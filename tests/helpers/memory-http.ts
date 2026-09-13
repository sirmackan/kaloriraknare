import http from 'node:http';
import { Duplex } from 'node:stream';
import type { Express } from 'express';

export class MemorySocket extends Duplex {
  peer?: MemorySocket;

  _read() {}

  _write(chunk: any, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    if (this.peer && !this.peer.destroyed) {
      this.peer.push(chunk);
    }
    callback();
  }

  _destroy(err: Error | null, callback: (error: Error | null) => void) {
    if (this.peer && !this.peer.destroyed) {
      this.peer.push(null);
    }
    callback(err);
  }
}

export function createSocketPair(): [MemorySocket, MemorySocket] {
  const s1 = new MemorySocket();
  const s2 = new MemorySocket();
  s1.peer = s2;
  s2.peer = s1;
  return [s1, s2];
}

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
  path: string;
  headers?: Record<string, string>;
  body?: any;
}

export interface ResponseResult {
  status: number;
  headers: Record<string, string>;
  body: string;
  json: () => any;
}

export async function dispatchRequest(
  target: http.Server | Express | any,
  options: RequestOptions
): Promise<ResponseResult> {
  const server = target instanceof http.Server
    ? target
    : http.createServer(target);

  const [clientSocket, serverSocket] = createSocketPair();
  server.emit('connection', serverSocket);

  return new Promise<ResponseResult>((resolve, reject) => {
    let rawResponse = '';
    const timeout = setTimeout(() => {
      clientSocket.destroy();
      serverSocket.destroy();
      reject(new Error(`Request timed out after 5000ms: ${options.method} ${options.path}`));
    }, 5000);

    clientSocket.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    clientSocket.on('data', (chunk) => {
      rawResponse += chunk.toString();
      const headerEnd = rawResponse.indexOf('\r\n\r\n');
      if (headerEnd !== -1) {
        const headerPart = rawResponse.slice(0, headerEnd);
        const bodyPart = rawResponse.slice(headerEnd + 4);

        const statusMatch = headerPart.match(/HTTP\/1\.[01]\s+(\d{3})/);
        const status = statusMatch ? parseInt(statusMatch[1], 10) : 500;

        const headers: Record<string, string> = {};
        const headerLines = headerPart.split('\r\n').slice(1);
        for (const line of headerLines) {
          const colonIdx = line.indexOf(':');
          if (colonIdx !== -1) {
            const key = line.slice(0, colonIdx).trim().toLowerCase();
            const val = line.slice(colonIdx + 1).trim();
            headers[key] = val;
          }
        }

        const contentLength = headers['content-length'] ? parseInt(headers['content-length'], 10) : null;
        const isChunked = headers['transfer-encoding']?.toLowerCase() === 'chunked';

        let bodyComplete = false;
        let finalBody = bodyPart;

        if (contentLength !== null) {
          if (Buffer.byteLength(bodyPart) >= contentLength) {
            finalBody = bodyPart.slice(0, contentLength);
            bodyComplete = true;
          }
        } else if (isChunked) {
          if (rawResponse.includes('0\r\n\r\n')) {
            const chunks = bodyPart.split(/\r\n[0-9a-fA-F]+\r\n/);
            finalBody = chunks
              .join('')
              .replace(/^[0-9a-fA-F]+\r\n/, '')
              .replace(/\r\n0\r\n\r\n.*$/, '');
            bodyComplete = true;
          }
        } else if (status === 204 || status === 304 || options.method === 'HEAD') {
          finalBody = '';
          bodyComplete = true;
        }

        if (bodyComplete) {
          clearTimeout(timeout);
          clientSocket.destroy();
          serverSocket.destroy();
          resolve({
            status,
            headers,
            body: finalBody,
            json: () => {
              try {
                return JSON.parse(finalBody);
              } catch (e: any) {
                throw new Error(`Failed to parse JSON response: "${finalBody}". Error: ${e.message}`);
              }
            },
          });
        }
      }
    });

    const bodyStr = options.body
      ? typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body)
      : '';

    let reqPayload = `${options.method} ${options.path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n`;
    if (bodyStr) {
      reqPayload += `Content-Type: application/json\r\nContent-Length: ${Buffer.byteLength(bodyStr)}\r\n`;
    }
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        reqPayload += `${key}: ${value}\r\n`;
      }
    }
    reqPayload += '\r\n' + bodyStr;

    clientSocket.write(reqPayload);
  });
}
