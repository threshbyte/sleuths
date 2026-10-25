/**
 * Deterministic thread dump (jstack) parser.
 *
 * Ported from the Java reference implementation. No LLM, no hallucination:
 * turns a jstack text into structured diagnostics (deadlocks, state distribution,
 * contended locks, hot stack frames) that an MCP server / LLM can consume directly.
 *
 * @author threshbyte
 */

export interface ThreadAnalysisResult {
  totalThreads: number;
  stateCounts: Record<string, number>;
  deadlockedThreads: string[];
  contendedLocks: Record<string, string[]>;
  topFrames: Record<string, number>;
  summary: string;
}

interface ThreadInfo {
  name: string;
  id: number;
  priority: number;
  state: string;
  stackFrames: string[];
  waitingToLock: string | null;
}

const THREAD_HEADER = /^"([^"]+)"\s+#(\d+)\b.*?prio=(-?\d+).*/;
const STATE_LINE = /java\.lang\.Thread\.State:\s+([A-Z_]+)/;
const STACK_FRAME = /^\s+at\s+(.+)/;
const WAITING_TO_LOCK = /waiting to lock <(0x[0-9a-f]+)>/;
const DEADLOCK_MARKER = /^Found\s+.*deadlock/i;
const DEADLOCK_THREAD = /^"([^"]+)":/;
const FRAME_NORMALIZE = /\(.*\)$/;

const TOP_N = 10;

/**
 * Parse a full jstack / jcmd Thread.print output.
 */
export function parseThreadDump(dump: string): ThreadAnalysisResult {
  if (!dump || dump.trim().length === 0) {
    return {
      totalThreads: 0,
      stateCounts: {},
      deadlockedThreads: [],
      contendedLocks: {},
      topFrames: {},
      summary: "empty thread dump",
    };
  }

  const threads: ThreadInfo[] = [];
  let current: ThreadInfo | null = null;
  const stateCounts: Record<string, number> = {};
  const deadlockedThreads: string[] = [];
  let inDeadlockSection = false;

  for (const raw of dump.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");

    // 1. deadlock section
    if (DEADLOCK_MARKER.test(line.trim())) {
      inDeadlockSection = true;
      continue;
    }
    if (inDeadlockSection) {
      const dm = line.trim().match(DEADLOCK_THREAD);
      if (dm) {
        deadlockedThreads.push(dm[1]);
      }
      if (THREAD_HEADER.test(line)) {
        inDeadlockSection = false;
      } else {
        continue;
      }
    }

    // 2. new thread header
    const hm = line.match(THREAD_HEADER);
    if (hm) {
      if (current) threads.push(current);
      current = {
        name: hm[1],
        id: parseInt(hm[2], 10),
        priority: parseInt(hm[3], 10),
        state: "NEW",
        stackFrames: [],
        waitingToLock: null,
      };
      continue;
    }
    if (!current) continue;

    // 3. state
    const sm = line.trim().match(STATE_LINE);
    if (sm) {
      current.state = sm[1];
      continue;
    }

    // 4. stack frame
    const fm = line.match(STACK_FRAME);
    if (fm) {
      current.stackFrames.push(fm[1].trim());
      continue;
    }

    // 5. locks
    const wl = line.match(WAITING_TO_LOCK);
    if (wl) {
      current.waitingToLock = wl[1];
    }
  }
  if (current) threads.push(current);

  // state distribution
  for (const t of threads) {
    stateCounts[t.state] = (stateCounts[t.state] || 0) + 1;
  }

  // hot locks: same lock awaited by >= 2 threads
  const contended: Record<string, string[]> = {};
  for (const t of threads) {
    if (t.waitingToLock) {
      (contended[t.waitingToLock] ??= []).push(t.name);
    }
  }
  for (const [lock, waiters] of Object.entries(contended)) {
    if (waiters.length < 2) delete contended[lock];
  }

  // hot stack frames
  const frameFreq: Record<string, number> = {};
  for (const t of threads) {
    const top = t.stackFrames[0];
    if (top) {
      const normalized = normalizeFrame(top);
      frameFreq[normalized] = (frameFreq[normalized] || 0) + 1;
    }
  }
  const topFrames: Record<string, number> = {};
  Object.entries(frameFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .forEach(([k, v]) => (topFrames[k] = v));

  const summary = buildSummary(threads.length, stateCounts, deadlockedThreads, contended);

  return {
    totalThreads: threads.length,
    stateCounts,
    deadlockedThreads,
    contendedLocks: contended,
    topFrames,
    summary,
  };
}

function normalizeFrame(frame: string): string {
  const f = frame.startsWith("at ") ? frame.slice(3) : frame;
  return f.replace(FRAME_NORMALIZE, "");
}

function buildSummary(
  total: number,
  states: Record<string, number>,
  deadlocks: string[],
  contended: Record<string, string[]>,
): string {
  let sb = `Total ${total} threads; `;
  sb += Object.entries(states)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  if (deadlocks.length > 0) {
    sb += ` | DEADLOCK detected: ${deadlocks.join(", ")}`;
  }
  if (Object.keys(contended).length > 0) {
    sb += " | Hot locks: ";
    for (const [lock, waiters] of Object.entries(contended)) {
      sb += `lock ${lock} awaited by ${waiters.length} threads; `;
    }
  }
  if (deadlocks.length === 0 && Object.keys(contended).length === 0) {
    sb += " | no deadlock, no obvious lock contention.";
  }
  return sb;
}
