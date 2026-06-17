import { Injectable, Logger } from '@nestjs/common';
import { readdirSync, readFileSync, existsSync } from 'fs';
import * as path from 'path';
import { Skill, SkillMetadata } from './skill.interface';

@Injectable()
export class SkillRegistryService {
  private readonly logger = new Logger(SkillRegistryService.name);
  private readonly skillsDir = path.join(process.cwd(), 'skills');
  private skills: Skill[] = [];

  constructor() {
    this.loadSkillsFromFilesystem();
  }

  getAllSkills(): Skill[] {
    return [...this.skills];
  }

  findRelevant(query: string, limit = 5): Skill[] {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => term.length >= 3);

    const matched = this.skills
      .map((skill) => {
        const score = terms.reduce((acc, term) => {
          if (skill.name.toLowerCase().includes(term)) return acc + 3;
          if (skill.description.toLowerCase().includes(term)) return acc + 2;
          if (skill.keywords.some((kw) => kw.toLowerCase().includes(term))) return acc + 4;
          if (skill.content.toLowerCase().includes(term)) return acc + 1;
          return acc;
        }, 0);
        return { skill, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || (b.skill.priority ?? 0) - (a.skill.priority ?? 0))
      .slice(0, limit)
      .map((item) => item.skill);

    return matched;
  }

  private loadSkillsFromFilesystem(): void {
    if (!existsSync(this.skillsDir)) {
      this.logger.warn(`No existe el directorio de skills: ${this.skillsDir}`);
      return;
    }

    const skillFolders = readdirSync(this.skillsDir, { withFileTypes: true }).filter((dirent) => dirent.isDirectory());

    for (const folder of skillFolders) {
      const folderPath = path.join(this.skillsDir, folder.name);
      const metadataPath = path.join(folderPath, 'metadata.json');
      const skillPath = path.join(folderPath, 'skill.md');

      if (!existsSync(metadataPath) || !existsSync(skillPath)) {
        this.logger.warn(`Skill incompleta en ${folderPath}; se requiere metadata.json y skill.md`);
        continue;
      }

      try {
        const metadataRaw = readFileSync(metadataPath, 'utf-8');
        const metadata = JSON.parse(metadataRaw) as SkillMetadata;
        const content = readFileSync(skillPath, 'utf-8');
        const summary = this.buildSummary(content);

        this.skills.push({
          ...metadata,
          content,
          summary,
          source: folder.name,
        });
      } catch (error) {
        this.logger.error(`Error cargando skill ${folder.name}: ${error.message}`);
      }
    }

    this.logger.log(`Skills cargadas: ${this.skills.length}`);
  }

  private buildSummary(content: string): string {
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    return lines.slice(0, 4).join(' ');
  }
}
