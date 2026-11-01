-- Whether the landlord or homeowner has paid for their plan. Set by Vachi staff on /platform.
ALTER TABLE "rentals"."accounts" ADD COLUMN IF NOT EXISTS "plan_paid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Invitation links from Vachi staff. Each carries a license (homes allowed, end date, paid) that the
-- new account gets when it signs up through the link. One use only.
CREATE TABLE IF NOT EXISTS "rentals"."license_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" varchar(64) NOT NULL,
	"email" varchar(320),
	"kind" varchar(10) DEFAULT 'landlord' NOT NULL,
	"home_limit" integer,
	"plan_expires" date,
	"paid" boolean DEFAULT false NOT NULL,
	"note" varchar(200),
	"created_by" uuid REFERENCES "rentals"."accounts"("id") ON DELETE SET NULL,
	"used_by" uuid REFERENCES "rentals"."accounts"("id") ON DELETE SET NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "license_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "rentals"."license_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rentals_app') THEN
  CREATE POLICY rentals_app_all ON "rentals"."license_invites" FOR ALL TO rentals_app USING (true) WITH CHECK (true);
 END IF;
END $$;
--> statement-breakpoint
-- Prices Vachi staff set on /platform. Each one sells a license: an account type, how many homes,
-- and how many months it lasts. Buyers pay once through Stripe; paying again extends the license.
CREATE TABLE IF NOT EXISTS "rentals"."price_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"kind" varchar(10) DEFAULT 'landlord' NOT NULL,
	"home_limit" integer,
	"months" integer DEFAULT 1 NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"description" varchar(300),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- One online payment for a price plan. When Stripe confirms it, a new buyer gets an invitation link
-- with the paid license; a signed-in buyer's own license is extended instead.
CREATE TABLE IF NOT EXISTS "rentals"."plan_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid REFERENCES "rentals"."price_plans"("id") ON DELETE SET NULL,
	"plan_name" varchar(80) NOT NULL,
	"email" varchar(320) NOT NULL,
	"full_name" varchar(200),
	"amount" numeric(10, 2) NOT NULL,
	"account_id" uuid REFERENCES "rentals"."accounts"("id") ON DELETE SET NULL,
	"invite_id" uuid REFERENCES "rentals"."license_invites"("id") ON DELETE SET NULL,
	"status" varchar(12) DEFAULT 'started' NOT NULL,
	"stripe_session_id" varchar(255),
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_purchases_session_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
ALTER TABLE "rentals"."price_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rentals"."plan_purchases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rentals_app') THEN
  CREATE POLICY rentals_app_all ON "rentals"."price_plans" FOR ALL TO rentals_app USING (true) WITH CHECK (true);
  CREATE POLICY rentals_app_all ON "rentals"."plan_purchases" FOR ALL TO rentals_app USING (true) WITH CHECK (true);
 END IF;
END $$;
--> statement-breakpoint
-- Every in-app notification is also emailed, unless the person turns that off on their Account page.
ALTER TABLE "rentals"."accounts" ADD COLUMN IF NOT EXISTS "email_notifications" boolean DEFAULT true NOT NULL;
