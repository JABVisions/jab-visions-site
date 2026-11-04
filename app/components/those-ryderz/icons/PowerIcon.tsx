import type { ReactNode, SVGProps } from 'react';
import type { AbilityId, RyderId } from '@/lib/ryderz-raid/config';
import { DERIVED_POWERS, type DerivedPowerKind } from '@/lib/ryderz-raid/progression/derived-powers';

/**
 * One symbol per power. Every glyph is drawn on a 24×24 grid in `currentColor`
 * with round 1.8 strokes, so the dock, the tree, the Database and the select
 * screen all tint it with the Ryder's aura. `GLYPHS` is typed against
 * `AbilityId`: adding a power without a symbol is a type error, so new powers
 * always ship with one.
 */

const dot = (cx: number, cy: number, r = 1.3) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;

/** Signature prop for each Ryder, used inside the tree-earned power glyphs. */
const MOTIF: Record<RyderId, ReactNode> = {
  rubi: (
    <>
      <path d="M12 3v13" />
      <path d="M8.5 14h7" />
      <path d="M10.5 20h3" />
      <path d="M12 16v4" />
    </>
  ),
  leo: <path d="M13.5 2.5 7 13h4.5L9.5 21.5 17 11h-4.5z" />,
  aaron: (
    <>
      <path d="M11 3v18" />
      <path d="M11 5.5c3.5 0 6.5 2 6.5 4.75S14.5 15 11 15" />
    </>
  ),
  zoe: (
    <>
      <circle cx="12" cy="12" r="6" />
      {dot(12, 12, 2)}
    </>
  ),
  keven: (
    <>
      <path d="M12 21V6" />
      <path d="M8.5 9.5 12 3l3.5 6.5" />
      <path d="M9 21h6" />
    </>
  ),
  lilly: (
    <>
      <path d="M12 3v18" />
      <path d="M6 6v4a6 6 0 0 0 12 0V6" />
    </>
  ),
  'kid-paranormal': (
    <>
      <path d="M7.5 13V7" />
      <path d="M12 12V4" />
      <path d="M16.5 13V7" />
      <path d="M7.5 13c0 5 2 8 4.5 8s4.5-3 4.5-8" />
    </>
  ),
  'agent-nyx': (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 7.5V12h3.5" />
    </>
  ),
  'marilyn-monroe': <path d="M12 3l2 6.5L20.5 12 14 14.5 12 21l-2-6.5L3.5 12 10 9.5z" />,
  'martin-luther-king': (
    <>
      <path d="M5 12h3" />
      <path d="M11 7.5a6 6 0 0 1 0 9" />
      <path d="M15.5 4a11 11 0 0 1 0 16" />
    </>
  ),
  marywantis: <path d="M12 3c4 5 6.5 8.3 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 11.3 8 8 12 3z" />,
  tj: (
    <>
      <path d="M12 2.5c2.2 0 3.5 2.2 3.5 5.5v10h-7V8c0-3.3 1.3-5.5 3.5-5.5z" />
      <path d="M8.5 21.5h7" />
    </>
  ),
};

const STROKE = 1.8;

/** A motif scaled and centred; the stroke is widened by the inverse scale so it stays the same weight as the frame. */
function Motif({ ryder, scale, cx = 12, cy = 12 }: { ryder: RyderId; scale: number; cx?: number; cy?: number }) {
  return (
    <g transform={`translate(${cx} ${cy}) scale(${scale}) translate(-12 -12)`} strokeWidth={STROKE / scale}>
      {MOTIF[ryder]}
    </g>
  );
}

/**
 * Tree-earned powers share a frame per kind: a breaker lifts the motif over a
 * shock ring, a volley streaks it forward, a nova rings it with a dashed
 * detonation, a snare brackets it like a target, a surge flanks it with speed
 * chevrons, a blitz sets it inside an eight-point burst.
 */
