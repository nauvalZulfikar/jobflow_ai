// @ts-nocheck — page.evaluate() callbacks run in browser context (DOM types unavailable in Node TS config)
import { execSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Page } from 'playwright'
import type { DetectedField, FormAnswer, ResumeContent } from '@jobflow/shared'
import { BaseApplier, type ApplyResult } from './base.applier.js'
import { openai, AI_MODEL } from '@jobflow/ai'

// ── Types ──────────────────────────────────────────────────────────────

type ExtractedElement = {
  idx: number
  tag: string
  type?: string
  name?: string
  id?: string
  label?: string
  placeholder?: string
  value?: string
  required: boolean
  options?: string[] // for select / custom dropdown
  role?: string
  text?: string // for buttons
  selector: string
  isDropdown?: boolean
  dropdownTriggerSelector?: string
}

type AIAction = {
  idx: number
  action: 'fill' | 'select' | 'click' | 'check' | 'type_and_pick'
  value?: string
  reason?: string
}

type AIFormPlan = {
  actions: AIAction[]
  submitIdx?: number
  nextIdx?: number
  needsMoreSteps: boolean
}

// ── GenericAIApplier ───────────────────────────────────────────────────

export class GenericAIApplier extends BaseApplier {
  source = 'generic'
  private resumeContent: ResumeContent | null = null
  private jobDescription = ''
  private linkedInCookie?: string

  constructor(opts?: { linkedInCookie?: string }) {
    super()
    this.linkedInCookie = opts?.linkedInCookie
  }

  setContext(resumeContent: ResumeContent, jobDescription: string) {
    this.resumeContent = resumeContent
    this.jobDescription = jobDescription
  }

  // ── DOM Extraction ─────────────────────────────────────────────────

