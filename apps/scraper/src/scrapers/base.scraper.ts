import type { ScrapeSource, ScrapedJob } from '@jobflow/shared'
import { BrowserBase } from '../browser/browser-base.js'

export abstract class BaseScraper extends BrowserBase {
  abstract source: ScrapeSource

  abstract scrape(
    keyword: string,
    location: string,
    pages: number
  ): AsyncGenerator<ScrapedJob>
}
