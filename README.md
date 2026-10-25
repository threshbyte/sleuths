# sleuths

> A production-troubleshooting MCP server for AI agents. Turns thread dumps, GC logs and heap histograms into **deterministic** structured diagnostics (deadlocks, hot locks, bottleneck frames), so Cursor / Claude / Copilot pinpoint the problem directly — instead of hallucinating from raw logs.

English | [中文](./README_ZH.md)

## Features

- **Deterministic parsing**: no LLM hallucination; reproducible and testable
- **Standard MCP protocol**: STDIO transport, works with Cursor / Claude / Copilot
- **Zero intrusion**: only parses existing diagnostic artifacts; never attaches to your app
- **Focused on production troubleshooting**: deadlocks, lock contention, memory pressure

## Tools

| Tool | Description | Status |
|------|-------------|--------|
| `analyze_thread_dump` | Thread dumps: deadlocks, state distribution, hot locks, top frames | ✅ MVP |
| `analyze_gc_log` | GC logs: Full GC frequency, memory pressure, pauses | 🚧 planned |
| `analyze_heap_histo` | Heap histogram: top classes, suspected leaks | 🚧 planned |
| `parse_exception_log` | Aggregated exceptions, root-cause chain | 🚧 planned |

## Setup

Add sleuths to your AI client (Cursor / Claude / Copilot) as a standard MCP server, then just say: "analyze this thread dump".

## License

[MIT](./LICENSE)
