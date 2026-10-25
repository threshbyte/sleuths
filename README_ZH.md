# sleuths-mcp

> 给 AI agent 用的生产排障 MCP Server。把线程 dump、GC 日志、堆直方图等诊断产物**确定性解析**成结构化结论,让 Cursor / Claude / Copilot 直接定位问题,而不是靠大模型读日志瞎猜。

[English](./README.md) | 中文

## 安装

需要 Node.js 18+。无需全局安装,直接 `npx` 运行:

```bash
npx -y sleuths-mcp
```

或全局安装:

```bash
npm install -g sleuths-mcp
```

## 接入你的 AI 客户端

在 MCP 配置里加一段:

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

然后直接说:"帮我分析这份线程 dump"。

## 特性

- **确定性解析**:不靠 LLM 幻觉,结果可复现、可测试
- **标准 MCP 协议**:STDIO 传输,接入 Cursor / Claude / Copilot
- **零侵入**:只解析已有诊断产物,不 attach 你的应用
- **一键启动**:`npx -y sleuths-mcp`,不需要装 Java

## Tools

| Tool | 说明 | 状态 |
|------|------|------|
| `analyze_thread_dump` | 线程 dump:死锁、状态分布、热点锁、Top 栈帧 | ✅ MVP |
| `parse_exception_log` | 异常日志聚合:按类型分组、根因链、出现次数 | ✅ MVP |
| `analyze_gc_log` | GC 日志:Young/Full 次数、平均/最大停顿、内存趋势 | ✅ MVP |
| `analyze_heap_histo` | 堆直方图:按字节 Top 类、疑似内存泄漏 | ✅ MVP |

## 本地开发

```bash
npm install
npm run build
node dist/index.js
```

## License

[MIT](./LICENSE)
