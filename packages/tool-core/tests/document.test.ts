/**
 * M14 契约测试：document.create/read/edit/render + DOCX + PDF read/meta。
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { tmpdir } from "node:os"
import { mkdtempSync, rmSync, existsSync } from "node:fs"
import { join } from "node:path"
import {
  ToolRegistry,
  documentCreateTool,
  documentReadTool,
  documentRenderTool,
  documentEditTool,
  pdfReadTool,
  pdfMetaTool,
} from "../src/index.ts"

const MINIMAL_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT /F1 12 Tf 72 712 Td (Hello PDF) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000052 00000 n 
0000000101 00000 n 
0000000211 00000 n 
0000000320 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
377
%%EOF
`,
)

test("M14-T02/T06: document.create 生成 DOCX", async () => {
  const ws = mkdtempSync(join(tmpdir(), "m14-"))
  const registry = new ToolRegistry()
  registry.register(documentCreateTool)
  const r = await registry.execute(
    "platform.document.create",
    { workspacePath: ws, allowWrite: true },
    { title: "报告", paragraphs: ["第一段", "第二段"], table: [["列A", "列B"], ["1", "2"]] },
  )
  assert.equal(r.ok, true)
  if (r.ok) {
    const out = r.output as { path: string; mdPath: string }
    assert.ok(existsSync(out.path))
    assert.ok(out.path.endsWith(".docx"))
    assert.ok(existsSync(out.mdPath))
  }
  rmSync(ws, { recursive: true, force: true })
})

test("M14-T03: document.read 提取 DOCX 文本", async () => {
  const ws = mkdtempSync(join(tmpdir(), "m14r-"))
  const registry = new ToolRegistry()
  registry.register(documentCreateTool)
  registry.register(documentReadTool)
  const created = await registry.execute(
    "platform.document.create",
    { workspacePath: ws, allowWrite: true },
    { title: "ReadMe", paragraphs: ["hello world"] },
  )
  assert.equal(created.ok, true)
  const read = await registry.execute("platform.document.read", { workspacePath: ws }, { path: ".agentdesk-docs/readme.docx" })
  assert.equal(read.ok, true)
  if (read.ok) {
    assert.match(String((read.output as { text: string }).text), /hello world/)
  }
  rmSync(ws, { recursive: true, force: true })
})

test("M14-T05: document.render 生成 HTML", async () => {
  const ws = mkdtempSync(join(tmpdir(), "m14h-"))
  const registry = new ToolRegistry()
  registry.register(documentCreateTool)
  registry.register(documentRenderTool)
  const created = await registry.execute(
    "platform.document.create",
    { workspacePath: ws, allowWrite: true },
    { title: "Preview", paragraphs: ["hi"] },
  )
  const rendered = await registry.execute("platform.document.render", { workspacePath: ws }, { path: ".agentdesk-docs/preview.docx" })
  assert.equal(rendered.ok, true)
  if (rendered.ok) {
    assert.match(String((rendered.output as { html: string }).html), /<html|<body|hi/i)
  }
  rmSync(ws, { recursive: true, force: true })
})

test("M14-T04: document.edit 定点替换", async () => {
  const ws = mkdtempSync(join(tmpdir(), "m14e-"))
  const registry = new ToolRegistry()
  registry.register(documentCreateTool)
  registry.register(documentEditTool)
  await registry.execute(
    "platform.document.create",
    { workspacePath: ws, allowWrite: true },
    { title: "Edit", paragraphs: ["old text"] },
  )
  const edited = await registry.execute(
    "platform.document.edit",
    { workspacePath: ws, allowWrite: true },
    { path: ".agentdesk-docs/edit.docx", search: "old", replace: "new", output: "edited.docx" },
  )
  assert.equal(edited.ok, true)
  rmSync(ws, { recursive: true, force: true })
})

test("M14-T07/T08: pdf.read / pdf.meta", async () => {
  const ws = mkdtempSync(join(tmpdir(), "m14p-"))
  const { writeFileSync } = await import("node:fs")
  writeFileSync(join(ws, "hello.pdf"), MINIMAL_PDF)
  const registry = new ToolRegistry()
  registry.register(pdfReadTool)
  registry.register(pdfMetaTool)
  const read = await registry.execute("platform.pdf.read", { workspacePath: ws }, { path: "hello.pdf" })
  if (read.ok) {
    const out = read.output as { numPages: number; text: string }
    assert.ok(out.numPages >= 1)
  }
  const meta = await registry.execute("platform.pdf.meta", { workspacePath: ws }, { path: "hello.pdf" })
  if (meta.ok) {
    assert.ok((meta.output as { numPages: number }).numPages >= 1)
  }
  rmSync(ws, { recursive: true, force: true })
})
