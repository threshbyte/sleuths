#!/usr/bin/env node
/**
 * sleuths-mcp — MCP server entry point (STDIO transport).
 *
 * Wraps deterministic production-troubleshooting parsers as MCP tools so that
 * Cursor / Claude / Copilot get structured diagnostics instead of hallucinating
 * from raw logs.
 *
 * @author threshbyte
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { parseThreadDump } from "./threadDumpParser.js";
import { parseExceptionLogs } from "./exceptionLogParser.js";
import { parseGcLogs } from "./gcLogParser.js";
import { parseHeapHisto } from "./heapHistoParser.js";

async function main() {
  const server = new McpServer({
    name: "sleuths-mcp",
    version: "0.1.0",
  });

  // 1. Thread dump
  server.registerTool(
    "analyze_thread_dump",
    {
      title: "Analyze Thread Dump",
      description:
        "Parse a jstack / jcmd Thread.print thread dump text and return: " +
        "total thread count, state distribution, deadlocked threads, hot locks, top frames.",
      inputSchema: {
        dump: z.string().describe("The full thread dump text (jstack output)."),
      },
    },
    async ({ dump }) => ({
      content: [{ type: "text", text: JSON.stringify(parseThreadDump(dump), null, 2) }],
    }),
  );

  // 2. Exception log aggregation
  server.registerTool(
    "parse_exception_log",
    {
      title: "Parse Exception Logs",
      description:
        "Aggregate raw exception logs: group by exception type, count occurrences, " +
        "extract root cause (Caused-by chain) and first frame. Returns a structured " +
        "summary you can use to tell which error dominates and where it originates.",
      inputSchema: {
        logs: z.string().describe("Raw exception / stack-trace log text."),
      },
    },
    async ({ logs }) => ({
      content: [{ type: "text", text: JSON.stringify(parseExceptionLogs(logs), null, 2) }],
    }),
  );

  // 3. GC log
  server.registerTool(
    "analyze_gc_log",
    {
      title: "Analyze GC Log",
      description:
        "Parse JVM GC logs and return: total GC events, Young/Full counts, " +
        "average and max pause time, memory trend, and whether Full GC is frequent.",
      inputSchema: {
        logs: z.string().describe("GC log text (-Xlog:gc* output)."),
      },
    },
    async ({ logs }) => ({
      content: [{ type: "text", text: JSON.stringify(parseGcLogs(logs), null, 2) }],
    }),
  );

  // 4. Heap histogram
  server.registerTool(
    "analyze_heap_histo",
    {
      title: "Analyze Heap Histogram",
      description:
        "Parse jmap -histo output: top classes by bytes, total heap, and suspected " +
        "application-level memory leaks (non-JDK classes taking >5% heap).",
      inputSchema: {
        histo: z.string().describe("Output of `jmap -histo <pid>`."),
      },
    },
    async ({ histo }) => ({
      content: [{ type: "text", text: JSON.stringify(parseHeapHisto(histo), null, 2) }],
    }),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[sleuths-mcp] fatal:", err);
  process.exit(1);
});
