const PI = "http://127.0.0.1:30141"
const native = "019fd051-f047-745a-b45a-74a696896e26"
const res = await fetch(`${PI}/api/agent/${native}`, { signal: AbortSignal.timeout(10000) })
const d = await res.json()
const sp = d.state?.systemPrompt ?? ""
console.log("has pi-echo in systemPrompt:", sp.includes("pi-echo"))
console.log("has PI-SKILL-OK:", sp.includes("PI-SKILL-OK"))
const i = sp.indexOf("pi-echo")
console.log("ctx around:", sp.slice(Math.max(0, i - 200), i + 300))
