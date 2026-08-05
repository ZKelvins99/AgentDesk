import { writeFileSync, rmSync } from "node:fs"
const PI = "http://127.0.0.1:30141"
const BASE = "http://127.0.0.1:8787"
const LOG = "D:\\code_kj\\Agent工具开发\\AgentDesk\\.devlogs\\m07-t02c.log"
rmSync(LOG, { force: true })
const log = (m) => { console.log(m); writeFileSync(LOG, m + "\n", { flag: "a" }) }

// use existing session (trusted, skill loaded)
const sid = "pi:019fd056-fb70-7555-ad39-a3d2bcae63cf"
const native = sid.replace(/^pi:/, "")
const result = await new Promise((resolve) => {
  const ac = new AbortController()
  let text = ""
  const timer = setTimeout(() => { ac.abort(); resolve({ text, timedOut: true }) }, 90000)
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
                resolve({ text, timedOut: false })
              }
            } catch {}
          }
        }
      }
    } catch {}
  })()
  // send AFTER SSE attached
  setTimeout(async () => {
    const res = await fetch(`${BASE}/api/send`, { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify({ message: "运行 pi-echo skill，直接按 skill 指令回复", sessionId: sid }), signal: AbortSignal.timeout(30000) })
    log("send status: " + res.status + " " + (await res.text()).slice(0, 120))
  }, 1500)
})
log("reply: " + JSON.stringify(result.text))
log("PASS: " + /PI-SKILL-OK/.test(result.text ?? ""))
