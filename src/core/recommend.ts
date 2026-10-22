/**
 * First-run program recommendation. Pure: scores templates against a few answers.
 */

export type Experience = 'new' | 'some' | 'experienced';
export type TrainingGoal = 'muscle' | 'strength' | 'both';
export type Equipment = 'gym' | 'dumbbells';
export type SetupAnswers = { experience: Experience; days: number; goal: TrainingGoal; equipment: Equipment };

export type TemplateLike = { id: string; name: string; level: 'beginner' | 'intermediate' | 'advanced'; daysPerWeek: number; isCustom?: boolean };

/** What each built-in program is mainly for. Custom or unknown programs count as "both". */
const GOAL_OF: Record<string, TrainingGoal> = {
  tpl_ovrld_beginner: 'muscle',
  tpl_ovrld_intermediate: 'muscle',
  tpl_ovrld_advanced: 'muscle',
  tpl_hypertrophy_meso_5: 'muscle',
  tpl_ppl_6: 'muscle',
  tpl_bodypart_5: 'muscle',
  tpl_dumbbell_3: 'muscle',
  tpl_fullbody_novice_3: 'strength',
  tpl_undulating_3: 'strength',
  tpl_strength_block_4: 'strength',
  tpl_upper_lower_4: 'both',
  tpl_power_size_4: 'both',
  tpl_minimal_2: 'both',
};

/** Programs that need only dumbbells and a bench. */
const DUMBBELL_ONLY = new Set(['tpl_dumbbell_3']);

const LEVEL_FIT: Record<Experience, Record<TemplateLike['level'], number>> = {
  new: { beginner: 3, intermediate: 0.5, advanced: -3 },
  some: { beginner: 1.5, intermediate: 3, advanced: 0 },
  experienced: { beginner: 0, intermediate: 2.5, advanced: 3 },
};

export function scoreProgram(t: TemplateLike, a: SetupAnswers): number {
  if (a.equipment === 'dumbbells' && !DUMBBELL_ONLY.has(t.id)) return -Infinity;
  const goal = GOAL_OF[t.id] ?? 'both';
  const level = LEVEL_FIT[a.experience][t.level];
  // Fewer days than you have is fine; more days than you have is a poor fit.
  const gap = t.daysPerWeek - a.days;
  const days = gap === 0 ? 3 : gap === -1 ? 2 : gap < -1 ? 0.5 : gap === 1 ? -1 : -4;
  const goalFit = goal === a.goal ? 2 : goal === 'both' || a.goal === 'both' ? 1 : -0.5;
  const signature = t.id.startsWith('tpl_ovrld_') ? 0.5 : 0;
  return level + days + goalFit + signature;
}

/** Up to `limit` built-in programs, best fit first. */
export function recommendPrograms<T extends TemplateLike>(templates: T[], a: SetupAnswers, limit = 3): T[] {
  return templates
    .filter((t) => !t.isCustom)
    .map((t) => ({ t, score: scoreProgram(t, a) }))
    .filter((x) => Number.isFinite(x.score))
    .sort((x, y) => y.score - x.score || x.t.name.localeCompare(y.t.name))
    .slice(0, limit)
    .map((x) => x.t);
}
