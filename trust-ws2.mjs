const PI = "http://127.0.0.1:30141"
const ws = "D:\\code_kj\\Agent工具开发\\AgentDesk\\test-workspace"
// 等待 60s 让 session 结束，然后重试 trust
let done = false
for (let i = 0; i < 12; i++) {
  await new Promise(r => setTimeout(r, 5000))
  const p = await fetch(`${PI}/api/project-trust`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cwd: ws }), signal: AbortSignal.timeout(10000) })
  const t = await p.text()
  console.log(`try ${i}: ${p.status} ${t.slice(0, 120)}`)
  if (p.status === 200) { done = true; break }
}
console.log("trusted:", done)
