import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { BrowserWindow } from 'electron'

/**
 * Debug-only capture path: when GITDESK_SHOTS_DIR is set, the app captures
 * the real main window as PNGs (one per desk view/state) and quits. Used by
 * automated visual review; inert in normal use.
 */

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms))

const setInput = (sel: string, value: string): string =>
  `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false;` +
  ` Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)});` +
  ` el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`

export async function captureShots(win: BrowserWindow, dir: string): Promise<void> {
  const outDir = join(dir, 'gitdesk-capture')
  mkdirSync(outDir, { recursive: true })
  const wc = win.webContents
  const evl = (expr: string): Promise<unknown> => wc.executeJavaScript(expr)
  const shot = async (name: string): Promise<void> => {
    const image = await wc.capturePage()
    writeFileSync(join(outDir, `${name}.png`), image.toPNG())
  }

  win.setBounds({ x: 60, y: 40, width: 1440, height: 900 })
  // Wait for the store to hydrate (desk rendered), or surface the repo
  // picker first if this profile starts with no repository selected.
  const hasDesk = async (): Promise<boolean> =>
    (await evl(`!!document.querySelector('.desk-tab')`)) === true
  if (!(await hasDesk())) {
    // Onboarding screen: open the repo card or the header picker.
    const picked = await evl(
      `(() => { const c = [...document.querySelectorAll('.recent-card,.repo-card,button,div[role="button"]')].find(x => x.textContent && x.textContent.includes('BetterGitHub')); if (c) { c.click(); return true } return false })()`
    )
    if (picked !== true) {
      await evl(`document.querySelectorAll('.header-left .btn.picker')[0]?.click()`)
      await sleep(500)
      await evl(
        `(() => { const b = [...document.querySelectorAll('.popover-item')].find(x => x.textContent.includes('BetterGitHub')); if (b) { b.click(); return true } return false })()`
      )
    }
  }
  for (let i = 0; i < 50; i++) {
    if (await hasDesk()) break
    await sleep(400)
  }
  await sleep(1800)

  // Make sure the capture targets the checkout with pending changes.
  const onTarget = await evl(
    `!!document.querySelector('.desk-tab') && document.body.innerText.includes('BetterGitHub')`
  )
  if (onTarget !== true) {
    await evl(`document.querySelectorAll('.header-left .btn.picker')[0]?.click()`)
    await sleep(500)
    await evl(
      `(() => { const b = [...document.querySelectorAll('.popover-item')].find(x => x.textContent.includes('BetterGitHub')); if (b) { b.click(); return true } return false })()`
    )
    await sleep(2500)
  }

  await shot('01-review-default')

  await evl(`document.querySelector('.file-row')?.click()`)
  await sleep(1200)
  await shot('02-review-diff-selected')

  await evl(setInput('.strip-filter', 'src'))
  await sleep(500)
  await shot('03-review-filtered')
  await evl(setInput('.strip-filter', ''))
  await sleep(400)

  await evl(`[...document.querySelectorAll('.desk-tab')][1].click()`)
  await sleep(1600)
  await evl(`document.querySelector('.commit-row')?.click()`)
  await sleep(1200)
  await shot('04-history')

  await evl(`[...document.querySelectorAll('.desk-tab')][2].click()`)
  await sleep(500)
  await shot('05-conflicts')

  await evl(`[...document.querySelectorAll('.desk-tab')][3].click()`)
  await sleep(500)
  await shot('06-stash')

  await evl(`document.documentElement.setAttribute('data-theme','dark')`)
  await evl(`[...document.querySelectorAll('.desk-tab')][0].click()`)
  await sleep(400)
  await evl(`document.querySelector('.file-row')?.click()`)
  await sleep(1000)
  await shot('07-review-dark')
  await evl(`document.documentElement.setAttribute('data-theme','light')`)

  win.setBounds({ x: 60, y: 40, width: 1040, height: 820 })
  await sleep(700)
  await shot('08-narrow-1040')
}
