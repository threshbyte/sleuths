/**
 * Exception log parser: aggregates raw exception logs into grouped, root-cause structured output.
 *
 * A "block" starts at a line matching `XxxException: ...` / `XxxError: ...` and includes
 * subsequent `at ...` frames and `Caused by: ...` lines. Timestamp from the nearest preceding
 * log line is captured.
 *
 * @author threshbyte
 */

export interface ExceptionGroup {
  type: string;
  message: string;
  count: number;
  firstOccurrence: string | null;
  lastOccurrence: string | null;
  rootCause: string | null;
  topFrame: string | null;
}

export interface ExceptionLogResult {
  totalExceptions: number;
  uniqueTypes: number;
  groups: ExceptionGroup[];
  summary: string;
}

const TIMESTAMP = /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?)/;
const EXCEPTION_HEADER = /^([\w.]+(?:Exception|Error|Throwable))(?::\s*(.*))?/;
const STACK_FRAME = /^\s+at\s+(.+)/;
const CAUSED_BY = /^Caused by:\s*([\w.]+)(?::\s*(.*))?/;

export function parseExceptionLogs(logs: string): ExceptionLogResult {
  if (!logs || logs.trim().length === 0) {
    return { totalExceptions: 0, uniqueTypes: 0, groups: [], summary: "empty log" };
  }

  const lines = logs.split(/\r?\n/);
  const groups = new Map<string, ExceptionGroup>();

  let current: { type: string; message: string; ts: string | null; root: string | null; frame: string | null } | null = null;
  let pendingTs: string | null = null;

  for (const line of lines) {
    const tsMatch = line.match(TIMESTAMP);
    if (tsMatch) pendingTs = tsMatch[1];

    const trimmed = line.trim();

    // New exception?
    const hm = trimmed.match(EXCEPTION_HEADER);
    if (hm && !STACK_FRAME.test(line)) {
      // flush previous
      if (current) {
        const key = current.type + "|" + current.message;
        const g = groups.get(key);
        if (g) {
          g.count++;
          g.lastOccurrence = current.ts ?? g.lastOccurrence;
        } else {
          groups.set(key, {
            type: current.type,
            message: current.message,
            count: 1,
            firstOccurrence: current.ts,
            lastOccurrence: current.ts,
            rootCause: current.root,
            topFrame: current.frame,
          });
        }
      }
      current = {
        type: hm[1],
        message: hm[2] ?? "",
        ts: pendingTs,
        root: null,
        frame: null,
      };
      continue;
    }

    if (!current) continue;

    const cb = trimmed.match(CAUSED_BY);
    if (cb) {
      current.root = cb[1] + (cb[2] ? ": " + cb[2] : "");
      continue;
    }
    const sf = line.match(STACK_FRAME);
    if (sf && !current.frame) current.frame = sf[1].trim();
  }
  // flush last
  if (current) {
    const key = current.type + "|" + current.message;
    const g = groups.get(key);
    if (g) {
      g.count++;
      g.lastOccurrence = current.ts ?? g.lastOccurrence;
    } else {
      groups.set(key, {
        type: current.type,
        message: current.message,
        count: 1,
        firstOccurrence: current.ts,
        lastOccurrence: current.ts,
        rootCause: current.root,
        topFrame: current.frame,
      });
    }
  }

  const sorted = [...groups.values()].sort((a, b) => b.count - a.count);
  const total = sorted.reduce((s, g) => s + g.count, 0);
  const summary =
    `Total ${total} exceptions across ${sorted.length} types. ` +
    `Top: ${sorted[0]?.type ?? "none"} x${sorted[0]?.count ?? 0}` +
    (sorted[0]?.rootCause ? ` (root: ${sorted[0].rootCause})` : "") + ".";

  return {
    totalExceptions: total,
    uniqueTypes: sorted.length,
    groups: sorted,
    summary,
  };
}
