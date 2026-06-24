import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SkillRegistryService } from './skill-registry.service';

describe('SkillRegistryService', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'jarvis-skills-'));
    jest.spyOn(process, 'cwd').mockReturnValue(tempRoot);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('loads markdown skills from the skills folder and prioritizes them by priority', () => {
    const skillsDir = path.join(tempRoot, 'skills');
    mkdirSync(skillsDir, { recursive: true });

    writeFileSync(
      path.join(skillsDir, 'nestjs.md'),
      `---
name: NestJS
category: backend
description: Buenas prácticas para construir APIs con NestJS.
keywords:
  - nestjs
  - backend
priority: 10
capabilities:
  - toolExecution
---

# Skill: NestJS

Guías recomendadas para organizar módulos y servicios.
`,
      'utf-8',
    );

    const fallbackDir = path.join(skillsDir, 'fallback-skill');
    mkdirSync(fallbackDir, { recursive: true });
    writeFileSync(
      path.join(fallbackDir, 'metadata.json'),
      JSON.stringify({
        name: 'Fallback Skill',
        description: 'Skill de respaldo',
        category: 'general',
        keywords: ['fallback'],
        priority: 1,
      }),
      'utf-8',
    );
    writeFileSync(path.join(fallbackDir, 'skill.md'), '# Fallback skill\n\nContenido de respaldo.\n', 'utf-8');

    const service = new SkillRegistryService();
    const relevant = service.findRelevant('nestjs', 5);

    expect(relevant[0]?.name).toBe('NestJS');
    expect(relevant[0]?.priority).toBe(10);
    expect(relevant[0]?.source).toBe('nestjs.md');
  });
});
