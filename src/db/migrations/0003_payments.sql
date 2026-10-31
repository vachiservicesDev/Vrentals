CREATE TABLE IF NOT EXISTS "rentals"."rent_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"charge_id" uuid NOT NULL,
	"payer_id" uuid,
	"amount" numeric(10, 2) NOT NULL,
	"status" varchar(12) DEFAULT 'started' NOT NULL,
	"stripe_account_id" varchar(64) NOT NULL,
	"stripe_session_id" varchar(255),
	"stripe_payment_intent_id" varchar(255),
	"failure_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rent_payments_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
ALTER TABLE "rentals"."accounts" ADD COLUMN "stripe_account_id" varchar(64);--> statement-breakpoint
ALTER TABLE "rentals"."accounts" ADD COLUMN "stripe_charges_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rentals"."rent_payments" ADD CONSTRAINT "rent_payments_charge_id_rent_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "rentals"."rent_charges"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rentals"."rent_payments" ADD CONSTRAINT "rent_payments_payer_id_accounts_id_fk" FOREIGN KEY ("payer_id") REFERENCES "rentals"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "rentals"."accounts" ADD CONSTRAINT "accounts_stripe_account_id_unique" UNIQUE("stripe_account_id");--> statement-breakpoint
-- Closed to Supabase's anon/authenticated keys, like every other table here.
ALTER TABLE "rentals"."rent_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rent_payments_charge_idx" ON "rentals"."rent_payments" ("charge_id");--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rentals_app') THEN
  CREATE POLICY rentals_app_all ON "rentals"."rent_payments" FOR ALL TO rentals_app USING (true) WITH CHECK (true);
 END IF;
END $$;