function derived(ryder: RyderId, kind: DerivedPowerKind): ReactNode {
  if (kind === 'breaker') {
    return (
      <>
        <path d="M3 20.5a9 9 0 0 1 18 0" />
        <Motif ryder={ryder} scale={0.62} cy={10} />
      </>
    );
  }
  if (kind === 'volley') {
    return (
      <>
        <path d="M2 8h5" />
        <path d="M2 12h7.5" />
        <path d="M2 16h5" />
        <Motif ryder={ryder} scale={0.58} cx={15.5} />
      </>
    );
  }
  if (kind === 'nova') {
    return (
      <>
        <circle cx="12" cy="12" r="10" strokeDasharray="2.6 2.6" />
        <Motif ryder={ryder} scale={0.5} />
      </>
    );
  }
  if (kind === 'snare') {
    return (
      <>
        <path d="M2.5 8V2.5H8" />
        <path d="M16 2.5h5.5V8" />
        <path d="M21.5 16v5.5H16" />
        <path d="M8 21.5H2.5V16" />
        <Motif ryder={ryder} scale={0.5} />
      </>
    );
  }
  if (kind === 'surge') {
    return (
      <>
        <path d="M2.5 7.5 6 12l-3.5 4.5" />
        <path d="M21.5 7.5 18 12l3.5 4.5" />
        <Motif ryder={ryder} scale={0.6} />
      </>
    );
  }
  return (
    <>
      <path d="M12 1.5l1.7 5.9 5.7-2.3-2.3 5.7 5.9 1.7-5.9 1.7 2.3 5.7-5.7-2.3-1.7 5.9-1.7-5.9-5.7 2.3 2.3-5.7-5.9-1.7 5.9-1.7-2.3-5.7 5.7 2.3z" />
      <Motif ryder={ryder} scale={0.42} />
    </>
  );
}

