import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { execute, documentMatches, score } from 'firebase/firestore/pipelines';
import type { User, Ingredient, MealItem, Recipe, MealType, LoggedUnit, BaseUnit } from '../types';
import firebaseConfigJson from '../../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: firebaseConfigJson.apiKey,
  authDomain: firebaseConfigJson.authDomain,
  projectId: firebaseConfigJson.projectId,
  storageBucket: firebaseConfigJson.storageBucket,
  messagingSenderId: firebaseConfigJson.messagingSenderId,
  appId: firebaseConfigJson.appId,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Initialize Firestore with specific database ID from config
export const db: Firestore = firebaseConfigJson.firestoreDatabaseId
  ? getFirestore(app, firebaseConfigJson.firestoreDatabaseId)
  : getFirestore(app);

// User Profile Service
export async function syncUserProfile(fbUser: FirebaseUser): Promise<User> {
  const userDocRef = doc(db, 'users', fbUser.uid);
  const snap = await getDoc(userDocRef);

  if (snap.exists()) {
    const data = snap.data();
    return {
      id: fbUser.uid,
      email: fbUser.email || data.email || 'anonym@app.se',
      name: fbUser.displayName || data.name || 'Användare',
      targetCalories: data.targetCalories || 2400,
      targetProtein: data.targetProtein || 160,
      createdAt: data.createdAt || new Date().toISOString(),
      goalsConfigured: data.goalsConfigured ?? true,
    };
  }

  // Create new profile with default goals (marked as not yet configured)
  const newUser: User = {
    id: fbUser.uid,
    email: fbUser.email || '',
    name: fbUser.displayName || 'Google-användare',
    targetCalories: 2400,
    targetProtein: 160,
    createdAt: new Date().toISOString(),
    goalsConfigured: false,
  };

  await setDoc(userDocRef, {
    email: newUser.email,
    name: newUser.name,
    targetCalories: newUser.targetCalories,
    targetProtein: newUser.targetProtein,
    createdAt: newUser.createdAt,
    updatedAt: new Date().toISOString(),
    goalsConfigured: false,
  });

  return newUser;
}

export async function updateFirebaseUserGoals(userId: string, targetCalories: number, targetProtein: number): Promise<void> {
  const userDocRef = doc(db, 'users', userId);
  await updateDoc(userDocRef, {
    targetCalories,
    targetProtein,
    goalsConfigured: true,
    updatedAt: new Date().toISOString(),
  });
}

// Ingredients Service
export async function fetchIngredientsFromFirestore(q?: string, barcode?: string): Promise<Ingredient[]> {
  const colRef = collection(db, 'ingredients');

  if (barcode && barcode.trim()) {
    const cleanBarcode = barcode.trim();
    try {
      const qBarcode = query(colRef, where('barcode', '==', cleanBarcode));
      const snap = await getDocs(qBarcode);
      return snap.docs.map((d) => ({ ...d.data(), id: d.id } as Ingredient));
    } catch {
      return [];
    }
  }

  if (q && q.trim()) {
    const trimmedQuery = q.trim();
    try {
      const result: any = await execute(
        (db as any).pipeline()
          .collection('ingredients')
          .search({
            query: documentMatches(trimmedQuery),
            sort: score().descending(),
          })
          .limit(25)
      );

      const items = (result.results || result.docs || []).map((d: any) => ({
        ...(typeof d.data === 'function' ? d.data() : d),
        id: d.id,
      } as Ingredient));

      return items;
    } catch (err) {
      console.warn('Pipeline search error, fallback to prefix query:', err);
      try {
        const qPrefix = query(
          colRef,
          where('name', '>=', trimmedQuery),
          where('name', '<=', trimmedQuery + '\uf8ff'),
          limit(25)
        );
        const snap = await getDocs(qPrefix);
        return snap.docs.map((d) => ({ ...d.data(), id: d.id } as Ingredient));
      } catch (fallbackErr) {
        console.warn('Prefix search fallback error:', fallbackErr);
        return [];
      }
    }
  }

  return [];
}

export async function fetchIngredientById(id: string): Promise<Ingredient | null> {
  if (!id) return null;
  try {
    const docRef = doc(db, 'ingredients', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return null;
    }
    return { ...snap.data(), id: snap.id } as Ingredient;
  } catch (err) {
    console.warn(`Could not fetch ingredient with id ${id}:`, err);
    return null;
  }
}

