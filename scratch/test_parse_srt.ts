import * as fs from 'fs';
import * as path from 'path';

interface SrtBlock {
  index: number;
  timeframe: string;
  lines: string[];
}

function parseSrt(filePath: string): SrtBlock[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  // Normalize line endings
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawBlocks = normalized.split(/\n\n+/);

  const blocks: SrtBlock[] = [];

  for (const raw of rawBlocks) {
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length >= 2 && lines[1].includes('-->')) {
      const index = parseInt(lines[0], 10);
      const timeframe = lines[1];
      const textLines = lines.slice(2);
      blocks.push({
        index,
        timeframe,
        lines: textLines
      });
    }
  }

  return blocks;
}

const inputPath = 'C:\\Users\\nacho\\Downloads\\Brassed Off (1996)\\Brassed-Off-1996-1080p-BluRay.srt';
const blocks = parseSrt(inputPath);
console.log(`Parsed ${blocks.length} SRT blocks successfully.`);
console.log('First 3 blocks:', JSON.stringify(blocks.slice(0, 3), null, 2));
console.log('Last 3 blocks:', JSON.stringify(blocks.slice(-3), null, 2));
