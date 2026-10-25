package com.threshbyte.sleuths.core.threaddump;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Deterministic thread dump (jstack) parser.
 *
 * <p>Design goal: <b>no LLM, no hallucination</b>.
 * It turns a jstack text into structured diagnostics (deadlocks, state
 * distribution, contended locks, hot stack frames) that an upper-layer
 * MCP server or LLM can consume directly.</p>
 *
 * <p>Accepted input:
 * <ul>
 *   <li>standard output of {@code jstack <pid>}</li>
 *   <li>output of {@code jcmd <pid> Thread.print}</li>
 *   <li>a full dump containing a "Found ... deadlock" section</li>
 * </ul>
 *
 * @author threshbyte
 */
public final class ThreadDumpParser {

    // "main" #1 prio=5 os_prio=0 tid=0x... nid=... RUNNABLE [0x...]
    private static final Pattern THREAD_HEADER =
            Pattern.compile("^\"([^\"]+)\"\\s+#(\\d+)\\b.*?prio=(-?\\d+).*");

    // java.lang.Thread.State: WAITING (parking)
    private static final Pattern STATE_LINE =
            Pattern.compile("^java\\.lang\\.Thread\\.State:\\s+([A-Z_]+)");

    // at com.foo.Bar.baz(Bar.java:12)
    private static final Pattern STACK_FRAME =
            Pattern.compile("^\\s+at\\s+(.+)");

    // waiting to lock <0x...> (a java.lang.Object)
    private static final Pattern WAITING_TO_LOCK =
            Pattern.compile("waiting to lock <(0x[0-9a-f]+)>");

    // locked <0x...>
    private static final Pattern LOCKED =
            Pattern.compile("locked <(0x[0-9a-f]+)>");

    // deadlock section marker
    private static final Pattern DEADLOCK_MARKER =
            Pattern.compile("^Found\\s+.*deadlock", Pattern.CASE_INSENSITIVE);

    // deadlock-section thread line: "Thread-0":
    private static final Pattern DEADLOCK_THREAD =
            Pattern.compile("^\"([^\"]+)\":");

    // normalize frame: strip source location, keep class.method as aggregation key
    private static final Pattern FRAME_NORMALIZE = Pattern.compile("\\(.*\\)$");

    private static final int TOP_N = 10;

    private ThreadDumpParser() {}