export async function fetchPersonalRecentIngredients(userId?: string): Promise<Ingredient[]> {
  if (!userId) {
    return [];
  }

  try {
    const mealsCol = collection(db, 'meals');
    let snap;
    try {
      const qMeals = query(
        mealsCol,
        where('userId', '==', userId),
        orderBy('date', 'desc'),
        limit(150)
      );
      snap = await getDocs(qMeals);
    } catch {
      // Fallback in case composite index is not yet built in Firestore
      const qMealsFallback = query(
        mealsCol,
        where('userId', '==', userId),
        limit(200)
      );
      snap = await getDocs(qMealsFallback);
    }

    if (snap.empty) {
      return [];
    }

    const meals = snap.docs.map((d) => ({ ...d.data(), id: d.id } as MealItem));

    // Sort descending by date/createdAt to get the most recent meals first
    meals.sort((a, b) => {
      const timeA = new Date(a.createdAt || a.date).getTime();
      const timeB = new Date(b.createdAt || b.date).getTime();
      return timeB - timeA;
    });

    const recentIngredientIds: string[] = [];
    const seenIds = new Set<string>();

    for (const m of meals) {
      if (m.ingredientId && !seenIds.has(m.ingredientId)) {
        seenIds.add(m.ingredientId);
        recentIngredientIds.push(m.ingredientId);
      }
    }

    if (recentIngredientIds.length === 0) {
      return [];
    }

    // Fetch only the top 20 unique recent ingredients directly by ID
    const targetIds = recentIngredientIds.slice(0, 20);
    const fetchedIngredients = await Promise.all(
      targetIds.map((id) => fetchIngredientById(id))
    );

    const personalRecent: Ingredient[] = [];
    for (const ing of fetchedIngredients) {
      if (ing) {
        personalRecent.push(ing);
      }
    }

    return personalRecent;
  } catch (err) {
    console.warn('Could not fetch personal recent ingredients:', err);
    return [];
  }
}

export async function addIngredientToFirestore(
  userId: string,
  userName: string,
  data: {
    name: string;
    barcode?: string;
    unit: BaseUnit;
    caloriesPer100: number;
    proteinPer100: number;
    pieceWeight?: number | null;
    pieceLabel?: string | null;
  }
): Promise<Ingredient> {
  const colRef = collection(db, 'ingredients');
  const docRef = doc(colRef);

  const cleanData: any = {
    id: docRef.id,
    name: data.name.trim(),
    unit: data.unit || 'g',
    caloriesPer100: Number(data.caloriesPer100) || 0,
    proteinPer100: Number(data.proteinPer100) || 0,
    pieceWeight: data.pieceWeight && Number(data.pieceWeight) > 0 ? Number(data.pieceWeight) : null,
    pieceLabel: data.pieceLabel?.trim() || null,
    createdByUserId: userId || 'anonymous',
    createdByName: userName || 'Användare',
    createdAt: new Date().toISOString(),
  };

  // Only assign barcode if non-empty; NEVER pass undefined to Firestore setDoc
  if (data.barcode && data.barcode.trim()) {
    cleanData.barcode = data.barcode.trim();
  }

  // Persist to Firestore
  await setDoc(docRef, cleanData);

  return cleanData as Ingredient;
}

