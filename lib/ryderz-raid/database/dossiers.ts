import { ENEMIES, RYDERZ, RYDER_ORDER, type EnemyKind, type RyderId } from '../config';

/**
 * The Database: a journal of everyone the signal has touched. Each entry reads
 * like an investigator's dossier: a classification block, a psychological
 * profile, field notes from the block, and the kit as recorded in combat.
 * Stats and powers come straight from the live specs so the journal never
 * drifts from the game.
 */
export type DossierSection = 'ryderz' | 'boomers' | 'pad' | 'universe' | 'villains' | 'hosts' | 'classified';

export const DOSSIER_SECTIONS: DossierSection[] = ['ryderz', 'boomers', 'pad', 'universe', 'villains', 'hosts', 'classified'];

export const SECTION_LABEL: Record<DossierSection, { title: string; blurb: string; code: string }> = {
  ryderz: { title: 'Those Ryderz', blurb: 'Signal-marked. Seven sins, five signals, one awakening.', code: 'RZ' },
  boomers: { title: 'Those Boomers', blurb: 'Virtues returned. Older signals that never went dark.', code: 'BM' },
  pad: { title: 'P.A.D.', blurb: 'Paranormal Activity Division. Government operatives.', code: 'PD' },
  universe: { title: 'JAB Visions', blurb: 'Crossovers from the wider mythology.', code: 'JV' },
  villains: { title: 'Threats', blurb: 'Hostiles with their own signal.', code: 'TH' },
  hosts: { title: 'Hosts', blurb: 'Civilians bound to the Broadcast.', code: 'HS' },
  classified: { title: 'Classified', blurb: 'Files sealed pending clearance.', code: 'CL' },
};

export interface Dossier {
  id: string;
  /** Playable body for the showcase; null for hosts and sealed files. */
  ryderId: RyderId | null;
  /** Journal number, e.g. RZ-001. */
  entry: string;
  section: DossierSection;
  name: string;
  codename: string;
  designation: string;
  affiliation: string;
  status: string;
  /** 1 (nuisance) to 5 (catastrophic). */
  threat: 1 | 2 | 3 | 4 | 5;
  /** One-line reading off the signal scanner. */
  signal: string;
  /** Psychological profile, in paragraphs. */
  profile: string[];
  /** Investigator's field notes from the block. */
  notes: string[];
  /** Short descriptors stamped on the file. */
  tags: string[];
  /** Cast performer, when the character has been cast. */
  performer?: string;
  /** Sealed files render redacted bars instead of text. */
  sealed?: boolean;
  /** Hosts: the enemy kind whose numbers the file quotes. */
  enemy?: EnemyKind;
}

interface Lore {
  section: DossierSection;
  affiliation: string;
  status: string;
  threat: Dossier['threat'];
  signal: string;
  profile: string[];
  notes: string[];
  tags: string[];
  performer?: string;
}

