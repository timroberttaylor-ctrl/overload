/**
 * Overload database schema (SQLite via Drizzle).
 *
 * Conventions
 * - Every table has a text `id` primary key (UUID, or a natural key such as a date
 *   for day-keyed tables) plus created/updated/deleted timestamps (epoch ms) so the
 *   data can be synced later without a schema rewrite. Deletes are soft.
 * - Weights are always stored in kilograms. Display units are a setting.
 * - Calendar dates are ISO strings `YYYY-MM-DD` (local date of the user).
 */
import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const now = sql`(cast(unixepoch('subsec') * 1000 as integer))`;

const audit = {
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
  deletedAt: integer('deleted_at'),
};

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

export const MOVEMENT_PATTERNS = [
  'squat',
  'hinge',
  'lunge',
  'push_h',
  'push_v',
  'pull_h',
  'pull_v',
  'isolation',
  'core',
  'carry',
] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

export const exercises = sqliteTable(
  'exercises',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    primaryMuscle: text('primary_muscle').notNull(),
    /** JSON array of muscle names */
    secondaryMuscles: text('secondary_muscles').notNull().default('[]'),
    equipment: text('equipment').notNull(),
    pattern: text('pattern').$type<MovementPattern>().notNull(),
    isCompound: integer('is_compound', { mode: 'boolean' }).notNull().default(false),
    /** Smallest sensible load jump for this exercise, kg */
    defaultIncrementKg: real('default_increment_kg').notNull().default(2.5),
    /** Our own short coaching cues */
    cues: text('cues').notNull().default(''),
    /** Optional user-supplied media link (we ship placeholders only) */
    mediaUrl: text('media_url'),
    isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
    ...audit,
  },
  (t) => [index('exercises_primary_idx').on(t.primaryMuscle)],
);

// ---------------------------------------------------------------------------
// Program templates
// ---------------------------------------------------------------------------

export const PROGRESSION_METHODS = ['linear', 'double', 'rpe', 'block'] as const;
export type ProgressionMethod = (typeof PROGRESSION_METHODS)[number];

export const PROGRESSION_RULES = ['linear', 'double', 'rpe', 'none'] as const;
export type ProgressionRuleKind = (typeof PROGRESSION_RULES)[number];

export const programTemplates = sqliteTable('program_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  method: text('method').$type<ProgressionMethod>().notNull(),
  level: text('level').$type<'beginner' | 'intermediate' | 'advanced'>().notNull(),
  weeks: integer('weeks').notNull(),
  daysPerWeek: integer('days_per_week').notNull(),
  /** Length of the repeating cycle in days (training + rest days), usually 7 */
  cycleLength: integer('cycle_length').notNull().default(7),
  minutes: integer('minutes').notNull(),
  summary: text('summary').notNull(),
  /** "Who it's for / why choose it" */
  rationale: text('rationale').notNull(),
  isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
  ...audit,
});

export const PHASE_KINDS = ['accumulation', 'intensification', 'realisation', 'deload'] as const;
export type PhaseKind = (typeof PHASE_KINDS)[number];

export const phases = sqliteTable('phases', {
  id: text('id').primaryKey(),
  templateId: text('template_id')
    .notNull()
    .references(() => programTemplates.id),
  weekFrom: integer('week_from').notNull(),
  weekTo: integer('week_to').notNull(),
  kind: text('kind').$type<PhaseKind>().notNull(),
  /** Multiplier applied to prescribed working sets */
  volumeMult: real('volume_mult').notNull().default(1),
  /** RPE target applied to working sets in this phase (null = per exercise) */
  rpeTarget: real('rpe_target'),
  /**
   * Multiplier on the rep range of RPE-prescribed (main) lifts in this phase, e.g. 0.6 turns
   * 8–10 into 5–6. Null means 1. The RPE engine turns fewer reps into heavier loads.
   */
  repMult: real('rep_mult'),
  ...audit,
});

/** One slot in the template's repeating cycle. Rest days are explicit rows. */
export const templateDays = sqliteTable(
  'template_days',
  {
    id: text('id').primaryKey(),
    templateId: text('template_id')
      .notNull()
      .references(() => programTemplates.id),
    dayIndex: integer('day_index').notNull(),
    name: text('name').notNull(),
    isRest: integer('is_rest', { mode: 'boolean' }).notNull().default(false),
    focus: text('focus').notNull().default(''),
    ...audit,
  },
  (t) => [uniqueIndex('template_days_tpl_idx').on(t.templateId, t.dayIndex)],
);

