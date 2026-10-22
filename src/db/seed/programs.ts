/**
 * Starter program templates, written from scratch on well-known public training
 * methods (linear progression, double progression, RPE top sets, block periodisation).
 */
import type { PhaseKind, ProgressionMethod, ProgressionRuleKind } from '../schema';

export type SeedSlot = {
  exerciseId: string;
  series: string;
  sets: number;
  repMin: number;
  repMax: number;
  rule: ProgressionRuleKind;
  rpe?: number;
  restS?: number;
  warmup?: number;
  tempo?: string;
  incrementKg?: number;
};

export type SeedDay = { name: string; focus: string; rest?: boolean; slots: SeedSlot[] };

/**
 * volumeMult scales working sets; rpeTarget overrides per-exercise RPE; repMult scales the rep
 * range of RPE-prescribed main lifts (e.g. 0.6 turns 8–10 into 5–6) so blocks move from volume
 * to intensity the way periodised programs do.
 */
export type SeedPhase = { weekFrom: number; weekTo: number; kind: PhaseKind; volumeMult: number; rpeTarget?: number; repMult?: number };

export type SeedProgram = {
  id: string;
  name: string;
  method: ProgressionMethod;
  level: 'beginner' | 'intermediate' | 'advanced';
  weeks: number;
  minutes: number;
  summary: string;
  rationale: string;
  days: SeedDay[]; // one repeating cycle; length = cycle length
  phases: SeedPhase[];
};

type Opt = Partial<Omit<SeedSlot, 'exerciseId' | 'series' | 'sets' | 'repMin' | 'repMax' | 'rule'>>;
const s = (exerciseId: string, series: string, sets: number, repMin: number, repMax: number, rule: ProgressionRuleKind, o: Opt = {}): SeedSlot => ({
  exerciseId,
  series,
  sets,
  repMin,
  repMax,
  rule,
  ...o,
});
const rest = (name = 'Rest'): SeedDay => ({ name, focus: 'Recovery', rest: true, slots: [] });

// ---------------------------------------------------------------------------
// 1. Upper / Lower, 4 days: linear on compounds, double on accessories
// ---------------------------------------------------------------------------
const upperLower: SeedProgram = {
  id: 'tpl_upper_lower_4',
  name: 'Upper / Lower Foundation',
  method: 'linear',
  level: 'beginner',
  weeks: 8,
  minutes: 60,
  summary: 'Four days a week, each muscle trained twice. Big lifts go up in small steps every session they are completed.',
  rationale:
    'Pick this if you are newer to structured training or coming back after a break. Linear progression on the main lifts gives fast, measurable strength gains while accessories use rep ranges. Week 8 is a planned deload.',
  days: [
    {
      name: 'Upper A',
      focus: 'Chest · Back · Shoulders · Arms',
      slots: [
        s('bench_press', 'A', 3, 5, 5, 'linear', { warmup: 2, restS: 180, rpe: 8 }),
        s('barbell_row', 'B', 3, 6, 6, 'linear', { warmup: 1, restS: 150, rpe: 8 }),
        s('seated_db_press', 'C', 3, 8, 12, 'double', { restS: 120 }),
        s('lat_pulldown', 'D', 3, 8, 12, 'double', { restS: 120 }),
        s('triceps_pushdown', 'E', 2, 10, 15, 'double', { restS: 60 }),
        s('db_curl', 'E', 2, 10, 15, 'double', { restS: 60 }),
      ],
    },
    {
      name: 'Lower A',
      focus: 'Quads · Hamstrings · Calves',
      slots: [
        s('back_squat', 'A', 3, 5, 5, 'linear', { warmup: 3, restS: 180, rpe: 8 }),
        s('rdl', 'B', 3, 8, 8, 'linear', { warmup: 1, restS: 150, rpe: 8 }),
        s('leg_press', 'C', 2, 10, 15, 'double', { restS: 120 }),
        s('lying_leg_curl', 'D', 3, 10, 15, 'double', { restS: 90 }),
        s('standing_calf_raise', 'E', 3, 10, 15, 'double', { restS: 60 }),
      ],
    },
    rest(),
    {
      name: 'Upper B',
      focus: 'Shoulders · Back · Chest · Arms',
      slots: [
        s('ohp', 'A', 3, 5, 5, 'linear', { warmup: 2, restS: 180, rpe: 8 }),
        s('pull_up', 'B', 3, 6, 10, 'double', { restS: 150 }),
        s('incline_db_press', 'C', 3, 8, 12, 'double', { restS: 120 }),
        s('seated_cable_row', 'D', 3, 8, 12, 'double', { restS: 120 }),
        s('lateral_raise', 'E', 3, 12, 20, 'double', { restS: 60 }),
        s('hammer_curl', 'F', 2, 10, 15, 'double', { restS: 60 }),
      ],
    },
    {
      name: 'Lower B',
      focus: 'Posterior chain · Quads · Core',
      slots: [
        s('deadlift', 'A', 1, 5, 5, 'linear', { warmup: 3, restS: 240, rpe: 8, incrementKg: 5 }),
        s('front_squat', 'B', 3, 6, 8, 'double', { warmup: 1, restS: 150 }),
        s('bulgarian_split_squat', 'C', 2, 8, 12, 'double', { restS: 90 }),
        s('seated_leg_curl', 'D', 3, 10, 15, 'double', { restS: 90 }),
        s('hanging_leg_raise', 'E', 3, 8, 15, 'double', { restS: 60 }),
      ],
    },
    rest(),
    rest(),
  ],
  phases: [
    { weekFrom: 1, weekTo: 7, kind: 'accumulation', volumeMult: 1 },
    { weekFrom: 8, weekTo: 8, kind: 'deload', volumeMult: 0.5, rpeTarget: 6 },
  ],
};