const RYDER_LORE: Record<RyderId, Lore> = {
  rubi: {
    section: 'ryderz',
    affiliation: 'Those Ryderz',
    status: 'Active · Signal-bound',
    threat: 4,
    signal: 'Unstable brilliance, multiplied desire, emotional precision.',
    performer: 'Chaeyeon Kim',
    profile: [
      'Rubi carries confidence like armor, but underneath the shine is the ache of feeling overlooked. Her power splits her into multiples, forcing her to face every version of herself she tries to outrun.',
      'The red aura answers envy. Every echo she sends out is a Rubi who was chosen, who was seen first, who got there before she did. She fights alongside them and resents them in the same breath.',
    ],
    notes: [
      'Opens with the blade. The four-cut combo is practiced to the point of ritual; the last cut always lands with knockback.',
      'Echo-selves hunt independently and dissolve on their own. Do not count them as a reinforcement tally; count them as her mood.',
      'Lunges from the front while a clone cuts from behind. Watch the space you cannot see.',
      'You never fight Rubi alone.',
    ],
    tags: ['Duplication', 'Empathic awareness', 'Red light blade'],
  },
  leo: {
    section: 'ryderz',
    affiliation: 'Those Ryderz',
    status: 'Active · Signal-bound',
    threat: 4,
    signal: 'High velocity aura, elevated self-image, fracture risk under humiliation.',
    performer: 'Haylee Brown',
    profile: [
      'Leo is fashion, pressure, ego, and command wrapped into one dangerous spark. She moves faster than most people can understand her, but pride keeps her from slowing down long enough to be truly seen.',
      'The yellow aura runs hot. She treats a fight like a runway and the ground like something that owes her a crater.',
    ],
    notes: [
      'Kinetic impact on landing. She goes up to come down; the dive is the attack, not the jump.',
      'Overdrive leaves marks on everything she passes. The marks detonate when she stops. Keep moving until she does.',
      'Pride Rush is a shoulder charge steered mid-run. The last body in line takes the knuckle.',
      'Humiliation changes her tempo. The faster she is, the more she is hiding.',
    ],
    tags: ['Super speed', 'Kinetic impact', 'Spiked knuckles'],
  },
  aaron: {
    section: 'ryderz',
    affiliation: 'Those Ryderz',
    status: 'Active · Signal-bound',
    threat: 4,
    signal: 'Spatial distortion, guarded attachment, emotional concealment.',
    performer: 'Hadi Taloustan',
    profile: [
      'Aaron is soft-spoken, observant, and harder to read than he looks. His greed is not just about wanting more. It is about wanting to keep what makes him feel safe, even when his heart is split between loyalty and longing.',
      'The black aura does not burst outward. It pulls inward, like everything else about him.',
    ],
    notes: [
      'Everything is done with the axe. The boomerang loop launches whatever it crosses and curves back to his hand; the arc is wider than it looks.',
      'Portals open behind the nearest body. The cut comes at neck height a half-second after he vanishes.',
      'Greed Swing feeds aura back with every host it throws. The longer the spin runs, the more he has left.',
      'Heaviest hitter on the roster. Slowest to regenerate. He knows both.',
    ],
    tags: ['Teleportation', 'Shadow movement', 'Black aura axe'],
  },
  zoe: {
    section: 'ryderz',
    affiliation: 'Those Ryderz',
    status: 'Active · Signal-bound',
    threat: 3,
    signal: 'Defensive glamour, unstable longing, high-impact emotional discharge.',
    performer: 'Aria Patterson',
    profile: [
      'Zoe is bubbly, reckless, romantic, and louder than the pain she refuses to explain. Her aura protects her body before she learns how to protect her spirit.',
      'Three plasma orbs orbit her at all times. She calls them company. The scanner calls them a shield that has not decided what it is for.',
    ],
    notes: [
      'Levitates inside a plasma sphere and steers it through the crowd. Contact burns and shoves; the drain is constant.',
      'The disc expands as it travels. Distance makes it worse, not better.',
      'Heartbreak Blitz strafes from above and finishes with a burst. The landing is clean; the ground is not.',
      'Largest aura pool of the five. Smallest tolerance for being ignored.',
    ],
    tags: ['Force fields', 'Levitation', 'Blue energy projection'],
  },
  keven: {
    section: 'ryderz',
    affiliation: 'Those Ryderz',
    status: 'Active · Signal-bound',
    threat: 3,
    signal: 'Phantom pulse, delayed activation, redeemer-class anomaly.',
    performer: 'John Andy',
    profile: [
      'Keven looks unserious until the room needs saving. His stillness is mistaken for weakness, but his power lives in patience, timing, and the strange courage to disappear before striking back.',
      'The pink aura phases. Sloth, in his case, is not laziness. It is the refusal to move until the move matters.',
    ],
    notes: [
      'Hunts from under the floor. The eruption is telegraphed by a ripple in the pavement; by then he has your ankle.',
      'Phantom Phase makes him intangible and invisible to hosts. Anything he walks through takes phase damage.',
      'Dart Storm is loosed from the top of a backflip. The darts home. Cover does not help.',
      'Redeemer-class flag on file. Reason withheld.',
    ],
    tags: ['Invisibility', 'Phasing', 'Phantom movement', 'Pink energy darts'],
  },
  lilly: {
    section: 'ryderz',
    affiliation: 'Those Ryderz · Horseman',
    status: 'Active · Famine',
    threat: 5,
    signal: 'Hunger field, mass displacement, summoning rite detected.',
    profile: [
      'Lilly James is Famine. Where the five Ryderz were marked by sin, she was named for a plague, and she wears the name without apology.',
      'The emerald aura takes. Health, ground, scale, allegiance; everything in her radius belongs to her for as long as the vortex holds.',
    ],
    notes: [
      'Soul Drain spins an emerald vortex that feeds her from everything inside it. Leave the circle before you are part of it.',
      'Giant Step quadruples her height. Each footfall shocks the ground around the impact.',
      'Animal Allegiance opens a summoning circle. Registered animals answer and hunt independently.',
      'Mounts the pitchfork and flies. Altitude is not a retreat; it is a reposition.',
    ],
    tags: ['Life drain', 'Growth', 'Summoning', 'Emerald pitchfork', 'Flight'],
  },
  'kid-paranormal': {
    section: 'pad',
    affiliation: 'JAB Visions: Paranormal Activity Division',
    status: 'Active · Operative',
    threat: 4,
    signal: 'Unipolar energy, dimensional shear, resonance climbing.',
    profile: [
      'A child-sized operative under a blanket cape, cleared for field work by a division that does not explain itself. The paperwork lists an age. The field reports do not believe it.',
      'Unipolar Energy manifests as spectral hands, illusion copies, and geometry that should not fold. Resonance builds with every hit landed.',
    ],
    notes: [
      'Phantom Grasp cracks the air open. Two hands seize, lift, and slam into a radial shockwave.',
      'Sends two attacking copies and one decoy, then swaps places with the nearest. The swap stops at walls.',
      'Fourth-Dimensional Collapse folds a construct around everyone nearby. They hang inside until it bursts.',
      'Teleports through goo. Do not ask.',
    ],
    tags: ['Unipolar constructs', 'Illusions', 'Dimensional fold'],
  },
  'agent-nyx': {
    section: 'pad',
    affiliation: 'JAB Visions: Paranormal Activity Division',
    status: 'Active · Field agent',
    threat: 3,
    signal: 'Temporal casing, trail rewind, suppression field.',
    profile: [
      'Agent Yesterday-Nyx works the wrist guard and keeps her own counsel. The guard does the casing, the rewinding, and the suppression; she does the hitting.',
      'Nothing she does changes the clock. The scanner is specific about this. Her file is not.',
    ],
    notes: [
      'Temporal Zap locks up to five targets in a cone. Cased bodies release on a timer. Dodging out of the cone during the charge avoids it.',
      'Rewind Protocol slides her back along her own path, restores a capped share of lost health, and leaves a decoy where she stood.',
      'Zero Hour slows everything inside a violet field and lands one impact when it closes. She keeps fighting with her hands throughout.',
      'The guard is P.A.D. issue. The reflexes are hers.',
    ],
    tags: ['Stasis', 'Rewind', 'Suppression', 'P.A.D. wrist guard'],
  },
  'marilyn-monroe': {
    section: 'boomers',
    affiliation: 'Those Boomers',
    status: 'Returned · Charity',
    threat: 3,
    signal: 'Blue dust, projected glamour, mass restoration.',
    profile: [
      'Marilyn came back as Charity, and she gives it the way she gave everything: all at once, in public, with the lights on.',
      'The blue aura sparkles rather than arcs. Boomers do not run electricity. They run memory.',
    ],
    notes: [
      'Showtime sends three projections cartwheeling at three different targets. Each hits once and stops at a wall.',
      "Let's Be Bad is a spinning kick she holds for as long as she wants. Contact does not cancel it.",
      'Abracadabra heals every ally in range and hits every enemy once. Only the bodies it kills burst into blue dust.',
      'Gives more than she keeps. That is the whole file.',
    ],
    tags: ['Projection', 'Restoration', 'Blue dust'],
  },
  'martin-luther-king': {
    section: 'boomers',
    affiliation: 'Those Boomers',
    status: 'Returned · Justice',
    threat: 3,
    signal: 'Burgundy wave, pacification, blessing active.',
    profile: [
      'Martin returned as Justice. He does not raise his voice. The word is the weapon and the aura carries it to the back of the crowd.',
      'The burgundy wave pacifies before it punishes. Hosts stop mid-swing and wake up confused. Heavies resist. He expected that.',
    ],
    notes: [
      'Dream Vision washes out to twelve metres and stops every attack inside it. It deals no damage.',
      'Proclaim Peace holds a beam down the aim line. Bodies inside freeze and take damage every half-second until they leave it.',
      'Free at Last doubles strength and speed and halves incoming damage for twelve seconds. It does not stack.',
      'Highest health on the roster. He has been hit before.',
    ],
    tags: ['Pacification', 'Beam', 'Blessing'],
  },
  marywantis: {
    section: 'universe',
    affiliation: 'JAB Visions Universe',
    status: 'Active · Tidecaller',
    threat: 4,
    signal: 'Living water, guardian summon, whirlpool pressure.',
    profile: [
      'Marywantis is a mermaid who fights on land with the sea she brought with her. The water is alive, it listens to her, and it does not like you.',
      'Mercy is not a second model. Mercy is a guardian made of current, and she arrives when called.',
    ],
    notes: [
      'Call Mercy summons the guardian for twelve seconds. She imprisons up to three enemies and drowns them over time. Bosses are shoved, not caged.',
      'Fin Kick is a steerable cartwheel of four hits and a crescent that knocks back. No cooldown; the tide cuts out at random.',
      'Wave Pool pulls, lifts, and spins everything caught inside, then bursts outward. Nothing is thrown through walls.',
      'Sprinting while moving is a surf. She is faster on the straight than the file suggests.',
    ],
    tags: ['Living water', 'Guardian summon', 'Whirlpool', 'Mermaid'],
  },
  tj: {
    section: 'villains',
    affiliation: 'Unaffiliated · Hostile',
    status: 'At large · Ringmaster of Death',
    threat: 5,
    signal: 'Forest-green influence, crowd inversion, riot cascade.',
    profile: [
      'TJ calls himself the Ringmaster of Death and runs the block like a circus where the audience is the act. Twin guns are the least dangerous thing about him.',
      'His signal does not hit people. It turns them. A crowd under his influence stops being a crowd and becomes a weapon pointed at itself.',
    ],
    notes: [
      'Death Strike empties both guns down the aim line for three seconds, then shoves with two finishing shots.',
      'Mind-Control Madness grabs up to eight civilians inside fifteen metres and sets them on each other for fifteen seconds. Bosses resist.',
      'RIOT! rakes a twenty-five metre bullet storm; up to twenty survivors frenzy afterwards. Each death in the riot speeds up the rest.',
      'Nothing he does has a cooldown. The blackout is the only stop. Plan for the blackout.',
    ],
    tags: ['Twin guns', 'Mind control', 'Riot', 'Unrestrained'],
  },
};

