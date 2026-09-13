import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import firebaseConfigJson from './firebase-applet-config.json' with { type: 'json' };
import {
  syncUser,
  updateUserGoals,
  getIngredients,
  getIngredientById,
  getRecentIngredients,
  createIngredient,
  updateIngredient,
  deleteIngredient,
  getMealsByDate,
  addMealItem,
  addBatchMeals,
  updateMealItem,
  deleteMealItem,
  getRecipes,
  createRecipe,
  deleteRecipe,
} from './src/db/queries.ts';

// Initialize Firebase Admin SDK lazily / safely
if (!getApps().length) {
  initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || firebaseConfigJson.projectId,
  });
}

const app = express();
const PORT = 3000;

// Disable ETag header generation to prevent 304 caching of dynamic API responses
app.set('etag', false);

app.use(express.json());

// Prevent browser/proxy caching for all API endpoints
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Helper to extract authenticated user from Authorization header via Firebase Admin SDK
async function authenticateUser(req: express.Request): Promise<DecodedIdToken | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7).trim();
  if (!token) return null;

  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    return decodedToken;
  } catch (err: any) {
    console.error('Firebase token verification failed:', err.message || err);
    return null;
  }
}

async function requireAuth(req: express.Request, res: express.Response): Promise<string | null> {
  const decodedToken = await authenticateUser(req);
  if (!decodedToken || !decodedToken.uid) {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired ID token' });
    return null;
  }
  return decodedToken.uid;
}

// Health check route
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'kaloriraknare', time: new Date().toISOString() });
});

// User Profile
app.post('/api/users/sync', async (req, res) => {
  try {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    const { email, name, targetCalories, targetProtein } = req.body;
    const user = await syncUser({ id: userId, email, name, targetCalories, targetProtein });
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/goals', async (req, res) => {
  try {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    const { targetCalories, targetProtein } = req.body;
    const user = await updateUserGoals(userId, targetCalories, targetProtein);
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Ingredients
app.get('/api/ingredients', async (req, res) => {
  try {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    const q = req.query.q as string | undefined;
    const barcode = req.query.barcode as string | undefined;
    const items = await getIngredients(q, barcode);
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ingredients/recent', async (req, res) => {
  try {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    const items = await getRecentIngredients(userId);
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ingredients/:id', async (req, res) => {
  try {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    const item = await getIngredientById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Ingredient not found' });
    }
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ingredients', async (req, res) => {
  try {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    const item = await createIngredient({
      ...req.body,
      createdByUserId: userId,
    });
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/ingredients/:id', async (req, res) => {
  try {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    const item = await updateIngredient(req.params.id, req.body);
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/ingredients/:id', async (req, res) => {
  try {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    const success = await deleteIngredient(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Ingredient not found' });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Meals
app.get('/api/meals', async (req, res) => {
  try {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    const date = req.query.date as string;
    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }
    const items = await getMealsByDate(userId, date);
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/meals', async (req, res) => {
  try {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    const created = await addMealItem(userId, req.body);
    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/meals/batch', async (req, res) => {
  try {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    const items = req.body.items || [];
    const created = await addBatchMeals(userId, items);
    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/meals/:id', async (req, res) => {
  try {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    const { amount, loggedUnit } = req.body;
    const updated = await updateMealItem(userId, req.params.id, amount, loggedUnit);
    res.json(updated);
  } catch (err: any) {
    if (err.message === 'Meal item not found' || err.message === 'Ingredient not found') {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/meals/:id', async (req, res) => {
  try {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    const success = await deleteMealItem(userId, req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Meal item not found' });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Recipes
app.get('/api/recipes', async (req, res) => {
  try {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    const list = await getRecipes(userId);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/recipes', async (req, res) => {
  try {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    const { id, name, items } = req.body;
    const created = await createRecipe(userId, id, name, items);
    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/recipes/:id', async (req, res) => {
  try {
    const userId = await requireAuth(req, res);
    if (!userId) return;
    const success = await deleteRecipe(userId, req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Recipe not found' });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Kaloriräknare server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