// ---------------------------------------------------------------------------
// 2. Push / Pull / Legs, 6 days: double progression throughout
// ---------------------------------------------------------------------------
const ppl: SeedProgram = {
  id: 'tpl_ppl_6',
  name: 'Push · Pull · Legs',
  method: 'double',
  level: 'intermediate',
  weeks: 8,
  minutes: 70,
  summary: 'Six sessions a week, each muscle twice. Every exercise uses a rep range: hit the top of the range on all sets, then add load.',
  rationale:
    'Pick this if you can train most days and want a high weekly volume for muscle growth. Double progression is forgiving: you progress reps first, then load, so it suits accessory-heavy hypertrophy work. Week 8 deloads.',
  days: [
    {
      name: 'Push 1',
      focus: 'Chest · Shoulders · Triceps',
      slots: [
        s('bench_press', 'A', 3, 6, 8, 'double', { warmup: 2, restS: 180, rpe: 8 }),
        s('seated_db_press', 'B', 3, 8, 12, 'double', { restS: 120 }),
        s('cable_fly', 'C', 3, 12, 15, 'double', { restS: 75 }),
        s('lateral_raise', 'D', 4, 12, 20, 'double', { restS: 60 }),
        s('overhead_triceps_ext', 'E', 3, 10, 15, 'double', { restS: 60 }),
      ],
    },
    {
      name: 'Pull 1',
      focus: 'Back · Rear delts · Biceps',
      slots: [
        s('barbell_row', 'A', 3, 6, 8, 'double', { warmup: 1, restS: 150, rpe: 8 }),
        s('lat_pulldown', 'B', 3, 8, 12, 'double', { restS: 120 }),
        s('chest_supported_row', 'C', 3, 10, 12, 'double', { restS: 90 }),
        s('face_pull', 'D', 3, 12, 20, 'double', { restS: 60 }),
        s('incline_db_curl', 'E', 3, 10, 15, 'double', { restS: 60 }),
      ],
    },
    {
      name: 'Legs 1',
      focus: 'Quads · Hamstrings · Calves',
      slots: [
        s('back_squat', 'A', 3, 6, 8, 'double', { warmup: 3, restS: 180, rpe: 8, incrementKg: 5 }),
        s('rdl', 'B', 3, 8, 10, 'double', { warmup: 1, restS: 150 }),
        s('leg_extension', 'C', 3, 12, 15, 'double', { restS: 75 }),
        s('lying_leg_curl', 'D', 3, 10, 15, 'double', { restS: 75 }),
        s('standing_calf_raise', 'E', 4, 10, 15, 'double', { restS: 60 }),
      ],
    },
    {
      name: 'Push 2',
      focus: 'Shoulders · Chest · Triceps',
      slots: [
        s('ohp', 'A', 3, 6, 8, 'double', { warmup: 2, restS: 180, rpe: 8 }),
        s('incline_db_press', 'B', 3, 8, 12, 'double', { restS: 120 }),
        s('dips', 'C', 3, 8, 12, 'double', { restS: 90 }),
        s('cable_lateral_raise', 'D', 3, 12, 20, 'double', { restS: 60 }),
        s('triceps_pushdown', 'E', 3, 10, 15, 'double', { restS: 60 }),
      ],
    },
    {
      name: 'Pull 2',
      focus: 'Lats · Upper back · Biceps',
      slots: [
        s('pull_up', 'A', 3, 6, 10, 'double', { restS: 150 }),
        s('db_row', 'B', 3, 8, 12, 'double', { restS: 90 }),
        s('pullover', 'C', 3, 12, 15, 'double', { restS: 60 }),
        s('rear_delt_fly', 'D', 3, 12, 20, 'double', { restS: 60 }),
        s('barbell_curl', 'E', 3, 8, 12, 'double', { restS: 60 }),
      ],
    },
    {
      name: 'Legs 2',
      focus: 'Glutes · Quads · Core',
      slots: [
        s('hip_thrust', 'A', 3, 8, 12, 'double', { warmup: 1, restS: 120 }),
        s('hack_squat', 'B', 3, 8, 12, 'double', { warmup: 1, restS: 150 }),
        s('walking_lunge', 'C', 2, 10, 14, 'double', { restS: 90 }),
        s('seated_leg_curl', 'D', 3, 10, 15, 'double', { restS: 75 }),
        s('cable_crunch', 'E', 3, 10, 15, 'double', { restS: 60 }),
      ],
    },
    rest(),
  ],
  phases: [
    { weekFrom: 1, weekTo: 7, kind: 'accumulation', volumeMult: 1 },
    { weekFrom: 8, weekTo: 8, kind: 'deload', volumeMult: 0.5, rpeTarget: 6 },
  ],
};

