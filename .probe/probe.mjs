/**
 * Temporary QA probe (deleted after the run): drives the dev app over CDP to
 * prove whether "Sign in with GitHub" produces a device code.
 */
import { writeFileSync } from 'fs'

const CDP = process.env.PROBE_CDP ?? 'http://127.0.0.1:9334'
const SHOT = new URL('./code.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')

const sleep = ms => new Promise(r => setTimeout(r, ms))

let targets = []
for (let i = 0; i < 80; i++) {
  try {
    targets = await (await fetch(`${CDP}/json/list`)).json()
    if (targets.some(p => p.type === 'page' && p.webSocketDebuggerUrl)) break
  } catch {
    /* not up yet */
  }
  await sleep(500)
}
const page = targets.find(p => p.type === 'page' && p.webSocketDebuggerUrl)
if (!page) {
  console.log('NO PAGE TARGET. targets =', JSON.stringify(targets.map(t => ({ type: t.type, url: t.url }))))
  process.exit(2)
}
console.log('page:', page.url, '| title:', page.title)

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = e => rej(new Error('ws: ' + e.message))
})
let seq = 0
const pending = new Map()
ws.onmessage = ev => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result)
  }
}
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq
    pending.set(id, { res, rej })
    ws.send(JSON.stringify({ id, method, params }))
  })

const evaluate = async expression => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
  }
  return r.result.value
}

const clickText = text =>
  evaluate(`(() => {
    const want = ${JSON.stringify(text.toLowerCase())};
    const nodes = [...document.querySelectorAll('button, a, [role="button"], summary')];
    const hit = nodes.find(n => ((n.innerText || n.textContent || '') + ' ' + (n.title || '')).toLowerCase().includes(want)
      && n.offsetParent !== null);
    if (!hit) return 'NOT FOUND';
    hit.click();
    return 'clicked: ' + (hit.innerText || hit.title || hit.tagName).trim().slice(0, 60);
  })()`)

const state = () =>
  evaluate(`(() => {
    const t = s => document.querySelector(s)?.textContent?.trim() ?? null;
    const visible = s => { const n = document.querySelector(s); return !!n && n.offsetParent !== null; };
    return {
      code: t('.signin-code'),
      codeVisible: visible('.signin-code'),
      error: t('.signin-error'),
      notice: t('.signin-notice'),
      setupLede: t('.signin-setup-lede'),
      waiting: visible('.signin-waiting'),
      dialogOpen: visible('.settings-section') || visible('.dialog'),
    };
  })()`)

console.log('open Preferences :', await clickText('preferences'))
await sleep(400)
console.log('open Accounts    :', await clickText('accounts'))
await sleep(400)
console.log('before click     :', JSON.stringify(await state()))
console.log('click GitHub     :', await clickText('sign in with github'))
await sleep(1800)
const after = await state()
console.log('after click      :', JSON.stringify(after, null, 2))

const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(SHOT, Buffer.from(shot.data, 'base64'))
console.log('screenshot       :', SHOT)
console.log(
  after.code && /^[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(after.code)
    ? `RESULT: CODE SHOWN (${after.code})`
    : 'RESULT: NO CODE SHOWN'
)
ws.close()
process.exit(0)
