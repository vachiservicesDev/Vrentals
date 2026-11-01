import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, notifications } from '@/db/schema';
import { notify, notifyLandlords } from '@/lib/notify';
import { resetDb, seedAccount } from './db';

const mail = vi.hoisted(() => ({ sendMail: vi.fn(async () => undefined) }));
vi.mock('@/lib/email/mail', async (orig) => ({ ...(await orig<typeof import('@/lib/email/mail')>()), smtpConfigured: () => true, sendMail: mail.sendMail }));

describe('notifications by email', () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
  });

  it('emails a copy of each in-app notification, except to people who turned emails off', async () => {
    const owner = await seedAccount({ email: 'owner@example.com', fullName: 'Olivia Owner' });
    const partner = await seedAccount({ email: 'partner@example.com' });
    await db.update(accounts).set({ actsFor: owner.id }).where(eq(accounts.id, partner.id));
    await notifyLandlords(owner.id, { title: 'New repair: Unit 12', message: 'The sink leaks.', link: '/homes/x#repairs' });
    expect(await db.select().from(notifications)).toHaveLength(2);
    expect(mail.sendMail).toHaveBeenCalledTimes(2);
    expect(mail.sendMail).toHaveBeenCalledWith('owner@example.com', expect.objectContaining({ subject: 'New repair: Unit 12', text: expect.stringContaining('/homes/x#repairs') }));

    vi.clearAllMocks();
    await db.update(accounts).set({ emailNotifications: false }).where(eq(accounts.id, partner.id));
    await notifyLandlords(owner.id, { title: 'Rent paid', message: 'Paid.' });
    expect(mail.sendMail).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    await notify({ accountId: owner.id, title: 'Receipt', message: 'Sent separately.', email: false });
    expect(mail.sendMail).not.toHaveBeenCalled();
  });
});