interface HostLore {
  name: string;
  codename: string;
  designation: string;
  threat: Dossier['threat'];
  signal: string;
  profile: string[];
  notes: string[];
  tags: string[];
}

const HOST_LORE: Record<EnemyKind, HostLore> = {
  walker: {
    name: 'Signal-bound civilian',
    codename: 'Walker',
    designation: 'Host · Line',
    threat: 1,
    signal: 'Low-band Broadcast tether. Reversible.',
    profile: ['An ordinary resident of the block, tuned to the Broadcast and walked toward whoever is not. They do not know they are fighting. Most do not remember it afterwards.'],
    notes: ['Comes in numbers. Each round adds eight more to the street.', 'Slow, soft, and relentless. Launches cleanly; finishes cleanly.'],
    tags: ['Crowd', 'Melee'],
  },
  sprinter: {
    name: 'Signal-bound sprinter',
    codename: 'Sprinter',
    designation: 'Host · Flank',
    threat: 2,
    signal: 'Elevated tether. Adrenal spike.',
    profile: ['The Broadcast runs these hot. They close faster than the line and arrive from the side you were not watching.'],
    notes: ['Low health. Dies to a heavy. Problem is reaching them before they reach you.', 'Tends to circle for an opening. The engagement director gives them one eventually.'],
    tags: ['Fast', 'Flank'],
  },
  heavy: {
    name: 'Signal-bound enforcer',
    codename: 'Enforcer',
    designation: 'Host · Anchor',
    threat: 3,
    signal: 'Dense tether. Mass compensation active.',
    profile: ['Big, slow, and tuned deep. The Broadcast seems to pick them for frame; whatever they did before, they carry it.'],
    notes: ['Resists crowd control and launchers. Hit them when they telegraph; the windup is long.', 'Three times the mass of a walker. Knockback barely moves them.'],
    tags: ['Armor', 'Heavy strike'],
  },
  thrower: {
    name: 'Signal-bound thrower',
    codename: 'Thrower',
    designation: 'Host · Range',
    threat: 2,
    signal: 'Tether with projectile intent.',
    profile: ['Keeps eleven metres and throws whatever the block hands them. They hang at the edge of a fight so you have to choose between them and the line.'],
    notes: ['Prefers range. Closing the distance usually ends it.', 'Thrown objects can be caught and returned with melee.'],
    tags: ['Ranged', 'Harass'],
  },
  adept: {
    name: 'Signal Adept',
    codename: 'Adept',
    designation: 'Host · Caster',
    threat: 3,
    signal: 'Tether with partial aura expression.',
    profile: ['A host the Broadcast has taught something. They express a thin aura of their own, hold a middle distance, and punish anyone who stands still.'],
    notes: ['Keeps about four metres. Dodge cancels beat their casts.', 'Worth more points than the line. Worth more attention too.'],
    tags: ['Caster', 'Mid-range'],
  },
  broadcaster: {
    name: 'The Broadcaster',
    codename: 'Broadcaster',
    designation: 'Boss · Source',
    threat: 5,
    signal: 'Broadcast origin. Full-band saturation.',
    profile: ['The signal has a source and the source has a body. Twice the height of a host and eight times the mass, it is less a person than a tower that learned to walk.', 'Every host on the block is downstream of it.'],
    notes: ['Round-ending encounter. Expect the street to keep filling while it stands.', 'Cannot be caged, launched, or thrown. Can be hurt. Keep hurting it.'],
    tags: ['Boss', 'Source'],
  },
};

