import { Injectable, Logger, Optional } from '@nestjs/common';
import { readdirSync, readFileSync, existsSync } from 'fs';
import * as path from 'path';
import {
  CapabilityId,
  CapabilityRegistryService,
} from '../config/capability-registry.service';
import { Skill, SkillMetadata } from './skill.interface';

interface ParsedFrontmatter {
  name?: string;
  description?: string;
  category?: string;
  keywords?: string[];
  priority?: number;
  capabilities?: string[];
  preconditions?: string[];
  steps?: string[];
  pitfalls?: string[];
  verificationSteps?: string[];
  content?: string;
}

@Injectable()
export class SkillRegistryService {
  private readonly logger = new Logger(SkillRegistryService.name);
  private readonly skillsDir = path.join(process.cwd(), 'skills');
  private skills: Skill[] = [];

  constructor(
    @Optional() private readonly capabilityRegistry?: CapabilityRegistryService,
  ) {
    this.loadSkillsFromFilesystem();
  }

  getAllSkills(): Skill[] {
    return [...this.skills];
  }

  getProceduralSkills(): Skill[] {
    return this.skills.filter((s) => s.isProceduralSop === true);
  }

  /**
   * Comprueba si todas las capacidades requeridas por la skill (capabilities y preconditions)
   * están operativas en CapabilityRegistryService.
   */
  isSkillExecutable(skill: Skill): {
    executable: boolean;
    missingCapabilities: string[];
  } {
    if (!this.capabilityRegistry) {
      return { executable: true, missingCapabilities: [] };
    }

    const required = [
      ...(skill.capabilities ?? []),
      ...(skill.preconditions ?? []),
    ];
    if (required.length === 0) {
      return { executable: true, missingCapabilities: [] };
    }

    const snapshot = this.capabilityRegistry.getSnapshot();
    const missing: string[] = [];

    for (const reqRaw of required) {
      const normalized = reqRaw.replace(/^capability:\s*/i, '').trim();
      const capId = normalized as CapabilityId;
      if (snapshot.capabilities[capId]) {
        if (!this.capabilityRegistry.isCapabilityOperational(capId)) {
          missing.push(capId);
        }
      }
    }

    return {
      executable: missing.length === 0,
      missingCapabilities: missing,
    };
  }

  findRelevant(query: string, limit = 5, onlyExecutable = false): Skill[] {
    const STOP_WORDS = new Set([
      'que', 'del', 'los', 'las', 'por', 'para', 'con', 'una', 'uno', 'unos',
      'unas', 'sin', 'mas', 'más', 'fue', 'son', 'ser', 'era', 'esto', 'esta',
      'ese', 'esa', 'aqui', 'aquí', 'alla', 'allá', 'como', 'cómo', 'cuando',
      'cuándo', 'donde', 'dónde', 'quien', 'quién', 'cual', 'cuál', 'bien',
      'mal', 'muy', 'tan', 'hay', 'nos', 'les', 'sus', 'mis', 'tus', 'oye',
      'hey', 'hola', 'chau', 'dime', 'dame', 'puedes', 'sabes', 'sabe',
      'tienes', 'tienen', 'algo', 'nada', 'todo', 'entendi', 'entendí',
      'entiendo', 'explicar', 'explica', 'hacer', 'decir', 'ver', 'dar',
    ]);

    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^a-záéíóúüñ0-9_-]/g, ''))
      .filter((term) => term.length >= 3 && !STOP_WORDS.has(term));

    if (terms.length === 0) return [];

    const matched = this.skills
      .filter((skill) => {
        if (!onlyExecutable) return true;
        return this.isSkillExecutable(skill).executable;
      })
      .map((skill) => {
        const score = terms.reduce((acc, term) => {
          if (skill.name.toLowerCase().includes(term)) return acc + 5;
          if (skill.keywords.some((kw) => kw.toLowerCase().includes(term)))
            return acc + 4;
          if (skill.description.toLowerCase().includes(term)) return acc + 2;
          return acc;
        }, 0);
        const effectiveScore = score + (skill.priority ?? 0) / 10;
        return { skill, score: effectiveScore };
      })
      .filter((item) => item.score >= 3) // Requiere al menos una coincidencia real
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
      const isProceduralSop = Boolean(
        metadata.preconditions?.length ||
          metadata.steps?.length ||
          metadata.pitfalls?.length ||
          metadata.verificationSteps?.length,
      );

      this.skills.push({
        ...metadata,
        content,
        summary,
        source: folderName,
        isProceduralSop,
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
      const isProceduralSop = Boolean(
        metadata.preconditions?.length ||
          metadata.steps?.length ||
          metadata.pitfalls?.length ||
          metadata.verificationSteps?.length,
      );

      this.skills.push({
        ...metadata,
        content,
        summary,
        source: fileName,
        isProceduralSop,
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
    const preconditions = frontmatter.preconditions ?? [];
    const steps = frontmatter.steps ?? [];
    const pitfalls = frontmatter.pitfalls ?? [];
    const verificationSteps = frontmatter.verificationSteps ?? [];

    return {
      metadata: {
        name,
        description,
        category,
        keywords,
        priority,
        capabilities,
        preconditions,
        steps,
        pitfalls,
        verificationSteps,
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

    const listKeyMap: Record<string, keyof ParsedFrontmatter> = {
      keywords: 'keywords',
      capabilities: 'capabilities',
      preconditions: 'preconditions',
      steps: 'steps',
      pitfalls: 'pitfalls',
      pitfalls_to_avoid: 'pitfalls',
      verification_steps: 'verificationSteps',
      verificationSteps: 'verificationSteps',
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line.startsWith('- ')) {
        if (!currentKey) continue;
        const item = line
          .slice(2)
          .trim()
          .replace(/^['"]|['"]$/g, '');
        const currentValue = parsed[currentKey];
        if (Array.isArray(currentValue)) {
          currentValue.push(item);
        }
        continue;
      }

      const keyValue = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!keyValue) continue;

      const [, rawKey, value] = keyValue;

      if (rawKey in listKeyMap) {
        const mappedKey = listKeyMap[rawKey];
        currentKey = mappedKey;
        if (value.trim()) {
          const entries = value
            .split(',')
            .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean);
          (parsed as any)[mappedKey] = entries;
        } else {
          (parsed as any)[mappedKey] = [];
        }
        continue;
      }

      currentKey = rawKey as keyof ParsedFrontmatter;

      if (rawKey === 'priority') {
        parsed.priority = Number(value) || 5;
        continue;
      }

      if (
        rawKey === 'name' ||
        rawKey === 'description' ||
        rawKey === 'category'
      ) {
        parsed[rawKey as 'name' | 'description' | 'category'] = value.replace(
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
