import { type AnyPgColumn, bigint, boolean, date, decimal, integer, pgSchema, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Everything lives in its own Postgres schema, `rentals`, so it never mixes with other apps'
 * tables that share the same Supabase project. Sign-in is Supabase Auth; `accounts` holds the
 * app's own record for each login (landlord or tenant), keyed to auth.users.id.
 *
 * Authorization note: Drizzle connects with DATABASE_URL, a privileged direct connection that
 * BYPASSES RLS. Every route checks the caller itself (src/lib/auth/guards.ts) and scopes landlord
 * data by properties.owner_id. RLS is enabled with no policies, so the anon/authenticated API keys
 * can't read these tables at all.
 */
export const rentals = pgSchema('rentals');

export const roleEnum = rentals.enum('role', ['landlord', 'tenant']);

export const accounts = rentals.table('accounts', {
  id: uuid('id').primaryKey(), // auth.users.id
  email: varchar('email', { length: 255 }).notNull().unique(),
  role: roleEnum('role').notNull(),
  fullName: varchar('full_name', { length: 200 }),
  phone: varchar('phone', { length: 30 }),
  // A co-landlord (a spouse or partner) manages the homes of the landlord named here, with the same
  // access. Empty for everyone else. Removing the owner removes their co-landlords' access too.
  actsFor: uuid('acts_for').references((): AnyPgColumn => accounts.id, { onDelete: 'cascade' }),
  isActive: boolean('is_active').notNull().default(true),
  // The owner's own Stripe account, where tenants' online rent goes. Only Stripe's ids are kept:
  // bank details stay with Stripe and never reach this app.
  stripeAccountId: varchar('stripe_account_id', { length: 64 }).unique(),
  stripeChargesEnabled: boolean('stripe_charges_enabled').notNull().default(false),
  // A landlord's plan, set by Vachi staff on /platform (like VTrack's company licenses). Empty means
  // no limit. After planExpires the account is read-only until the plan is renewed.
  homeLimit: integer('home_limit'),
  planExpires: date('plan_expires'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/** Vachi staff who manage landlords' plans on /platform. Added by hand in SQL, never through the app. */
export const platformAdmins = rentals.table('platform_admins', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const properties = rentals.table('properties', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 150 }).notNull(),
  address: text('address').notNull(),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 2 }).notNull().default('CT'),
  zip: varchar('zip', { length: 10 }),
  hoaName: varchar('hoa_name', { length: 150 }),
  hoaContact: text('hoa_contact'),
  notes: text('notes'),
  // Depreciation: what the home cost, how much of that is land, and the day it was first ready to rent.
  purchasePrice: decimal('purchase_price', { precision: 12, scale: 2 }),
  landValue: decimal('land_value', { precision: 12, scale: 2 }),
  placedInService: date('placed_in_service'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const leases = rentals.table('leases', {
  id: uuid('id').defaultRandom().primaryKey(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').references(() => accounts.id, { onDelete: 'set null' }),
  tenantName: varchar('tenant_name', { length: 200 }).notNull(),
  tenantEmail: varchar('tenant_email', { length: 255 }).notNull(),
  tenantPhone: varchar('tenant_phone', { length: 30 }),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  monthlyRent: decimal('monthly_rent', { precision: 10, scale: 2 }).notNull(),
  dueDay: integer('due_day').notNull().default(1),
  // Days after the due date before rent counts as late (Connecticut requires at least 9).
  graceDays: integer('grace_days').notNull().default(9),
  lateFee: decimal('late_fee', { precision: 10, scale: 2 }),
  securityDeposit: decimal('security_deposit', { precision: 10, scale: 2 }),
  status: varchar('status', { length: 10 }).notNull().default('active'), // 'active' | 'ended'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/** One month's rent for one lease. Status (due, late, partial, paid) is computed, see src/lib/rentals/rent.ts. */
export const rentCharges = rentals.table(
  'rent_charges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    leaseId: uuid('lease_id')
      .notNull()
      .references(() => leases.id, { onDelete: 'cascade' }),
    period: date('period').notNull(), // first day of the month
    dueDate: date('due_date').notNull(),
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
    paidAmount: decimal('paid_amount', { precision: 10, scale: 2 }).notNull().default('0'),
    paidOn: date('paid_on'),
    paymentMethod: varchar('payment_method', { length: 30 }),
    note: text('note'),
    // When the automatic rent reminder and late notice went out, so each is sent once.
    reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
    lateNoticeSentAt: timestamp('late_notice_sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ leasePeriod: unique('rent_charges_lease_period_key').on(t.leaseId, t.period) }),
);

export const repairRequests = rentals.table('repair_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  reportedBy: uuid('reported_by').references(() => accounts.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  urgency: varchar('urgency', { length: 10 }).notNull().default('normal'), // 'low' | 'normal' | 'urgent'
  status: varchar('status', { length: 12 }).notNull().default('open'), // 'open' | 'scheduled' | 'done' | 'cancelled'
  appointmentAt: timestamp('appointment_at', { withTimezone: true }),
  vendorName: varchar('vendor_name', { length: 150 }),
  vendorPhone: varchar('vendor_phone', { length: 30 }),
  cost: decimal('cost', { precision: 10, scale: 2 }),
  // Landlord-only; tenants never see these.
  notes: text('notes'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/** Insurance renewals, HOA dues, property tax and anything else with a due date. Landlord-only. */
export const reminders = rentals.table('reminders', {
  id: uuid('id').defaultRandom().primaryKey(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 12 }).notNull(), // 'insurance' | 'hoa' | 'tax' | 'other'
  title: varchar('title', { length: 200 }).notNull(),
  provider: varchar('provider', { length: 150 }),
  reference: varchar('reference', { length: 100 }), // policy or account number
  amount: decimal('amount', { precision: 10, scale: 2 }),
  dueDate: date('due_date').notNull(),
  repeat: varchar('repeat', { length: 10 }).notNull().default('none'), // 'none' | 'monthly' | 'quarterly' | 'yearly'
  notes: text('notes'),
  doneAt: timestamp('done_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * The money ledger for a home: expenses, income other than rent, and security deposits.
 * Rent comes from rent_charges and isn't copied here. Some rows are written for the landlord:
 * a bill reminder marked paid (source 'reminder', one row per due date) and a repair marked fixed
 * with a cost (source 'repair', kept in step with the repair).
 */
export const transactions = rentals.table(
  'transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    leaseId: uuid('lease_id').references(() => leases.id, { onDelete: 'set null' }),
    type: varchar('type', { length: 10 }).notNull(), // 'expense' | 'income' | 'deposit'
    category: varchar('category', { length: 30 }).notNull(), // see src/lib/rentals/money.ts
    date: date('date').notNull(),
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
    payee: varchar('payee', { length: 150 }), // who was paid, or who paid
    // Which account the money moved through: the rental business's, or the owner's own card.
    paidFrom: varchar('paid_from', { length: 10 }).notNull().default('business'), // 'business' | 'personal'
    description: text('description'),
    sourceType: varchar('source_type', { length: 10 }), // 'reminder' | 'repair'
    sourceId: uuid('source_id'),
    sourceRef: varchar('source_ref', { length: 20 }), // the reminder's due date, or 'repair'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ source: unique('transactions_source_key').on(t.sourceType, t.sourceId, t.sourceRef) }),
);

/**
 * A tenant's online rent payment (a bank debit through Stripe). A bank payment takes a few business
 * days: it stays 'processing' until Stripe confirms it, and only then counts toward the month.
 */
export const rentPayments = rentals.table('rent_payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  chargeId: uuid('charge_id')
    .notNull()
    .references(() => rentCharges.id, { onDelete: 'cascade' }),
  payerId: uuid('payer_id').references(() => accounts.id, { onDelete: 'set null' }),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  status: varchar('status', { length: 12 }).notNull().default('started'), // 'started' | 'processing' | 'succeeded' | 'failed' | 'expired'
  stripeAccountId: varchar('stripe_account_id', { length: 64 }).notNull(),
  stripeSessionId: varchar('stripe_session_id', { length: 255 }).unique(),
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
  failureMessage: text('failure_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Private papers for a home: insurance policies, HOA and tax bills, the deed, the signed lease.
 * Landlord-only; tenants never see these. The file itself lives in the private Supabase Storage
 * bucket "rentals-documents" under `storagePath`, and is only handed out as a short-lived link.
 */
export const documents = rentals.table('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  uploadedBy: uuid('uploaded_by').references(() => accounts.id, { onDelete: 'set null' }),
  kind: varchar('kind', { length: 12 }).notNull(), // see DOCUMENT_KINDS in src/lib/rentals/documents.ts
  name: varchar('name', { length: 200 }).notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  contentType: varchar('content_type', { length: 100 }).notNull(),
  size: bigint('size', { mode: 'number' }).notNull(),
  storagePath: text('storage_path').notNull().unique(),
  expiresOn: date('expires_on'), // a policy's end date, for example
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const notifications = rentals.table('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 200 }).notNull(),
  message: text('message').notNull(),
  urgent: boolean('urgent').notNull().default(false),
  link: varchar('link', { length: 300 }),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