// ---------------------------------------------------------------------------
// 3. Classic body-part split, 5 days: RPE top set + double-progression work
// ---------------------------------------------------------------------------
const bodyPart: SeedProgram = {
  id: 'tpl_bodypart_5',
  name: 'Classic Five-Day Split',
  method: 'rpe',
  level: 'intermediate',
  weeks: 6,
  minutes: 65,
  summary: 'One major muscle group per day with plenty of exercise variety. The first lift each day is an RPE-guided top set; the rest use rep ranges.',
  rationale:
    'Pick this if you like focused, high-volume sessions for one area at a time and have the recovery to train five days. The RPE top set auto-regulates on good and bad days; accessories progress by reps then load. Week 6 deloads.',
  days: [
    {
      name: 'Chest',
      focus: 'Chest · Triceps',
      slots: [
        s('incline_bench', 'A', 1, 6, 8, 'rpe', { warmup: 3, restS: 180, rpe: 9 }),
        s('incline_bench', 'A', 2, 8, 10, 'double', { restS: 150 }),
        s('db_bench', 'B', 3, 8, 12, 'double', { restS: 120 }),
        s('machine_chest_press', 'C', 2, 10, 12, 'double', { restS: 90 }),
        s('pec_deck', 'D', 3, 12, 15, 'double', { restS: 60, tempo: '3/1/1/1' }),
        s('triceps_pushdown', 'E', 3, 10, 15, 'double', { restS: 60 }),
      ],
    },
    {
      name: 'Back',
      focus: 'Lats · Upper back · Traps',
      slots: [
        s('barbell_row', 'A', 1, 6, 8, 'rpe', { warmup: 2, restS: 180, rpe: 9 }),
        s('barbell_row', 'A', 2, 8, 10, 'double', { restS: 150 }),
        s('neutral_pulldown', 'B', 3, 8, 12, 'double', { restS: 120 }),
        s('seated_cable_row', 'C', 3, 10, 12, 'double', { restS: 90 }),
        s('single_arm_pulldown', 'D', 2, 12, 15, 'double', { restS: 60 }),
        s('shrug', 'E', 3, 10, 15, 'double', { restS: 60 }),
      ],
    },
    {
      name: 'Legs',
      focus: 'Quads · Hamstrings · Glutes · Calves',
      slots: [
        s('back_squat', 'A', 1, 5, 6, 'rpe', { warmup: 3, restS: 240, rpe: 9 }),
        s('back_squat', 'A', 2, 8, 10, 'double', { restS: 180, incrementKg: 5 }),
        s('stiff_leg_dl', 'B', 3, 8, 10, 'double', { restS: 150 }),
        s('leg_press', 'C', 3, 12, 15, 'double', { restS: 120 }),
        s('seated_leg_curl', 'D', 3, 10, 15, 'double', { restS: 75 }),
        s('seated_calf_raise', 'E', 4, 12, 15, 'double', { restS: 60 }),
      ],
    },
    {
      name: 'Shoulders',
      focus: 'Delts · Core',
      slots: [
        s('ohp', 'A', 1, 5, 6, 'rpe', { warmup: 2, restS: 180, rpe: 9 }),
        s('ohp', 'A', 2, 8, 10, 'double', { restS: 150 }),
        s('lateral_raise', 'B', 4, 12, 20, 'double', { restS: 60 }),
        s('upright_row', 'C', 3, 10, 15, 'double', { restS: 75 }),
        s('face_pull', 'D', 3, 15, 20, 'double', { restS: 60 }),
        s('ab_wheel', 'E', 3, 8, 15, 'double', { restS: 60 }),
      ],
    },
    {
      name: 'Arms',
      focus: 'Biceps · Triceps · Forearms',
      slots: [
        s('close_grip_bench', 'A', 1, 6, 8, 'rpe', { warmup: 2, restS: 150, rpe: 9 }),
        s('barbell_curl', 'B', 3, 8, 12, 'double', { restS: 90 }),
        s('skull_crusher', 'C', 3, 8, 12, 'double', { restS: 90 }),
        s('preacher_curl', 'D', 3, 10, 15, 'double', { restS: 60 }),
        s('overhead_triceps_ext', 'D', 3, 10, 15, 'double', { restS: 60 }),
        s('hammer_curl', 'E', 2, 10, 15, 'double', { restS: 60 }),
        s('wrist_curl', 'E', 2, 15, 20, 'double', { restS: 45 }),
      ],
    },
    rest(),
    rest(),
  ],
  phases: [
    { weekFrom: 1, weekTo: 5, kind: 'accumulation', volumeMult: 1 },
    { weekFrom: 6, weekTo: 6, kind: 'deload', volumeMult: 0.5, rpeTarget: 6 },
  ],
};

