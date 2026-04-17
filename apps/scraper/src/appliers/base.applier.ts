import type { Page } from 'playwright'
import type { DetectedField, FormAnswer } from '@jobflow/shared'
import { BrowserBase } from '../browser/browser-base.js'

export type ApplyResult = {
  success: boolean
  screenshotUrl?: string
  errorMessage?: string
}

export abstract class BaseApplier extends BrowserBase {
  abstract source: string

  abstract detectFields(applyUrl: string): Promise<DetectedField[]>

  abstract apply(
    applyUrl: string,
    answers: FormAnswer[],
    resumeFileUrl?: string
  ): Promise<ApplyResult>

  protected async fillField(page: Page, selector: string, value: string): Promise<void> {
    const el = page.locator(selector).first()
    try {
      await el.waitFor({ timeout: 3000 })
    } catch {
      return
    }
    const tagName = await el.evaluate((e) => e.tagName.toLowerCase()).catch(() => 'input')
    if (tagName === 'select') {
      await el.selectOption(value).catch(() => {})
    } else {
      await el.fill(value).catch(() => {})
    }
    await this.randomDelay(200, 600)
  }

  protected async isAuthWall(page: Page, expectedHost: string): Promise<boolean> {
    const url = page.url()
    return (
      !url.includes(expectedHost) &&
      (url.includes('login') || url.includes('signin') || url.includes('auth'))
    )
  }

  protected async takeScreenshot(page: Page): Promise<Buffer> {
    return page.screenshot({ type: 'png', fullPage: false })
  }
}
