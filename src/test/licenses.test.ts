import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, licenseInvites, notifications, platformAdmins } from '@/db/schema';
import { GET as listInvites, POST as createInvite } from '@/app/api/platform/invites/route';
import { DELETE as cancelInvite } from '@/app/api/platform/invites/[id]/route';
import { GET as platformList } from '@/app/api/platform/landlords/route';
import { PATCH as platformEdit } from '@/app/api/platform/landlords/[id]/route';
import { accountFor } from '@/lib/auth/guards';
import { licenseStatus } from '@/lib/rentals/plans';
import { resetDb, seedAccount } from './db';
import { jsonRequest } from './http';
import { setCurrentUser } from './mockAuth';

const json = (res: Response) => res.json() as Promise<any>;
const params = (id: string) => ({ params: { id } });
const patch = (body: unknown) => new NextRequest('http://localhost/api/x', { method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const del = () => new NextRequest('http://localhost/api/x', { method: 'DELETE' });
const login = (id: string, email: string, token?: string, kind = 'landlord') => ({ id, email, user_metadata: { signup_role: 'landlord', account_kind: kind, full_name: 'Pat', ...(token ? { license_invite: token } : {}) } });

async function staff() {
  const admin = await seedAccount({ email: 'staff@vachi.example' });
  await db.insert(platformAdmins).values({ accountId: admin.id });
  setCurrentUser(admin.id);
  return admin;
}

describe('licenses and invitation links', () => {
  beforeEach(resetDb);

  it('only Vachi staff can make or list invitation links', async () => {
    const owner = await seedAccount();
    setCurrentUser(owner.id);
    expect((await createInvite(jsonRequest({ kind: 'landlord' }))).status).toBe(404);
    expect((await listInvites()).status).toBe(404);
  });

  it('an invitation link creates the account with its license, once', async () => {
    const admin = await staff();
    const res = await createInvite(jsonRequest({ kind: 'homeowner', homeLimit: '3', planExpires: '2027-06-30', paid: true, note: 'Trial 1' }));
    expect(res.status).toBe(201);
    const { invite } = await json(res);
    expect(invite.token.length).toBeGreaterThanOrEqual(32);

    const account = await accountFor(login('8f6f2a8e-6f0a-4f43-8e1e-1d8f7b9c1b01', 'Pat@Example.com', invite.token, 'homeowner'));
    expect(account).toMatchObject({ email: 'pat@example.com', kind: 'homeowner', homeLimit: 3, planExpires: '2027-06-30', planPaid: true });
    const [used] = await db.select().from(licenseInvites).where(eq(licenseInvites.id, invite.id));
    expect(used.usedBy).toBe(account!.id);
    // Staff are told about the sign-up.
    const notices = await db.select().from(notifications).where(eq(notifications.accountId, admin.id));
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ title: 'New sign-up', link: '/platform' });
    expect(notices[0].message).toContain('Pat (pat@example.com) signed up as a homeowner');
    expect(notices[0].message).toContain('Trial 1');

    // The same link can't make a second account.
    expect(await accountFor(login('8f6f2a8e-6f0a-4f43-8e1e-1d8f7b9c1b02', 'other@example.com', invite.token))).toBeNull();
    // Signing in again still finds the first account.
    expect((await accountFor(login('8f6f2a8e-6f0a-4f43-8e1e-1d8f7b9c1b01', 'pat@example.com')))?.id).toBe(account!.id);

    const list = await json(await listInvites());
    expect(list.invites[0]).toMatchObject({ usedByEmail: 'pat@example.com' });
  });

  it('a link made out to an email only works for that email, and a cancelled link works for nobody', async () => {
    await staff();
    const { invite } = await json(await createInvite(jsonRequest({ kind: 'landlord', email: 'Lee@Example.com' })));
    expect(await accountFor(login('8f6f2a8e-6f0a-4f43-8e1e-1d8f7b9c1c01', 'someone@example.com', invite.token))).toBeNull();
    expect(await accountFor(login('8f6f2a8e-6f0a-4f43-8e1e-1d8f7b9c1c02', 'lee@example.com', invite.token))).toMatchObject({ email: 'lee@example.com', planPaid: false, homeLimit: null });

    const { invite: second } = await json(await createInvite(jsonRequest({ kind: 'landlord' })));
    expect((await cancelInvite(del(), params(second.id))).status).toBe(200);
    expect((await cancelInvite(del(), params(second.id))).status).toBe(409);
    expect(await accountFor(login('8f6f2a8e-6f0a-4f43-8e1e-1d8f7b9c1c03', 'x@example.com', second.token))).toBeNull();
  });

  it('staff can mark a license paid, and the status reads paid, expired or suspended', async () => {
    const owner = await seedAccount({ email: 'owner@example.com' });
    await staff();
    expect((await platformEdit(patch({ planPaid: true, planExpires: '2027-12-31' }), params(owner.id))).status).toBe(200);
    const row = (await json(await platformList())).landlords.find((l: any) => l.id === owner.id);
    expect(row).toMatchObject({ planPaid: true, kind: 'landlord' });

    const today = '2027-01-01';
    expect(licenseStatus({ homeLimit: null, planExpires: '2027-12-31', planPaid: true, isActive: true }, today)).toBe('paid');
    expect(licenseStatus({ homeLimit: null, planExpires: '2027-12-31', planPaid: false, isActive: true }, today)).toBe('trial');
    expect(licenseStatus({ homeLimit: null, planExpires: '2026-12-31', planPaid: true, isActive: true }, today)).toBe('expired');
    expect(licenseStatus({ homeLimit: null, planExpires: null, planPaid: false, isActive: false }, today)).toBe('suspended');
    expect(licenseStatus({ homeLimit: null, planExpires: null, planPaid: false, isActive: true }, today)).toBe('free');
    const [saved] = await db.select().from(accounts).where(eq(accounts.id, owner.id));
    expect(saved.planPaid).toBe(true);
  });
});
