import { PosterDesignSpec } from '../poster.types';

export interface PosterEngine {
  readonly era: string;
  generateSvg(spec: PosterDesignSpec): string;
}
