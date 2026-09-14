ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_unit_check" CHECK ("ingredients"."unit" IN ('g', 'ml'));--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_date_format_check" CHECK ("meals"."date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_type_check" CHECK ("meals"."meal_type" IN ('breakfast', 'lunch', 'dinner', 'snack'));--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_logged_unit_check" CHECK ("meals"."logged_unit" IN ('g', 'ml', 'st', 'port'));--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_base_unit_check" CHECK ("meals"."base_unit" IN ('g', 'ml'));--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_nutrition_non_negative_check" CHECK ("recipes"."total_calories" >= 0 AND "recipes"."total_protein" >= 0);--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_items_array_check" CHECK (jsonb_typeof("recipes"."items_json") = 'array');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_goals_positive_check" CHECK ("users"."target_calories" > 0 AND "users"."target_protein" > 0);