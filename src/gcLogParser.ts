/**
 * GC log parser (OpenJDK -Xlog:gc* unified logging format).
 *
 * Example lines:
 *   [2024-01-15T10:23:45.123+0800] GC(12) Pause Young (Normal) (G1 Evacuation Pause) 100M->50M(200M) 10.234ms
 *   [2024-01-15T10:24:00.456+0800] GC(15) Pause Full (System.gc()) 200M->150M(200M) 120.456ms
 *
 * @author threshbyte
 */

export interface GcEvent {
  timestamp: string | null;
  kind: "Young" | "Full" | "Other";
  cause: string | null;
  heapBeforeMb: number;
  heapAfterMb: number;
  heapTotalMb: number;
  pauseMs: number;
}

export interface GcLogResult {
  totalEvents: number;
  youngCount: number;
  fullCount: number;
  avgPauseMs: number;
  maxPauseMs: number;
  maxPauseEvent: GcEvent | null;
  heapGrowthMb: number;
  summary: string;
}

// Matches: [ts] GC(n) Pause Young/Full ...  100M->50M(200M) 10.234ms
// Don't try to parse the cause parentheses — jump straight to the heap numbers.
const LINE = /\[([\dT:+\-.]+)\][\s\S]*?Pause\s+(Young|Full)[\s\S]*?([\d.]+)([KMG])->([\d.]+)([KMG])\(([\d.]+)([KMG])\)\s+([\d.]+)(ms|s)/;

function toMb(value: number, unit: string): number {
  switch (unit) {
    case "K": return value / 1024;
    case "G": return value * 1024;
    default: return value;
  }
}

export function parseGcLogs(logs: string): GcLogResult {
  if (!logs || logs.trim().length === 0) {
    return {
      totalEvents: 0, youngCount: 0, fullCount: 0,
      avgPauseMs: 0, maxPauseMs: 0, maxPauseEvent: null,
      heapGrowthMb: 0, summary: "empty GC log",
    };
  }

  const events: GcEvent[] = [];
  for (const raw of logs.split(/\r?\n/)) {
    const m = raw.trim().match(LINE);
    if (!m) continue;
    const [, ts, kindRaw, bV, bU, aV, aU, tV, tU, pauseV, pauseU] = m;
    const pauseMs = pauseU === "s" ? parseFloat(pauseV) * 1000 : parseFloat(pauseV);
    events.push({
      timestamp: ts,
      kind: kindRaw as GcEvent["kind"],
      cause: null,
      heapBeforeMb: toMb(parseFloat(bV), bU),
      heapAfterMb: toMb(parseFloat(aV), aU),
      heapTotalMb: toMb(parseFloat(tV), tU),
      pauseMs,
    });
  }

  const young = events.filter(e => e.kind === "Young");
  const full = events.filter(e => e.kind === "Full");
  const avgPauseMs = events.length
    ? Math.round((events.reduce((s, e) => s + e.pauseMs, 0) / events.length) * 10) / 10
    : 0;
  const maxEvent = events.length ? events.reduce((a, b) => (a.pauseMs > b.pauseMs ? a : b)) : null;
  const heapGrowth = events.length
    ? Math.round((events[events.length - 1].heapAfterMb - events[0].heapAfterMb) * 10) / 10
    : 0;

  const summary =
    `${events.length} GC events: ${young.length} Young, ${full.length} Full. ` +
    `avg pause ${avgPauseMs}ms, max ${maxEvent?.pauseMs ?? 0}ms. ` +
    (full.length > 0 ? `⚠️ ${full.length} Full GC detected.` : "no Full GC.");

  return {
    totalEvents: events.length,
    youngCount: young.length,
    fullCount: full.length,
    avgPauseMs,
    maxPauseMs: maxEvent?.pauseMs ?? 0,
    maxPauseEvent: maxEvent,
    heapGrowthMb: heapGrowth,
    summary,
  };
}