export async function updateIngredientInFirestore(
  userId: string,
  id: string,
  data: {
    name: string;
    barcode?: string;
    unit: BaseUnit;
    caloriesPer100: number;
    proteinPer100: number;
    pieceWeight?: number | null;
    pieceLabel?: string | null;
  }
): Promise<Ingredient> {
  const docRef = doc(db, 'ingredients', id);
  const existingDoc = await getDoc(docRef);
  const existingData = existingDoc.exists() ? (existingDoc.data() as Partial<Ingredient>) : {};

  const cleanData: any = {
    id,
    name: data.name.trim(),
    unit: data.unit || 'g',
    caloriesPer100: Number(data.caloriesPer100) || 0,
    proteinPer100: Number(data.proteinPer100) || 0,
    pieceWeight: data.pieceWeight && Number(data.pieceWeight) > 0 ? Number(data.pieceWeight) : null,
    pieceLabel: data.pieceLabel?.trim() || null,
    createdByUserId: existingData.createdByUserId || userId || 'anonymous',
    createdByName: existingData.createdByName,
    createdAt: existingData.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (data.barcode && data.barcode.trim()) {
    cleanData.barcode = data.barcode.trim();
  } else {
    cleanData.barcode = deleteField();
  }

  // Update in Firestore
  await updateDoc(docRef, cleanData);

  return {
    ...cleanData,
    barcode: data.barcode?.trim() || undefined,
  } as Ingredient;
}

export async function deleteIngredientFromFirestore(
  userId: string,
  id: string
): Promise<boolean> {
  const docRef = doc(db, 'ingredients', id);
  await deleteDoc(docRef);
  return true;
}

// Meal Items Service
export async function fetchMealsFromFirestore(userId: string, date: string): Promise<MealItem[]> {
  const colRef = collection(db, 'meals');
  const qMeals = query(
    colRef,
    where('userId', '==', userId),
    where('date', '==', date)
  );

  const snap = await getDocs(qMeals);
  const items = snap.docs.map((d) => ({ ...d.data(), id: d.id } as MealItem));
  // Sort by createdAt safely
  items.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  return items;
}

export async function addMealItemToFirestore(
  userId: string,
  item: {
    date: string;
    mealType: MealType;
    ingredientId: string;
    amount: number;
    loggedUnit: LoggedUnit;
  }
): Promise<MealItem> {
  // Fetch ingredient details for calculations
  let ing: Ingredient | null = null;
  try {
    const ingDoc = await getDoc(doc(db, 'ingredients', item.ingredientId));
    if (ingDoc.exists()) {
      ing = ingDoc.data() as Ingredient;
    }
  } catch {
    // network or permission error
  }

  if (!ing) {
    throw new Error('Råvaran hittades inte');
  }

  const effectiveGrams =
    item.loggedUnit === 'st' && ing.pieceWeight
      ? item.amount * ing.pieceWeight
      : item.amount;

  const calories = Math.round((effectiveGrams / 100) * ing.caloriesPer100);
  const protein = Math.round(((effectiveGrams / 100) * ing.proteinPer100) * 10) / 10;

  const colRef = collection(db, 'meals');
  const docRef = doc(colRef);

  const mealItem: MealItem = {
    id: docRef.id,
    userId,
    date: item.date,
    mealType: item.mealType,
    ingredientId: item.ingredientId,
    ingredientName: ing.name,
    amount: item.amount,
    loggedUnit: item.loggedUnit,
    baseUnit: ing.unit,
    pieceWeight: ing.pieceWeight || null,
    calories,
    protein,
    createdAt: new Date().toISOString(),
  };

  await setDoc(docRef, mealItem);
  return mealItem;
}

export async function addBatchMealsToFirestore(
  userId: string,
  items: {
    date: string;
    mealType: MealType;
    ingredientId: string;
    amount: number;
    loggedUnit: LoggedUnit;
  }[]
): Promise<MealItem[]> {
  const results: MealItem[] = [];
  for (const item of items) {
    const created = await addMealItemToFirestore(userId, item);
    results.push(created);
  }
  return results;
}

export async function updateMealItemInFirestore(
  userId: string,
  mealId: string,
  amount: number,
  loggedUnit: LoggedUnit
): Promise<MealItem> {
  const mealDocRef = doc(db, 'meals', mealId);
  const snap = await getDoc(mealDocRef);
  if (!snap.exists()) {
    throw new Error('Raden hittades inte');
  }
  const item = snap.data() as MealItem;
  if (item.userId !== userId) {
    throw new Error('Ej behörig att redigera denna rad');
  }

  // Fetch actual ingredient to recalculate precisely from baseline per 100g
  let caloriesPer100 = 0;
  let proteinPer100 = 0;
  let pieceWeight = item.pieceWeight || null;

  if (item.ingredientId) {
    const ingSnap = await getDoc(doc(db, 'ingredients', item.ingredientId));
    if (ingSnap.exists()) {
      const ingData = ingSnap.data() as Ingredient;
      caloriesPer100 = Number(ingData.caloriesPer100) || 0;
      proteinPer100 = Number(ingData.proteinPer100) || 0;
      pieceWeight = ingData.pieceWeight || null;
    }
  }

  // Fallback to item ratio only if ingredient doc was completely unavailable
  let calories: number;
  let protein: number;

  const effectiveGrams =
    loggedUnit === 'st' && pieceWeight
      ? amount * pieceWeight
      : amount;

  if (caloriesPer100 > 0 || proteinPer100 > 0) {
    calories = Math.round((effectiveGrams / 100) * caloriesPer100);
    protein = Math.round(((effectiveGrams / 100) * proteinPer100) * 10) / 10;
  } else {
    const previousFactor =
      item.loggedUnit === 'st' && item.pieceWeight
        ? (item.amount * item.pieceWeight) / 100
        : item.amount / 100 || 1;
    const baseCal = item.calories / (previousFactor || 1);
    const basePro = item.protein / (previousFactor || 1);
    const currentFactor = effectiveGrams / 100;
    calories = Math.round(baseCal * currentFactor);
    protein = Math.round((basePro * currentFactor) * 10) / 10;
  }

  await updateDoc(mealDocRef, {
    amount,
    loggedUnit,
    pieceWeight,
    calories,
    protein,
  });

  return {
    ...item,
    amount,
    loggedUnit,
    pieceWeight,
    calories,
    protein,
  };
}

export async function deleteMealItemFromFirestore(userId: string, mealId: string): Promise<boolean> {
  const mealDocRef = doc(db, 'meals', mealId);
  const snap = await getDoc(mealDocRef);
  if (!snap.exists()) return false;
  const item = snap.data() as MealItem;
  if (item.userId !== userId) {
    throw new Error('Ej behörig');
  }
  await deleteDoc(mealDocRef);
  return true;
}

export async function copyMealFromDateInFirestore(
  userId: string,
  targetDate: string,
  targetMealType: MealType,
  sourceDate: string,
  sourceMealType: MealType
): Promise<MealItem[]> {
  const sourceItems = await fetchMealsFromFirestore(userId, sourceDate);
  const filtered = sourceItems.filter((i) => i.mealType === sourceMealType);

  if (filtered.length === 0) return [];

  const batchPayload = filtered.map((item) => ({
    date: targetDate,
    mealType: targetMealType,
    ingredientId: item.ingredientId,
    amount: item.amount,
    loggedUnit: item.loggedUnit,
  }));

  return addBatchMealsToFirestore(userId, batchPayload);
}

export async function copyYesterdayMealInFirestore(
  userId: string,
  date: string,
  targetMealType: MealType,
  sourceMealType: MealType = targetMealType
): Promise<MealItem[]> {
  // calculate yesterday's date
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  const yStr = dt.getFullYear();
  const mStr = String(dt.getMonth() + 1).padStart(2, '0');
  const dStr = String(dt.getDate()).padStart(2, '0');
  const yesterday = `${yStr}-${mStr}-${dStr}`;

  return copyMealFromDateInFirestore(userId, date, targetMealType, yesterday, sourceMealType);
}

export async function fetchYesterdayMealsInFirestore(
  userId: string,
  date: string
): Promise<{ date: string; items: MealItem[] }> {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  const yStr = dt.getFullYear();
  const mStr = String(dt.getMonth() + 1).padStart(2, '0');
  const dStr = String(dt.getDate()).padStart(2, '0');
  const yesterday = `${yStr}-${mStr}-${dStr}`;

  const items = await fetchMealsFromFirestore(userId, yesterday);
  return { date: yesterday, items };
}

// Recipes Service
export async function fetchRecipesFromFirestore(userId: string): Promise<Recipe[]> {
  const colRef = collection(db, 'recipes');
  const qRecipes = query(colRef, where('userId', '==', userId));
  const snap = await getDocs(qRecipes);
  const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as Recipe));
  list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return list;
}

