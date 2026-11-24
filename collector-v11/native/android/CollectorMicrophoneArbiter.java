package com.collector.app;

import android.app.ActivityManager;
import android.content.Context;
import java.io.File;
import java.io.FileInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Process-local mutual exclusion for the microphone.
 * Persistent recorder state is checked separately after process recreation.
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

    /**
     * Fail closed if the foreground recorder service or its persisted state
     * indicates an active, unreadable, or otherwise unresolved recording.
     */
    public static boolean isRecorderBusy(Context context) {
        if (context == null) return true;
        if (isRecorderServiceRunning(context)) return true;
        File stateFile = new File(new File(context.getFilesDir(), "recordings"), "active-state.json");
        if (!stateFile.exists()) return false;
        try (FileInputStream input = new FileInputStream(stateFile);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[2048];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            JSONObject state = new JSONObject(new String(output.toByteArray(), StandardCharsets.UTF_8));
            String status = state.optString("status", "unknown");
            return "starting".equals(status) || "recording".equals(status)
                || "paused".equals(status) || "saving".equals(status)
                || !("inactive".equals(status) || "complete".equals(status)
                    || "interrupted".equals(status));
        } catch (Exception ignored) {
            return true;
        }
    }

    private static boolean isRecorderServiceRunning(Context context) {
        ActivityManager manager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
        if (manager == null) return true;
        for (ActivityManager.RunningServiceInfo service : manager.getRunningServices(1000)) {
            if (CollectorRecordingService.class.getName().equals(service.service.getClassName())) return true;
        }
        return false;
    }
}
