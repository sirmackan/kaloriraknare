import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { z, type ZodType } from 'zod';
import firebaseConfigJson from './firebase-applet-config.json' with { type: 'json' };
import { pool } from './src/db/index.ts';
import { runMigrations } from './src/db/migrate.ts';
import {
  InvalidReferenceError,
  NotFoundError,
  addMealItem,
  copyMeal,
  createIngredient,
  createRecipe,
  deleteIngredient,
  deleteMealItem,
  deleteRecipe,
  getIngredientById,
  getIngredients,
  getIngredientsByIds,
  getMealsByDate,
  getRecentIngredients,
  getRecipes,
  logRecipe,
  syncUser,
  updateIngredient,
  updateMealItem,
  updateUserGoals,
} from './src/db/queries.ts';
import {
  copyMealSchema,
  goalsSchema,
  idParamSchema,
  idsSchema,
  ingredientInputSchema,
  ingredientSearchSchema,
  logRecipeSchema,
  mealInputSchema,
  mealQuerySchema,
  mealUpdateSchema,
  recipeInputSchema,
} from './src/validation.ts';

if (!getApps().length) {
  initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || firebaseConfigJson.projectId });
}

const app = express();
const port = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.set('etag', false);
app.use(express.json({ limit: '64kb' }));
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

type AuthedLocals = { user: DecodedIdToken };
type AsyncRoute = (req: Request, res: Response<unknown, AuthedLocals>, next: NextFunction) => Promise<unknown>;

class RequestValidationError extends Error {
  constructor(readonly issues: z.core.$ZodIssue[]) {
    super('Ogiltig förfrågan');
  }
}

function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new RequestValidationError(result.error.issues);
  return result.data;
}

function asyncRoute(handler: AsyncRoute) {
  return (req: Request, res: Response<unknown, AuthedLocals>, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', check: 'liveness', service: 'kaloriraknare', time: new Date().toISOString() });
});

app.get('/api/ready', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', check: 'readiness', service: 'kaloriraknare' });
}));

app.use('/api', asyncRoute(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Ogiltig eller saknad inloggning' });
    return;
  }
  try {
    res.locals.user = await getAuth().verifyIdToken(header.slice(7).trim());
    next();
  } catch (error) {
    console.warn('Firebase token verification failed', error instanceof Error ? error.message : error);
    res.status(401).json({ error: 'Ogiltig eller utgången inloggning' });
  }
}));

app.post('/api/users/sync', asyncRoute(async (_req, res) => {
  const claims = res.locals.user;
  const user = await syncUser({
    id: claims.uid,
    email: typeof claims.email === 'string' ? claims.email : '',
    name: typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim() : 'Google-användare',
  });
  res.json(user);
}));

app.put('/api/users/goals', asyncRoute(async (req, res) => {
  const input = parse(goalsSchema, req.body);
  res.json(await updateUserGoals(res.locals.user.uid, input.targetCalories, input.targetProtein));
}));

app.get('/api/ingredients', asyncRoute(async (req, res) => {
  const input = parse(ingredientSearchSchema, req.query);
  res.json(await getIngredients(input.q, input.barcode));
}));

app.post('/api/ingredients/batch', asyncRoute(async (req, res) => {
  const { ids } = parse(idsSchema, req.body);
  res.json(await getIngredientsByIds(ids));
}));

app.get('/api/ingredients/recent', asyncRoute(async (_req, res) => {
  res.json(await getRecentIngredients(res.locals.user.uid));
}));

app.get('/api/ingredients/:id', asyncRoute(async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const item = await getIngredientById(id);
  if (!item) throw new NotFoundError('Råvaran hittades inte');
  res.json(item);
}));

app.post('/api/ingredients', asyncRoute(async (req, res) => {
  const input = parse(ingredientInputSchema, req.body);
  res.status(201).json(await createIngredient({ ...input, createdByUserId: res.locals.user.uid }));
}));

app.put('/api/ingredients/:id', asyncRoute(async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const input = parse(ingredientInputSchema, req.body);
  const item = await updateIngredient(id, input);
  if (!item) throw new NotFoundError('Råvaran hittades inte');
  res.json(item);
}));

app.delete('/api/ingredients/:id', asyncRoute(async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  if (!await deleteIngredient(id)) throw new NotFoundError('Råvaran hittades inte');
  res.json({ success: true });
}));

app.get('/api/meals', asyncRoute(async (req, res) => {
  const { date } = parse(mealQuerySchema, req.query);
  res.json(await getMealsByDate(res.locals.user.uid, date));
}));

app.post('/api/meals', asyncRoute(async (req, res) => {
  const input = parse(mealInputSchema, req.body);
  res.status(201).json(await addMealItem(res.locals.user.uid, input));
}));

app.put('/api/meals/:id', asyncRoute(async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const input = parse(mealUpdateSchema, req.body);
  res.json(await updateMealItem(res.locals.user.uid, id, input));
}));

app.delete('/api/meals/:id', asyncRoute(async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  if (!await deleteMealItem(res.locals.user.uid, id)) throw new NotFoundError('Måltidsraden hittades inte');
  res.json({ success: true });
}));

app.post('/api/meals/copy', asyncRoute(async (req, res) => {
  const input = parse(copyMealSchema, req.body);
  res.status(201).json(await copyMeal(res.locals.user.uid, input));
}));

app.get('/api/recipes', asyncRoute(async (_req, res) => {
  res.json(await getRecipes(res.locals.user.uid));
}));

app.post('/api/recipes', asyncRoute(async (req, res) => {
  const input = parse(recipeInputSchema, req.body);
  res.status(201).json(await createRecipe(res.locals.user.uid, input));
}));

app.post('/api/recipes/:id/log', asyncRoute(async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const input = parse(logRecipeSchema, req.body);
  res.status(201).json(await logRecipe(res.locals.user.uid, id, input.date, input.mealType));
}));

app.delete('/api/recipes/:id', asyncRoute(async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  if (!await deleteRecipe(res.locals.user.uid, id)) throw new NotFoundError('Receptet hittades inte');
  res.json({ success: true });
}));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Hittades inte' }));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof RequestValidationError) {
    res.status(400).json({ error: error.message, issues: error.issues });
    return;
  }
  if (error instanceof NotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof InvalidReferenceError) {
    res.status(409).json({ error: error.message });
    return;
  }
  const isUniqueViolation = typeof error === 'object' && error !== null && ((error as any).code === '23505' || (error as any).cause?.code === '23505');
  if (isUniqueViolation) {
    const constraint = (error as any).constraint || (error as any).cause?.constraint;
    if (constraint === 'ingredients_active_barcode_unique_idx') {
      res.status(409).json({ error: 'En aktiv råvara med den streckkoden finns redan' });
      return;
    }
  }
  console.error(error);
  res.status(500).json({ error: 'Ett oväntat serverfel inträffade' });
});

export async function startServer() {
  try {
    await runMigrations();
  } catch (err) {
    console.warn('[db] Skipping runtime migrations due to error:', err);
  }

  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use('/assets', express.static(path.join(distPath, 'assets'), { maxAge: '1y', immutable: true }));
    app.use(express.static(distPath, { maxAge: 0 }));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Kaloriräknare server running on http://0.0.0.0:${port}`);
  });
  const shutdown = () => server.close(() => void pool.end());
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

export { app };

if (process.env.NODE_ENV !== 'test') void startServer();