// ---------------------------------------------------------------------------
// 4. Strength block, 4 days, 6 weeks: block periodisation on RPE
// ---------------------------------------------------------------------------
const strengthBlock: SeedProgram = {
  id: 'tpl_strength_block_4',
  name: 'Strength Block',
  method: 'block',
  level: 'advanced',
  weeks: 6,
  minutes: 75,
  summary: 'Six-week block: three weeks of higher-volume accumulation, two heavier intensification weeks on lower reps (4–6 becomes 3–4), then a deload. Main lifts are prescribed by RPE.',
  rationale:
    'Pick this when your main lifts have stalled on simple linear progression. Volume builds work capacity first, then intensity rises as volume drops, so you finish the block ready to test or start a new one.',
  days: [
    {
      name: 'Squat focus',
      focus: 'Squat · Hamstrings',
      slots: [
        s('back_squat', 'A', 4, 4, 6, 'rpe', { warmup: 3, restS: 240, rpe: 7.5 }),
        s('rdl', 'B', 3, 6, 8, 'double', { restS: 150 }),
        s('bulgarian_split_squat', 'C', 3, 8, 10, 'double', { restS: 90 }),
        s('plank', 'D', 3, 30, 60, 'none', { restS: 60 }),
      ],
    },
    {
      name: 'Bench focus',
      focus: 'Bench · Upper back',
      slots: [
        s('bench_press', 'A', 4, 4, 6, 'rpe', { warmup: 3, restS: 240, rpe: 7.5 }),
        s('chest_supported_row', 'B', 4, 6, 10, 'double', { restS: 120 }),
        s('incline_db_press', 'C', 3, 8, 10, 'double', { restS: 120 }),
        s('face_pull', 'D', 3, 12, 20, 'double', { restS: 60 }),
      ],
    },
    rest(),
    {
      name: 'Deadlift focus',
      focus: 'Deadlift · Quads',
      slots: [
        s('deadlift', 'A', 3, 3, 5, 'rpe', { warmup: 3, restS: 240, rpe: 7.5 }),
        s('front_squat', 'B', 3, 5, 8, 'double', { restS: 180 }),
        s('back_extension', 'C', 3, 10, 15, 'double', { restS: 90 }),
        s('farmer_carry', 'D', 3, 30, 40, 'none', { restS: 90 }),
      ],
    },
    {
      name: 'Press focus',
      focus: 'Overhead press · Lats · Arms',
      slots: [
        s('ohp', 'A', 4, 4, 6, 'rpe', { warmup: 2, restS: 210, rpe: 7.5 }),
        s('pull_up', 'B', 4, 5, 8, 'double', { restS: 150 }),
        s('close_grip_bench', 'C', 3, 6, 8, 'double', { restS: 150 }),
        s('barbell_curl', 'D', 3, 8, 12, 'double', { restS: 60 }),
      ],
    },
    rest(),
    rest(),
  ],
  phases: [
    { weekFrom: 1, weekTo: 3, kind: 'accumulation', volumeMult: 1, rpeTarget: 7.5 },
    { weekFrom: 4, weekTo: 5, kind: 'intensification', volumeMult: 0.8, rpeTarget: 8.5, repMult: 0.7 },
    { weekFrom: 6, weekTo: 6, kind: 'deload', volumeMult: 0.5, rpeTarget: 6 },
  ],
};

// ---------------------------------------------------------------------------
// 5. Full-body novice, 3 days: linear progression on the big lifts
// ---------------------------------------------------------------------------
const fullBodyNovice: SeedProgram = {
  id: 'tpl_fullbody_novice_3',
  name: 'Full Body Novice',
  method: 'linear',
  level: 'beginner',
  weeks: 12,
  minutes: 55,
  summary: 'Three full-body sessions a week built around the squat, bench, deadlift, press and row. Add a little weight every time you complete all your sets.',
  rationale:
    'Pick this if you are new to barbell training. Beginners recover fast enough to add weight to the main lifts every session, the quickest strength gains you will ever see. Few exercises practised often, so technique improves quickly. Weeks 6 and 12 are lighter deload weeks so the progress lasts.',
  days: [
    {
      name: 'Full Body A',
      focus: 'Squat · Bench · Row',
      slots: [
        s('back_squat', 'A', 3, 5, 5, 'linear', { warmup: 3, restS: 180, rpe: 8, incrementKg: 2.5 }),
        s('bench_press', 'B', 3, 5, 5, 'linear', { warmup: 2, restS: 180, rpe: 8 }),
        s('barbell_row', 'C', 3, 6, 6, 'linear', { warmup: 1, restS: 150, rpe: 8 }),
        s('triceps_pushdown', 'D', 2, 10, 15, 'double', { restS: 60 }),
        s('db_curl', 'D', 2, 10, 15, 'double', { restS: 60 }),
      ],
    },
    rest(),
    {
      name: 'Full Body B',
      focus: 'Deadlift · Press · Chin-up',
      slots: [
        s('deadlift', 'A', 1, 5, 5, 'linear', { warmup: 3, restS: 240, rpe: 8, incrementKg: 5 }),
        s('ohp', 'B', 3, 5, 5, 'linear', { warmup: 2, restS: 180, rpe: 8 }),
        s('chin_up', 'C', 3, 5, 10, 'double', { restS: 150 }),
        s('leg_press', 'D', 2, 10, 15, 'double', { restS: 120 }),
        s('hanging_leg_raise', 'E', 2, 8, 15, 'double', { restS: 60 }),
      ],
    },
    rest(),
    {
      name: 'Full Body C',
      focus: 'Squat · Incline · Hinge',
      slots: [
        s('back_squat', 'A', 3, 5, 5, 'linear', { warmup: 3, restS: 180, rpe: 8, incrementKg: 2.5 }),
        s('incline_db_press', 'B', 3, 8, 12, 'double', { restS: 120 }),
        s('rdl', 'C', 3, 8, 8, 'linear', { warmup: 1, restS: 150, rpe: 8 }),
        s('lat_pulldown', 'D', 3, 8, 12, 'double', { restS: 120 }),
        s('lateral_raise', 'E', 2, 12, 20, 'double', { restS: 60 }),
      ],
    },
    rest(),
    rest(),
  ],
  phases: [
    { weekFrom: 1, weekTo: 5, kind: 'accumulation', volumeMult: 1 },
    { weekFrom: 6, weekTo: 6, kind: 'deload', volumeMult: 0.6, rpeTarget: 6 },
    { weekFrom: 7, weekTo: 11, kind: 'accumulation', volumeMult: 1 },
    { weekFrom: 12, weekTo: 12, kind: 'deload', volumeMult: 0.6, rpeTarget: 6 },
  ],
};

