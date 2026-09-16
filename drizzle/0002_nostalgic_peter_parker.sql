ALTER TABLE "ingredients" DROP CONSTRAINT "ingredients_barcode_ean13_check";--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_barcode_ean13_check" CHECK ("ingredients"."barcode" IS NULL OR (
      "ingredients"."barcode" ~ '^[0-9]{13}$' AND (
        (10 - (
          (
            SUBSTRING("ingredients"."barcode", 1, 1)::integer +
            SUBSTRING("ingredients"."barcode", 2, 1)::integer * 3 +
            SUBSTRING("ingredients"."barcode", 3, 1)::integer +
            SUBSTRING("ingredients"."barcode", 4, 1)::integer * 3 +
            SUBSTRING("ingredients"."barcode", 5, 1)::integer +
            SUBSTRING("ingredients"."barcode", 6, 1)::integer * 3 +
            SUBSTRING("ingredients"."barcode", 7, 1)::integer +
            SUBSTRING("ingredients"."barcode", 8, 1)::integer * 3 +
            SUBSTRING("ingredients"."barcode", 9, 1)::integer +
            SUBSTRING("ingredients"."barcode", 10, 1)::integer * 3 +
            SUBSTRING("ingredients"."barcode", 11, 1)::integer +
            SUBSTRING("ingredients"."barcode", 12, 1)::integer * 3
          ) % 10
        )) % 10 = SUBSTRING("ingredients"."barcode", 13, 1)::integer
      )
    ));