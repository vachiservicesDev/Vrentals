import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth/guards';
import { removeCoLandlord } from '@/lib/rentals/team';

/** The owner removes a co-landlord's access. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const gate = await requireOwner();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  if (!(await removeCoLandlord(gate.ownerId, params.id))) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
