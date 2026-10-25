#!/usr/bin/env node
/**
 * sleuths-mcp — MCP server entry point (STDIO transport).
 *
 * Wraps the deterministic thread-dump parser as an MCP tool so that
 * Cursor / Claude / Copilot can call it during troubleshooting and get
 * structured diagnostics instead of LLM guesses.
 *
 * @author threshbyte
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { parseThreadDump } from "./threadDumpParser.js";

async function main() {
  const server = new McpServer({
    name: "sleuths-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "analyze_thread_dump",
    {
      title: "Analyze Thread Dump",
      description:
        "Parse a jstack / jcmd Thread.print thread dump text and return: " +
        "total thread count, state distribution, deadlocked threads, hot locks " +
        "(contended by multiple threads), and top hot stack frames. " +
        "Deterministic — no LLM hallucination.",
      inputSchema: {
        dump: z.string().describe("The full thread dump text (jstack output)."),
      },
    },
    async ({ dump }) => {
      const result = parseThreadDump(dump);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Keep process alive; StdioServerTransport handles shutdown.
}

main().catch((err) => {
  console.error("[sleuths-mcp] fatal:", err);
  process.exit(1);
});
