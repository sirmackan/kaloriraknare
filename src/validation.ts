import { z } from 'zod';

export const baseUnitSchema = z.enum(['g', 'ml']);
export const loggedUnitSchema = z.enum(['g', 'ml', 'st']);
export const mealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);

export function isValidEan13(barcode: string): boolean {
  if (!/^\d{13}$/.test(barcode)) {
    return false;
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(barcode[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return Number(barcode[12]) === checkDigit;
}

export function calculateEan13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) {
    throw new Error('EAN-13 prefix must be 12 digits');
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

export const ean13Schema = z.string()
  .regex(/^\d{13}$/, 'Streckkoden måste vara exakt 13 siffror')
  .refine(isValidEan13, 'Ogiltig kontrollsiffra för EAN-13-streckkod');

const finiteNonNegative = (maximum: number) => z.number().finite().min(0).max(maximum);
const finitePositive = (maximum: number) => z.number().finite().positive().max(maximum);
const idSchema = z.string().trim().min(1).max(128);
export const idParamSchema = z.strictObject({ id: idSchema });

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, 'Ogiltigt datum');

const optionalBarcodeSchema = z.preprocess(
  (value) => value === '' || value === null ? undefined : value,
  ean13Schema.optional(),
);

export const goalsSchema = z.strictObject({
  targetCalories: z.number().int().min(1).max(20_000),
  targetProtein: z.number().int().min(1).max(1_000),
});

export const ingredientInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  barcode: optionalBarcodeSchema,
  unit: baseUnitSchema,
  caloriesPer100: finiteNonNegative(10_000),
  proteinPer100: finiteNonNegative(1_000),
  pieceWeight: z.union([finitePositive(100_000), z.null()]).optional(),
});

export const ingredientSearchSchema = z.strictObject({
  q: z.string().trim().max(120).optional(),
  barcode: ean13Schema.optional(),
});

export const idsSchema = z.strictObject({
  ids: z.array(idSchema).min(1).max(100).transform((ids) => [...new Set(ids)]),
});

export const mealQuerySchema = z.strictObject({ date: dateSchema });

export const ingredientMealInputSchema = z.strictObject({
  kind: z.literal('ingredient'),
  date: dateSchema,
  mealType: mealTypeSchema,
  ingredientId: idSchema,
  amount: finitePositive(1_000_000),
  loggedUnit: loggedUnitSchema,
});

export const quickMealInputSchema = z.strictObject({
  kind: z.literal('quick'),
  date: dateSchema,
  mealType: mealTypeSchema,
  name: z.string().trim().min(1).max(120),
  calories: finiteNonNegative(100_000),
  protein: finiteNonNegative(10_000),
}).refine((value) => value.calories > 0 || value.protein > 0, {
  message: 'Kalorier eller protein måste vara större än noll',
});

export const mealInputSchema = z.discriminatedUnion('kind', [ingredientMealInputSchema, quickMealInputSchema]);

export const ingredientMealUpdateSchema = z.strictObject({
  kind: z.literal('ingredient'),
  amount: finitePositive(1_000_000),
  loggedUnit: loggedUnitSchema,
});

export const quickMealUpdateSchema = z.strictObject({
  kind: z.literal('quick'),
  name: z.string().trim().min(1).max(120),
  calories: finiteNonNegative(100_000),
  protein: finiteNonNegative(10_000),
}).refine((value) => value.calories > 0 || value.protein > 0, {
  message: 'Kalorier eller protein måste vara större än noll',
});

export const mealUpdateSchema = z.discriminatedUnion('kind', [ingredientMealUpdateSchema, quickMealUpdateSchema]);

export const recipeInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  items: z.array(z.strictObject({
    ingredientId: idSchema,
    amount: finitePositive(1_000_000),
    loggedUnit: loggedUnitSchema,
  })).min(1).max(100),
});

export const copyMealSchema = z.strictObject({
  sourceDate: dateSchema,
  sourceMealType: mealTypeSchema,
  targetDate: dateSchema,
  targetMealType: mealTypeSchema,
});

export const logRecipeSchema = z.strictObject({
  date: dateSchema,
  mealType: mealTypeSchema,
});

export type IngredientInput = z.infer<typeof ingredientInputSchema>;
export type MealInput = z.infer<typeof mealInputSchema>;
export type MealUpdate = z.infer<typeof mealUpdateSchema>;
export type RecipeInput = z.infer<typeof recipeInputSchema>;
export type CopyMealInput = z.infer<typeof copyMealSchema>;
export type LogRecipeInput = z.infer<typeof logRecipeSchema>;
