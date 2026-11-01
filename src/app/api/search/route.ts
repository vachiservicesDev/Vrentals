import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, documents, leases, licenseInvites, platformAdmins, properties, reminders, repairRequests, transactions } from '@/db/schema';
import { requireLandlord } from '@/lib/auth/guards';

export interface SearchResult {
  type: 'Home' | 'Tenant' | 'Repair' | 'Bill' | 'Expense' | 'Document' | 'Account' | 'Invitation';
  title: string;
  subtitle: string;
  href: string;
}

const PER_TYPE = 6;

/** `%term%` for ILIKE, with the user's own % and _ taken literally. */
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const anyOf = (pattern: string, ...cols: Parameters<typeof ilike>[0][]): SQL => or(...cols.map((c) => ilike(c, pattern)))!;

/**
 * One search across everything a landlord or homeowner keeps here: homes, tenants, repairs, bills,
 * expenses and documents, only in their own homes. Vachi staff also find accounts and invitation
 * links. Each kind returns a handful of the best matches.
 */
export async function GET(request: NextRequest) {
  const gate = await requireLandlord();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ results: [] });
  const p = like(q);
  const mine = eq(properties.ownerId, gate.ownerId);

  const [homes, tenants, repairs, bills, expenses, docs, admin] = await Promise.all([
    db
      .select({ id: properties.id, name: properties.name, address: properties.address, city: properties.city })
      .from(properties)
      .where(and(mine, anyOf(p, properties.name, properties.address, properties.city, properties.zip)))
      .limit(PER_TYPE),
    db
      .select({ name: leases.tenantName, email: leases.tenantEmail, status: leases.status, homeId: properties.id, home: properties.name })
      .from(leases)
      .innerJoin(properties, eq(properties.id, leases.propertyId))
      .where(and(mine, anyOf(p, leases.tenantName, leases.tenantEmail, leases.tenantPhone)))
      .orderBy(desc(leases.startDate))
      .limit(PER_TYPE),
    db
      .select({ title: repairRequests.title, status: repairRequests.status, homeId: properties.id, home: properties.name })
      .from(repairRequests)
      .innerJoin(properties, eq(properties.id, repairRequests.propertyId))
      .where(and(mine, anyOf(p, repairRequests.title, repairRequests.description)))
      .orderBy(desc(repairRequests.createdAt))
      .limit(PER_TYPE),
    db
      .select({ title: reminders.title, dueDate: reminders.dueDate, homeId: properties.id, home: properties.name })
      .from(reminders)
      .innerJoin(properties, eq(properties.id, reminders.propertyId))
      .where(and(mine, anyOf(p, reminders.title)))
      .orderBy(desc(reminders.dueDate))
      .limit(PER_TYPE),
    db
      .select({ payee: transactions.payee, description: transactions.description, category: transactions.category, amount: transactions.amount, date: transactions.date, homeId: properties.id, home: properties.name })
      .from(transactions)
      .innerJoin(properties, eq(properties.id, transactions.propertyId))
      .where(and(mine, anyOf(p, transactions.payee, transactions.description, transactions.category)))
      .orderBy(desc(transactions.date))
      .limit(PER_TYPE),
    db
      .select({ name: documents.name, fileName: documents.fileName, homeId: properties.id, home: properties.name })
      .from(documents)
      .innerJoin(properties, eq(properties.id, documents.propertyId))
      .where(and(mine, anyOf(p, documents.name, documents.fileName)))
      .orderBy(desc(documents.createdAt))
      .limit(PER_TYPE),
    db.select({ id: platformAdmins.accountId }).from(platformAdmins).where(eq(platformAdmins.accountId, gate.account.id)).limit(1),
  ]);

  const results: SearchResult[] = [
    ...homes.map((h) => ({ type: 'Home' as const, title: h.name, subtitle: [h.address, h.city].filter(Boolean).join(', '), href: `/homes/${h.id}` })),
    ...tenants.map((t) => ({ type: 'Tenant' as const, title: t.name, subtitle: `${t.home} · ${t.email}`, href: `/homes/${t.homeId}#lease` })),
    ...repairs.map((r) => ({ type: 'Repair' as const, title: r.title, subtitle: `${r.home} · ${r.status.replace(/_/g, ' ')}`, href: `/homes/${r.homeId}#repairs` })),
    ...bills.map((b) => ({ type: 'Bill' as const, title: b.title, subtitle: `${b.home} · due ${b.dueDate}`, href: `/homes/${b.homeId}#bills` })),
    ...expenses.map((e) => ({ type: 'Expense' as const, title: e.payee || e.description || e.category, subtitle: `${e.home} · $${Number(e.amount).toFixed(2)} · ${e.date}`, href: `/homes/${e.homeId}#money` })),
    ...docs.map((d) => ({ type: 'Document' as const, title: d.name, subtitle: `${d.home} · ${d.fileName}`, href: `/homes/${d.homeId}#documents` })),
  ];

  if (admin.length) {
    const [people, invites] = await Promise.all([
      db
        .select({ email: accounts.email, fullName: accounts.fullName, kind: accounts.kind })
        .from(accounts)
        .where(and(eq(accounts.role, 'landlord'), anyOf(p, accounts.email, accounts.fullName)))
        .limit(PER_TYPE),
      db
        .select({ email: licenseInvites.email, note: licenseInvites.note, usedAt: licenseInvites.usedAt })
        .from(licenseInvites)
        .where(anyOf(p, licenseInvites.email, licenseInvites.note))
        .limit(PER_TYPE),
    ]);
    results.push(
      ...people.map((a) => ({ type: 'Account' as const, title: a.fullName || a.email, subtitle: `${a.kind === 'homeowner' ? 'Homeowner' : 'Landlord'} · ${a.email}`, href: `/platform?q=${encodeURIComponent(a.email)}` })),
      ...invites.map((i) => ({ type: 'Invitation' as const, title: i.email || i.note || 'Invitation link', subtitle: i.usedAt ? 'Signed up' : 'Waiting', href: `/platform?q=${encodeURIComponent(i.email || i.note || '')}` })),
    );
  }
  return NextResponse.json({ results });
}
