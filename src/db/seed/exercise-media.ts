/**
 * Exercise illustrations (start and end position) from the Everkinetic open exercise
 * data set, licensed CC BY-SA 4.0. Adapted for Overload: cropped, resized and converted
 * to transparent line art so the app can tint them. See assets/exercises/CREDITS.md.
 * Generated; edit the mapping in assets/exercises/CREDITS.md and regenerate.
 */
import type { ImageSourcePropType } from 'react-native';

export type ExerciseMedia = { frames: [ImageSourcePropType, ImageSourcePropType]; source: string; variant: boolean };

export const EXERCISE_MEDIA: Record<string, ExerciseMedia> = {
  ab_wheel: { frames: [require('../../../assets/exercises/ab_wheel_0.png'), require('../../../assets/exercises/ab_wheel_1.png')], source: 'ab-rollout-on-knees-with-barbell', variant: true },
  back_extension: { frames: [require('../../../assets/exercises/back_extension_0.png'), require('../../../assets/exercises/back_extension_1.png')], source: 'hyperextensions', variant: false },
  back_squat: { frames: [require('../../../assets/exercises/back_squat_0.png'), require('../../../assets/exercises/back_squat_1.png')], source: 'barbell-squat', variant: false },
  barbell_curl: { frames: [require('../../../assets/exercises/barbell_curl_0.png'), require('../../../assets/exercises/barbell_curl_1.png')], source: 'biceps-curls-with-barbell', variant: false },
  barbell_row: { frames: [require('../../../assets/exercises/barbell_row_0.png'), require('../../../assets/exercises/barbell_row_1.png')], source: 'reverse-grips-bent-over-barbell-rows', variant: true },
  bench_press: { frames: [require('../../../assets/exercises/bench_press_0.png'), require('../../../assets/exercises/bench_press_1.png')], source: 'bench-press', variant: false },
  bike_intervals: { frames: [require('../../../assets/exercises/bike_intervals_0.png'), require('../../../assets/exercises/bike_intervals_1.png')], source: 'air-bike', variant: true },
  cable_curl: { frames: [require('../../../assets/exercises/cable_curl_0.png'), require('../../../assets/exercises/cable_curl_1.png')], source: 'standing-biceps-curl-with-cable', variant: false },
  cable_fly: { frames: [require('../../../assets/exercises/cable_fly_0.png'), require('../../../assets/exercises/cable_fly_1.png')], source: 'cable-crossover', variant: false },
  chest_supported_row: { frames: [require('../../../assets/exercises/chest_supported_row_0.png'), require('../../../assets/exercises/chest_supported_row_1.png')], source: 't-bar-rows', variant: true },
  chin_up: { frames: [require('../../../assets/exercises/chin_up_0.png'), require('../../../assets/exercises/chin_up_1.png')], source: 'narrow-parallel-grip-chin-ups', variant: true },
  close_grip_bench: { frames: [require('../../../assets/exercises/close_grip_bench_0.png'), require('../../../assets/exercises/close_grip_bench_1.png')], source: 'close-grip-barbell-bench-press', variant: false },
  db_bench: { frames: [require('../../../assets/exercises/db_bench_0.png'), require('../../../assets/exercises/db_bench_1.png')], source: 'bench-press-dumbbell', variant: false },
  db_curl: { frames: [require('../../../assets/exercises/db_curl_0.png'), require('../../../assets/exercises/db_curl_1.png')], source: 'biceps-curl-with-dumbbell', variant: false },
  db_rdl: { frames: [require('../../../assets/exercises/db_rdl_0.png'), require('../../../assets/exercises/db_rdl_1.png')], source: 'dumbbell-dead-lifts', variant: true },
  deadlift: { frames: [require('../../../assets/exercises/deadlift_0.png'), require('../../../assets/exercises/deadlift_1.png')], source: 'barbell-dead-lifts', variant: false },
  dips: { frames: [require('../../../assets/exercises/dips_0.png'), require('../../../assets/exercises/dips_1.png')], source: 'chest-dips', variant: false },
  front_squat: { frames: [require('../../../assets/exercises/front_squat_0.png'), require('../../../assets/exercises/front_squat_1.png')], source: 'front-squat-with-barbell', variant: false },
  glute_bridge: { frames: [require('../../../assets/exercises/glute_bridge_0.png'), require('../../../assets/exercises/glute_bridge_1.png')], source: 'bridging', variant: false },
  goblet_squat: { frames: [require('../../../assets/exercises/goblet_squat_0.png'), require('../../../assets/exercises/goblet_squat_1.png')], source: 'squats-using-dumbbells', variant: true },
  hack_squat: { frames: [require('../../../assets/exercises/hack_squat_0.png'), require('../../../assets/exercises/hack_squat_1.png')], source: 'hack-squat-machine', variant: false },
  hammer_curl: { frames: [require('../../../assets/exercises/hammer_curl_0.png'), require('../../../assets/exercises/hammer_curl_1.png')], source: 'biceps-hammer-curl-with-dumbbell', variant: false },
  high_bar_heel_squat: { frames: [require('../../../assets/exercises/high_bar_heel_squat_0.png'), require('../../../assets/exercises/high_bar_heel_squat_1.png')], source: 'narrow-stance-squat-with-barbell', variant: true },
  hip_abduction: { frames: [require('../../../assets/exercises/hip_abduction_0.png'), require('../../../assets/exercises/hip_abduction_1.png')], source: 'thigh-abductor', variant: false },
  hip_adduction: { frames: [require('../../../assets/exercises/hip_adduction_0.png'), require('../../../assets/exercises/hip_adduction_1.png')], source: 'thigh-adductor', variant: false },
  incline_bench: { frames: [require('../../../assets/exercises/incline_bench_0.png'), require('../../../assets/exercises/incline_bench_1.png')], source: 'incline-bench-press', variant: false },
  incline_db_curl: { frames: [require('../../../assets/exercises/incline_db_curl_0.png'), require('../../../assets/exercises/incline_db_curl_1.png')], source: 'alternating-incline-curl-with-dumbbell', variant: false },
  incline_db_press: { frames: [require('../../../assets/exercises/incline_db_press_0.png'), require('../../../assets/exercises/incline_db_press_1.png')], source: 'incline-dumbbell-press', variant: false },
  lat_pulldown: { frames: [require('../../../assets/exercises/lat_pulldown_0.png'), require('../../../assets/exercises/lat_pulldown_1.png')], source: 'underhand-pull-down', variant: true },
  lateral_raise: { frames: [require('../../../assets/exercises/lateral_raise_0.png'), require('../../../assets/exercises/lateral_raise_1.png')], source: 'lateral-dumbbell-raises', variant: false },
  leg_extension: { frames: [require('../../../assets/exercises/leg_extension_0.png'), require('../../../assets/exercises/leg_extension_1.png')], source: 'leg-extensions', variant: false },
  leg_press: { frames: [require('../../../assets/exercises/leg_press_0.png'), require('../../../assets/exercises/leg_press_1.png')], source: 'leg-press', variant: false },
  leg_press_calf_raise: { frames: [require('../../../assets/exercises/leg_press_calf_raise_0.png'), require('../../../assets/exercises/leg_press_calf_raise_1.png')], source: 'calves-press-on-leg-machine', variant: false },
  lying_leg_curl: { frames: [require('../../../assets/exercises/lying_leg_curl_0.png'), require('../../../assets/exercises/lying_leg_curl_1.png')], source: 'lying-leg-curl-machine', variant: false },
  machine_chest_press: { frames: [require('../../../assets/exercises/machine_chest_press_0.png'), require('../../../assets/exercises/machine_chest_press_1.png')], source: 'machine-bench-press', variant: false },
  machine_shoulder_press: { frames: [require('../../../assets/exercises/machine_shoulder_press_0.png'), require('../../../assets/exercises/machine_shoulder_press_1.png')], source: 'seated-military-press', variant: true },
  neutral_pulldown: { frames: [require('../../../assets/exercises/neutral_pulldown_0.png'), require('../../../assets/exercises/neutral_pulldown_1.png')], source: 'v-bar-pull-down', variant: false },
  ohp: { frames: [require('../../../assets/exercises/ohp_0.png'), require('../../../assets/exercises/ohp_1.png')], source: 'seated-military-press', variant: true },
  preacher_curl: { frames: [require('../../../assets/exercises/preacher_curl_0.png'), require('../../../assets/exercises/preacher_curl_1.png')], source: 'preacher-curl-with-machine', variant: false },
  pull_up: { frames: [require('../../../assets/exercises/pull_up_0.png'), require('../../../assets/exercises/pull_up_1.png')], source: 'pull-ups', variant: false },
  pullover: { frames: [require('../../../assets/exercises/pullover_0.png'), require('../../../assets/exercises/pullover_1.png')], source: 'straight-arm-push-down', variant: false },
  push_up: { frames: [require('../../../assets/exercises/push_up_0.png'), require('../../../assets/exercises/push_up_1.png')], source: 'push-ups', variant: false },
  rdl: { frames: [require('../../../assets/exercises/rdl_0.png'), require('../../../assets/exercises/rdl_1.png')], source: 'romanian-dead-lift', variant: false },
  rear_delt_fly: { frames: [require('../../../assets/exercises/rear_delt_fly_0.png'), require('../../../assets/exercises/rear_delt_fly_1.png')], source: 'seated-rear-lateral-cable-raise', variant: true },
  reverse_lunge: { frames: [require('../../../assets/exercises/reverse_lunge_0.png'), require('../../../assets/exercises/reverse_lunge_1.png')], source: 'rear-lunges-with-dumbbell', variant: false },
  seated_cable_row: { frames: [require('../../../assets/exercises/seated_cable_row_0.png'), require('../../../assets/exercises/seated_cable_row_1.png')], source: 'seated-cable-rows', variant: false },
  seated_calf_raise: { frames: [require('../../../assets/exercises/seated_calf_raise_0.png'), require('../../../assets/exercises/seated_calf_raise_1.png')], source: 'seated-calf-raise-using-machine', variant: false },
  seated_db_press: { frames: [require('../../../assets/exercises/seated_db_press_0.png'), require('../../../assets/exercises/seated_db_press_1.png')], source: 'one-arm-dumbbell-shoulder-press', variant: true },
  seated_leg_curl: { frames: [require('../../../assets/exercises/seated_leg_curl_0.png'), require('../../../assets/exercises/seated_leg_curl_1.png')], source: 'seated-leg-curl', variant: false },
  shrug: { frames: [require('../../../assets/exercises/shrug_0.png'), require('../../../assets/exercises/shrug_1.png')], source: 'shoulder-shrugs', variant: false },
  sissy_squat: { frames: [require('../../../assets/exercises/sissy_squat_0.png'), require('../../../assets/exercises/sissy_squat_1.png')], source: 'weighted-sissy-squat-with-weight-plate', variant: false },
  skull_crusher: { frames: [require('../../../assets/exercises/skull_crusher_0.png'), require('../../../assets/exercises/skull_crusher_1.png')], source: 'lying-triceps-press-with-barbell', variant: false },
  standing_calf_raise: { frames: [require('../../../assets/exercises/standing_calf_raise_0.png'), require('../../../assets/exercises/standing_calf_raise_1.png')], source: 'standing-calf-raises-using-machine', variant: false },
  stiff_leg_dl: { frames: [require('../../../assets/exercises/stiff_leg_dl_0.png'), require('../../../assets/exercises/stiff_leg_dl_1.png')], source: 'romanian-dead-lift', variant: true },
  triceps_pushdown: { frames: [require('../../../assets/exercises/triceps_pushdown_0.png'), require('../../../assets/exercises/triceps_pushdown_1.png')], source: 'triceps-pushdown-with-cable', variant: false },
  upright_row: { frames: [require('../../../assets/exercises/upright_row_0.png'), require('../../../assets/exercises/upright_row_1.png')], source: 'upright-cable-row', variant: false },
  walking_lunge: { frames: [require('../../../assets/exercises/walking_lunge_0.png'), require('../../../assets/exercises/walking_lunge_1.png')], source: 'walking-lunges', variant: false },
};

export const MEDIA_CREDIT = 'Exercise illustrations: Everkinetic (everkinetic.com, github.com/everkinetic/data), CC BY-SA 4.0. Adapted (cropped, resized, recoloured).';