// ---------------------------------------------------------------------------
// 6. Minimalist full body, 2 days: double progression, short sessions
// ---------------------------------------------------------------------------
const minimalist: SeedProgram = {
  id: 'tpl_minimal_2',
  name: 'Minimalist Full Body',
  method: 'double',
  level: 'beginner',
  weeks: 8,
  minutes: 50,
  summary: 'Two full-body sessions a week covering every major muscle. Each exercise has a rep range: reach the top on every set, then add weight.',
  rationale:
    'Pick this when life is busy or you are fitting training around sport. Two hard full-body sessions still train each muscle twice a week, enough to build and keep strength and muscle. Keep at least two days between sessions. Week 8 deloads.',
  days: [
    {
      name: 'Session A',
      focus: 'Squat · Bench · Pulldown',
      slots: [
        s('back_squat', 'A', 3, 6, 8, 'double', { warmup: 3, restS: 180, rpe: 8 }),
        s('bench_press', 'B', 3, 6, 8, 'double', { warmup: 2, restS: 150, rpe: 8 }),
        s('lat_pulldown', 'C', 3, 8, 12, 'double', { restS: 120 }),
        s('rdl', 'D', 2, 8, 10, 'double', { warmup: 1, restS: 120 }),
        s('lateral_raise', 'E', 2, 12, 20, 'double', { restS: 60 }),
        s('db_curl', 'F', 2, 10, 15, 'double', { restS: 45 }),
        s('triceps_pushdown', 'F', 2, 10, 15, 'double', { restS: 45 }),
      ],
    },
    rest(),
    rest(),
    {
      name: 'Session B',
      focus: 'Deadlift · Press · Row',
      slots: [
        s('deadlift', 'A', 2, 4, 6, 'double', { warmup: 3, restS: 210, rpe: 8, incrementKg: 5 }),
        s('ohp', 'B', 3, 6, 8, 'double', { warmup: 2, restS: 150, rpe: 8 }),
        s('seated_cable_row', 'C', 3, 8, 12, 'double', { restS: 120 }),
        s('bulgarian_split_squat', 'D', 2, 8, 12, 'double', { restS: 90 }),
        s('incline_db_press', 'E', 2, 8, 12, 'double', { restS: 90 }),
        s('hanging_leg_raise', 'F', 2, 8, 15, 'double', { restS: 60 }),
      ],
    },
    rest(),
    rest(),
    rest(),
  ],
  phases: [
    { weekFrom: 1, weekTo: 7, kind: 'accumulation', volumeMult: 1 },
    { weekFrom: 8, weekTo: 8, kind: 'deload', volumeMult: 0.5, rpeTarget: 6 },
  ],
};

