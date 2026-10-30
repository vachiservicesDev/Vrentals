import { db } from '@/db';
import { notifications } from '@/db/schema';

/** An in-app notification for one account (shown under the bell and on /notifications). */
export async function notify(input: { accountId: string; title: string; message: string; urgent?: boolean; link?: string }) {
  await db.insert(notifications).values({ ...input, urgent: input.urgent ?? false });
}
