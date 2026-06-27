/**
 * BusinessSourceModule — Módulo de fuentes comerciales para Jarvis
 */

import { Module } from '@nestjs/common';
import { BusinessSourceService } from './business-source.service';
import { SitemapCrawlerService } from './sitemap-crawler.service';

@Module({
  providers: [BusinessSourceService, SitemapCrawlerService],
  exports: [BusinessSourceService, SitemapCrawlerService],
})
export class BusinessSourceModule {}
