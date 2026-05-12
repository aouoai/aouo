import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clearSkills, getAllSkills, getSkill, buildSkillIndex } from '../../src/packs/skillRegistry.js';

describe('packs/skillRegistry', () => {
  beforeEach(() => {
    clearSkills();
  });

  afterEach(() => {
    clearSkills();
  });

  it('should return undefined for unregistered skill', () => {
    expect(getSkill('nonexistent')).toBeUndefined();
  });

  it('should return empty array when no skills registered', () => {
    expect(getAllSkills()).toEqual([]);
  });

  it('should return empty string for skill index with no skills', () => {
    expect(buildSkillIndex()).toBe('');
  });
});
