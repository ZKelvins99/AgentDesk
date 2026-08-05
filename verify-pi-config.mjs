import { PiWebRuntime } from "./packages/runtime-pi/src/index.ts"
const runtime = new PiWebRuntime({ baseUrl: "http://127.0.0.1:30141", cwd: "D:\\code_kj\\Agent工具开发\\AgentDesk\\test-workspace" })
const config = await runtime.nativeConfig()
const g = config.global.settings
const p = config.project.settings
console.log("global.settings.defaultProvider:", g.defaultProvider, "| defaultModel:", g.defaultModel)
console.log("global.models.providers keys:", Object.keys(config.global.models?.providers ?? {}).join(","))
console.log("project.settings.defaultModel:", p?.defaultModel, "| theme:", p?.theme)