  private async extractFormElements(page: Page): Promise<ExtractedElement[]> {
    return page.evaluate(() => {
      const elements: any[] = []
      let idx = 0

      function getLabel(el: HTMLElement): string {
        // 1. aria-label
        const ariaLabel = el.getAttribute('aria-label')
        if (ariaLabel) return ariaLabel.trim()

        // 2. <label for="id">
        const id = el.getAttribute('id')
        if (id) {
          const label = document.querySelector(`label[for="${id}"]`)
          if (label) return label.textContent?.trim() || ''
        }

        // 3. Closest label ancestor
        const parentLabel = el.closest('label')
        if (parentLabel) return parentLabel.textContent?.trim() || ''

        // 4. Preceding sibling/adjacent text
        const prev = el.previousElementSibling
        if (prev && ['LABEL', 'SPAN', 'P', 'DIV'].includes(prev.tagName)) {
          const text = prev.textContent?.trim() || ''
          if (text.length < 100) return text
        }

        // 5. aria-labelledby
        const labelledBy = el.getAttribute('aria-labelledby')
        if (labelledBy) {
          const refEl = document.getElementById(labelledBy)
          if (refEl) return refEl.textContent?.trim() || ''
        }

        // 6. placeholder
        return (el as HTMLInputElement).placeholder || ''
      }

      function isVisible(el: HTMLElement): boolean {
        const style = window.getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
        const rect = el.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      }

      function buildSelector(el: HTMLElement): string {
        if (el.id) return `#${CSS.escape(el.id)}`
        const name = el.getAttribute('name')
        if (name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`
        const ariaLabel = el.getAttribute('aria-label')
        if (ariaLabel) return `${el.tagName.toLowerCase()}[aria-label="${CSS.escape(ariaLabel)}"]`
        // Fallback: nth-of-type path
        const parent = el.parentElement
        if (parent) {
          const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName)
          const index = siblings.indexOf(el) + 1
          const parentSel = parent.id ? `#${CSS.escape(parent.id)}` : parent.tagName.toLowerCase()
          return `${parentSel} > ${el.tagName.toLowerCase()}:nth-of-type(${index})`
        }
        return el.tagName.toLowerCase()
      }

      // Inputs, textareas, selects
      const formEls = document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), ' +
        'textarea, select'
      )
      for (const el of formEls) {
        const htmlEl = el as HTMLElement
        if (!isVisible(htmlEl)) continue

        const tag = el.tagName.toLowerCase()
        const inputType = el.getAttribute('type') || (tag === 'textarea' ? 'textarea' : tag === 'select' ? 'select' : 'text')

        const entry: any = {
          idx: idx++,
          tag,
          type: inputType,
          name: el.getAttribute('name') || undefined,
          id: el.id || undefined,
          label: getLabel(htmlEl),
          placeholder: (el as HTMLInputElement).placeholder || undefined,
          value: (el as HTMLInputElement).value || undefined,
          required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
          selector: buildSelector(htmlEl),
        }

        if (tag === 'select') {
          entry.options = Array.from((el as HTMLSelectElement).options)
            .map(o => o.text.trim())
            .filter(t => t && t !== '--' && t !== 'Select' && t !== 'Choose')
        }

        elements.push(entry)
      }

      // Custom dropdowns (div/button with listbox/combobox role)
      const customDropdowns = document.querySelectorAll(
        '[role="combobox"], [role="listbox"], [aria-haspopup="listbox"], [aria-haspopup="true"]'
      )
      for (const el of customDropdowns) {
        const htmlEl = el as HTMLElement
        if (!isVisible(htmlEl)) continue
        // Skip if already captured as a native element
        if (el.tagName.toLowerCase() === 'select' || el.tagName.toLowerCase() === 'input') continue

        elements.push({
          idx: idx++,
          tag: el.tagName.toLowerCase(),
          type: 'custom_dropdown',
          role: el.getAttribute('role') || undefined,
          label: getLabel(htmlEl),
          value: htmlEl.textContent?.trim().substring(0, 100) || undefined,
          required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
          selector: buildSelector(htmlEl),
          isDropdown: true,
        })
      }

      // Buttons (for submit/next detection)
      const buttons = document.querySelectorAll('button, [role="button"], input[type="submit"]')
      for (const el of buttons) {
        const htmlEl = el as HTMLElement
        if (!isVisible(htmlEl)) continue
        if (htmlEl.hasAttribute('disabled')) continue

        const text = htmlEl.textContent?.trim() || ''
        if (!text) continue

        elements.push({
          idx: idx++,
          tag: el.tagName.toLowerCase(),
          type: 'button',
          text: text.substring(0, 80),
          selector: buildSelector(htmlEl),
          required: false,
        })
      }

      return elements
    })
  }

  // ── Dropdown Option Scraping ───────────────────────────────────────

  private async scrapeDropdownOptions(page: Page, element: ExtractedElement): Promise<string[]> {
    try {
      const trigger = page.locator(element.selector).first()
      if (!(await trigger.isVisible({ timeout: 2000 }).catch(() => false))) return []

      // Click to open
      await trigger.click()
      await this.randomDelay(500, 1000)

      // Wait for options to appear
      const options = await page.evaluate((sel) => {
        const results: string[] = []

        // Strategy 1: role="option" anywhere visible
        const optionEls = document.querySelectorAll('[role="option"], [role="listbox"] li, [role="listbox"] div')
        for (const opt of optionEls) {
          const text = opt.textContent?.trim()
          if (text && (opt as HTMLElement).offsetParent !== null) {
            results.push(text.substring(0, 100))
          }
        }

        // Strategy 2: ul/li siblings of trigger
        if (results.length === 0) {
          const trigger = document.querySelector(sel)
          const parent = trigger?.parentElement
          if (parent) {
            const items = parent.querySelectorAll('li, [class*="option"], [class*="item"]')
            for (const item of items) {
              const text = item.textContent?.trim()
              if (text && (item as HTMLElement).offsetParent !== null) {
                results.push(text.substring(0, 100))
              }
            }
          }
        }

        return results
      }, element.selector)

      // Close dropdown by pressing Escape
      await page.keyboard.press('Escape')
      await this.randomDelay(300, 500)

      return options.slice(0, 50) // cap at 50 options
    } catch {
      // Try closing anyway
      await page.keyboard.press('Escape').catch(() => {})
      return []
    }
  }

  // ── Full Extraction (with dropdown scraping) ───────────────────────

  private async extractFullForm(page: Page): Promise<ExtractedElement[]> {
    const elements = await this.extractFormElements(page)

    // Scrape options for custom dropdowns
    for (const el of elements) {
      if (el.isDropdown && (!el.options || el.options.length === 0)) {
        el.options = await this.scrapeDropdownOptions(page, el)
      }
    }

    return elements
  }

  // ── AI Action Planning ─────────────────────────────────────────────

  private async planActions(elements: ExtractedElement[], resumeData: ResumeContent, jobDescription: string): Promise<AIFormPlan> {
    // Build compact form description
    const formDesc = elements.map(el => {
      const parts = [`[${el.idx}] ${el.type || el.tag}`]
      if (el.label) parts.push(`label="${el.label}"`)
      if (el.placeholder) parts.push(`placeholder="${el.placeholder}"`)
      if (el.name) parts.push(`name="${el.name}"`)
      if (el.value) parts.push(`current="${el.value}"`)
      if (el.required) parts.push('REQUIRED')
      if (el.options?.length) parts.push(`options=[${el.options.slice(0, 20).join('|')}]`)
      if (el.text) parts.push(`text="${el.text}"`)
      return parts.join(' ')
    }).join('\n')

    const resumeJSON = JSON.stringify({
      personalInfo: resumeData.personalInfo,
      currentTitle: resumeData.experience?.[0]?.title,
      currentCompany: resumeData.experience?.[0]?.company,
      yearsExp: resumeData.experience?.length || 0,
      education: resumeData.education?.[0],
      skills: resumeData.skills?.slice(0, 15),
    })

    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You fill job application forms. Given form elements and resume data, return actions to fill and submit.

Rules:
- Only fill empty fields (no current value). Skip pre-filled fields.
- For select/custom_dropdown: pick the CLOSEST matching option from the available options list. Use the EXACT option text.
- For searchable dropdowns (type_and_pick): type a short keyword, then the first suggestion will be picked.
- For checkboxes: only check if relevant (e.g. "I agree to terms" → check).
- Identify the submit/apply button (not "Next" or "Continue" — those are for multi-step).
- If you see a "Next"/"Continue" button but no "Submit", set needsMoreSteps=true and nextIdx to that button.
- For questions like "why do you want to work here", write 2-3 genuine sentences based on the job description.
- Answer honestly based on resume. Never fabricate experience or skills.
- Keep answers concise. For text fields, max 500 chars unless specified.

Return JSON:
{
  "actions": [{"idx": 0, "action": "fill|select|click|check|type_and_pick", "value": "...", "reason": "short reason"}],
  "submitIdx": number|null,
  "nextIdx": number|null,
  "needsMoreSteps": boolean
}`,
        },
        {
          role: 'user',
          content: `RESUME:\n${resumeJSON}\n\nJOB DESCRIPTION (first 1000 chars):\n${jobDescription.substring(0, 1000)}\n\nFORM ELEMENTS:\n${formDesc}`,
        },
      ],
    })

    const text = response.choices[0]?.message?.content ?? '{"actions":[],"needsMoreSteps":false}'
    return JSON.parse(text) as AIFormPlan
  }

  // ── Action Execution ───────────────────────────────────────────────

  private async executeActions(page: Page, elements: ExtractedElement[], plan: AIFormPlan): Promise<void> {
    for (const action of plan.actions) {
      const element = elements.find(el => el.idx === action.idx)
      if (!element) continue

      try {
        const locator = page.locator(element.selector).first()
        if (!(await locator.isVisible({ timeout: 3000 }).catch(() => false))) continue

        switch (action.action) {
          case 'fill': {
            if (element.tag === 'textarea') {
              await locator.fill(action.value || '')
            } else {
              await locator.fill('')
              await locator.type(action.value || '', { delay: 30 + Math.random() * 50 })
            }
            break
          }

          case 'select': {
            if (element.tag === 'select') {
              // Native select — try by value first, then by label
              await locator.selectOption({ label: action.value || '' }).catch(async () => {
                await locator.selectOption(action.value || '').catch(() => {})
              })
            } else {
              // Custom dropdown — click trigger, then click option
              await locator.click()
              await this.randomDelay(500, 1000)

              // Find and click the matching option
              const optionClicked = await page.evaluate((val) => {
                const options = document.querySelectorAll('[role="option"], [role="listbox"] li, [role="listbox"] div, ul li, [class*="option"]')
                for (const opt of options) {
                  const text = opt.textContent?.trim() || ''
                  if (text === val && (opt as HTMLElement).offsetParent !== null) {
                    (opt as HTMLElement).click()
                    return true
                  }
                }
                // Fuzzy match
                for (const opt of options) {
                  const text = opt.textContent?.trim().toLowerCase() || ''
                  if (text.includes((val || '').toLowerCase()) && (opt as HTMLElement).offsetParent !== null) {
                    (opt as HTMLElement).click()
                    return true
                  }
                }
                return false
              }, action.value)

              if (!optionClicked) {
                await page.keyboard.press('Escape')
              }
            }
            break
          }

          case 'type_and_pick': {
            // For searchable dropdowns — type keyword then pick first suggestion
            await locator.click()
            await this.randomDelay(300, 500)
            await locator.fill('')
            await locator.type(action.value || '', { delay: 50 + Math.random() * 80 })
            await this.randomDelay(800, 1500) // wait for suggestions

            // Click first visible suggestion
            await page.evaluate(() => {
              const suggestions = document.querySelectorAll(
                '[role="option"], [role="listbox"] li, [class*="suggestion"], [class*="autocomplete"] li, [class*="dropdown"] li'
              )
              for (const s of suggestions) {
                if ((s as HTMLElement).offsetParent !== null) {
                  (s as HTMLElement).click()
                  return
                }
              }
            })
            await this.randomDelay(300, 500)
            break
          }

          case 'check': {
            const checked = await locator.isChecked().catch(() => false)
            if (!checked) await locator.click()
            break
          }

          case 'click': {
            await locator.click()
            break
          }
        }

        await this.randomDelay(300, 800)
      } catch (err) {
        // Log but continue — one failed field shouldn't block the rest
        console.warn(`[GenericAI] Failed action on [${action.idx}]: ${(err as Error).message}`)
      }
    }
  }

  // ── DetectFields (implements BaseApplier) ──────────────────────────

  async detectFields(applyUrl: string): Promise<DetectedField[]> {
    await this.launchBrowser()
    try {
      const page = await this.setupPage(applyUrl)
      const elements = await this.extractFullForm(page)

      return elements
        .filter(el => el.type !== 'button')
        .map(el => ({
          name: el.name || el.id || el.label?.toLowerCase().replace(/\s+/g, '_') || `field_${el.idx}`,
          label: el.label || el.placeholder || el.name || '',
          type: this.mapFieldType(el.type || 'text'),
          required: el.required,
          options: el.options,
        }))
    } finally {
      await this.closeBrowser()
    }
  }

  private mapFieldType(type: string): DetectedField['type'] {
    const map: Record<string, DetectedField['type']> = {
      text: 'text', email: 'text', tel: 'text', url: 'text', password: 'text',
      textarea: 'textarea', select: 'select', custom_dropdown: 'select',
      radio: 'radio', checkbox: 'checkbox', number: 'number', file: 'file',
    }
    return map[type] || 'text'
  }

  // ── Page Setup (handles LinkedIn cookies, navigation) ──────────────

  private async setupPage(url: string): Promise<Page> {
    const page = await this.newStealthPage()

    // Inject LinkedIn cookie if needed
    if (url.includes('linkedin.com') && this.linkedInCookie) {
      await page.context().addCookies([
        { name: 'li_at', value: this.linkedInCookie, domain: '.linkedin.com', path: '/' },
      ])
    }

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    await this.randomDelay(1500, 3000)

    // Handle LinkedIn Easy Apply — click button to open modal
    if (url.includes('linkedin.com')) {
      const easyApplyBtn = page.locator('button:has-text("Easy Apply")').first()
      if (await easyApplyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await easyApplyBtn.click()
        await this.randomDelay(1500, 2500)
      }
    }

    // Handle Indeed Apply button
    if (url.includes('indeed.com')) {
      const applyBtn = page.locator('[data-testid="apply-button"], [aria-label*="Apply"]').first()
      if (await applyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await applyBtn.click()
        await this.randomDelay(1500, 2500)
      }
    }

    // Check auth wall
    const currentUrl = page.url()
    if (currentUrl.includes('login') || currentUrl.includes('signin') || currentUrl.includes('auth')) {
      throw new Error('requires_auth')
    }

    return page
  }

  // ── Apply (main entry point) ───────────────────────────────────────

  async apply(applyUrl: string, answers: FormAnswer[], resumeFileUrl?: string): Promise<ApplyResult> {
    if (!this.resumeContent) {
      return { success: false, errorMessage: 'Resume content not set. Call setContext() first.' }
    }

    await this.launchBrowser()

    try {
      const page = await this.setupPage(applyUrl)

      // Upload resume if there's a file input
      if (resumeFileUrl) {
        await this.handleResumeUpload(page, resumeFileUrl)
      }

      // Multi-step form loop
      const maxSteps = 8
      for (let step = 0; step < maxSteps; step++) {
        // Extract form elements for current step
        const elements = await this.extractFullForm(page)

        if (elements.length === 0) {
          // No form elements — check if we already submitted
          const bodyText = await page.textContent('body') || ''
          if (this.looksLikeConfirmation(bodyText)) {
            return { success: true }
          }
          return { success: false, errorMessage: 'no_form_elements_found' }
        }

        // Ask AI to plan actions
        const plan = await this.planActions(elements, this.resumeContent, this.jobDescription)

        // Execute fill actions
        await this.executeActions(page, elements, plan)

        // Handle file upload on this step too
        if (resumeFileUrl) {
          await this.handleResumeUpload(page, resumeFileUrl)
        }

        // Click submit or next
        if (plan.submitIdx != null) {
          const submitEl = elements.find(el => el.idx === plan.submitIdx)
          if (submitEl) {
            const submitBtn = page.locator(submitEl.selector).first()
            await submitBtn.click()
            await this.randomDelay(3000, 5000)

            // Verify submission
            const bodyText = await page.textContent('body') || ''
            if (this.looksLikeConfirmation(bodyText)) {
              return { success: true }
            }

            // Check if modal closed (LinkedIn pattern)
            const modal = page.locator('[role="dialog"]').first()
            if (!(await modal.isVisible({ timeout: 2000 }).catch(() => false))) {
              return { success: true }
            }

            // Might have validation errors — continue to next iteration
            continue
          }
        }

        if (plan.needsMoreSteps && plan.nextIdx != null) {
          const nextEl = elements.find(el => el.idx === plan.nextIdx)
          if (nextEl) {
            const nextBtn = page.locator(nextEl.selector).first()
            await nextBtn.click()
            await this.randomDelay(1500, 2500)
            continue
          }
        }

        // No submit or next found by AI — try to find buttons ourselves
        const fallbackResult = await this.fallbackButtonNavigation(page)
        if (fallbackResult === 'submitted') {
          return { success: true }
        }
        if (fallbackResult === 'next') {
          continue
        }

        // Truly stuck
        return { success: false, errorMessage: 'no_submit_or_next_button' }
      }

      return { success: false, errorMessage: 'too_many_steps' }
    } catch (e: any) {
      return { success: false, errorMessage: e.message }
    } finally {
      await this.closeBrowser()
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private looksLikeConfirmation(text: string): boolean {
    const lower = text.toLowerCase()
    return (
      lower.includes('application submitted') ||
      lower.includes('application was sent') ||
      lower.includes('application has been submitted') ||
      lower.includes('thank you for applying') ||
      lower.includes('successfully submitted') ||
      lower.includes('lamaran terkirim') ||
      lower.includes('berhasil dikirim') ||
      lower.includes('already applied') ||
      lower.includes('you applied')
    )
  }

  private async fallbackButtonNavigation(page: Page): Promise<'submitted' | 'next' | 'stuck'> {
    // Try submit-like buttons
    const submitTexts = ['Submit application', 'Submit', 'Apply', 'Apply now', 'Send application', 'Kirim', 'Lamar']
    for (const text of submitTexts) {
      const btn = page.locator(`button:has-text("${text}")`).first()
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await btn.click()
        await this.randomDelay(3000, 5000)
        const bodyText = await page.textContent('body') || ''
        if (this.looksLikeConfirmation(bodyText)) return 'submitted'
        return 'submitted' // assume success if button existed
      }
    }

    // Try next-like buttons
    const nextTexts = ['Next', 'Continue', 'Review', 'Lanjutkan', 'Selanjutnya']
    for (const text of nextTexts) {
      const btn = page.locator(`button:has-text("${text}")`).first()
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await btn.click()
        await this.randomDelay(1500, 2500)
        return 'next'
      }
    }

    return 'stuck'
  }

  private async handleResumeUpload(page: Page, resumeFileUrl: string): Promise<void> {
    const fileInput = page.locator('input[type="file"]').first()
    if (!(await fileInput.isVisible({ timeout: 2000 }).catch(() => false))) return

    // Check if already has a file
    const hasFile = await fileInput.evaluate((el: HTMLInputElement) => el.files && el.files.length > 0)
    if (hasFile) return

    try {
      const ext = resumeFileUrl.match(/\.(pdf|docx?)(\?|$)/i)?.[1] || 'pdf'
      const tmpPath = join(tmpdir(), `resume_${Date.now()}.${ext}`)
      execSync(`curl -s -o "${tmpPath}" "${resumeFileUrl}"`)
      await fileInput.setInputFiles(tmpPath)
      await this.randomDelay(1000, 2000)
    } catch {
      // Resume upload is best-effort
    }
  }
}
