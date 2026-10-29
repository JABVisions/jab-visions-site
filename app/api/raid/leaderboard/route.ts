import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { RYDERZ } from '@/lib/ryderz-raid/config';
import { getSupabasePublicConfig } from '@/lib/supabase/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIFFICULTIES = ['easy', 'normal', 'hard', 'nightmare'] as const;
type Difficulty = (typeof DIFFICULTIES)[number];

function database() {
  const { url, key, configured } = getSupabasePublicConfig();
  return configured ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

function boundedInt(value: unknown, min: number, max: number) {
  if (typeof value !== 'number') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? Math.round(number) : null;
}

export async function GET(request: NextRequest) {
  const supabase = database();
  if (!supabase) return NextResponse.json({ error: 'Leaderboard is not configured yet.' }, { status: 503 });

  const difficulty = request.nextUrl.searchParams.get('difficulty');
  if (difficulty && difficulty !== 'all' && !DIFFICULTIES.includes(difficulty as Difficulty)) {
    return NextResponse.json({ error: 'Invalid difficulty.' }, { status: 400 });
  }

  let query = supabase
    .from('ryderz_raid_leaderboard')
    .select('id, display_name, ryder_id, difficulty, result, wave_reached, kills, damage, score, created_at')
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(50);
  if (difficulty && difficulty !== 'all') query = query.eq('difficulty', difficulty);

  const { data, error } = await query;
  if (error) {
    const status = error.code === '42P01' || error.code === 'PGRST205' ? 503 : 500;
    return NextResponse.json({ error: status === 503 ? 'Leaderboard storage needs to be set up.' : 'Could not load leaderboard.' }, { status });
  }

  return NextResponse.json({ entries: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const supabase = database();
  if (!supabase) return NextResponse.json({ error: 'Leaderboard is not configured yet.' }, { status: 503 });

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const body = parsed as Record<string, unknown>;

  const submissionId = typeof body.submissionId === 'string' ? body.submissionId : '';
  const displayName = typeof body.displayName === 'string'
    ? body.displayName.replace(/[<>\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ').slice(0, 16)
    : '';
  const ryderId = typeof body.ryderId === 'string' && Object.prototype.hasOwnProperty.call(RYDERZ, body.ryderId) ? body.ryderId : '';
  const difficulty = typeof body.difficulty === 'string' && DIFFICULTIES.includes(body.difficulty as Difficulty) ? body.difficulty : '';
  const result = body.result === 'victory' || body.result === 'defeat' ? body.result : '';
  const waveReached = boundedInt(body.waveReached, 1, 999);
  const kills = boundedInt(body.kills, 0, 100000);
  const damage = boundedInt(body.damage, 0, 100000000);

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId)) {
    return NextResponse.json({ error: 'Invalid run ID.' }, { status: 400 });
  }
  if (displayName.length < 2 || !ryderId || !difficulty || !result || waveReached === null || kills === null || damage === null) {
    return NextResponse.json({ error: 'Run details are incomplete.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('ryderz_raid_leaderboard')
    .insert({
      submission_id: submissionId,
      display_name: displayName,
      ryder_id: ryderId,
      difficulty,
      result,
      wave_reached: waveReached,
      kills,
      damage,
    })
    .select('id, score')
    .single();

  if (error?.code === '23505') return NextResponse.json({ ok: true, duplicate: true });
  if (error?.code === '23514') {
    console.error('[raid-leaderboard] database rejected the Ryder roster', { code: error.code, message: error.message });
    return NextResponse.json({ error: 'Leaderboard roster needs a database update before this Ryder can be posted.' }, { status: 503 });
  }
  if (error) {
    console.error('[raid-leaderboard] run submission failed', { code: error.code, message: error.message });
    return NextResponse.json({ error: 'Could not save this run. Your score is still available to retry from this screen.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, score: data.score });
}
