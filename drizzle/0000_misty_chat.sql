CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ingredients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"barcode" text,
	"unit" text DEFAULT 'g' NOT NULL,
	"calories_per_100" double precision DEFAULT 0 NOT NULL,
	"protein_per_100" double precision DEFAULT 0 NOT NULL,
	"piece_weight" double precision,
	"created_by_user_id" text DEFAULT 'system' NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingredients_barcode_ean13_check" CHECK ("ingredients"."barcode" IS NULL OR "ingredients"."barcode" ~ '^[0-9]{13}$'),
	CONSTRAINT "ingredients_nutrition_non_negative_check" CHECK ("ingredients"."calories_per_100" >= 0 AND "ingredients"."protein_per_100" >= 0),
	CONSTRAINT "ingredients_piece_weight_positive_check" CHECK ("ingredients"."piece_weight" IS NULL OR "ingredients"."piece_weight" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"meal_type" text NOT NULL,
	"ingredient_id" text,
	"ingredient_name" text NOT NULL,
	"amount" double precision NOT NULL,
	"logged_unit" text DEFAULT 'g' NOT NULL,
	"base_unit" text DEFAULT 'g' NOT NULL,
	"piece_weight" double precision,
	"calories" integer DEFAULT 0 NOT NULL,
	"protein" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meals_amount_positive_check" CHECK ("meals"."amount" > 0),
	CONSTRAINT "meals_nutrition_non_negative_check" CHECK ("meals"."calories" >= 0 AND "meals"."protein" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recipes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"items_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_calories" integer DEFAULT 0 NOT NULL,
	"total_protein" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"name" text DEFAULT 'Användare' NOT NULL,
	"target_calories" integer DEFAULT 2400 NOT NULL,
	"target_protein" integer DEFAULT 160 NOT NULL,
	"goals_configured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN IF NOT EXISTS "is_deleted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "meals" ALTER COLUMN "ingredient_id" DROP NOT NULL;--> statement-breakpoint
UPDATE "recipes" SET "items_json" = '[]' WHERE "items_json" IS NULL OR btrim("items_json"::text) = '';--> statement-breakpoint
ALTER TABLE "recipes" ALTER COLUMN "items_json" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "recipes"
 ALTER COLUMN "items_json" TYPE jsonb
 USING ("items_json"::text)::jsonb;--> statement-breakpoint
ALTER TABLE "recipes" ALTER COLUMN "items_json" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "recipes" ALTER COLUMN "items_json" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meals" ADD CONSTRAINT "meals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meals" ADD CONSTRAINT "meals_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipes" ADD CONSTRAINT "recipes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
UPDATE "ingredients" SET "barcode" = NULL WHERE "barcode" IS NOT NULL AND "barcode" !~ '^[0-9]{13}$';--> statement-breakpoint
WITH "ranked_barcodes" AS (
 SELECT "id", row_number() OVER (PARTITION BY "barcode" ORDER BY "created_at", "id") AS "position"
 FROM "ingredients"
 WHERE "is_deleted" = false AND "barcode" IS NOT NULL
)
UPDATE "ingredients" SET "barcode" = NULL
FROM "ranked_barcodes"
WHERE "ingredients"."id" = "ranked_barcodes"."id" AND "ranked_barcodes"."position" > 1;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_barcode_ean13_check" CHECK ("barcode" IS NULL OR "barcode" ~ '^[0-9]{13}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_nutrition_non_negative_check" CHECK ("calories_per_100" >= 0 AND "protein_per_100" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_piece_weight_positive_check" CHECK ("piece_weight" IS NULL OR "piece_weight" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meals" ADD CONSTRAINT "meals_amount_positive_check" CHECK ("amount" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meals" ADD CONSTRAINT "meals_nutrition_non_negative_check" CHECK ("calories" >= 0 AND "protein" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ingredients_name_trgm_idx" ON "ingredients" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ingredients_barcode_idx" ON "ingredients" USING btree ("barcode");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ingredients_active_barcode_unique_idx" ON "ingredients" USING btree ("barcode") WHERE "ingredients"."is_deleted" = false AND "ingredients"."barcode" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meals_user_id_date_idx" ON "meals" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meals_user_id_created_at_idx" ON "meals" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_user_id_idx" ON "recipes" USING btree ("user_id");