// ---------------------------------------------------------------------------
// 7. Power & Size upper/lower, 4 days: heavy RPE days + hypertrophy days, periodised
// ---------------------------------------------------------------------------
const powerSize: SeedProgram = {
  id: 'tpl_power_size_4',
  name: 'Power & Size Upper / Lower',
  method: 'block',
  level: 'intermediate',
  weeks: 9,
  minutes: 70,
  summary: 'Two heavy days for strength and two higher-rep days for muscle each week. The heavy lifts move from 4–6 reps down to doubles and triples over the block, then a deload.',
  rationale:
    'Pick this if you want to get stronger and bigger at the same time and can train four days. Heavy days use RPE so loads match how you are performing; size days use rep ranges. Weeks 1–4 build, 5–7 get heavier with fewer reps, week 8 peaks with low-rep top sets, and week 9 deloads.',
  days: [
    {
      name: 'Upper Power',
      focus: 'Bench · Row · Press',
      slots: [
        s('bench_press', 'A', 3, 4, 6, 'rpe', { warmup: 3, restS: 210, rpe: 8 }),
        s('barbell_row', 'B', 3, 4, 6, 'rpe', { warmup: 1, restS: 180, rpe: 8 }),
        s('ohp', 'C', 2, 6, 8, 'double', { warmup: 1, restS: 150 }),
        s('pull_up', 'D', 3, 5, 8, 'double', { restS: 150 }),
        s('skull_crusher', 'E', 2, 8, 12, 'double', { restS: 60 }),
        s('barbell_curl', 'E', 2, 8, 12, 'double', { restS: 60 }),
      ],
    },
    {
      name: 'Lower Power',
      focus: 'Squat · Deadlift',
      slots: [
        s('back_squat', 'A', 3, 4, 6, 'rpe', { warmup: 3, restS: 240, rpe: 8 }),
        s('deadlift', 'B', 2, 3, 5, 'rpe', { warmup: 2, restS: 240, rpe: 8 }),
        s('leg_press', 'C', 3, 8, 12, 'double', { restS: 120 }),
        s('lying_leg_curl', 'D', 3, 8, 12, 'double', { restS: 90 }),
        s('standing_calf_raise', 'E', 3, 8, 12, 'double', { restS: 60 }),
      ],
    },
    rest(),
    {
      name: 'Upper Size',
      focus: 'Chest · Back · Shoulders · Arms',
      slots: [
        s('incline_db_press', 'A', 4, 8, 12, 'double', { warmup: 1, restS: 120 }),
        s('seated_cable_row', 'B', 4, 8, 12, 'double', { restS: 120 }),
        s('machine_shoulder_press', 'C', 3, 10, 15, 'double', { restS: 90 }),
        s('lat_pulldown', 'D', 3, 10, 15, 'double', { restS: 90 }),
        s('cable_fly', 'E', 3, 12, 15, 'double', { restS: 60 }),
        s('lateral_raise', 'F', 3, 12, 20, 'double', { restS: 60 }),
        s('incline_db_curl', 'G', 2, 10, 15, 'double', { restS: 45 }),
        s('overhead_triceps_ext', 'G', 2, 10, 15, 'double', { restS: 45 }),
      ],
    },
    {
      name: 'Lower Size',
      focus: 'Quads · Hamstrings · Calves',
      slots: [
        s('front_squat', 'A', 3, 8, 10, 'double', { warmup: 2, restS: 150 }),
        s('rdl', 'B', 3, 8, 12, 'double', { warmup: 1, restS: 150 }),
        s('bulgarian_split_squat', 'C', 3, 10, 12, 'double', { restS: 90 }),
        s('seated_leg_curl', 'D', 3, 10, 15, 'double', { restS: 75 }),
        s('leg_extension', 'E', 3, 12, 15, 'double', { restS: 60 }),
        s('seated_calf_raise', 'F', 4, 12, 20, 'double', { restS: 45 }),
      ],
    },
    rest(),
    rest(),
  ],
  phases: [
    { weekFrom: 1, weekTo: 4, kind: 'accumulation', volumeMult: 1, rpeTarget: 7.5 },
    { weekFrom: 5, weekTo: 7, kind: 'intensification', volumeMult: 0.85, rpeTarget: 8.5, repMult: 0.75 },
    { weekFrom: 8, weekTo: 8, kind: 'realisation', volumeMult: 0.6, rpeTarget: 9, repMult: 0.5 },
    { weekFrom: 9, weekTo: 9, kind: 'deload', volumeMult: 0.5, rpeTarget: 6 },
  ],
};

