import type { DetectedField, FormAnswer } from '@jobflow/shared'
import { BaseApplier, type ApplyResult } from './base.applier.js'

export class LinkedInApplier extends BaseApplier {
  source = 'linkedin'
  private linkedInCookie: string | undefined

  constructor(linkedInCookie?: string) {
    super()
    this.linkedInCookie = linkedInCookie
  }

  private parseCookies(): { name: string; value: string; domain: string; path: string; secure?: boolean; sameSite?: 'Strict' | 'Lax' | 'None' }[] {
    if (!this.linkedInCookie) return []
    if (this.linkedInCookie.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(this.linkedInCookie)
        return parsed.map((c: any) => ({
          name: c.name,
          value: c.value,
          domain: c.domain?.startsWith('.') ? c.domain : `.linkedin.com`,
          path: c.path ?? '/',
          secure: c.secure ?? true,
          sameSite: (c.sameSite ?? 'None') as 'None',
        }))
      } catch {}
    }
    return [{ name: 'li_at', value: this.linkedInCookie, domain: '.linkedin.com', path: '/', secure: true, sameSite: 'None' }]
  }

  /** Convert job view URL to direct apply URL */
  private toApplyUrl(viewUrl: string): string {
    // https://www.linkedin.com/jobs/view/123456 -> https://www.linkedin.com/jobs/view/123456/apply/
    const base = viewUrl.replace(/\/+$/, '')
    return `${base}/apply/?openSDUIApplyFlow=true`
  }

  private async openApplyPage(url: string) {
    if (!this.linkedInCookie) throw new Error('requires_auth')
    const page = await this.newStealthPage()
    await page.context().addCookies(this.parseCookies())

    // Navigate to job page first (not directly to /apply/ which LinkedIn blocks)
    const jobUrl = url.replace(/\/+$/, '').replace(/\/apply\/?.*$/, '')
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(3000)

    if (page.url().includes('/login') || page.url().includes('/checkpoint')) {
      throw new Error('requires_auth')
    }

    // Find and click Easy Apply button/link to open the form
    const easyApplyBtn = page.locator('button:has-text("Easy Apply"), a:has-text("Easy Apply")').first()
    const hasEasyApply = await easyApplyBtn.isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasEasyApply) {
      throw new Error('no_easy_apply')
    }

    // If it's a link, get href and navigate; if button, click it
    const tagName = await easyApplyBtn.evaluate((e) => e.tagName.toLowerCase())
    if (tagName === 'a') {
      const href = await easyApplyBtn.getAttribute('href')
      if (href) {
        const fullUrl = href.startsWith('http') ? href : `https://www.linkedin.com${href}`
        await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
      } else {
        await easyApplyBtn.click()
      }
    } else {
      await easyApplyBtn.click()
    }
    await page.waitForTimeout(3000)

    return page
  }

  async detectFields(applyUrl: string): Promise<DetectedField[]> {
    if (!this.linkedInCookie) throw new Error('requires_auth')
    await this.launchBrowser(true)
    const fields: DetectedField[] = []

    try {
      const page = await this.openApplyPage(applyUrl)

      const modal = page.locator('[role="dialog"]').first()
      const modalVisible = await modal.isVisible({ timeout: 5000 }).catch(() => false)
      if (!modalVisible) return fields

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
          name, label,
          type: inputType as DetectedField['type'],
          required: (await input.getAttribute('required')) !== null,
        }

        const tagName = await input.evaluate((e) => e.tagName.toLowerCase())
        if (tagName === 'select') {
          field.type = 'select'
          field.options = (await input.locator('option').allTextContents()).filter(Boolean)
        }
        if (tagName === 'textarea') field.type = 'textarea'

        if (!fields.find((f) => f.name === field.name)) fields.push(field)
      }
    } finally {
      await this.closeBrowser()
    }
    return fields
  }

  async apply(applyUrl: string, _answers: FormAnswer[], _resumeFileUrl?: string): Promise<ApplyResult> {
    if (!this.linkedInCookie) return { success: false, errorMessage: 'requires_auth' }
    await this.launchBrowser(true)

    try {
      // Step 1: Open job page first, check for Easy Apply
      if (!this.linkedInCookie) throw new Error('requires_auth')
      const page = await this.newStealthPage()
      await page.context().addCookies(this.parseCookies())
      await page.goto(applyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(3000)

      if (page.url().includes('/login') || page.url().includes('/checkpoint')) {
        return { success: false, errorMessage: 'requires_auth' }
      }

      // Find Easy Apply link and get its href
      const easyApplyLink = page.locator('a:has-text("Easy Apply")').first()
      const hasEasyApply = await easyApplyLink.isVisible({ timeout: 5000 }).catch(() => false)
      if (!hasEasyApply) {
        return { success: false, errorMessage: 'no_easy_apply' }
      }

      const applyHref = await easyApplyLink.getAttribute('href').catch(() => null)
      if (!applyHref) {
        return { success: false, errorMessage: 'no_apply_href' }
      }

      // Step 2: Navigate to the apply URL to open form
      const fullApplyUrl = applyHref.startsWith('http') ? applyHref : `https://www.linkedin.com${applyHref}`
      await page.goto(fullApplyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(3000)

      // Check that the apply modal/dialog is open
      const modal = page.locator('[role="dialog"]').first()
      const modalVisible = await modal.isVisible({ timeout: 5000 }).catch(() => false)
      if (!modalVisible) {
        return { success: false, errorMessage: 'modal_not_opened' }
      }

      // Walk through multi-step form — LinkedIn pre-fills most fields from profile
      // Just click Next/Review/Submit through each step
      let submitted = false
      let maxSteps = 10
      while (maxSteps-- > 0) {
        const submitBtn = modal.locator('button:has-text("Submit application"), button:has-text("Submit")').first()
        const nextBtn = modal.locator('button:has-text("Next"), button:has-text("Review"), button:has-text("Continue")').first()

        if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitBtn.click()
          await page.waitForTimeout(4000)
          submitted = true
          break
        }
        if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await nextBtn.click()
          await page.waitForTimeout(2000)
        } else {
          // No Next or Submit — might be stuck on required field
          await page.screenshot({ path: `/tmp/stuck-step.png` })
          break
        }
      }

      if (!submitted) {
        return { success: false, errorMessage: 'submit_button_not_found' }
      }

      // Verify confirmation
      const confirmed = await page.locator(
        ':text("application was sent"), :text("Application submitted"), :text("Your application was sent")'
      ).first().isVisible({ timeout: 8000 }).catch(() => false)

      if (!confirmed) {
        await page.screenshot({ path: `/tmp/no-confirm.png` })
        // Still mark success if submit was clicked — LinkedIn may show different confirmation
        // Check if the modal closed (which means submission succeeded)
        const modalStillOpen = await modal.isVisible({ timeout: 2000 }).catch(() => false)
        if (!modalStillOpen) return { success: true }
        return { success: false, errorMessage: 'no_confirmation_shown' }
      }

      return { success: true }
    } catch (e: any) {
      return { success: false, errorMessage: e.message }
    } finally {
      await this.closeBrowser()
    }
  }
}