const CANON: Record<Exclude<AbilityId, keyof typeof DERIVED_POWERS>, ReactNode> = {
  // Rubi
  bladeFan: (
    <>
      <path d="M12 16V3" />
      <path d="M12 16 4.5 6" />
      <path d="M12 16l7.5-10" />
      <path d="M10.3 4.7 12 3l1.7 1.7" />
      <path d="M8.5 16h7" />
      <path d="M12 16v5.5" />
      <path d="M10 21.5h4" />
    </>
  ),
  duplicate: (
    <>
      <circle cx="9" cy="7.5" r="2.7" />
      <path d="M3.5 19.5V17a5.5 5.5 0 0 1 11 0v2.5" />
      <circle cx="16" cy="7.5" r="2.7" strokeDasharray="2 2" />
      <path d="M16.5 19.5V17a5.5 5.5 0 0 0-2.5-4.6" strokeDasharray="2 2" />
      <path d="M16 12c2.8 0 5 2.2 5 5v2.5" strokeDasharray="2 2" />
    </>
  ),
  envyPulse: (
    <>
      <path d="M4 20 18.5 5.5" />
      <path d="M20 20 5.5 5.5" />
      <path d="M14 5.5h4.5V10" />
      <path d="M10 5.5H5.5V10" />
    </>
  ),
  // Leo
  shockwave: (
    <>
      <path d="M12 2.5v9" />
      <path d="M8.5 8 12 11.5 15.5 8" />
      <path d="M3.5 16h17" />
      <path d="M12 16 9 21" />
      <path d="M12 16l3.5 4.5" />
      <path d="M7.5 16 5 19" />
      <path d="M16.5 16l2.5 3" />
    </>
  ),
  overdrive: (
    <>
      <path d="M2 12h3l2.2-4.5 3 9 2.5-6.5 1.6 3.5" />
      {dot(17.5, 9)}
      {dot(21, 12.5)}
      {dot(17.5, 16)}
    </>
  ),
  prideDash: (
    <>
      <path d="M9 5l7 7-7 7" />
      <path d="M14.5 5l7 7-7 7" />
      <path d="M2 8.5h4" />
      <path d="M2 12h5.5" />
      <path d="M2 15.5h4" />
    </>
  ),
  // Aaron
  cleave: (
    <>
      <path d="M4.5 18c0-5.5 3.2-10 8.5-12.5l3.5 3.5C12 10.5 9 14 8 19z" />
      <path d="M16.5 4.5c4.5 3.5 5.5 9 3 15" strokeDasharray="2 2.5" />
    </>
  ),
  blink: (
    <>
      <ellipse cx="12" cy="12" rx="5" ry="9" />
      <path d="M3 18.5 21 5.5" />
    </>
  ),
  greedSiphon: (
    <>
      <path d="M19 12a7 7 0 1 1-2.8-5.6" />
      <path d="M16.5 3v4h4" />
      <path d="M11.5 8.5v7" />
      <path d="M11.5 10c2 0 3.2.8 3.2 2s-1.2 2-3.2 2" />
    </>
  ),
  // Zoe
  lift: (
    <>
      <circle cx="12" cy="8" r="4.5" />
      <path d="M5.5 16.5c2.2 1.4 4.3 1.4 6.5 0s4.3-1.4 6.5 0" />
      <path d="M8 20.5c1.4.9 2.6.9 4 0s2.6-.9 4 0" />
    </>
  ),
  forcefield: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="12" r="5.8" />
      {dot(12, 12, 2.1)}
    </>
  ),
  heartbreak: (
    <>
      <path d="M12 20.5 4.3 12.8A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 7.7 6.2z" />
      <path d="M12 6.6 10.3 11l3.2 2.4-2 4.5" />
    </>
  ),
  // Keven
  decoy: (
    <>
      <path d="M3 14h18" />
      <circle cx="12" cy="7" r="2.7" />
      <path d="M8 14v-.5a4 4 0 0 1 8 0v.5" />
      <path d="M8.5 17.5h7" strokeDasharray="2 2" />
      <path d="M10 20.5h4" strokeDasharray="2 2" />
    </>
  ),
  phase: (
    <>
      <path d="M5 20.5V11a7 7 0 0 1 14 0v9.5l-2.3-1.8-2.4 1.8-2.3-1.8-2.3 1.8-2.4-1.8z" strokeDasharray="2.6 2" />
      {dot(9.5, 11, 1)}
      {dot(14.5, 11, 1)}
    </>
  ),
  dartStorm: (
    <>
      <path d="M3 21l8.5-8.5" />
      <path d="M8 12.5h3.5V16" />
      <path d="M9.5 21l6.5-6.5" />
      <path d="M12.5 14.5H16V18" />
      <path d="M15 21l5.5-5.5" />
      <path d="M17 15.5h3.5V19" />
    </>
  ),
  // Lilly
  soulDrain: (
    <>
      <path d="M12 12c0-1.4 1.4-2.3 2.8-1.8 1.7.6 2.4 2.7 1.4 4.6-1.3 2.5-4.5 3.2-7 1.7-3.2-1.9-3.9-6.2-1.5-9.1 2.8-3.4 8.1-3.8 11.6-.8" />
      {dot(4.5, 19)}
      {dot(20, 17.5, 1.1)}
      {dot(19.5, 5, 1)}
    </>
  ),
  giantStep: (
    <>
      <path d="M8.5 21.5c-2.6 0-3.8-2.2-3.2-5s2.3-5.5 4.6-5.5 3.3 2.2 3.1 5-1.9 5.5-4.5 5.5z" />
      {dot(4.5, 8, 1.3)}
      {dot(7.5, 5.5, 1.3)}
      {dot(11, 4.8, 1.3)}
      {dot(14.3, 6.3, 1.2)}
      <path d="M15.5 13.5a5.5 5.5 0 0 1 0 7.5" />
      <path d="M18.5 11a9 9 0 0 1 0 12" />
    </>
  ),
  animalAllegiance: (
    <>
      <ellipse cx="12" cy="15.8" rx="4.4" ry="3.6" />
      <circle cx="6.2" cy="11" r="1.8" />
      <circle cx="9.8" cy="7.3" r="1.8" />
      <circle cx="14.2" cy="7.3" r="1.8" />
      <circle cx="17.8" cy="11" r="1.8" />
    </>
  ),
  // Kid Paranormal
  phantomGrasp: (
    <>
      <path d="M6 13.5V7a1.5 1.5 0 0 1 3 0v5" />
      <path d="M9 12V4.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M12 12V5.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M15 12.5V8a1.5 1.5 0 0 1 3 0v7c0 3.6-2.6 6.5-6 6.5s-6-2.9-6-6.5v-1.5l-2.5-3" />
      <path d="M20.5 3.5 22 2M19 2.5l-.5-1.5" />
    </>
  ),
  paranormalProjection: (
    <>
      <circle cx="12" cy="7" r="2.5" />
      <path d="M8.3 19.5v-3.2a3.7 3.7 0 0 1 7.4 0v3.2" />
      <circle cx="4.8" cy="9.2" r="1.8" strokeDasharray="1.8 1.6" />
      <path d="M2.2 18.5v-2.3a2.6 2.6 0 0 1 4.6-1.6" strokeDasharray="1.8 1.6" />
      <circle cx="19.2" cy="9.2" r="1.8" strokeDasharray="1.8 1.6" />
      <path d="M21.8 18.5v-2.3a2.6 2.6 0 0 0-4.6-1.6" strokeDasharray="1.8 1.6" />
    </>
  ),
  dimensionalCollapse: (
    <>
      <path d="M12 2.5l8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5z" />
      <path d="M12 12l8.5-4.75" />
      <path d="M12 12v9.5" />
      <path d="M12 12 3.5 7.25" />
    </>
  ),
  // Agent Nyx
  temporalZap: (
    <>
      <path d="M2.5 12 20.5 4" />
      <path d="M2.5 12l18 8" />
      <path d="M13 9h5v6h-5z" />
      <path d="M15.5 9V7.5a1.5 1.5 0 0 0-3 0V9" />
    </>
  ),
  rewindProtocol: (
    <>
      <path d="M12 7v10l-8.5-5z" />
      <path d="M20.5 7v10L12 12z" />
      <path d="M4 4.5c5-2.5 11-2.5 16 0" strokeDasharray="2 2.5" />
    </>
  ),
  zeroHour: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5" />
      <path d="M12 12h3.5" />
      <path d="M12 3.5V5M12 19v1.5M3.5 12H5M19 12h1.5" />
    </>
  ),
  // Marilyn Monroe
  showtime: (
    <>
      <path d="M12 3.5l1.7 5.3 5.3 1.7-5.3 1.7-1.7 5.3-1.7-5.3L5 10.5l5.3-1.7z" />
      <path d="M19.5 16.5v3.5M17.75 18.25h3.5" />
      <path d="M4.5 15.5v3.5M2.75 17.25h3.5" />
      <path d="M12 19.5v2" />
    </>
  ),
  letsBeBad: (
    <>
      <path d="M3.5 5c3-1.2 14-1.2 17 0" />
      <path d="M6 9c2.5-.9 9.5-.9 12 0" />
      <path d="M8 13c1.8-.7 6.2-.7 8 0" />
      <path d="M10 17c1-.5 3-.5 4 0" />
      <path d="M11.5 21h1" />
    </>
  ),
  abracadabra: (
    <>
      <path d="M3.5 20.5 15 9" />
      <path d="M17.5 3v4.5M15.25 5.25h4.5" />
      {dot(12.5, 4.5, 1.1)}
      {dot(20.5, 11, 1.1)}
      {dot(16, 12.5, 0.9)}
    </>
  ),
  // Martin Luther King Jr.
  dreamVision: (
    <>
      <path d="M2.5 13s3.6-6 9.5-6 9.5 6 9.5 6-3.6 6-9.5 6-9.5-6-9.5-6z" />
      <circle cx="12" cy="13" r="2.6" />
      <path d="M12 2.5v2M6.2 4l1 1.8M17.8 4l-1 1.8" />
    </>
  ),
  proclaimPeace: (
    <>
      <path d="M2.5 12h4.5" />
      <path d="M10 7.5a6.2 6.2 0 0 1 0 9" />
      <path d="M14 4.5a10.5 10.5 0 0 1 0 15" />
      <path d="M18 2.2a14 14 0 0 1 0 19.6" />
    </>
  ),
  freeAtLast: (
    <>
      <path d="M9.5 14.5 7 17a3.5 3.5 0 0 1-5-5l2.5-2.5a3.5 3.5 0 0 1 4.6-.3" />
      <path d="M14.5 9.5 17 7a3.5 3.5 0 0 1 5 5l-2.5 2.5a3.5 3.5 0 0 1-4.6.3" />
      <path d="M12.5 4.5 13 2M8.5 6 6.5 4.5M15.5 18l2 1.5M11.5 19.5 11 22" />
    </>
  ),
  // Marywantis
  callMercy: (
    <>
      <path d="M12 2.5c4 5 6.5 8.4 6.5 11.7a6.5 6.5 0 0 1-13 0C5.5 10.9 8 7.5 12 2.5z" />
      <circle cx="12" cy="11.5" r="1.9" />
      <path d="M9.3 18.5v-.8a2.7 2.7 0 0 1 5.4 0v.8" />
    </>
  ),
  finKick: (
    <>
      <path d="M12.5 21.5c-2-6 0-11.5 6.5-17-1 6.5 1 10.5 3 12.5-3.3-1-6.5 0-9.5 4.5z" />
      <path d="M2.5 9.5c2.2.3 3.8 1.6 4.8 3.8" />
      <path d="M2.5 15c1.6.2 2.8 1.1 3.5 2.7" />
    </>
  ),
  wavePool: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M4.5 10c2 1.6 3.8 1.6 5.5 0s3.5-1.6 5.5 0 3.2 1.3 4 1" />
      <path d="M5 15c2 1.6 3.8 1.6 5.5 0s3.5-1.6 5.5 0 2.6 1.3 3.3 1" />
    </>
  ),
  // TJ
  deathStrike: (
    <>
      <path d="M2.5 7.5h9v4H9L8 16H4.5l1-4.5h-3z" />
      <path d="M21.5 7.5h-9v4H15l1 4.5h3.5l-1-4.5h3z" />
      <path d="M12 2.5v3M10 4h4" />
    </>
  ),
  mindControl: (
    <>
      <circle cx="12" cy="9.5" r="4.8" />
      <path d="M7.5 21v-1.5a4.5 4.5 0 0 1 9 0V21" />
      <ellipse cx="12" cy="9.5" rx="9.5" ry="3" strokeDasharray="2 2" />
    </>
  ),
  riot: (
    <>
      {dot(12, 12, 2.3)}
      <path d="M17 12h4.5M7 12H2.5M12 7V2.5M12 17v4.5" />
      <path d="M15.5 8.5l3.2-3.2M8.5 8.5 5.3 5.3M15.5 15.5l3.2 3.2M8.5 15.5l-3.2 3.2" />
    </>
  ),
};

const DERIVED_GLYPHS = Object.fromEntries(
  Object.entries(DERIVED_POWERS).map(([id, spec]) => [id, derived(spec.owner, spec.kind)]),
) as Record<keyof typeof DERIVED_POWERS, ReactNode>;

export const GLYPHS: Record<AbilityId, ReactNode> = { ...CANON, ...DERIVED_GLYPHS };

export default function PowerIcon({
  id,
  size = 22,
  title,
  ...rest
}: {
  id: AbilityId;
  size?: number;
  /** Accessible name; omitted glyphs are decorative. */
  title?: string;
} & Omit<SVGProps<SVGSVGElement>, 'id' | 'width' | 'height'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {GLYPHS[id]}
    </svg>
  );
}
