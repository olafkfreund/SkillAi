/**
 * Screenshot script for SkillAI documentation.
 * Takes screenshots of all major portal pages with PII obscured.
 * Run: npx ts-node --esm scripts/screenshots.ts
 * Or:  npx tsx scripts/screenshots.ts
 */

import { chromium, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'

const BASE_URL = 'http://localhost:3001'
const OUT_DIR = path.join(process.cwd(), 'docs', 'screenshots')
const CREDENTIALS = { email: 'admin@skillai.internal', password: 'admin123' }

const CSS_BLUR = `
  /* Blur candidate names, emails and personal data */
  [data-pii], .pii-blur { filter: blur(6px) !important; }

  /* Target common name patterns in tables and cards */
  table td:first-child,
  .candidate-name,
  h1.candidate-name { filter: blur(6px) !important; }
`

async function obscurePII(page: Page) {
  await page.addStyleTag({ content: CSS_BLUR })

  // Blur all text that looks like a name (two capitalised words) or email
  await page.evaluate(() => {
    const namePattern = /^[A-Z][a-z]+ [A-Z][a-z]+$/
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    document.querySelectorAll('p, span, td, h1, h2, h3, a').forEach((el) => {
      const text = el.textContent?.trim() ?? ''
      if (namePattern.test(text) || emailPattern.test(text)) {
        ;(el as HTMLElement).style.filter = 'blur(6px)'
        ;(el as HTMLElement).style.userSelect = 'none'
      }
    })
  })
}

async function screenshot(page: Page, name: string) {
  await obscurePII(page)
  // Let any animations settle
  await page.waitForTimeout(800)
  const filePath = path.join(OUT_DIR, `${name}.png`)
  await page.screenshot({ path: filePath, fullPage: true })
  console.log(`  Saved: ${name}.png`)
}

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`)
  await page.waitForLoadState('networkidle')
  await page.fill('input[name="email"]', CREDENTIALS.email)
  await page.fill('input[name="password"]', CREDENTIALS.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/dashboard/, { timeout: 15000 })
  await page.waitForLoadState('networkidle')
  console.log('  Logged in successfully')
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const browser = await chromium.launch({
    executablePath: '/etc/profiles/per-user/olafkfreund/bin/google-chrome-stable',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
  })
  const page = await context.newPage()

  try {
    // Login
    console.log('Logging in...')
    await login(page)

    // 1. Dashboard home
    console.log('Dashboard home...')
    await page.goto(`${BASE_URL}/dashboard`)
    await page.waitForLoadState('networkidle')
    await screenshot(page, '01-dashboard-home')

    // 2. Candidates list
    console.log('Candidates list...')
    await page.goto(`${BASE_URL}/dashboard/candidates`)
    await page.waitForLoadState('networkidle')
    await screenshot(page, '02-candidates-list')

    // 3. Candidate profile — grab first candidate link
    console.log('Candidate profile...')
    const firstCandidate = page.locator('a[href*="/candidates/"]').first()
    if (await firstCandidate.count() > 0) {
      await firstCandidate.click()
      await page.waitForLoadState('networkidle')
      await screenshot(page, '03-candidate-profile')
    }

    // 4. Roles list
    console.log('Roles list...')
    await page.goto(`${BASE_URL}/dashboard/roles`)
    await page.waitForLoadState('networkidle')
    await screenshot(page, '04-roles-list')

    // 5. Role detail — first role
    console.log('Role detail...')
    const firstRole = page.locator('a[href*="/roles/"]').first()
    if (await firstRole.count() > 0) {
      await firstRole.click()
      await page.waitForLoadState('networkidle')
      await screenshot(page, '05-role-detail')
    }

    // 6. Agencies list
    console.log('Agencies list...')
    await page.goto(`${BASE_URL}/dashboard/agencies`)
    await page.waitForLoadState('networkidle')
    await screenshot(page, '06-agencies-list')

    // 7. Agency detail — first agency
    console.log('Agency detail...')
    const firstAgency = page.locator('a[href*="/agencies/"]').first()
    if (await firstAgency.count() > 0) {
      await firstAgency.click()
      await page.waitForLoadState('networkidle')
      await screenshot(page, '07-agency-detail')
    }

    // 8. CV Upload page
    console.log('CV Upload...')
    const uploadLinks = page.locator('a[href*="/upload"]')
    if (await uploadLinks.count() > 0) {
      await uploadLinks.first().click()
      await page.waitForLoadState('networkidle')
      await screenshot(page, '08-cv-upload')
    }

    // 9. Interview pack — navigate back to a candidate with a complete pack
    console.log('Interview pack...')
    await page.goto(`${BASE_URL}/dashboard/candidates`)
    await page.waitForLoadState('networkidle')
    const candidateLink = page.locator('a[href*="/candidates/"]').first()
    if (await candidateLink.count() > 0) {
      await candidateLink.click()
      await page.waitForLoadState('networkidle')
      // Look for a complete interview pack link
      const packLink = page.locator('a[href*="/interview/"]').first()
      if (await packLink.count() > 0) {
        await packLink.click()
        await page.waitForLoadState('networkidle')
        await screenshot(page, '09-interview-pack')
      }
    }

    // 10. Settings page
    console.log('Settings...')
    await page.goto(`${BASE_URL}/settings`)
    await page.waitForLoadState('networkidle')
    await screenshot(page, '10-settings')

    // 11. Compare page (if exists)
    console.log('Comparison...')
    await page.goto(`${BASE_URL}/dashboard/compare`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await screenshot(page, '11-compare')

    console.log('\nAll screenshots saved to docs/screenshots/')
  } catch (err) {
    console.error('Screenshot error:', err)
  } finally {
    await browser.close()
  }
}

main()
