CREATE TABLE IF NOT EXISTS "rentals"."transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"lease_id" uuid,
	"type" varchar(10) NOT NULL,
	"category" varchar(30) NOT NULL,
	"date" date NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"payee" varchar(150),
	"paid_from" varchar(10) DEFAULT 'business' NOT NULL,
	"description" text,
	"source_type" varchar(10),
	"source_id" uuid,
	"source_ref" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_source_key" UNIQUE("source_type","source_id","source_ref")
);
--> statement-breakpoint
ALTER TABLE "rentals"."properties" ADD COLUMN "purchase_price" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "rentals"."properties" ADD COLUMN "land_value" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "rentals"."properties" ADD COLUMN "placed_in_service" date;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rentals"."transactions" ADD CONSTRAINT "transactions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "rentals"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rentals"."transactions" ADD CONSTRAINT "transactions_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "rentals"."leases"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Closed to Supabase's anon/authenticated keys, like every other table here.
ALTER TABLE "rentals"."transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_property_date_idx" ON "rentals"."transactions" ("property_id", "date");--> statement-breakpoint
-- In production the app signs in as rentals_app, which has a policy on every rentals table.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rentals_app') THEN
  CREATE POLICY rentals_app_all ON "rentals"."transactions" FOR ALL TO rentals_app USING (true) WITH CHECK (true);
 END IF;
END $$;
