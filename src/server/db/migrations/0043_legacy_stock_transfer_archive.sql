CREATE TABLE "legacy_stock_transfer_archive" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text NOT NULL,
	"legacy_item_id" text NOT NULL,
	"variant_id" uuid NOT NULL,
	"legacy_from_location_id" text NOT NULL,
	"from_location_id" uuid NOT NULL,
	"legacy_to_location_id" text NOT NULL,
	"to_location_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"source_notes" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legacy_stock_transfer_archive_quantity_positive" CHECK ("legacy_stock_transfer_archive"."quantity" > 0),
	CONSTRAINT "legacy_stock_transfer_archive_distinct_locations" CHECK ("legacy_stock_transfer_archive"."from_location_id" <> "legacy_stock_transfer_archive"."to_location_id")
);
--> statement-breakpoint
ALTER TABLE "legacy_stock_transfer_archive" ADD CONSTRAINT "legacy_stock_transfer_archive_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_stock_transfer_archive" ADD CONSTRAINT "legacy_stock_transfer_archive_from_location_id_locations_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_stock_transfer_archive" ADD CONSTRAINT "legacy_stock_transfer_archive_to_location_id_locations_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_stock_transfer_archive_legacy_id_key" ON "legacy_stock_transfer_archive" USING btree ("legacy_id");
--> statement-breakpoint
ALTER TABLE public.legacy_stock_transfer_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_stock_transfer_archive FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.legacy_stock_transfer_archive FROM PUBLIC, anon, authenticated, service_role;
