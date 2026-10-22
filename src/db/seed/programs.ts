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

export type SeedPhase = { weekFrom: number; weekTo: number; kind: PhaseKind; volumeMult: number; rpeTarget?: number };

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
  summary: 'Six-week block: three weeks of higher-volume accumulation, two heavier intensification weeks, then a deload. Main lifts are prescribed by RPE.',
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
    { weekFrom: 4, weekTo: 5, kind: 'intensification', volumeMult: 0.8, rpeTarget: 8.5 },
    { weekFrom: 6, weekTo: 6, kind: 'deload', volumeMult: 0.5, rpeTarget: 6 },
  ],
};

export const SEED_PROGRAMS: SeedProgram[] = [upperLower, ppl, bodyPart, strengthBlock];
