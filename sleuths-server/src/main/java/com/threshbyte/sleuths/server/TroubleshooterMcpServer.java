package com.threshbyte.sleuths.server;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.threshbyte.sleuths.core.threaddump.ThreadAnalysisResult;
import com.threshbyte.sleuths.core.threaddump.ThreadDumpParser;
import io.modelcontextprotocol.json.jackson.JacksonMcpJsonMapper;
import io.modelcontextprotocol.server.McpServer;
import io.modelcontextprotocol.server.McpServerFeatures.SyncToolSpecification;
import io.modelcontextprotocol.server.transport.StdioServerTransportProvider;
import io.modelcontextprotocol.spec.McpSchema;
import io.modelcontextprotocol.spec.McpSchema.CallToolResult;

import java.util.List;
import java.util.concurrent.CountDownLatch;

/**
 * JVMSleuth MCP Server entry point (STDIO transport).
 *
 * <p>Wraps {@link ThreadDumpParser} as an MCP tool so that Cursor / Claude /
 * Copilot can call it during troubleshooting and get <b>deterministic</b>
 * structured diagnostics instead of LLM guesses from raw logs.</p>
 *
 * <p>API aligned with official MCP Java SDK 0.17.x:
 * https://java.sdk.modelcontextprotocol.io/latest/server/ </p>
 *
 * @author threshbyte
 */
public final class TroubleshooterMcpServer {

    private TroubleshooterMcpServer() {}

    public static void main(String[] args) throws Exception {
        // STDIO transport: talk to the MCP client (Cursor/Claude) over stdin/stdout
        var transportProvider = new StdioServerTransportProvider(
                new JacksonMcpJsonMapper(new ObjectMapper()));

        var analyzeThreadDump = SyncToolSpecification.builder()
                .tool(McpSchema.Tool.builder()
                        .name("analyze_thread_dump")
                        .description("Parse a jstack / jcmd Thread.print thread dump text and return: "
                                + "total thread count, state distribution, Java-level deadlocked threads, "
                                + "hot locks (contended by multiple threads), and top hot stack frames. "
                                + "Input arg 'dump' is the full thread dump text.")
                        .build())
                .callHandler((exchange, request) -> {
                    Object dump = request.arguments().get("dump");
                    ThreadAnalysisResult result =
                            ThreadDumpParser.parse(dump == null ? "" : dump.toString());
                    return CallToolResult.builder()
                            .content(List.of(new McpSchema.TextContent(toText(result))))
                            .build();
                })
                .build();

        var server = McpServer.sync(transportProvider)
                .serverInfo("sleuths-server", "0.1.0")
                .capabilities(McpSchema.ServerCapabilities.builder()
                        .tools(true)   // enable tool capability, required by addTool
                        .build())
                .build();
        server.addTool(analyzeThreadDump);

        // Block main thread and wait for MCP requests over stdin
        new CountDownLatch(1).await();
    }

    /** Flatten the structured result into readable text as the tool's return content. */
    private static String toText(ThreadAnalysisResult r) {
        return "total=" + r.totalThreads()
                + "\nstateCounts=" + r.stateCounts()
                + "\ndeadlocks=" + r.deadlockedThreads()
                + "\ncontendedLocks=" + r.contendedLocks()
                + "\ntopFrames=" + r.topFrames()
                + "\nsummary=" + r.summary();
    }
}
