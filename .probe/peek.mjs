/**
 * Temporary, READ-ONLY probe: reports what the running app's Accounts pane is
 * showing right now. Performs no clicks and changes nothing.
 */
const CDP = process.env.PROBE_CDP ?? 'http://127.0.0.1:9333'

const targets = await (await fetch(`${CDP}/json/list`)).json()
const page = targets.find(p => p.type === 'page' && p.webSocketDebuggerUrl)
if (!page) {
  console.log('no page target:', JSON.stringify(targets.map(t => ({ type: t.type, url: t.url }))))
  process.exit(2)
}
console.log('target:', page.url, '| title:', page.title)

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = e => rej(new Error(String(e.message)))
})
const reply = new Map()
ws.onmessage = ev => {
  const m = JSON.parse(ev.data)
  if (m.id && reply.has(m.id)) {
    reply.get(m.id)(m)
    reply.delete(m.id)
  }
}
const send = (method, params = {}) =>
  new Promise(res => {
    const id = Math.floor(Math.random() * 1e9)
    reply.set(id, res)
    ws.send(JSON.stringify({ id, method, params }))
  })

const expr = `(() => {
  const t = s => document.querySelector(s)?.textContent?.trim() ?? null;
  const vis = s => { const n = document.querySelector(s); return !!n && n.offsetParent !== null; };
  const btn = label => [...document.querySelectorAll('button')]
    .some(b => (b.innerText || '').toLowerCase().includes(label) && b.offsetParent !== null);
  return {
    dialog: vis('.dialog') || vis('.settings-section'),
    accountsListed: [...document.querySelectorAll('.account-sub')].map(n => n.textContent.trim()),
    chips: [...document.querySelectorAll('.account-chip')].map(n => n.textContent.trim()),
    code: vis('.signin-code') ? t('.signin-code') : null,
    setup: vis('.signin-setup-lede') ? t('.signin-setup-lede') : null,
    error: t('.signin-error'),
    githubButton: btn('sign in with github'),
    gitlabButton: btn('sign in with gitlab'),
    tokenField: vis('.signin-token-input')
  };
})()`

const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true })
if (r.exceptionDetails) {
  console.log('eval error:', r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
} else {
  console.log(JSON.stringify(r.result.value, null, 2))
}
ws.close()
