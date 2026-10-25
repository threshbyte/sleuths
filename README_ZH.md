# sleuths

> 给 AI agent 用的生产排障 MCP Server。把线程 dump、GC 日志、堆直方图等诊断产物**确定性解析**成结构化结论,让 Cursor / Claude / Copilot 直接定位问题,而不是靠大模型读日志瞎猜。

[English](./README.md) | 中文

## 特性

- **确定性解析**:不靠 LLM 幻觉,结果可复现、可测试
- **标准 MCP 协议**:STDIO 传输,接入 Cursor / Claude / Copilot
- **零侵入**:只解析已有诊断产物,不 attach 你的应用
- **聚焦生产排障**:死锁、锁竞争、内存压力

## Tools

| Tool | 说明 | 状态 |
|------|------|------|
| `analyze_thread_dump` | 线程 dump:死锁、状态分布、热点锁、Top 栈帧 | ✅ MVP |
| `analyze_gc_log` | GC 日志:Full GC 频率、内存压力、停顿 | 🚧 计划 |
| `analyze_heap_histo` | 堆直方图:Top 占用类、疑似泄漏 | 🚧 计划 |
| `parse_exception_log` | 异常日志聚合、根因链 | 🚧 计划 |

## 接入

按标准 MCP 方式把 sleuths 加进你的 AI 客户端(Cursor / Claude / Copilot),然后直接说:"帮我分析这份线程 dump"。

## License

[MIT](./LICENSE)
