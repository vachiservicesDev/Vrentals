CREATE TABLE IF NOT EXISTS "rentals"."applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"status" varchar(10) DEFAULT 'new' NOT NULL,
	"full_name" varchar(200) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(30) NOT NULL,
	"move_in_date" date,
	"answers" jsonb NOT NULL,
	"signed_name" varchar(200) NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"landlord_notes" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rentals"."lease_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lease_id" uuid NOT NULL,
	"status" varchar(10) DEFAULT 'draft' NOT NULL,
	"terms" jsonb NOT NULL,
	"body" text NOT NULL,
	"body_sha256" varchar(64) NOT NULL,
	"landlord_name" varchar(200),
	"landlord_signed_at" timestamp with time zone,
	"landlord_signed_ip" varchar(64),
	"tenant_name" varchar(200),
	"tenant_signed_at" timestamp with time zone,
	"tenant_signed_ip" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rentals"."listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"headline" varchar(150),
	"description" text,
	"asking_rent" numeric(10, 2) NOT NULL,
	"security_deposit" numeric(10, 2),
	"available_from" date,
	"bedrooms" numeric(3, 1),
	"bathrooms" numeric(3, 1),
	"square_feet" integer,
	"pet_policy" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listings_property_id_unique" UNIQUE("property_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rentals"."showing_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(30),
	"note" text,
	"status" varchar(10) DEFAULT 'booked' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rentals"."showing_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"minutes" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rentals"."applications" ADD CONSTRAINT "applications_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "rentals"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rentals"."lease_agreements" ADD CONSTRAINT "lease_agreements_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "rentals"."leases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rentals"."listings" ADD CONSTRAINT "listings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "rentals"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rentals"."showing_bookings" ADD CONSTRAINT "showing_bookings_slot_id_showing_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "rentals"."showing_slots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rentals"."showing_slots" ADD CONSTRAINT "showing_slots_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "rentals"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lease_agreements_one_live_idx" ON "rentals"."lease_agreements" USING btree ("lease_id") WHERE "rentals"."lease_agreements"."status" <> 'void';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "showing_bookings_one_per_slot_idx" ON "rentals"."showing_bookings" USING btree ("slot_id") WHERE "rentals"."showing_bookings"."status" = 'booked';--> statement-breakpoint
-- Closed to Supabase's anon/authenticated keys, like every other table here.
ALTER TABLE "rentals"."listings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rentals"."showing_slots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rentals"."showing_bookings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rentals"."applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rentals"."lease_agreements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "showing_slots_property_idx" ON "rentals"."showing_slots" ("property_id", "starts_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "applications_property_idx" ON "rentals"."applications" ("property_id");--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rentals_app') THEN
  CREATE POLICY rentals_app_all ON "rentals"."listings" FOR ALL TO rentals_app USING (true) WITH CHECK (true);
  CREATE POLICY rentals_app_all ON "rentals"."showing_slots" FOR ALL TO rentals_app USING (true) WITH CHECK (true);
  CREATE POLICY rentals_app_all ON "rentals"."showing_bookings" FOR ALL TO rentals_app USING (true) WITH CHECK (true);
  CREATE POLICY rentals_app_all ON "rentals"."applications" FOR ALL TO rentals_app USING (true) WITH CHECK (true);
  CREATE POLICY rentals_app_all ON "rentals"."lease_agreements" FOR ALL TO rentals_app USING (true) WITH CHECK (true);
 END IF;
END $$;
