import { execSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import type { DetectedField, FormAnswer } from '@jobflow/shared'
import { BaseApplier, type ApplyResult } from './base.applier.js'

export class IndeedApplier extends BaseApplier {
  source = 'indeed'

  async detectFields(applyUrl: string): Promise<DetectedField[]> {
    await this.launchBrowser()
    const page = await this.newStealthPage()
    const fields: DetectedField[] = []

    try {
      await page.goto(applyUrl, { waitUntil: 'networkidle', timeout: 30000 })

      // Click "Apply now" if present
      const applyBtn = page
        .locator('[data-testid="apply-button"], .jobsearch-IndeedApplyButton-newDesign, [aria-label*="Apply"]')
        .first()
      if (await applyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await applyBtn.click()
        await page.waitForTimeout(2000)
      }

      if (await this.isAuthWall(page, 'indeed.com')) {
        throw new Error('requires_auth')
      }

      const inputs = await page.locator('input:visible, select:visible, textarea:visible').all()

      for (const input of inputs) {
        const name = (await input.getAttribute('name')) ?? ''
        const id = (await input.getAttribute('id')) ?? ''
        const placeholder = (await input.getAttribute('placeholder')) ?? ''
        const ariaLabel = (await input.getAttribute('aria-label')) ?? ''
        const inputType = (await input.getAttribute('type')) ?? 'text'

        // Skip hidden/submit/button types
        if (['hidden', 'submit', 'button', 'reset'].includes(inputType)) continue

        let label = ariaLabel || placeholder
        if (!label && id) {
          label = (await page.locator(`label[for="${id}"]`).textContent().catch(() => '')) ?? ''
        }
        label = label.trim()
        if (!label && !name) continue

        const fieldName = name || id || label.toLowerCase().replace(/\s+/g, '_')

        const field: DetectedField = {
          name: fieldName,
          label: label || name,
          type: inputType === 'tel' ? 'text' : (inputType as DetectedField['type']),
          required: (await input.getAttribute('required')) !== null,
        }

        const tagName = await input.evaluate((e: { tagName: string }) => e.tagName.toLowerCase())
        if (tagName === 'select') {
          field.type = 'select'
          field.options = (await input.locator('option').allTextContents()).filter(Boolean)
        }
        if (tagName === 'textarea') {
          field.type = 'textarea'
        }

        const maxLength = await input.getAttribute('maxlength')
        if (maxLength) field.maxLength = parseInt(maxLength)

        // Avoid duplicate fieldNames
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

      const applyBtn = page.locator('[data-testid="apply-button"]').first()
      if (await applyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await applyBtn.click()
        await page.waitForTimeout(2000)
      }

      if (await this.isAuthWall(page, 'indeed.com')) {
        return { success: false, errorMessage: 'requires_auth' }
      }

      // Upload resume file if URL provided
      if (resumeFileUrl) {
        const fileInput = page.locator('input[type="file"]').first()
        if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          const tmpPath = join(tmpdir(), `resume_${Date.now()}.pdf`)
          execSync(`curl -s -o "${tmpPath}" "${resumeFileUrl}"`)
          await fileInput.setInputFiles(tmpPath)
          await this.randomDelay(1000, 2000)
        }
      }

      // Fill all fields
      for (const answer of answers) {
        const selector = `[name="${answer.fieldName}"], #${answer.fieldName}`
        await this.fillField(page, selector, answer.value)
        await this.randomDelay(200, 500)
      }

      // Navigate multi-step form
      let maxSteps = 6
      while (maxSteps-- > 0) {
        const submitBtn = page
          .locator('button:has-text("Submit application"), button:has-text("Submit"), button:has-text("Kirim")')
          .first()
        const continueBtn = page
          .locator('[data-testid="IndeedApplyButton"], button:has-text("Continue"), button:has-text("Lanjutkan"), button:has-text("Next")')
          .first()

        if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitBtn.click()
          await page.waitForTimeout(3000)
          break
        }
        if (await continueBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await continueBtn.click()
          await page.waitForTimeout(2000)
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
