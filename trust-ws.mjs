const PI = "http://127.0.0.1:30141"
const ws = "D:\\code_kj\\Agent工具开发\\AgentDesk\\test-workspace"
const g = await fetch(`${PI}/api/project-trust?cwd=${encodeURIComponent(ws)}`, { signal: AbortSignal.timeout(10000) })
console.log("GET:", g.status, (await g.text()).slice(0, 400))
const p = await fetch(`${PI}/api/project-trust`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cwd: ws }), signal: AbortSignal.timeout(15000) })
console.log("POST:", p.status, (await p.text()).slice(0, 400))
