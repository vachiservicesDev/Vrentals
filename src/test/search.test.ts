import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { platformAdmins, properties, transactions } from '@/db/schema';
import { GET as search } from '@/app/api/search/route';
import { resetDb, seedAccount } from './db';
import { getRequest } from './http';
import { setCurrentUser } from './mockAuth';

const find = async (q: string) => ((await (await search(getRequest(`http://localhost/api/search?q=${encodeURIComponent(q)}`))).json()) as any).results;

describe('global search', () => {
  beforeEach(resetDb);

  it('finds only the signed-in owner’s own records, and staff also find accounts', async () => {
    const a = await seedAccount({ email: 'ann@example.com', fullName: 'Ann Owner' });
    const b = await seedAccount({ email: 'bob@example.com' });
    const [home] = await db.insert(properties).values({ ownerId: a.id, name: 'Maple Cottage', address: '12 Maple St' }).returning();
    await db.insert(properties).values({ ownerId: b.id, name: 'Maple Tower', address: '9 Elm St' });
    await db.insert(transactions).values({ propertyId: home.id, type: 'expense', category: 'repairs', date: '2026-10-01', amount: '120.00', payee: 'Maple Plumbing' });

    setCurrentUser(a.id);
    const results = await find('maple');
    expect(results.map((r: any) => r.title).sort()).toEqual(['Maple Cottage', 'Maple Plumbing']);
    expect(results.find((r: any) => r.type === 'Expense').href).toBe(`/homes/${home.id}#money`);
    expect(await find('m')).toEqual([]); // too short
    expect(await find('100%')).toEqual([]); // % is literal, not a wildcard

    await db.insert(platformAdmins).values({ accountId: b.id });
    setCurrentUser(b.id);
    const staff = await find('ann');
    expect(staff).toContainEqual(expect.objectContaining({ type: 'Account', title: 'Ann Owner' }));
    expect(staff.some((r: any) => r.title === 'Maple Cottage')).toBe(false);
  });
});
