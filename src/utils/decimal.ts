export function isDecimalInput(value: string): boolean {
  return /^\d*(?:[.,]\d*)?$/.test(value);
}

export function parseDecimal(value: string): number | null {
  if (!isDecimalInput(value) || !/\d/.test(value)) return null;
  const number = Number(value.replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}
