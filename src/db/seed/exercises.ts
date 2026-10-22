/**
 * Starter exercise library. Names are generic movement names; descriptions and
 * cues are our own wording. No third-party content or media.
 */
import type { MovementPattern } from '../schema';

export type SeedExercise = {
  id: string;
  name: string;
  primary: string;
  secondary: string[];
  equipment: string;
  pattern: MovementPattern;
  compound: boolean;
  incrementKg: number;
  cues: string;
};

const e = (
  id: string,
  name: string,
  primary: string,
  secondary: string[],
  equipment: string,
  pattern: MovementPattern,
  compound: boolean,
  incrementKg: number,
  cues: string,
): SeedExercise => ({ id, name, primary, secondary, equipment, pattern, compound, incrementKg, cues });

export const SEED_EXERCISES: SeedExercise[] = [
  // ---- Quads / squat pattern
  e('back_squat', 'Barbell Back Squat', 'quads', ['glutes', 'adductors', 'lower back'], 'barbell', 'squat', true, 5, 'Brace before you descend, keep the bar over mid-foot, and drive the floor away on the way up.'),
  e('front_squat', 'Barbell Front Squat', 'quads', ['glutes', 'upper back'], 'barbell', 'squat', true, 2.5, 'Elbows high, torso tall; sit straight down between the heels.'),
  e('high_bar_heel_squat', 'Heels-Elevated Barbell Squat', 'quads', ['glutes'], 'barbell', 'squat', true, 2.5, 'Heels on a small wedge so the knees travel forward; stay upright and control the bottom.'),
  e('hack_squat', 'Hack Squat (Machine)', 'quads', ['glutes'], 'machine', 'squat', true, 5, 'Back flat on the pad, feet mid-platform; go as deep as you can without the hips peeling off.'),
  e('leg_press', 'Leg Press', 'quads', ['glutes', 'adductors'], 'machine', 'squat', true, 10, 'Lower until the knees are well bent but the lower back stays on the pad; do not lock out hard.'),
  e('goblet_squat', 'Goblet Squat', 'quads', ['glutes', 'core'], 'dumbbell', 'squat', true, 2, 'Hold the bell at the chest, elbows inside the knees at the bottom.'),
  e('bulgarian_split_squat', 'Rear-Foot-Elevated Split Squat', 'quads', ['glutes', 'adductors'], 'dumbbell', 'lunge', true, 2, 'Most weight on the front foot; drop the back knee straight down.'),
  e('walking_lunge', 'Walking Lunge', 'quads', ['glutes'], 'dumbbell', 'lunge', true, 2, 'Long enough steps that the front shin stays roughly vertical; push through the whole foot.'),
  e('reverse_lunge', 'Reverse Lunge', 'glutes', ['quads'], 'dumbbell', 'lunge', true, 2, 'Step back softly and keep the torso slightly forward to bias the glutes.'),
  e('leg_extension', 'Leg Extension', 'quads', [], 'machine', 'isolation', false, 2.5, 'Pad just above the ankle; squeeze at the top for a beat, lower slowly.'),
  e('sissy_squat', 'Assisted Sissy Squat', 'quads', [], 'bodyweight', 'isolation', false, 0, 'Hold a support, let the knees travel far forward while hips stay extended.'),

  // ---- Hamstrings / glutes / hinge
  e('deadlift', 'Conventional Deadlift', 'hamstrings', ['glutes', 'lower back', 'upper back', 'forearms'], 'barbell', 'hinge', true, 5, 'Bar over mid-foot, take the slack out, push the floor away and keep the bar dragging up the legs.'),
  e('rdl', 'Romanian Deadlift', 'hamstrings', ['glutes', 'lower back'], 'barbell', 'hinge', true, 2.5, 'Soft knees, push the hips back until the hamstrings are long, keep the bar close.'),
  e('db_rdl', 'Dumbbell Romanian Deadlift', 'hamstrings', ['glutes'], 'dumbbell', 'hinge', true, 2, 'Same hinge as the barbell version; let the bells track down the front of the thighs.'),
  e('stiff_leg_dl', 'Stiff-Leg Deadlift', 'hamstrings', ['glutes', 'lower back'], 'barbell', 'hinge', true, 2.5, 'Minimal knee bend, slow lowering, stop when the back wants to round.'),
  e('hip_thrust', 'Barbell Hip Thrust', 'glutes', ['hamstrings'], 'barbell', 'hinge', true, 5, 'Upper back on the bench, chin tucked, finish with the pelvis tucked under, not an arched back.'),
  e('glute_bridge', 'Glute Bridge', 'glutes', ['hamstrings'], 'bodyweight', 'hinge', false, 0, 'Feet close to the hips; drive through the heels and pause at the top.'),
  e('back_extension', '45° Back Extension', 'glutes', ['hamstrings', 'lower back'], 'bench', 'hinge', false, 2.5, 'Round slightly through the upper back to bias the glutes; avoid overarching at the top.'),
  e('seated_leg_curl', 'Seated Leg Curl', 'hamstrings', [], 'machine', 'isolation', false, 2.5, 'Lean the torso forward slightly to lengthen the hamstrings; control the return.'),
  e('lying_leg_curl', 'Lying Leg Curl', 'hamstrings', ['calves'], 'machine', 'isolation', false, 2.5, 'Hips pinned to the pad; curl smoothly and resist on the way down.'),
  e('nordic_curl', 'Nordic Hamstring Curl', 'hamstrings', [], 'bodyweight', 'isolation', false, 0, 'Lower as slowly as you can from the knees, keeping hips extended; push back up with the hands.'),
  e('cable_pull_through', 'Cable Pull-Through', 'glutes', ['hamstrings'], 'cable', 'hinge', false, 2.5, 'Face away from the stack, hinge back and snap the hips through.'),
  e('hip_abduction', 'Hip Abduction (Machine)', 'abductors', ['glutes'], 'machine', 'isolation', false, 5, 'Sit tall or lean slightly forward; push out and hold briefly.'),
  e('hip_adduction', 'Hip Adduction (Machine)', 'adductors', [], 'machine', 'isolation', false, 5, 'Controlled squeeze in, slow stretch out.'),

  // ---- Calves
  e('standing_calf_raise', 'Standing Calf Raise', 'calves', [], 'machine', 'isolation', false, 5, 'Full stretch at the bottom with a pause, then rise as high as possible.'),
  e('seated_calf_raise', 'Seated Calf Raise', 'calves', [], 'machine', 'isolation', false, 5, 'Bent knee targets the soleus; slow tempo with a deep stretch.'),
  e('leg_press_calf_raise', 'Calf Press on Leg Press', 'calves', [], 'machine', 'isolation', false, 10, 'Balls of the feet on the bottom edge; do not let the knees bend.'),

  // ---- Chest / horizontal push
  e('bench_press', 'Barbell Bench Press', 'chest', ['front delts', 'triceps'], 'barbell', 'push_h', true, 2.5, 'Shoulder blades pinned, feet planted, touch the lower chest and press back toward the face.'),
  e('incline_bench', 'Incline Barbell Bench Press', 'chest', ['front delts', 'triceps'], 'barbell', 'push_h', true, 2.5, 'Low incline (about 30°); bar touches the upper chest.'),
  e('db_bench', 'Dumbbell Bench Press', 'chest', ['front delts', 'triceps'], 'dumbbell', 'push_h', true, 2, 'Let the bells come slightly wider than the bar would for a deeper stretch.'),
  e('incline_db_press', 'Incline Dumbbell Press', 'chest', ['front delts', 'triceps'], 'dumbbell', 'push_h', true, 2, 'Bench around 30°, elbows about 45° from the body.'),
  e('machine_chest_press', 'Machine Chest Press', 'chest', ['triceps'], 'machine', 'push_h', true, 5, 'Seat so the handles line up with mid-chest; stable and easy to push close to failure.'),
  e('dips', 'Chest Dip', 'chest', ['triceps', 'front delts'], 'bodyweight', 'push_h', true, 2.5, 'Lean forward slightly and lower until the shoulders are just below the elbows.'),
  e('push_up', 'Push-Up', 'chest', ['triceps', 'core'], 'bodyweight', 'push_h', true, 0, 'Body in one line; chest touches the floor each rep.'),
  e('cable_fly', 'Cable Fly', 'chest', [], 'cable', 'isolation', false, 2.5, 'Slight bend in the elbows, hug a big tree and squeeze the chest together.'),
  e('pec_deck', 'Pec Deck', 'chest', [], 'machine', 'isolation', false, 5, 'Arms slightly bent, stretch wide and close without letting the shoulders roll forward.'),

  // ---- Shoulders / vertical push
  e('ohp', 'Standing Overhead Press', 'front delts', ['triceps', 'upper chest', 'core'], 'barbell', 'push_v', true, 2.5, 'Squeeze glutes, press in a straight line and move the head through once the bar passes it.'),
  e('seated_db_press', 'Seated Dumbbell Shoulder Press', 'front delts', ['triceps', 'side delts'], 'dumbbell', 'push_v', true, 2, 'Back supported, bells start at ear level and finish over the shoulders.'),
  e('machine_shoulder_press', 'Machine Shoulder Press', 'front delts', ['triceps'], 'machine', 'push_v', true, 5, 'Handles start roughly at chin height; press without shrugging.'),
  e('lateral_raise', 'Dumbbell Lateral Raise', 'side delts', [], 'dumbbell', 'isolation', false, 1, 'Lead with the elbows, raise to shoulder height, lower slowly.'),
  e('cable_lateral_raise', 'Cable Lateral Raise', 'side delts', [], 'cable', 'isolation', false, 1.25, 'Cable behind the body, constant tension through the full range.'),
  e('rear_delt_fly', 'Rear Delt Fly (Machine)', 'rear delts', ['upper back'], 'machine', 'isolation', false, 2.5, 'Arms long, sweep back without squeezing the shoulder blades too hard.'),
  e('face_pull', 'Face Pull', 'rear delts', ['upper back', 'rotator cuff'], 'cable', 'pull_h', false, 2.5, 'Rope to the eyes, elbows high, finish with the hands outside the ears.'),
  e('upright_row', 'Cable Upright Row', 'side delts', ['traps'], 'cable', 'pull_v', false, 2.5, 'Wide grip, pull elbows up and out to shoulder height only.'),

  // ---- Back / pulls
  e('pull_up', 'Pull-Up', 'lats', ['biceps', 'upper back'], 'bodyweight', 'pull_v', true, 2.5, 'Start from a dead hang, drive the elbows down to the ribs.'),
  e('chin_up', 'Chin-Up', 'lats', ['biceps'], 'bodyweight', 'pull_v', true, 2.5, 'Palms facing you, chest toward the bar.'),
  e('lat_pulldown', 'Lat Pulldown', 'lats', ['biceps', 'upper back'], 'cable', 'pull_v', true, 2.5, 'Slight lean back, pull the bar to the upper chest, full stretch at the top.'),
  e('neutral_pulldown', 'Neutral-Grip Pulldown', 'lats', ['biceps'], 'cable', 'pull_v', true, 2.5, 'Close parallel handle; think elbows to hips.'),
  e('single_arm_pulldown', 'Single-Arm Cable Pulldown', 'lats', [], 'cable', 'pull_v', false, 1.25, 'Kneel or sit side-on; pull in an arc toward the hip.'),
  e('barbell_row', 'Barbell Bent-Over Row', 'upper back', ['lats', 'biceps', 'lower back'], 'barbell', 'pull_h', true, 2.5, 'Hinge to about 45°, pull the bar to the lower ribs without jerking the torso.'),
  e('chest_supported_row', 'Chest-Supported Row', 'upper back', ['lats', 'rear delts'], 'machine', 'pull_h', true, 2.5, 'Chest stays on the pad; squeeze the shoulder blades at the end.'),
  e('seated_cable_row', 'Seated Cable Row', 'upper back', ['lats', 'biceps'], 'cable', 'pull_h', true, 2.5, 'Sit tall, row to the stomach, let the shoulders reach forward on the return.'),
  e('db_row', 'One-Arm Dumbbell Row', 'lats', ['upper back', 'biceps'], 'dumbbell', 'pull_h', true, 2, 'Brace on a bench, pull the bell toward the hip.'),
  e('pullover', 'Cable Straight-Arm Pullover', 'lats', [], 'cable', 'isolation', false, 2.5, 'Arms nearly straight, sweep from overhead down to the thighs.'),
  e('shrug', 'Dumbbell Shrug', 'traps', [], 'dumbbell', 'isolation', false, 2, 'Straight up toward the ears, pause, lower fully.'),

  // ---- Arms
  e('barbell_curl', 'Barbell Curl', 'biceps', ['forearms'], 'barbell', 'isolation', false, 2.5, 'Elbows still at the sides; no swinging.'),
  e('db_curl', 'Dumbbell Curl', 'biceps', ['forearms'], 'dumbbell', 'isolation', false, 1, 'Rotate the pinky up as you curl.'),
  e('incline_db_curl', 'Incline Dumbbell Curl', 'biceps', [], 'dumbbell', 'isolation', false, 1, 'Arms hang behind the body for a long-length stretch.'),
  e('hammer_curl', 'Hammer Curl', 'brachialis', ['biceps', 'forearms'], 'dumbbell', 'isolation', false, 1, 'Neutral grip, thumbs up the whole way.'),
  e('preacher_curl', 'Preacher Curl', 'biceps', [], 'machine', 'isolation', false, 2.5, 'Armpits tight to the pad; control the bottom of each rep.'),
  e('cable_curl', 'Cable Curl', 'biceps', [], 'cable', 'isolation', false, 2.5, 'Step back for constant tension at the bottom.'),
  e('close_grip_bench', 'Close-Grip Bench Press', 'triceps', ['chest', 'front delts'], 'barbell', 'push_h', true, 2.5, 'Hands about shoulder-width, elbows tucked, touch the lower chest.'),
  e('skull_crusher', 'EZ-Bar Skull Crusher', 'triceps', [], 'barbell', 'isolation', false, 2.5, 'Lower toward the forehead or just behind the head; elbows stay pointed up.'),
  e('triceps_pushdown', 'Cable Triceps Pushdown', 'triceps', [], 'cable', 'isolation', false, 2.5, 'Elbows pinned, fully lock out each rep.'),
  e('overhead_triceps_ext', 'Overhead Cable Triceps Extension', 'triceps', [], 'cable', 'isolation', false, 2.5, 'Face away from the stack; long stretch behind the head.'),
  e('wrist_curl', 'Wrist Curl', 'forearms', [], 'dumbbell', 'isolation', false, 1, 'Forearms on the thighs, roll the weight to the fingertips and back.'),

  // ---- Core / carries
  e('hanging_leg_raise', 'Hanging Leg Raise', 'abs', ['hip flexors'], 'bodyweight', 'core', false, 0, 'Curl the pelvis up, not just the legs; no swinging.'),
  e('cable_crunch', 'Cable Crunch', 'abs', [], 'cable', 'core', false, 2.5, 'Kneel, round the spine down toward the floor, hips stay still.'),
  e('ab_wheel', 'Ab Wheel Rollout', 'abs', ['lats'], 'other', 'core', false, 0, 'Ribs down, roll out only as far as you can keep the back from sagging.'),
  e('plank', 'Plank', 'abs', ['core'], 'bodyweight', 'core', false, 0, 'Squeeze glutes and quads; hold a straight line. Log seconds as reps.'),
  e('pallof_press', 'Pallof Press', 'obliques', ['abs'], 'cable', 'core', false, 1.25, 'Resist the cable pulling you round; press out and hold.'),
  e('farmer_carry', 'Farmer Carry', 'forearms', ['traps', 'core'], 'dumbbell', 'carry', true, 2, 'Tall posture, short quick steps. Log metres as reps.'),

  // ---- Conditioning / mobility (tracked without load progression)
  e('bike_intervals', 'Bike Intervals', 'conditioning', [], 'machine', 'core', false, 0, 'Hard efforts with easy recovery; log minutes as reps.'),
  e('incline_walk', 'Incline Treadmill Walk', 'conditioning', [], 'machine', 'core', false, 0, 'Brisk walk on a steep incline; log minutes as reps.'),
  e('hip_mobility', 'Hip Mobility Flow', 'mobility', [], 'bodyweight', 'core', false, 0, 'Slow 90/90 switches, deep squat holds and hip openers; log minutes as reps.'),
];
