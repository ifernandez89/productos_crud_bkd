import { Injectable, Logger } from '@nestjs/common';
import { readdirSync, readFileSync, existsSync } from 'fs';
import * as path from 'path';
import { Skill, SkillMetadata } from './skill.interface';

interface ParsedFrontmatter {
  name?: string;
  description?: string;
  category?: string;
  keywords?: string[];
  priority?: number;
  capabilities?: string[];
  content?: string;
}

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
          if (skill.keywords.some((kw) => kw.toLowerCase().includes(term)))
            return acc + 4;
          if (skill.content.toLowerCase().includes(term)) return acc + 1;
          return acc;
        }, 0);
        const effectiveScore = score + (skill.priority ?? 0) / 10;
        return { skill, score: effectiveScore };
      })
      .filter((item) => item.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          (b.skill.priority ?? 0) - (a.skill.priority ?? 0),
      )
      .slice(0, limit)
      .map((item) => item.skill);

    return matched;
  }

  private loadSkillsFromFilesystem(): void {
    this.skills = [];

    if (!existsSync(this.skillsDir)) {
      this.logger.warn(`No existe el directorio de skills: ${this.skillsDir}`);
      return;
    }

    const entries = readdirSync(this.skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(this.skillsDir, entry.name);

      if (entry.isDirectory()) {
        this.loadSkillFromFolder(fullPath, entry.name);
        continue;
      }

      if (entry.isFile() && /\.(md|markdown)$/i.test(entry.name)) {
        this.loadSkillFromMarkdownFile(fullPath, entry.name);
      }
    }

    this.logger.log(`Skills cargadas: ${this.skills.length}`);
  }

  private loadSkillFromFolder(folderPath: string, folderName: string): void {
    const metadataPath = path.join(folderPath, 'metadata.json');
    const skillPath = path.join(folderPath, 'skill.md');

    if (!existsSync(metadataPath) || !existsSync(skillPath)) {
      this.logger.warn(
        `Skill incompleta en ${folderPath}; se requiere metadata.json y skill.md`,
      );
      return;
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
        source: folderName,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error cargando skill ${folderName}: ${message}`);
    }
  }

  private loadSkillFromMarkdownFile(filePath: string, fileName: string): void {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const { metadata, content: skillContent } = this.parseMarkdownSkill(
        content,
        fileName,
      );
      const summary = this.buildSummary(skillContent);

      this.skills.push({
        ...metadata,
        content: skillContent,
        summary,
        source: fileName,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error cargando skill ${fileName}: ${message}`);
    }
  }

  private parseMarkdownSkill(
    content: string,
    fallbackName: string,
  ): { metadata: SkillMetadata; content: string } {
    const frontmatter = this.parseFrontmatter(content);
    const skillContent = frontmatter.content ?? content;
    const name =
      frontmatter.name ??
      this.extractHeadingName(skillContent) ??
      path.basename(fallbackName, path.extname(fallbackName));
    const description =
      frontmatter.description ??
      this.extractDescription(skillContent) ??
      `Skill cargada desde ${fallbackName}`;
    const category = frontmatter.category ?? 'general';
    const keywords = frontmatter.keywords?.length
      ? frontmatter.keywords
      : this.extractKeywords(skillContent, name);
    const priority = frontmatter.priority ?? 5;
    const capabilities = frontmatter.capabilities ?? [];

    return {
      metadata: {
        name,
        description,
        category,
        keywords,
        priority,
        capabilities,
      },
      content: skillContent,
    };
  }

  private parseFrontmatter(content: string): ParsedFrontmatter {
    const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
    if (!match) {
      return {};
    }

    const parsed: ParsedFrontmatter = {};
    const lines = match[1].split(/\r?\n/);
    let currentKey: keyof ParsedFrontmatter | undefined;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line.startsWith('- ')) {
        if (!currentKey) continue;
        const item = line.slice(2).trim();
        const currentValue = parsed[currentKey];
        if (Array.isArray(currentValue)) {
          currentValue.push(item);
        }
        continue;
      }

      const keyValue = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!keyValue) continue;

      const [, key, value] = keyValue;
      currentKey = key as keyof ParsedFrontmatter;

      if (key === 'keywords' || key === 'capabilities') {
        if (value.trim()) {
          const entries = value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean);
          parsed[key as 'keywords' | 'capabilities'] = entries;
        } else {
          parsed[key as 'keywords' | 'capabilities'] = [];
        }
        continue;
      }

      if (key === 'priority') {
        parsed.priority = Number(value) || 5;
        continue;
      }

      if (key === 'name' || key === 'description' || key === 'category') {
        parsed[key as 'name' | 'description' | 'category'] = value.replace(
          /^['"]|['"]$/g,
          '',
        );
      }
    }

    const contentWithoutFrontmatter = content.replace(match[0], '').trim();
    if (contentWithoutFrontmatter) {
      parsed.content = contentWithoutFrontmatter;
    }

    return parsed;
  }

  private extractHeadingName(content: string): string | undefined {
    const headingMatch = content.match(/^#\s+(.+)$/m);
    return headingMatch?.[1]?.trim();
  }

  private extractDescription(content: string): string | undefined {
    const paragraphs = content
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && !part.startsWith('#'));

    return paragraphs[0]?.replace(/\s+/g, ' ').slice(0, 180);
  }

  private extractKeywords(content: string, name: string): string[] {
    const tokens = new Set<string>();
    const normalizedName = name.toLowerCase();
    normalizedName
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .forEach((token) => tokens.add(token));

    content
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3)
      .forEach((token) => tokens.add(token));

    return Array.from(tokens).slice(0, 8);
  }

  private buildSummary(content: string): string {
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    return lines.slice(0, 4).join(' ');
  }
}
