ALTER TABLE "rentals"."properties" ADD COLUMN IF NOT EXISTS "use" varchar(10) DEFAULT 'rental' NOT NULL;--> statement-breakpoint
ALTER TABLE "rentals"."properties" ADD COLUMN IF NOT EXISTS "home_sqft" integer;--> statement-breakpoint
ALTER TABLE "rentals"."properties" ADD COLUMN IF NOT EXISTS "office_sqft" integer;
