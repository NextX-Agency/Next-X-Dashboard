CREATE TABLE "legacy_payout_run_archive" (
	"id" uuid PRIMARY KEY NOT NULL,
	"legacy_id" text NOT NULL,
	"source_record" jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legacy_payout_run_archive_source_record_object" CHECK (jsonb_typeof("legacy_payout_run_archive"."source_record") = 'object')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_payout_run_archive_legacy_id_key" ON "legacy_payout_run_archive" USING btree ("legacy_id");
--> statement-breakpoint
ALTER TABLE public.legacy_payout_run_archive ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.legacy_payout_run_archive FORCE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE public.legacy_payout_run_archive FROM PUBLIC, anon, authenticated, service_role;
