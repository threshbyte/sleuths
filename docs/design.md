# sleuths 技术方案设计

> 版本:v0.1.0 · 最后更新:2026-10-25
> 定位:一个给 AI agent 用的生产排障 MCP Server。

---

## 1. 背景与问题

AI 编码助手(Cursor / Claude / Copilot)在排查生产问题时,通常直接读 `jstack`、GC log、异常堆栈等原始文本,然后**一本正经地胡说**:

- 把 `TIMED_WAITING` 当成卡死
- 漏看 jstack 自带的 deadlock 段落
- 找不到热点锁,把 CPU 高归咎于无关代码
- 对同一份 dump,每次给出不同结论

根因:**LLM 擅长理解语义,不擅长精确计数和状态机推理**。让它数"这 50 个线程里有几个 BLOCKED、哪把锁被 3 个线程等",它一定会出错。

## 2. 设计目标

| 目标 | 含义 |
|------|------|
| **确定性优先** | 所有数字、结论由代码算出来,不靠 LLM 猜;同一份 dump 永远得到同一份结果 |
| **语言无关** | 对外是标准 MCP server(STDIO + JSON-RPC),不绑定任何客户端;实现语言可替换 |
| **零侵入** | 只解析已有诊断产物(jstack 输出、GC log),不 attach 业务进程,不改运行时 |
| **可复现、可测试** | 解析层零运行时依赖,纯函数,容易写单测 |

## 3. 整体架构

```
┌─────────────────────────────────────────────────────────┐
│  AI Client (Cursor / Claude / Copilot)                  │
│  ─ 聊天 / 读上下文 / 决定调哪个 tool                     │
└──────────────────────┬──────────────────────────────────┘
                       │ MCP protocol (JSON-RPC over STDIO)
                       ▼
┌─────────────────────────────────────────────────────────┐
│  sleuths-server (MCP 适配层)                            │
│  ─ 注册 tools / 解析请求参数 / 把结果包成 CallToolResult │
└──────────────────────┬──────────────────────────────────┘
                       │ 纯 Java / 纯函数调用
                       ▼
┌─────────────────────────────────────────────────────────┐
│  sleuths-core (确定性解析层)                            │
│  ─ jstack 文本 → ThreadInfo[] → ThreadAnalysisResult    │
│  ─ 死锁检测 / 状态统计 / 热点锁 / Top 栈帧              │
└─────────────────────────────────────────────────────────┘
                       ▲
                       │ 输入
┌──────────────────────┴──────────────────────────────────┐
│  诊断产物:jstack <pid> / jcmd Thread.print / GC log     │
└─────────────────────────────────────────────────────────┘
```

**核心思想**:LLM 不直接面对原始 dump,而是面对 sleuths 算好的结构化结论。LLM 负责"理解业务语义、给修复建议",sleuths 负责"精确数数、找环、聚合"。

## 4. 分层数据流

从一份 jstack 文本到 AI 可用的诊断结果,分四层:

| 层 | 职责 | 当前状态 |
|----|------|----------|
| **L0 输入** | jstack / jcmd 原始输出(非结构化文本) | ✅ |
| **L1 解析层** | 正则 + 状态机切分,抽出线程名、状态、栈帧、锁地址,组成 `ThreadInfo` 对象 | ✅ MVP |
| **L2 基础诊断** | 数状态分布、聚合等待同一把锁的线程、抓 jstack 自带 deadlock 标记、Top N 栈帧 | ✅ MVP |
| **L3 推理层** | 等待图找环(支持 JUC 锁)、热点锁归因、忙循环关联、多 dump 时序对比 | 🚧 下一版 |
| **L4 输出** | 一段确定性文本/JSON,直接作为 MCP tool 返回值给 LLM | ✅ |

> L1/L2 是体力活,L3 才是真正的技术壁垒——和"随便写个正则"拉开差距的地方。

## 5. 模块划分

### 5.1 `sleuths-core`(解析层,核心资产)

- **零运行时依赖**:只用 JDK,不引入任何第三方库
- **纯函数**:`ThreadDumpParser.parse(String dump) → ThreadAnalysisResult`
- **可独立测试**:不启动 MCP 就能跑、能单测

关键类:
- `ThreadDumpParser` — 入口,状态机逐行解析
- `ThreadInfo` — 单个线程的不可变快照(名字、状态、栈帧、等待的锁)
- `ThreadAnalysisResult` — 聚合结果(总数、状态分布、死锁线程、热点锁、Top 帧、summary)

### 5.2 `sleuths-server`(MCP 适配层)

- 基于官方 MCP Java SDK 0.17.x
- STDIO 传输,通过 stdin/stdout 和客户端通信
- 注册 tools,把请求参数转成 core 层调用,再把结果包成 `CallToolResult`

## 6. Tool 设计规范

每个 tool 是一个 `SyncToolSpecification`,三要素:

1. **name**: snake_case,动词开头,如 `analyze_thread_dump`
2. **description**: 会暴露给 LLM,必须写清楚输入是什么、输出是什么——这直接影响 LLM 调对工具的概率
3. **inputSchema**: 参数列表(当前 MVP 是一个 `dump` 字符串)

返回值是一段结构化文本,包含:
```
total=N
stateCounts={RUNNABLE=x, BLOCKED=y, WAITING=z}
deadlocks=[threadA, threadB]
contendedLocks={0x..: [threadA, threadB]}
topFrames={com.foo.Bar.baz=12}
summary=...
```

## 7. 关键技术决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 传输方式 | STDIO | 本地工具最常见,Cursor/Claude 原生支持;不用起 HTTP 端口 |
| 解析层依赖 | 零第三方库 | 减少 fat-jar 体积,降低冲突,保证纯函数可测 |
| 为什么不直接让 LLM 读 dump | 确定性优先 | LLM 计数和找环一定会错;我们把这部分外包给代码 |
| 为什么不用 Arthas | 零侵入 | Arthas 要 attach agent;我们只解析已有产物,适合线上不敢动的环境 |
| 包名 | `com.threshbyte.sleuths` | 组织名 threshbyte,产品名 sleuths(侦探) |

## 8. 路线图

- **v0.1(当前)**: `analyze_thread_dump` MVP + STDIO server
- **v0.2**: 等待图找环(自己建等待图检测死锁,不依赖 jstack 自带标记,覆盖 JUC `ReentrantLock`)、`analyze_gc_log`
- **v0.3**: `analyze_heap_histo`、`parse_exception_log`
- **v1.0**: Node/TS 版本(npx 一行启动)、发布到 npm / Maven Central

## 9. 与现有方案的边界

| | Arthas | 云 APM | 纯 LLM 提示词 | sleuths |
|--|--------|--------|--------------|---------|
| 使用者 | 人在终端 | 绑云 | 模型读文本 | **AI agent 调用** |
| 可复现 | ✅ | ✅ | ❌ 幻觉 | ✅ |
| 侵入性 | attach agent | 装采集 | 无 | **只解析产物** |
| 厂商绑定 | 无 | 强 | 无 | 无、开源 |