// ---------------------------------------------------------------------------
// 8. Hypertrophy mesocycle, 5 days: volume and effort ramp, then deload
// ---------------------------------------------------------------------------
const hypertrophyMeso: SeedProgram = {
  id: 'tpl_hypertrophy_meso_5',
  name: 'Hypertrophy Mesocycle',
  method: 'double',
  level: 'intermediate',
  weeks: 6,
  minutes: 65,
  summary: 'Upper, Lower, Push, Pull, Legs. Sets and effort climb week by week (from about 3 reps in reserve to 1), then a deload clears fatigue before the next block.',
  rationale:
    'Pick this if muscle growth is the main goal and you can train five days. Each muscle gets roughly 10–20 hard sets a week, the range most consistently linked with growth. Week 1 eases in, weeks 2–3 are full volume, weeks 4–5 add sets and push closer to failure, and week 6 deloads. Run it back to back, changing a few exercises each time.',
  days: [
    {
      name: 'Upper',
      focus: 'Chest · Back · Shoulders',
      slots: [
        s('bench_press', 'A', 3, 6, 10, 'double', { warmup: 2, restS: 150 }),
        s('chest_supported_row', 'B', 3, 8, 12, 'double', { restS: 120 }),
        s('seated_db_press', 'C', 3, 8, 12, 'double', { restS: 120 }),
        s('neutral_pulldown', 'D', 3, 10, 12, 'double', { restS: 90 }),
        s('cable_lateral_raise', 'E', 3, 12, 20, 'double', { restS: 45 }),
      ],
    },
    {
      name: 'Lower',
      focus: 'Quads · Hamstrings · Calves',
      slots: [
        s('back_squat', 'A', 3, 6, 10, 'double', { warmup: 3, restS: 180 }),
        s('rdl', 'B', 3, 8, 12, 'double', { warmup: 1, restS: 150 }),
        s('leg_extension', 'C', 3, 12, 15, 'double', { restS: 60 }),
        s('lying_leg_curl', 'D', 3, 10, 15, 'double', { restS: 60 }),
        s('standing_calf_raise', 'E', 4, 10, 15, 'double', { restS: 45 }),
      ],
    },
    rest(),
    {
      name: 'Push',
      focus: 'Chest · Shoulders · Triceps',
      slots: [
        s('incline_db_press', 'A', 3, 8, 12, 'double', { warmup: 1, restS: 120 }),
        s('machine_chest_press', 'B', 3, 10, 12, 'double', { restS: 90 }),
        s('pec_deck', 'C', 3, 12, 15, 'double', { restS: 60 }),
        s('lateral_raise', 'D', 3, 12, 20, 'double', { restS: 45 }),
        s('triceps_pushdown', 'E', 3, 10, 15, 'double', { restS: 45 }),
        s('overhead_triceps_ext', 'E', 2, 10, 15, 'double', { restS: 45 }),
      ],
    },
    {
      name: 'Pull',
      focus: 'Lats · Upper back · Biceps',
      slots: [
        s('pull_up', 'A', 3, 6, 10, 'double', { restS: 150 }),
        s('seated_cable_row', 'B', 3, 8, 12, 'double', { restS: 120 }),
        s('single_arm_pulldown', 'C', 3, 10, 15, 'double', { restS: 60 }),
        s('face_pull', 'D', 3, 12, 20, 'double', { restS: 45 }),
        s('incline_db_curl', 'E', 3, 10, 15, 'double', { restS: 45 }),
        s('hammer_curl', 'E', 2, 10, 15, 'double', { restS: 45 }),
      ],
    },
    {
      name: 'Legs',
      focus: 'Glutes · Quads · Hamstrings',
      slots: [
        s('hack_squat', 'A', 3, 8, 12, 'double', { warmup: 2, restS: 150 }),
        s('hip_thrust', 'B', 3, 8, 12, 'double', { warmup: 1, restS: 120 }),
        s('walking_lunge', 'C', 2, 10, 12, 'double', { restS: 90 }),
        s('seated_leg_curl', 'D', 3, 10, 15, 'double', { restS: 60 }),
        s('seated_calf_raise', 'E', 3, 12, 20, 'double', { restS: 45 }),
        s('cable_crunch', 'F', 3, 10, 15, 'double', { restS: 45 }),
      ],
    },
    rest(),
  ],
  phases: [
    { weekFrom: 1, weekTo: 1, kind: 'accumulation', volumeMult: 0.8, rpeTarget: 7 },
    { weekFrom: 2, weekTo: 3, kind: 'accumulation', volumeMult: 1, rpeTarget: 8 },
    { weekFrom: 4, weekTo: 5, kind: 'intensification', volumeMult: 1.25, rpeTarget: 9 },
    { weekFrom: 6, weekTo: 6, kind: 'deload', volumeMult: 0.5, rpeTarget: 6 },
  ],
};

