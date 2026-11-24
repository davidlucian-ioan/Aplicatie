package com.collector.app;

/**
 * Process-local mutual exclusion for the microphone.
 * Persistent recorder state is still checked separately after process recreation.
 */
public final class CollectorMicrophoneArbiter {
    private static String owner = null;

    private CollectorMicrophoneArbiter() {}

    public static synchronized boolean tryAcquire(String requestedOwner) {
        if (requestedOwner == null || requestedOwner.isEmpty() || owner != null) {
            return false;
        }
        owner = requestedOwner;
        return true;
    }

    public static synchronized void release(String requestedOwner) {
        if (requestedOwner != null && requestedOwner.equals(owner)) {
            owner = null;
        }
    }

    public static synchronized boolean isOwnedByOther(String requestedOwner) {
        return owner != null && !owner.equals(requestedOwner);
    }

    public static synchronized String currentOwner() {
        return owner;
    }
}
