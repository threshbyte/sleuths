/**
 * jmap -histo parser: top classes by instance count / bytes, suspected leaks.
 *
 * Input format:
 *  num     #instances         #bytes  class name
 * ----------------------------------------------
 *    1:       1523456       121876544  [C
 *    2:        523456        83752345  java.lang.String
 *
 * @author threshbyte
 */

export interface HistoEntry {
  rank: number;
  instances: number;
  bytes: number;
  className: string;
}

export interface HeapHistoResult {
  totalInstances: number;
  totalBytes: number;
  top: HistoEntry[];
  suspectedLeaks: string[];
  summary: string;
}

const ROW = /^\s*(\d+):\s+(\d+)\s+(\d+)\s+(.+)$/;

export function parseHeapHisto(histo: string): HeapHistoResult {
  if (!histo || histo.trim().length === 0) {
    return { totalInstances: 0, totalBytes: 0, top: [], suspectedLeaks: [], summary: "empty histo" };
  }

  const entries: HistoEntry[] = [];
  for (const line of histo.split(/\r?\n/)) {
    const m = line.trim().match(ROW);
    if (!m) continue;
    entries.push({
      rank: parseInt(m[1], 10),
      instances: parseInt(m[2], 10),
      bytes: parseInt(m[3], 10),
      className: m[4].trim(),
    });
  }

  entries.sort((a, b) => b.bytes - a.bytes);
  const top = entries.slice(0, 20);
  const totalBytes = entries.reduce((s, e) => s + e.bytes, 0);

  // Suspected leaks: user/application classes (not JDK) taking >5% heap each
  const suspectedLeaks = entries
    .filter(e => !/^(java\.|jdk\.|\[L?java\.|sun\.|com\.sun\.)/.test(e.className))
    .filter(e => totalBytes > 0 && e.bytes / totalBytes > 0.05)
    .slice(0, 5)
    .map(e => `${e.className} (${(e.bytes / 1024 / 1024).toFixed(1)} MB)`);

  const summary =
    `${entries.length} classes. Top by bytes: ${top[0]?.className ?? "none"}. ` +
    (suspectedLeaks.length > 0 ? `Suspected leaks: ${suspectedLeaks.join("; ")}.` : "no obvious leak.");

  return {
    totalInstances: entries.reduce((s, e) => s + e.instances, 0),
    totalBytes,
    top,
    suspectedLeaks,
    summary,
  };
}
