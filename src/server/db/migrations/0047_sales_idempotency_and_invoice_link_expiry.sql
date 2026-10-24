ALTER TABLE "sales" ADD COLUMN "public_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_idempotency_key" ON "sales" USING btree ("idempotency_key");