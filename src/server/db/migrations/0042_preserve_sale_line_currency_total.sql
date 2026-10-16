ALTER TABLE "sale_items" ADD COLUMN "line_total_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "sale_items"
SET "line_total_cents" = "unit_price_cents" * "quantity";
