-- A bill or receipt can belong to one money entry, so each expense shows its receipt.
ALTER TABLE "rentals"."documents" ADD COLUMN IF NOT EXISTS "transaction_id" uuid REFERENCES "rentals"."transactions"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_transaction_idx" ON "rentals"."documents" ("transaction_id");
--> statement-breakpoint
-- What the person uses Vrentals for, chosen at sign-up: 'landlord' (homes they rent out) or 'homeowner' (the home they live in). It sets their menus and wording.
ALTER TABLE "rentals"."accounts" ADD COLUMN IF NOT EXISTS "kind" varchar(10) DEFAULT 'landlord' NOT NULL;
