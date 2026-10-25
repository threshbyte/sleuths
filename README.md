# sleuths-mcp

> A production-troubleshooting MCP server for AI agents. Turns thread dumps, GC logs and heap histograms into **deterministic** structured diagnostics (deadlocks, hot locks, bottleneck frames), so Cursor / Claude / Copilot pinpoint the problem directly — instead of hallucinating from raw logs.

English | [中文](./README_ZH.md)

## Install

Requires Node.js 18+. No global install needed — run directly with `npx`:

```bash
npx -y sleuths-mcp
```

Or install globally:

```bash
npm install -g sleuths-mcp
```

## Setup with your AI client

Add sleuths to your MCP client (Cursor / Claude / Copilot):

```json
{
  "mcpServers": {
    "sleuths": {
      "command": "npx",
      "args": ["-y", "sleuths-mcp"]
    }
  }
}
```

Then just say: "analyze this thread dump".

## Features

- **Deterministic parsing**: no LLM hallucination; reproducible and testable
- **Standard MCP protocol**: STDIO transport, works with Cursor / Claude / Copilot
- **Zero intrusion**: only parses existing diagnostic artifacts; never attaches to your app
- **One-command install**: `npx -y sleuths-mcp`, no Java runtime required

## Tools

| Tool | Description | Status |
|------|-------------|--------|
| `analyze_thread_dump` | Thread dumps: deadlocks, state distribution, hot locks, top frames | ✅ MVP |
| `parse_exception_log` | Exception aggregation: group by type, root-cause chain, count | ✅ MVP |
| `analyze_gc_log` | GC logs: Young/Full counts, avg/max pause, memory trend | ✅ MVP |
| `analyze_heap_histo` | Heap histogram: top classes by bytes, suspected leaks | ✅ MVP |

## Develop

```bash
npm install
npm run build
node dist/index.js
```

## License

[MIT](./LICENSE)
