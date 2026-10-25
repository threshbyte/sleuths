package com.threshbyte.sleuths.core.threaddump;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;

/**
 * Structured info of a single thread as captured in a jstack snapshot.
 *
 * <p>Immutable: fixed once parsed, never mutated during analysis.</p>
 *
 * @author threshbyte
 */
public final class ThreadInfo {

    private final String name;
    private final long id;
    private final int priority;
    private final Thread.State state;
    private final List<String> stackFrames;
    /** Lock object this thread is trying to acquire, e.g. {@code <0x000000076af12345>}; null if none. */
    private final String waitingToLock;
    /** Name of the thread holding the lock this thread is waiting for; populated only when inferable. */
    private final String lockHolder;

    private ThreadInfo(Builder b) {
        this.name = Objects.requireNonNull(b.name, "thread name");
        this.id = b.id;
        this.priority = b.priority;
        this.state = Objects.requireNonNullElse(b.state, Thread.State.NEW);
        this.stackFrames = Collections.unmodifiableList(new ArrayList<>(b.stackFrames));
        this.waitingToLock = b.waitingToLock;
        this.lockHolder = b.lockHolder;
    }

    public String name() { return name; }
    public long id() { return id; }
    public int priority() { return priority; }
    public Thread.State state() { return state; }
    public List<String> stackFrames() { return stackFrames; }
    public String waitingToLock() { return waitingToLock; }
    public String lockHolder() { return lockHolder; }

    /** Top stack frame (the method currently executing); empty string when no frames. */
    public String topFrame() {
        return stackFrames.isEmpty() ? "" : stackFrames.get(0);
    }

    public static Builder builder(String name) {
        return new Builder(name);
    }

    /** Fluent builder used while parsing. */
    public static final class Builder {
        private final String name;
        private long id = -1;
        private int priority = -1;
        private Thread.State state;
        private final List<String> stackFrames = new ArrayList<>();
        private String waitingToLock;
        private String lockHolder;

        private Builder(String name) { this.name = name; }

        public Builder id(long id) { this.id = id; return this; }
        public Builder priority(int p) { this.priority = p; return this; }
        public Builder state(Thread.State s) { this.state = s; return this; }
        public Builder addFrame(String frame) { this.stackFrames.add(frame); return this; }
        public Builder waitingToLock(String lock) { this.waitingToLock = lock; return this; }
        public Builder lockHolder(String holder) { this.lockHolder = holder; return this; }

        public ThreadInfo build() { return new ThreadInfo(this); }
    }

    @Override
    public String toString() {
        return "ThreadInfo{name='" + name + "', id=" + id + ", state=" + state
                + ", frames=" + stackFrames.size() + '}';
    }
}