    /**
     * Parse a full jstack text.
     *
     * @param dump jstack / jcmd Thread.print output, must not be null
     * @return structured analysis; empty stats for empty input
     */
    public static ThreadAnalysisResult parse(String dump) {
        if (dump == null || dump.isBlank()) {
            return ThreadAnalysisResult.builder().summary("empty thread dump").build();
        }

        List<ThreadInfo> threads = new ArrayList<>();
        Deque<ThreadInfo.Builder> current = new ArrayDeque<>();
        Map<Thread.State, Integer> stateCounts = new LinkedHashMap<>();
        List<String> deadlockThreads = new ArrayList<>();
        boolean inDeadlockSection = false;

        for (String raw : dump.split("\\R")) {
            String line = raw.stripTrailing();

            // 1. deadlock section
            if (DEADLOCK_MARKER.matcher(line.trim()).find()) {
                inDeadlockSection = true;
                continue;
            }
            if (inDeadlockSection) {
                Matcher dm = DEADLOCK_THREAD.matcher(line.trim());
                if (dm.find()) {
                    deadlockThreads.add(dm.group(1));
                }
                if (THREAD_HEADER.matcher(line).matches()) {
                    inDeadlockSection = false;
                } else {
                    continue;
                }
            }

            // 2. new thread header
            Matcher hm = THREAD_HEADER.matcher(line);
            if (hm.matches()) {
                if (!current.isEmpty()) {
                    threads.add(current.pop().build());
                }
                ThreadInfo.Builder b = ThreadInfo.builder(hm.group(1))
                        .id(Long.parseLong(hm.group(2)))
                        .priority(Integer.parseInt(hm.group(3)));
                current.push(b);
                continue;
            }

            if (current.isEmpty()) {
                continue;
            }
            ThreadInfo.Builder b = current.peek();

            // 3. state (line may end with "(sleeping)", so use find not matches)
            Matcher sm = STATE_LINE.matcher(line.trim());
            if (sm.find()) {
                b.state(mapState(sm.group(1)));
                continue;
            }

            // 4. stack frame
            Matcher fm = STACK_FRAME.matcher(line);
            if (fm.find()) {
                b.addFrame(fm.group(1).trim());
                continue;
            }

            // 5. locks
            Matcher wl = WAITING_TO_LOCK.matcher(line);
            if (wl.find()) {
                b.waitingToLock(wl.group(1));
            }
        }
        if (!current.isEmpty()) {
            threads.add(current.pop().build());
        }

        for (ThreadInfo t : threads) {
            stateCounts.merge(t.state(), 1, Integer::sum);
        }

        // hot locks: same lock awaited by multiple threads
        Map<String, List<String>> contended = new LinkedHashMap<>();
        for (ThreadInfo t : threads) {
            if (t.waitingToLock() != null) {
                contended.computeIfAbsent(t.waitingToLock(), k -> new ArrayList<>()).add(t.name());
            }
        }
        contended.entrySet().removeIf(e -> e.getValue().size() < 2);

        // hot stack frames: aggregate top frame
        Map<String, Integer> frameFreq = new TreeMap<>();
        for (ThreadInfo t : threads) {
            String top = t.topFrame();
            if (!top.isEmpty()) {
                frameFreq.merge(normalizeFrame(top), 1, Integer::sum);
            }
        }
        Map<String, Integer> topFrames = new LinkedHashMap<>();
        frameFreq.entrySet().stream()
                .sorted((a, c) -> Integer.compare(c.getValue(), a.getValue()))
                .limit(TOP_N)
                .forEach(e -> topFrames.put(e.getKey(), e.getValue()));

        String summary = buildSummary(threads.size(), stateCounts, deadlockThreads, contended);

        return ThreadAnalysisResult.builder()
                .totalThreads(threads.size())
                .stateCounts(stateCounts)
                .deadlockedThreads(deadlockThreads)
                .contendedLocks(contended)
                .topFrames(topFrames)
                .summary(summary)
                .build();
    }

    private static Thread.State mapState(String s) {
        try {
            return Thread.State.valueOf(s);
        } catch (IllegalArgumentException e) {
            return Thread.State.RUNNABLE;
        }
    }

    // "at com.foo.Bar.baz(Bar.java:12)" -> "com.foo.Bar.baz"
    private static String normalizeFrame(String frame) {
        String f = frame.startsWith("at ") ? frame.substring(3) : frame;
        return FRAME_NORMALIZE.matcher(f).replaceAll("");
    }

    private static String buildSummary(int total,
                                       Map<Thread.State, Integer> states,
                                       List<String> deadlocks,
                                       Map<String, List<String>> contended) {
        StringBuilder sb = new StringBuilder();
        sb.append("Total ").append(total).append(" threads; ");
        states.forEach((k, v) -> sb.append(k).append('=').append(v).append(", "));
        sb.setLength(sb.length() - 2); // strip trailing ", "
        if (!deadlocks.isEmpty()) {
            sb.append(" | DEADLOCK detected: ").append(String.join(", ", deadlocks));
        }
        if (!contended.isEmpty()) {
            sb.append(" | Hot locks: ");
            contended.forEach((lock, waiters) ->
                    sb.append("lock ").append(lock).append(" awaited by ")
                      .append(waiters.size()).append(" threads; "));
        }
        if (deadlocks.isEmpty() && contended.isEmpty()) {
            sb.append(" | no deadlock, no obvious lock contention.");
        }
        return sb.toString();
    }
}
