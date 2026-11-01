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
