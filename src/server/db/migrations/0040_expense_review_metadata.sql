ALTER TABLE "expenses" ADD COLUMN "vendor_name" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "classification" text DEFAULT 'unclassified' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "reviewed_by_id" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "reviewed_by_legacy_id" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_reviewed_by_id_members_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;