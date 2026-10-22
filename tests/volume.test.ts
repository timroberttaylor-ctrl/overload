import { describe, expect, it } from 'vitest';

import { pickPushSlots, setsUnderPlan } from '@/core/planner';
import { groupStatus, laggingGroups, volumeHint, weeklyVolume } from '@/core/volume';

describe('weekly volume by muscle', () => {
  it('counts primary muscles fully and secondary muscles as half, once per group', () => {
    const v = weeklyVolume([
      { primaryMuscle: 'chest', secondaryMuscles: ['triceps', 'front delts'], sets: 3 },
      { primaryMuscle: 'lats', secondaryMuscles: ['upper back', 'biceps'], sets: 4 }, // upper back is the same group as lats
      { primaryMuscle: 'forearms', secondaryMuscles: [], sets: 2 }, // not tracked
    ]);
    expect(v).toMatchObject({ chest: 3, triceps: 1.5, shoulders: 1.5, back: 4, biceps: 2, quads: 0 });
  });

  it('flags low and high volume and picks the most lagging trained muscles', () => {
    expect(groupStatus('chest', 0)).toBe('none');
    expect(groupStatus('chest', 6)).toBe('low');
    expect(groupStatus('chest', 12)).toBe('ok');
    expect(groupStatus('chest', 24)).toBe('high');
    expect(volumeHint('chest', 6)).toMatch(/below the 10–20/);
    const done = weeklyVolume([
      { primaryMuscle: 'chest', secondaryMuscles: [], sets: 6 },
      { primaryMuscle: 'calves', secondaryMuscles: [], sets: 2 },
      { primaryMuscle: 'quads', secondaryMuscles: [], sets: 9 },
    ]);
    expect(laggingGroups(done, ['chest', 'calves', 'quads'])).toEqual(['calves', 'chest']);
    expect(laggingGroups(done, ['quads'])).toEqual(['quads']);
    expect(laggingGroups(done, [])).toEqual([]); // nothing trained next week → nowhere to add sets
  });

  it('puts push sets on up to two slots per lagging muscle, accessories first', () => {
    const slots = [
      { id: 'bench', primaryMuscle: 'chest', isAccessory: false },
      { id: 'fly', primaryMuscle: 'chest', isAccessory: true },
      { id: 'incline', primaryMuscle: 'chest', isAccessory: false },
      { id: 'calf', primaryMuscle: 'calves', isAccessory: true },
    ];
    expect(pickPushSlots(['chest', 'calves'], slots)).toEqual(['fly', 'bench', 'calf']);
    const plan = { volumeMult: 1, extraAccessorySet: false, pushSlotIds: ['fly'] };
    expect(setsUnderPlan(3, plan, true, 'fly')).toBe(4);
    expect(setsUnderPlan(3, plan, true, 'other-accessory')).toBe(3);
  });
});
