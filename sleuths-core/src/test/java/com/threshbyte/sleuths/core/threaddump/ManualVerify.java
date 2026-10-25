package com.threshbyte.sleuths.core.threaddump;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Manual smoke-test entry: reads a sample dump and prints the analysis.
 * Real tests should use JUnit (run by Maven); this main exists so the parser
 * can be verified directly with javac even without Maven installed.
 *
 * @author threshbyte
 */
public class ManualVerify {

    public static void main(String[] args) throws Exception {
        String path = args.length > 0 ? args[0] : "examples/sample-thread-dump.txt";
        String dump = Files.readString(Path.of(path));

        ThreadAnalysisResult result = ThreadDumpParser.parse(dump);

        System.out.println("==== Thread Analysis Result ====");
        System.out.println("totalThreads : " + result.totalThreads());
        System.out.println("stateCounts  : " + result.stateCounts());
        System.out.println("deadlock     : " + result.deadlockedThreads());
        System.out.println("contendedLocks: " + result.contendedLocks());
        System.out.println("topFrames    : " + result.topFrames());
        System.out.println("summary      : " + result.summary());
    }
}
