package com.threshbyte.sleuths.core.threaddump;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Analysis result of one thread dump (structured, ready to feed to an LLM).
 *
 * <p>All numbers are deterministic statistics, not LLM guesses.</p>
 *
 * @author threshbyte
 */
public final class ThreadAnalysisResult {

    private final int totalThreads;
    /** state -> count, in insertion order. */
    private final Map<Thread.State, Integer> stateCounts;
    /** Names of threads involved in a deadlock. */
    private final List<String> deadlockedThreads;
    /** Hot lock: same lock object awaited by multiple threads; value = waiting thread names. */
    private final Map<String, List<String>> contendedLocks;
    /** Most frequent top frames (Top N), for quick bottleneck location. */
    private final Map<String, Integer> topFrames;
    /** Human-readable diagnostic summary, safe to paste to an AI agent. */
    private final String summary;

    private ThreadAnalysisResult(Builder b) {
        this.totalThreads = b.totalThreads;
        this.stateCounts = Collections.unmodifiableMap(new LinkedHashMap<>(b.stateCounts));
        this.deadlockedThreads = Collections.unmodifiableList(new ArrayList<>(b.deadlockedThreads));
        this.contendedLocks = Collections.unmodifiableMap(new LinkedHashMap<>(b.contendedLocks));
        this.topFrames = Collections.unmodifiableMap(new LinkedHashMap<>(b.topFrames));
        this.summary = b.summary;
    }

    public int totalThreads() { return totalThreads; }
    public Map<Thread.State, Integer> stateCounts() { return stateCounts; }
    public List<String> deadlockedThreads() { return deadlockedThreads; }
    public Map<String, List<String>> contendedLocks() { return contendedLocks; }
    public Map<String, Integer> topFrames() { return topFrames; }
    public String summary() { return summary; }

    public boolean hasDeadlock() { return !deadlockedThreads.isEmpty(); }

    public static Builder builder() { return new Builder(); }

    public static final class Builder {
        private int totalThreads;
        private final Map<Thread.State, Integer> stateCounts = new LinkedHashMap<>();
        private final List<String> deadlockedThreads = new ArrayList<>();
        private final Map<String, List<String>> contendedLocks = new LinkedHashMap<>();
        private final Map<String, Integer> topFrames = new LinkedHashMap<>();
        private String summary = "";

        public Builder totalThreads(int n) { this.totalThreads = n; return this; }
        public Builder stateCounts(Map<Thread.State, Integer> m) { this.stateCounts.putAll(m); return this; }
        public Builder deadlockedThreads(List<String> l) { this.deadlockedThreads.addAll(l); return this; }
        public Builder contendedLocks(Map<String, List<String>> m) { this.contendedLocks.putAll(m); return this; }
        public Builder topFrames(Map<String, Integer> m) { this.topFrames.putAll(m); return this; }
        public Builder summary(String s) { this.summary = s; return this; }

        public ThreadAnalysisResult build() { return new ThreadAnalysisResult(this); }
    }

    @Override
    public String toString() {
        return "ThreadAnalysisResult{total=" + totalThreads + ", states=" + stateCounts
                + ", deadlocks=" + deadlockedThreads.size()
                + ", contendedLocks=" + contendedLocks.size() + '}';
    }
}