// ---------------------------------------------------------------------------
// 9. Undulating strength, 3 days: heavy / volume / moderate days, periodised to a peak
// ---------------------------------------------------------------------------
const undulating: SeedProgram = {
  id: 'tpl_undulating_3',
  name: 'Undulating Strength',
  method: 'block',
  level: 'intermediate',
  weeks: 8,
  minutes: 70,
  summary: 'The main lifts three times a week, each day with a different rep target: heavy, volume and moderate. Reps drop and loads rise over the block, ending in a peak week.',
  rationale:
    'Pick this once simple linear progression has stalled and you can train three days. Changing the rep target from day to day (daily undulating periodisation) lets you practise the main lifts often without grinding the same heavy sets every session. Weeks 1–3 build, 4–6 get heavier, week 7 peaks with low-rep top sets (a good week to test), and week 8 deloads.',
  days: [
    {
      name: 'Heavy day',
      focus: 'Squat · Bench · Upper back',
      slots: [
        s('back_squat', 'A', 4, 4, 6, 'rpe', { warmup: 3, restS: 240, rpe: 8 }),
        s('bench_press', 'B', 4, 4, 6, 'rpe', { warmup: 3, restS: 210, rpe: 8 }),
        s('barbell_row', 'C', 3, 6, 8, 'double', { warmup: 1, restS: 150 }),
        s('chin_up', 'D', 3, 5, 8, 'double', { restS: 150 }),
      ],
    },
    rest(),
    {
      name: 'Volume day',
      focus: 'Squat · Bench · Accessories',
      slots: [
        s('back_squat', 'A', 3, 8, 10, 'rpe', { warmup: 2, restS: 180, rpe: 7.5 }),
        s('bench_press', 'B', 4, 8, 10, 'rpe', { warmup: 2, restS: 150, rpe: 7.5 }),
        s('seated_cable_row', 'C', 3, 10, 12, 'double', { restS: 90 }),
        s('lateral_raise', 'D', 3, 12, 20, 'double', { restS: 45 }),
        s('db_curl', 'E', 2, 10, 15, 'double', { restS: 45 }),
        s('triceps_pushdown', 'E', 2, 10, 15, 'double', { restS: 45 }),
      ],
    },
    rest(),
    {
      name: 'Moderate day',
      focus: 'Deadlift · Overhead press',
      slots: [
        s('deadlift', 'A', 3, 4, 6, 'rpe', { warmup: 3, restS: 240, rpe: 8 }),
        s('ohp', 'B', 4, 5, 7, 'rpe', { warmup: 2, restS: 180, rpe: 8 }),
        s('lat_pulldown', 'C', 3, 8, 12, 'double', { restS: 90 }),
        s('lying_leg_curl', 'D', 3, 10, 15, 'double', { restS: 60 }),
        s('ab_wheel', 'E', 3, 6, 12, 'double', { restS: 60 }),
      ],
    },
    rest(),
    rest(),
  ],
  phases: [
    { weekFrom: 1, weekTo: 3, kind: 'accumulation', volumeMult: 1, rpeTarget: 7.5 },
    { weekFrom: 4, weekTo: 6, kind: 'intensification', volumeMult: 0.85, rpeTarget: 8.5, repMult: 0.75 },
    { weekFrom: 7, weekTo: 7, kind: 'realisation', volumeMult: 0.6, rpeTarget: 9, repMult: 0.5 },
    { weekFrom: 8, weekTo: 8, kind: 'deload', volumeMult: 0.5, rpeTarget: 6 },
  ],
};

// ---------------------------------------------------------------------------
// 10. Dumbbell only, 3 days: home or hotel gym, double progression
// ---------------------------------------------------------------------------
const dumbbellOnly: SeedProgram = {
  id: 'tpl_dumbbell_3',
  name: 'Dumbbell Only',
  method: 'double',
  level: 'beginner',
  weeks: 8,
  minutes: 45,
  summary: 'Three full-body sessions that need only a pair of adjustable dumbbells and a bench. Work up each rep range, then move to the next dumbbell.',
  rationale:
    'Pick this for training at home, in a hotel or in a small gym. Dumbbell jumps are bigger than barbell plates, so every exercise uses a rep range: when you hit the top on all sets, go up one dumbbell and start at the bottom again. Week 8 deloads.',
  days: [
    {
      name: 'Day A',
      focus: 'Squat · Press · Row',
      slots: [
        s('goblet_squat', 'A', 3, 8, 12, 'double', { warmup: 1, restS: 120 }),
        s('db_bench', 'B', 3, 8, 12, 'double', { warmup: 1, restS: 120 }),
        s('db_row', 'C', 3, 8, 12, 'double', { restS: 90 }),
        s('lateral_raise', 'D', 3, 12, 20, 'double', { restS: 45 }),
        s('db_curl', 'E', 2, 10, 15, 'double', { restS: 45 }),
      ],
    },
    rest(),
    {
      name: 'Day B',
      focus: 'Hinge · Shoulders · Single leg',
      slots: [
        s('db_rdl', 'A', 3, 8, 12, 'double', { warmup: 1, restS: 120 }),
        s('seated_db_press', 'B', 3, 8, 12, 'double', { warmup: 1, restS: 120 }),
        s('bulgarian_split_squat', 'C', 3, 8, 12, 'double', { restS: 90 }),
        s('push_up', 'D', 3, 8, 20, 'double', { restS: 60 }),
        s('hammer_curl', 'E', 2, 10, 15, 'double', { restS: 45 }),
      ],
    },
    rest(),
    {
      name: 'Day C',
      focus: 'Lunge · Incline · Back',
      slots: [
        s('reverse_lunge', 'A', 3, 8, 12, 'double', { restS: 90 }),
        s('incline_db_press', 'B', 3, 8, 12, 'double', { warmup: 1, restS: 120 }),
        s('db_row', 'C', 3, 10, 15, 'double', { restS: 90 }),
        s('glute_bridge', 'D', 3, 12, 20, 'double', { restS: 60 }),
        s('shrug', 'E', 2, 10, 15, 'double', { restS: 45 }),
        s('farmer_carry', 'F', 3, 30, 40, 'none', { restS: 90 }),
      ],
    },
    rest(),
    rest(),
  ],
  phases: [
    { weekFrom: 1, weekTo: 7, kind: 'accumulation', volumeMult: 1 },
    { weekFrom: 8, weekTo: 8, kind: 'deload', volumeMult: 0.5, rpeTarget: 6 },
  ],
};

/** Shown on Programs in this order: by level, then days per week. */
export const SEED_PROGRAMS: SeedProgram[] = [minimalist, fullBodyNovice, dumbbellOnly, upperLower, powerSize, undulating, hypertrophyMeso, bodyPart, ppl, strengthBlock];
