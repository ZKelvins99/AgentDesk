import { PiWebRuntime } from "./packages/runtime-pi/src/index.ts"
const runtime = new PiWebRuntime({ baseUrl: "http://127.0.0.1:30141", cwd: "D:\\code_kj\\Agent工具开发\\AgentDesk\\test-workspace" })
const skills = await runtime.nativeSkills()
console.log("nativeSkills:", JSON.stringify(skills))
