import { isPlayableRyder, type RaidDifficulty } from '@/lib/ryderz-raid/raid/squad';
import { actRoom, createRoom, readRoom, type RaidSnapshot } from '@/lib/ryderz-raid/raid/roomStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Authoritative raid rooms for this Node process.
 * A serverless host with more than one instance will not share these rooms.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code') ?? '';
  const guest = url.searchParams.get('guest') ?? '';
  const room = readRoom(code, guest);
  if (!room) return Response.json({ error: 'room not found' }, { status: 404 });
  return Response.json(room);
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    action?: string;
    guestId?: string;
    name?: string;
    ryderId?: string;
    code?: string;
    slot?: number;
    ready?: boolean;
    difficulty?: RaidDifficulty;
    arenaId?: string;
    snapshot?: RaidSnapshot;
    x?: number;
    z?: number;
  };
  const guestId = body.guestId ?? '';
  try {
    if (body.action === 'create') {
      const ryder = isPlayableRyder(body.ryderId) ? body.ryderId : 'rubi';
      return Response.json(createRoom(guestId, body.name ?? 'Host', ryder));
    }
    if (
      body.action !== 'join' &&
      body.action !== 'claim' &&
      body.action !== 'ready' &&
      body.action !== 'difficulty' &&
      body.action !== 'arena' &&
      body.action !== 'character' &&
      body.action !== 'start' &&
      body.action !== 'leave' &&
      body.action !== 'snapshot' &&
      body.action !== 'return' &&
      body.action !== 'input'
    ) {
      return Response.json({ error: 'unknown action' }, { status: 400 });
    }
    return Response.json(
      actRoom({
        action: body.action,
        guestId,
        name: body.name,
        code: body.code,
        slot: body.slot,
        ryderId: body.ryderId,
        ready: body.ready,
        difficulty: body.difficulty,
        arenaId: body.arenaId,
        snapshot: body.snapshot,
        x: body.x,
        z: body.z,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'room error';
    return Response.json({ error: message }, { status: 400 });
  }
}
