CREATE SCHEMA "rentals";
--> statement-breakpoint
CREATE TYPE "rentals"."role" AS ENUM('landlord', 'tenant');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rentals"."accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" "rentals"."role" NOT NULL,
	"full_name" varchar(200),
	"phone" varchar(30),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rentals"."leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"tenant_id" uuid,
	"tenant_name" varchar(200) NOT NULL,
	"tenant_email" varchar(255) NOT NULL,
	"tenant_phone" varchar(30),
	"start_date" date NOT NULL,
	"end_date" date,
	"monthly_rent" numeric(10, 2) NOT NULL,
	"due_day" integer DEFAULT 1 NOT NULL,
	"grace_days" integer DEFAULT 9 NOT NULL,
	"late_fee" numeric(10, 2),
	"security_deposit" numeric(10, 2),
	"status" varchar(10) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rentals"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"message" text NOT NULL,
	"urgent" boolean DEFAULT false NOT NULL,
	"link" varchar(300),
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rentals"."properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(150) NOT NULL,
	"address" text NOT NULL,
	"city" varchar(100),
	"state" varchar(2) DEFAULT 'CT' NOT NULL,
	"zip" varchar(10),
	"hoa_name" varchar(150),
	"hoa_contact" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rentals"."reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"kind" varchar(12) NOT NULL,
	"title" varchar(200) NOT NULL,
	"provider" varchar(150),
	"reference" varchar(100),
	"amount" numeric(10, 2),
	"due_date" date NOT NULL,
	"repeat" varchar(10) DEFAULT 'none' NOT NULL,
	"notes" text,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rentals"."rent_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lease_id" uuid NOT NULL,
	"period" date NOT NULL,
	"due_date" date NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"paid_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"paid_on" date,
	"payment_method" varchar(30),
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rent_charges_lease_period_key" UNIQUE("lease_id","period")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rentals"."repair_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"reported_by" uuid,
	"title" varchar(200) NOT NULL,
	"description" text,
	"urgency" varchar(10) DEFAULT 'normal' NOT NULL,
	"status" varchar(12) DEFAULT 'open' NOT NULL,
	"appointment_at" timestamp with time zone,
	"vendor_name" varchar(150),
	"vendor_phone" varchar(30),
	"cost" numeric(10, 2),
	"notes" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rentals"."leases" ADD CONSTRAINT "leases_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "rentals"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rentals"."leases" ADD CONSTRAINT "leases_tenant_id_accounts_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "rentals"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rentals"."notifications" ADD CONSTRAINT "notifications_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "rentals"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rentals"."properties" ADD CONSTRAINT "properties_owner_id_accounts_id_fk" FOREIGN KEY ("owner_id") REFERENCES "rentals"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rentals"."reminders" ADD CONSTRAINT "reminders_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "rentals"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rentals"."rent_charges" ADD CONSTRAINT "rent_charges_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "rentals"."leases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rentals"."repair_requests" ADD CONSTRAINT "repair_requests_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "rentals"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rentals"."repair_requests" ADD CONSTRAINT "repair_requests_reported_by_accounts_id_fk" FOREIGN KEY ("reported_by") REFERENCES "rentals"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- The app reads these through Drizzle's privileged connection (bypassing RLS). RLS with no
-- policies keeps them closed to Supabase's anon/authenticated API keys.
ALTER TABLE "rentals"."accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rentals"."properties" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rentals"."leases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rentals"."rent_charges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rentals"."repair_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rentals"."reminders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rentals"."notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "properties_owner_id_idx" ON "rentals"."properties" ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leases_property_id_idx" ON "rentals"."leases" ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leases_tenant_id_idx" ON "rentals"."leases" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repair_requests_property_id_idx" ON "rentals"."repair_requests" ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repair_requests_reported_by_idx" ON "rentals"."repair_requests" ("reported_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminders_property_id_idx" ON "rentals"."reminders" ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_account_id_idx" ON "rentals"."notifications" ("account_id");