const SEALED: Array<Pick<Dossier, 'id' | 'name' | 'codename' | 'designation' | 'tags'>> = [
  { id: 'baxter', name: 'Baxter Banks', codename: 'Pending', designation: 'Ryder · Unconfirmed', tags: ['Sealed'] },
  { id: 'ester', name: 'Ester Maxin', codename: 'Pending', designation: 'Support · Unconfirmed', tags: ['Sealed'] },
];

function pad(n: number) {
  return String(n).padStart(3, '0');
}

function fromRyder(id: RyderId, index: number): Dossier {
  const spec = RYDERZ[id];
  const lore = RYDER_LORE[id];
  return {
    id,
    ryderId: id,
    entry: `${SECTION_LABEL[lore.section].code}-${pad(index)}`,
    section: lore.section,
    name: spec.name,
    codename: spec.title,
    designation: spec.role,
    affiliation: lore.affiliation,
    status: lore.status,
    threat: lore.threat,
    signal: lore.signal,
    profile: lore.profile,
    notes: lore.notes,
    tags: [spec.flaw, ...lore.tags],
    performer: lore.performer,
  };
}

function fromHost(kind: EnemyKind, index: number): Dossier {
  const lore = HOST_LORE[kind];
  return {
    id: `host:${kind}`,
    ryderId: null,
    entry: `${SECTION_LABEL.hosts.code}-${pad(index)}`,
    section: 'hosts',
    name: lore.name,
    codename: lore.codename,
    designation: lore.designation,
    affiliation: 'The Broadcast',
    status: kind === 'broadcaster' ? 'Active · Source' : 'Active · Tethered',
    threat: lore.threat,
    signal: lore.signal,
    profile: lore.profile,
    notes: lore.notes,
    tags: lore.tags,
    enemy: kind,
  };
}

