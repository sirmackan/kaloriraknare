import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  syncUser,
  updateUserGoals,
  getIngredients,
  getIngredientById,
  getRecentIngredients,
  createIngredient,
  updateIngredient,
  getMealsByDate,
  addMealItem,
  addBatchMeals,
  updateMealItem,
  deleteMealItem,
  getRecipes,
  createRecipe,
  deleteRecipe,
} from './src/db/queries.ts';

const app = express();
const PORT = 3000;

app.use(express.json());

// Helper to extract userId from headers
function getUserId(req: express.Request): string {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  const customUid = req.headers['x-user-id'] as string;
  return customUid || 'anonymous';
}

// Health check route
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'kaloriraknare', time: new Date().toISOString() });
});

// User Profile
app.post('/api/users/sync', async (req, res) => {
  try {
    const { id, email, name, targetCalories, targetProtein } = req.body;
    const user = await syncUser({ id, email, name, targetCalories, targetProtein });
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/goals', async (req, res) => {
  try {
    const userId = getUserId(req);
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
    const userId = getUserId(req);
    const items = await getRecentIngredients(userId);
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ingredients/:id', async (req, res) => {
  try {
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
    const userId = getUserId(req);
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
    const userId = getUserId(req);
    const item = await updateIngredient(req.params.id, userId, req.body);
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Meals
app.get('/api/meals', async (req, res) => {
  try {
    const userId = getUserId(req);
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
    const userId = getUserId(req);
    const created = await addMealItem(userId, req.body);
    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/meals/batch', async (req, res) => {
  try {
    const userId = getUserId(req);
    const items = req.body.items || [];
    const created = await addBatchMeals(userId, items);
    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/meals/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { amount, loggedUnit } = req.body;
    const updated = await updateMealItem(userId, req.params.id, amount, loggedUnit);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/meals/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const success = await deleteMealItem(userId, req.params.id);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Recipes
app.get('/api/recipes', async (req, res) => {
  try {
    const userId = getUserId(req);
    const list = await getRecipes(userId);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/recipes', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id, name, items } = req.body;
    const created = await createRecipe(userId, id, name, items);
    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/recipes/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const success = await deleteRecipe(userId, req.params.id);
    res.json({ success });
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
