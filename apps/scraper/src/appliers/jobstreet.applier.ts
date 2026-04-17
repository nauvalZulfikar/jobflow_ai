import type { DetectedField, FormAnswer } from '@jobflow/shared'
import { BaseApplier, type ApplyResult } from './base.applier.js'

export class JobStreetApplier extends BaseApplier {
  source = 'jobstreet'

  async detectFields(applyUrl: string): Promise<DetectedField[]> {
    await this.launchBrowser()
    const page = await this.newStealthPage()
    const fields: DetectedField[] = []

    try {
      await page.goto(applyUrl, { waitUntil: 'networkidle', timeout: 30000 })

      // Detect external ATS redirect
      if (!page.url().includes('jobstreet.co.id') && !page.url().includes('jobstreet.com')) {
        throw new Error('external_ats')
      }

      // JobStreet uses data-automation attributes consistently
      const inputs = await page
        .locator('input:visible, select:visible, textarea:visible')
        .all()

      for (const input of inputs) {
        const automation = (await input.getAttribute('data-automation')) ?? ''
        const name = (await input.getAttribute('name')) ?? automation
        const id = (await input.getAttribute('id')) ?? ''
        const inputType = (await input.getAttribute('type')) ?? 'text'

        if (['hidden', 'submit', 'button', 'reset'].includes(inputType)) continue
        if (!name && !id) continue

        const label =
          (await page.locator(`label[for="${id}"]`).textContent().catch(() => ''))?.trim() ||
          automation ||
          name

        const field: DetectedField = {
          name: name || automation,
          label: label || name,
          type: inputType as DetectedField['type'],
          required: (await input.getAttribute('required')) !== null,
        }

        const tagName = await input.evaluate((e) => e.tagName.toLowerCase())
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
    await this.launchBrowser()
    const page = await this.newStealthPage()

    try {
      await page.goto(applyUrl, { waitUntil: 'networkidle', timeout: 30000 })

      if (!page.url().includes('jobstreet.co.id') && !page.url().includes('jobstreet.com')) {
        return { success: false, errorMessage: 'external_ats' }
      }

      for (const answer of answers) {
        const selector = `[name="${answer.fieldName}"], [data-automation="${answer.fieldName}"], #${answer.fieldName}`
        await this.fillField(page, selector, answer.value)
        await this.randomDelay(200, 600)
      }

      const submitBtn = page
        .locator('button[type="submit"], button:has-text("Apply"), button:has-text("Lamar"), button:has-text("Submit")')
        .first()
      if (await submitBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await submitBtn.click()
        await page.waitForTimeout(3000)
      }

      return { success: true }
    } catch (e: any) {
      return { success: false, errorMessage: e.message }
    } finally {
      await this.closeBrowser()
    }
  }
}