export const programExercises = sqliteTable(
  'program_exercises',
  {
    id: text('id').primaryKey(),
    templateDayId: text('template_day_id')
      .notNull()
      .references(() => templateDays.id),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    /** Superset / block letter: A, B, C… exercises sharing a letter alternate */
    series: text('series').notNull(),
    position: integer('position').notNull(),
    warmupSets: integer('warmup_sets').notNull().default(0),
    sets: integer('sets').notNull(),
    repMin: integer('rep_min').notNull(),
    repMax: integer('rep_max').notNull(),
    targetRpe: real('target_rpe'),
    tempo: text('tempo'),
    restS: integer('rest_s').notNull().default(120),
    // Progression rule (1:1 with the prescription)
    rule: text('rule').$type<ProgressionRuleKind>().notNull(),
    incrementKg: real('increment_kg'),
    failsBeforeReset: integer('fails_before_reset').notNull().default(3),
    resetPct: real('reset_pct').notNull().default(0.9),
    ...audit,
  },
  (t) => [index('program_exercises_day_idx').on(t.templateDayId)],
);

// ---------------------------------------------------------------------------
// The user's run of a program
// ---------------------------------------------------------------------------

export const enrolments = sqliteTable('enrolments', {
  id: text('id').primaryKey(),
  templateId: text('template_id')
    .notNull()
    .references(() => programTemplates.id),
  startedOn: text('started_on').notNull(),
  /** 0-based position in the *ordered* sequence of program days (not a calendar date) */
  currentDayIndex: integer('current_day_index').notNull().default(0),
  /** JSON array of template dayIndex values defining the user's custom order within a cycle; null = default */
  dayOrder: text('day_order'),
  status: text('status').$type<'active' | 'completed' | 'abandoned'>().notNull().default('active'),
  ...audit,
});

export const enrolmentSwaps = sqliteTable('enrolment_swaps', {
  id: text('id').primaryKey(),
  enrolmentId: text('enrolment_id')
    .notNull()
    .references(() => enrolments.id),
  /** The program_exercises row being replaced */
  programExerciseId: text('program_exercise_id')
    .notNull()
    .references(() => programExercises.id),
  fromExerciseId: text('from_exercise_id').notNull(),
  toExerciseId: text('to_exercise_id').notNull(),
  /** program = every future occurrence; session = one program day occurrence only */
  scope: text('scope').$type<'program' | 'session'>().notNull(),
  /** For scope=session: the absolute program day number (0-based) it applies to */
  programDay: integer('program_day'),
  ...audit,
});

/** Per-exercise progression state maintained by the overload engine (step 3). */
export const exerciseStates = sqliteTable('exercise_states', {
  id: text('id').primaryKey(), // = exercise id
  exerciseId: text('exercise_id')
    .notNull()
    .references(() => exercises.id),
  workingWeightKg: real('working_weight_kg'),
  targetReps: integer('target_reps'),
  consecutiveFails: integer('consecutive_fails').notNull().default(0),
  e1rmKg: real('e1rm_kg'),
  lastIncreaseOn: text('last_increase_on'),
  lastSessionId: text('last_session_id'),
  ...audit,
});

// ---------------------------------------------------------------------------
// Training log
// ---------------------------------------------------------------------------

export const SESSION_STATUSES = ['in_progress', 'completed', 'partial', 'discarded'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    enrolmentId: text('enrolment_id').references(() => enrolments.id),
    templateDayId: text('template_day_id').references(() => templateDays.id),
    /** Absolute program day number (0-based) this session fulfils, if any */
    programDay: integer('program_day'),
    date: text('date').notNull(),
    name: text('name').notNull(),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    status: text('status').$type<SessionStatus>().notNull(),
    readinessAtStart: real('readiness_at_start'),
    /** JSON: what the readiness nudge changed for this session */
    adjustments: text('adjustments'),
    notes: text('notes'),
    isBackfill: integer('is_backfill', { mode: 'boolean' }).notNull().default(false),
    ...audit,
  },
  (t) => [index('sessions_date_idx').on(t.date)],
);

export const SET_TYPES = ['warmup', 'working', 'backoff'] as const;
export type SetType = (typeof SET_TYPES)[number];

export const setLogs = sqliteTable(
  'set_logs',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    programExerciseId: text('program_exercise_id'),
    series: text('series'),
    exerciseOrder: integer('exercise_order').notNull().default(0),
    setIndex: integer('set_index').notNull(),
    setType: text('set_type').$type<SetType>().notNull(),
    targetWeightKg: real('target_weight_kg'),
    targetReps: integer('target_reps'),
    targetRpe: real('target_rpe'),
    /** Prescribed rest after this set, seconds */
    restS: integer('rest_s'),
    /** Engine explanation for the target (stored on the first working set of an exercise) */
    targetNote: text('target_note'),
    /** The lifter's own note on this set, e.g. "left shoulder felt off" */
    note: text('note'),
    weightKg: real('weight_kg'),
    reps: integer('reps'),
    rpe: real('rpe'),
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    loggedAt: integer('logged_at'),
    ...audit,
  },
  (t) => [
    index('set_logs_session_idx').on(t.sessionId),
    index('set_logs_exercise_idx').on(t.exerciseId, t.loggedAt),
  ],
);

