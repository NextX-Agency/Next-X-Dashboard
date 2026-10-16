CREATE TABLE "legacy_reservation_archive" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legacy_id" text NOT NULL,
	"legacy_item_id" text NOT NULL,
	"variant_id" uuid NOT NULL,
	"legacy_location_id" text NOT NULL,
	"location_id" uuid NOT NULL,
	"legacy_client_id" text,
	"customer_id" uuid,
	"quantity" integer NOT NULL,
	"source_status" text NOT NULL,
	"source_notes" text,
	"reserved_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legacy_reservation_archive_quantity_positive" CHECK ("legacy_reservation_archive"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "legacy_reservation_archive" ADD CONSTRAINT "legacy_reservation_archive_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_reservation_archive" ADD CONSTRAINT "legacy_reservation_archive_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_reservation_archive" ADD CONSTRAINT "legacy_reservation_archive_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_reservation_archive_legacy_id_key" ON "legacy_reservation_archive" USING btree ("legacy_id");--> statement-breakpoint
ALTER TABLE public.legacy_reservation_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_reservation_archive FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.legacy_reservation_archive FROM PUBLIC, anon, authenticated, service_role;