function sealed(entry: (typeof SEALED)[number], index: number): Dossier {
  return {
    id: entry.id,
    ryderId: null,
    entry: `${SECTION_LABEL.classified.code}-${pad(index)}`,
    section: 'classified',
    name: entry.name,
    codename: entry.codename,
    designation: entry.designation,
    affiliation: 'Those Ryderz',
    status: 'Sealed',
    threat: 1,
    signal: 'No reading on file.',
    profile: [],
    notes: [],
    tags: entry.tags,
    sealed: true,
  };
}

let CACHE: Dossier[] | null = null;

/** Every journal entry, numbered within its section, in section order. */
export function allDossiers(): Dossier[] {
  if (CACHE) return CACHE;
  const counters = new Map<DossierSection, number>();
  const next = (section: DossierSection) => {
    const n = (counters.get(section) ?? 0) + 1;
    counters.set(section, n);
    return n;
  };
  const ryderz = RYDER_ORDER.map((id) => fromRyder(id, next(RYDER_LORE[id].section)));
  const hosts = (Object.keys(ENEMIES) as EnemyKind[]).map((kind) => fromHost(kind, next('hosts')));
  const files = SEALED.map((entry) => sealed(entry, next('classified')));
  const out = [...ryderz, ...hosts, ...files];
  out.sort((a, b) => DOSSIER_SECTIONS.indexOf(a.section) - DOSSIER_SECTIONS.indexOf(b.section) || a.entry.localeCompare(b.entry));
  CACHE = out;
  return out;
}

