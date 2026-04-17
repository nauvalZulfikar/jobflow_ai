import type { DetectedField, FormAnswer } from '@jobflow/shared'
import { BaseApplier, type ApplyResult } from './base.applier.js'

export class LinkedInApplier extends BaseApplier {
  source = 'linkedin'
  private linkedInCookie: string | undefined

  constructor(linkedInCookie?: string) {
    super()
    this.linkedInCookie = linkedInCookie
  }

  private async injectCookieAndNavigate(url: string) {
    if (!this.linkedInCookie) throw new Error('requires_auth')
    const page = await this.newStealthPage()
    await page.context().addCookies([
      { name: 'li_at', value: this.linkedInCookie, domain: '.linkedin.com', path: '/' },
    ])
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    if (await this.isAuthWall(page, 'linkedin.com')) throw new Error('requires_auth')
    return page
  }

  async detectFields(applyUrl: string): Promise<DetectedField[]> {
    if (!this.linkedInCookie) throw new Error('requires_auth')

    await this.launchBrowser()
    const fields: DetectedField[] = []

    try {
      const page = await this.injectCookieAndNavigate(applyUrl)

      // Click Easy Apply button
      const easyApplyBtn = page
        .locator('button:has-text("Easy Apply"), .jobs-apply-button--top-card')
        .first()
      if (await easyApplyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await easyApplyBtn.click()
        await page.waitForTimeout(2000)
      }

      // Form is inside a modal
      const modal = page.locator('.jobs-easy-apply-modal, [role="dialog"]').first()
      const inputs = await modal.locator('input:visible, select:visible, textarea:visible').all()

      for (const input of inputs) {
        const id = (await input.getAttribute('id')) ?? ''
        const name = (await input.getAttribute('name')) ?? id
        const inputType = (await input.getAttribute('type')) ?? 'text'

        if (['hidden', 'submit', 'button', 'reset'].includes(inputType)) continue
        if (!name) continue

        const label =
          (await page.locator(`label[for="${id}"]`).textContent().catch(() => ''))?.trim() || name

        const field: DetectedField = {
          name,
          label,
          type: inputType as DetectedField['type'],
          required: (await input.getAttribute('required')) !== null,
        }

        const tagName = await input.evaluate((e: { tagName: string }) => e.tagName.toLowerCase())
        if (tagName === 'select') {
          field.type = 'select'
          field.options = (await input.locator('option').allTextContents()).filter(Boolean)
        }
        if (tagName === 'textarea') field.type = 'textarea'

        if (!fields.find((f) => f.name === field.name)) {
          fields.push(field)
        }
      }
    } finally {
      await this.closeBrowser()
    }

    return fields
  }

  async apply(applyUrl: string, answers: FormAnswer[], resumeFileUrl?: string): Promise<ApplyResult> {
    if (!this.linkedInCookie) return { success: false, errorMessage: 'requires_auth' }

    await this.launchBrowser()

    try {
      const page = await this.injectCookieAndNavigate(applyUrl)

      const easyApplyBtn = page.locator('button:has-text("Easy Apply")').first()
      if (await easyApplyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await easyApplyBtn.click()
        await page.waitForTimeout(2000)
      }

      const modal = page.locator('[role="dialog"]').first()

      for (const answer of answers) {
        const selector = `[name="${answer.fieldName}"], #${answer.fieldName}`
        const el = modal.locator(selector).first()
        const tagName = await el.evaluate((e: { tagName: string }) => e.tagName.toLowerCase()).catch(() => 'input')
        if (tagName === 'select') {
          await el.selectOption(answer.value).catch(() => {})
        } else {
          await el.fill(answer.value).catch(() => {})
        }
        await this.randomDelay(200, 500)
      }

      // Navigate multi-step Easy Apply modal
      let maxSteps = 6
      while (maxSteps-- > 0) {
        const submitBtn = modal.locator('button:has-text("Submit application")').first()
        const nextBtn = modal
          .locator('button:has-text("Next"), button:has-text("Review"), button:has-text("Continue")')
          .first()

        if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitBtn.click()
          await page.waitForTimeout(3000)
          break
        }
        if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await nextBtn.click()
          await page.waitForTimeout(1500)
        } else {
          break
        }
      }

      return { success: true }
    } catch (e: any) {
      return { success: false, errorMessage: e.message }
    } finally {
      await this.closeBrowser()
    }
  }
}
