import { writeFileSync, rmSync } from "node:fs"
const PI = "http://127.0.0.1:30141"
const BASE = "http://127.0.0.1:8787"
const WS = "D:\\code_kj\\Agent工具开发\\AgentDesk\\test-workspace"
const LOG = "D:\\code_kj\\Agent工具开发\\AgentDesk\\.devlogs\\m07-t02b.log"
rmSync(LOG, { force: true })
const log = (m) => { console.log(m); writeFileSync(LOG, m + "\n", { flag: "a" }) }

// 1. trust project
const trustRes = await fetch(`${PI}/api/project-trust`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cwd: WS }), signal: AbortSignal.timeout(15000) })
const trustBody = await trustRes.text()
log(`trust POST: ${trustRes.status} ${trustBody.slice(0, 200)}`)
const g = await fetch(`${PI}/api/project-trust?cwd=${encodeURIComponent(WS)}`, { signal: AbortSignal.timeout(10000) })
log(`trust status: ${(await g.text()).slice(0, 200)}`)

// 2. switch to pi + send skill prompt
await fetch(`${BASE}/api/switch`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runtimeId: "pi" }) })
const res = await fetch(`${BASE}/api/send`, { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify({ message: "运行 pi-echo skill，直接按 skill 指令回复", directory: WS }), signal: AbortSignal.timeout(30000) })
const sid = (await res.json()).sessionId
log("session: " + sid)
const native = sid.replace(/^pi:/, "")

// 3. listen SSE for reply
const result = await new Promise((resolve) => {
  const ac = new AbortController()
  let text = ""
  const timer = setTimeout(() => { ac.abort(); resolve(text) }, 120000)
  ;(async () => {
    try {
      const r = await fetch(`${PI}/api/agent/${native}/events`, { signal: ac.signal })
      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let buf = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let i
        while ((i = buf.indexOf("\n\n")) !== -1) {
          const block = buf.slice(0, i)
          buf = buf.slice(i + 2)
          for (const line of block.split("\n")) {
            if (!line.startsWith("data:")) continue
            try {
              const evt = JSON.parse(line.slice(5).trim())
              if (evt.type === "message_update") {
                const content = evt.message?.content ?? []
                const t = content.filter(p => p.type === "text" && typeof p.text === "string").map(p => p.text).join("")
                if (t && t.length > text.length) text = t
              }
              if (evt.type === "agent_settled" || evt.type === "prompt_done") {
                clearTimeout(timer)
                ac.abort()
                resolve(text)
              }
            } catch {}
          }
        }
      }
    } catch {}
  })()
})
log("reply: " + JSON.stringify(result))
log("PASS: " + /PI-SKILL-OK/.test(result ?? ""))
