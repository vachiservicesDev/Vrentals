'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAction, useResource } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Alert, Chip, EmptyState, Loading, PageHeader, When } from '@/components/ui/ui';

interface Item {
  id: string;
  title: string;
  message: string;
  urgent: boolean;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useResource<{ notifications: Item[] }>('/api/notifications');
  const action = useAction();
  const items = data?.notifications ?? [];
  const unread = items.filter((n) => !n.readAt).length;

  async function readAll() {
    const result = await action.run('read', '/api/notifications/read-all', { method: 'POST' });
    if (result.ok) {
      reload();
      router.refresh();
    }
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          unread > 0 && (
            <Button variant="secondary" onClick={readAll} busy={action.busy === 'read'} busyLabel="Marking…">
              Mark all as read
            </Button>
          )
        }
      />
      {error && <Alert title="Couldn't load notifications">{error}</Alert>}
      {loading && !data ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState>Nothing yet. Repairs, visits and payments show up here.</EmptyState>
      ) : (
        <ul className="grid gap-3">
          {items.map((n) => (
            <li key={n.id} className={`rounded-lg border bg-white p-4 sm:p-5 ${n.readAt ? 'border-line' : 'border-accent-600/40'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-semibold text-ink">{n.title}</p>
                <span className="flex items-center gap-2 text-sm text-muted">
                  {n.urgent && <Chip tone="danger">Urgent</Chip>}
                  {!n.readAt && <Chip tone="new">New</Chip>}
                  <When iso={n.createdAt} withTime />
                </span>
              </div>
              <p className="mt-1 text-ink-2">{n.message}</p>
              {n.link && (
                <Link href={n.link} className="link mt-2 inline-block text-sm">
                  Open
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