// ---------------------------------------------------------------------------
// Health, readiness, check-ins, planning
// ---------------------------------------------------------------------------

export const HEALTH_SOURCES = ['oura', 'healthconnect', 'healthkit', 'sample', 'manual'] as const;
export type HealthSource = (typeof HEALTH_SOURCES)[number];

export const healthDaily = sqliteTable(
  'health_daily',
  {
    id: text('id').primaryKey(), // `${date}:${source}`
    date: text('date').notNull(),
    source: text('source').$type<HealthSource>().notNull(),
    hrvMs: real('hrv_ms'),
    rhrBpm: real('rhr_bpm'),
    sleepHours: real('sleep_hours'),
    sleepScore: real('sleep_score'),
    vendorReadiness: real('vendor_readiness'),
    ...audit,
  },
  (t) => [uniqueIndex('health_daily_date_source_idx').on(t.date, t.source)],
);

export const readinessDaily = sqliteTable('readiness_daily', {
  id: text('id').primaryKey(), // = date
  date: text('date').notNull(),
  score: real('score'),
  band: text('band').$type<'green' | 'amber' | 'red' | 'unknown'>().notNull(),
  /** JSON array of human-readable reasons */
  reasons: text('reasons').notNull().default('[]'),
  ...audit,
});

export const checkins = sqliteTable('checkins', {
  id: text('id').primaryKey(), // = `${enrolmentId}:${programWeek}` (or a week start date for free training)
  weekStart: text('week_start').notNull(),
  enrolmentId: text('enrolment_id'),
  /** The program week this check-in reviews (1-based) */
  programWeek: integer('program_week'),
  fatigue: integer('fatigue').notNull(),
  soreness: integer('soreness').notNull(),
  motivation: integer('motivation').notNull(),
  jointPain: integer('joint_pain').notNull(),
  jointPainRegion: text('joint_pain_region'),
  note: text('note'),
  ...audit,
});

export const weekPlans = sqliteTable('week_plans', {
  id: text('id').primaryKey(),
  enrolmentId: text('enrolment_id')
    .notNull()
    .references(() => enrolments.id),
  weekStart: text('week_start').notNull(),
  volumeMult: real('volume_mult').notNull(),
  rpeCap: real('rpe_cap'),
  deload: integer('deload', { mode: 'boolean' }).notNull().default(false),
  reasons: text('reasons').notNull().default('[]'),
  accepted: integer('accepted', { mode: 'boolean' }),
  /** The program week this plan applies to (1-based) */
  programWeek: integer('program_week'),
  /** JSON: the full planner decision (kind, load changes, region rule, metrics) */
  details: text('details'),
  ...audit,
});

// ---------------------------------------------------------------------------
// Body & nutrition
// ---------------------------------------------------------------------------

export const bodyweights = sqliteTable('bodyweights', {
  id: text('id').primaryKey(), // = date
  date: text('date').notNull(),
  kg: real('kg').notNull(),
  source: text('source').$type<HealthSource>().notNull().default('manual'),
  ...audit,
});

export const nutritionTargets = sqliteTable('nutrition_targets', {
  id: text('id').primaryKey(),
  effectiveFrom: text('effective_from').notNull(),
  goal: text('goal').$type<'cut' | 'maintain' | 'gain'>().notNull(),
  activity: text('activity')
    .$type<'sedentary' | 'light' | 'moderate' | 'high' | 'very_high'>()
    .notNull(),
  basedOnKg: real('based_on_kg').notNull(),
  kcal: integer('kcal').notNull(),
  proteinG: integer('protein_g').notNull(),
  carbsG: integer('carbs_g').notNull(),
  fatG: integer('fat_g').notNull(),
  ...audit,
});

// ---------------------------------------------------------------------------
// Settings & sync bookkeeping
// ---------------------------------------------------------------------------

export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(), // setting key
  value: text('value').notNull(), // JSON
  ...audit,
});

/** Populated by triggers (see migration 0001). Consumed by the future sync worker. */
export const changeLog = sqliteTable('change_log', {
  seq: integer('seq').primaryKey({ autoIncrement: true }),
  tableName: text('table_name').notNull(),
  rowId: text('row_id').notNull(),
  op: text('op').$type<'insert' | 'update' | 'delete'>().notNull(),
  at: integer('at').notNull().default(now),
});

/** Tables that hold user or content data, in dependency order (parents first). */
export const DATA_TABLES = {
  exercises,
  program_templates: programTemplates,
  phases,
  template_days: templateDays,
  program_exercises: programExercises,
  enrolments,
  enrolment_swaps: enrolmentSwaps,
  exercise_states: exerciseStates,
  sessions,
  set_logs: setLogs,
  health_daily: healthDaily,
  readiness_daily: readinessDaily,
  checkins,
  week_plans: weekPlans,
  bodyweights,
  nutrition_targets: nutritionTargets,
  settings,
} as const;

export type DataTableName = keyof typeof DATA_TABLES;