export function dossiersIn(section: DossierSection): Dossier[] {
  return allDossiers().filter((entry) => entry.section === section);
}

export function dossierFor(id: string): Dossier | undefined {
  return allDossiers().find((entry) => entry.id === id);
}

/** Attribute bars for a Ryder, each scaled against the roster's highest value. */
export interface Attribute {
  label: string;
  value: number;
  max: number;
}

export function ryderAttributes(id: RyderId): Attribute[] {
  const spec = RYDERZ[id];
  const peak = (pick: (ryder: RyderId) => number) => Math.max(...RYDER_ORDER.map(pick));
  return [
    { label: 'Health', value: spec.maxHp, max: peak((r) => RYDERZ[r].maxHp) },
    { label: 'Aura', value: spec.maxAura, max: peak((r) => RYDERZ[r].maxAura) },
    { label: 'Speed', value: spec.speed, max: peak((r) => RYDERZ[r].speed) },
    { label: 'Strike', value: spec.meleeDamage, max: peak((r) => RYDERZ[r].meleeDamage) },
    { label: 'Regen', value: spec.auraRegen, max: peak((r) => RYDERZ[r].auraRegen) },
  ];
}

export function hostAttributes(kind: EnemyKind): Attribute[] {
  const spec = ENEMIES[kind];
  const kinds = Object.keys(ENEMIES) as EnemyKind[];
  const peak = (pick: (k: EnemyKind) => number) => Math.max(...kinds.map(pick));
  return [
    { label: 'Health', value: spec.hp, max: peak((k) => ENEMIES[k].hp) },
    { label: 'Speed', value: spec.speed, max: peak((k) => ENEMIES[k].speed) },
    { label: 'Damage', value: spec.damage, max: peak((k) => ENEMIES[k].damage) },
    { label: 'Mass', value: spec.mass, max: peak((k) => ENEMIES[k].mass) },
    { label: 'Points', value: spec.points, max: peak((k) => ENEMIES[k].points) },
  ];
}
