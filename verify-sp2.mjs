const PI = "http://127.0.0.1:30141"
const native = "019fd056-fb70-7555-ad39-a3d2bcae63cf"
const res = await fetch(`${PI}/api/agent/${native}`, { signal: AbortSignal.timeout(10000) })
const d = await res.json()
const sp = d.state?.systemPrompt ?? ""
console.log("has pi-echo:", sp.includes("pi-echo"))
console.log("has PI-SKILL-OK:", sp.includes("PI-SKILL-OK"))
const i = sp.indexOf("pi-echo")
if (i >= 0) console.log("ctx:", sp.slice(Math.max(0, i - 250), i + 400))
console.log("---state---")
console.log("isPromptRunning:", d.state?.isPromptRunning, "messageCount:", d.state?.messageCount, "status:", JSON.stringify(d.state?.status))