export async function createRecipeInFirestore(
  userId: string,
  name: string,
  items: { ingredientId: string; amount: number; loggedUnit: LoggedUnit }[]
): Promise<Recipe> {
  const recipeItems = [];
  let totalCalories = 0;
  let totalProtein = 0;

  for (const item of items) {
    const ingDoc = await getDoc(doc(db, 'ingredients', item.ingredientId));
    if (!ingDoc.exists()) continue;
    const ing = ingDoc.data() as Ingredient;

    const effectiveGrams =
      item.loggedUnit === 'st' && ing.pieceWeight
        ? item.amount * ing.pieceWeight
        : item.amount;

    const calories = Math.round((effectiveGrams / 100) * ing.caloriesPer100);
    const protein = Math.round(((effectiveGrams / 100) * ing.proteinPer100) * 10) / 10;

    totalCalories += calories;
    totalProtein += protein;

    recipeItems.push({
      ingredientId: ing.id,
      ingredientName: ing.name,
      amount: item.amount,
      loggedUnit: item.loggedUnit,
      baseUnit: ing.unit,
      pieceWeight: ing.pieceWeight || null,
      calories,
      protein,
    });
  }

  const colRef = collection(db, 'recipes');
  const docRef = doc(colRef);

  const recipe: Recipe = {
    id: docRef.id,
    userId,
    name: name.trim(),
    items: recipeItems,
    totalCalories,
    totalProtein: Math.round(totalProtein * 10) / 10,
    createdAt: new Date().toISOString(),
  };

  await setDoc(docRef, recipe);
  return recipe;
}

export async function deleteRecipeFromFirestore(userId: string, recipeId: string): Promise<boolean> {
  const recipeDocRef = doc(db, 'recipes', recipeId);
  const snap = await getDoc(recipeDocRef);
  if (!snap.exists()) return false;
  const data = snap.data() as Recipe;
  if (data.userId !== userId) throw new Error('Ej behörig');
  await deleteDoc(recipeDocRef);
  return true;
}
