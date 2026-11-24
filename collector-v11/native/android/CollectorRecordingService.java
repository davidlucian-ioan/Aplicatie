package com.collector.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
import android.system.Os;
import androidx.core.app.NotificationCompat;
import java.io.File;
import java.io.FileOutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;
import org.json.JSONObject;

public final class CollectorRecordingService extends Service {
    public static final String ACTION_START = "com.collector.app.recorder.START";
    public static final String ACTION_PAUSE = "com.collector.app.recorder.PAUSE";
    public static final String ACTION_RESUME = "com.collector.app.recorder.RESUME";
    public static final String ACTION_STOP = "com.collector.app.recorder.STOP";
    public static final String EXTRA_ID = "recordingId";

    private static final String CHANNEL_ID = "collector-recording";
    private static final int NOTIFICATION_ID = 4107;

    private MediaRecorder recorder;
    private CollectorMicrophoneLock microphoneLock;
    private PowerManager.WakeLock wakeLock;
    private File outputFile;
    private File manifestFile;
    private String recordingId;
    private String format;
    private String status = "inactive";
    private long startedAtMs;
    private long pausedDurationMs;
    private long pauseStartedAtMs;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || intent.getAction() == null) {
            stopSelf(startId);
            return START_NOT_STICKY;
        }

        String action = intent.getAction();
        String requestedId = intent.getStringExtra(EXTRA_ID);
        if (!ACTION_START.equals(action) && recordingId != null && requestedId != null && !recordingId.equals(requestedId)) {
            return START_NOT_STICKY;
        }
        try {
            if (ACTION_START.equals(action)) {
                startRecording(intent);
            } else if (ACTION_PAUSE.equals(action)) {
                pauseRecording();
            } else if (ACTION_RESUME.equals(action)) {
                resumeRecording();
            } else if (ACTION_STOP.equals(action)) {
                stopRecording();
            }
        } catch (Exception error) {
            failRecording(error);
        }
        return START_NOT_STICKY;
    }

    private void startRecording(Intent intent) throws Exception {
        if (recorder != null || "recording".equals(status) || "paused".equals(status)) {
            return;
        }

        recordingId = intent.getStringExtra(EXTRA_ID);
        if (recordingId == null || recordingId.trim().isEmpty()) {
            recordingId = UUID.randomUUID().toString();
        }

        File directory = recordingsDirectory();
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("Nu pot crea directorul local pentru înregistrări.");
        }
        boolean supportsAdts = Build.VERSION.SDK_INT >= 26;
        format = supportsAdts ? "aac" : "m4a";
        String extension = supportsAdts ? ".aac" : ".m4a";
        outputFile = new File(directory, "recording-" + recordingId + extension);
        manifestFile = new File(directory, recordingId + ".json");
        microphoneLock = CollectorMicrophoneLock.tryAcquire(this, "recorder:" + recordingId);
        if (microphoneLock == null) {
            throw new IllegalStateException("Microfonul este folosit de o sesiune de transcriere. Oprește transcrierea înainte de a înregistra.");
        }

        
        startedAtMs = System.currentTimeMillis();
        pausedDurationMs = 0L;
        pauseStartedAtMs = 0L;
        status = "starting";

        Notification notification = buildNotification("Pornire microfon · pregătesc fișierul local");
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        persistManifest(null);

        MediaRecorder nextRecorder = new MediaRecorder();
        nextRecorder.setAudioSource(MediaRecorder.AudioSource.MIC);
        nextRecorder.setOutputFormat(
            supportsAdts ? MediaRecorder.OutputFormat.AAC_ADTS : MediaRecorder.OutputFormat.MPEG_4
        );
        nextRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
        nextRecorder.setAudioEncodingBitRate(intent.getIntExtra("bitRate", 128000));
        nextRecorder.setAudioSamplingRate(intent.getIntExtra("sampleRate", 44100));
        nextRecorder.setOutputFile(outputFile.getAbsolutePath());
        recorder = nextRecorder;
        nextRecorder.setOnErrorListener((source, what, extra) ->
            failRecording(new IllegalStateException("Eroare MediaRecorder (" + what + ", " + extra + ")."))
        );
        nextRecorder.prepare();
        nextRecorder.start();
        status = "recording";
        acquireWakeLock();
        persistManifest(null);
        updateNotification("Înregistrare activă · serviciu Android pornit");
    }

    private void pauseRecording() throws Exception {
        if (recorder == null || !"recording".equals(status)) {
            return;
        }
        if (Build.VERSION.SDK_INT < 24) {
            throw new IllegalStateException("Pauza nu este disponibilă pe această versiune Android.");
        }
        recorder.pause();
        pauseStartedAtMs = System.currentTimeMillis();
        status = "paused";
        releaseWakeLock();
        persistManifest(null);
        updateNotification("Înregistrare pusă pe pauză");
    }

    private void resumeRecording() throws Exception {
        if (recorder == null || !"paused".equals(status)) {
            return;
        }
        if (Build.VERSION.SDK_INT < 24) {
            throw new IllegalStateException("Reluarea nu este disponibilă pe această versiune Android.");
        }
        recorder.resume();
        if (pauseStartedAtMs > 0L) {
            pausedDurationMs += Math.max(0L, System.currentTimeMillis() - pauseStartedAtMs);
        }
        pauseStartedAtMs = 0L;
        status = "recording";
        acquireWakeLock();
        persistManifest(null);
        updateNotification("Înregistrare activă · ecranul poate fi stins");
    }

    private void stopRecording() {
        if (recorder == null) {
            if (recordingId != null && "starting".equals(status)) {
                status = "interrupted";
                try { persistManifest("Înregistrarea a fost oprită înainte de inițializarea microfonului."); } catch (Exception ignored) {}
            }
            releaseWakeLock();
            releaseMicrophoneLock();
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return;
        }

        String finalStatus = "complete";
        String errorMessage = null;
        try {
            recorder.setOnErrorListener(null);
            recorder.stop();
        } catch (RuntimeException error) {
            finalStatus = "interrupted";
            errorMessage = "Recorderul nu a putut finaliza containerul audio; fișierul parțial a fost păstrat.";
        } finally {
            try {
                recorder.reset();
                recorder.release();
            } catch (Exception ignored) {
                // The output file is preserved even if release fails.
            }
            recorder = null;
        }

        releaseWakeLock();
        releaseMicrophoneLock();
        status = finalStatus;
        try {
            persistManifest(errorMessage);
        } catch (Exception ignored) {
            status = "interrupted";
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void failRecording(Exception error) {
        String message = error.getMessage() == null ? "Eroare necunoscută la înregistrare." : error.getMessage();
        if (recorder != null) {
            recorder.setOnErrorListener(null);
            try {
                recorder.stop();
            } catch (RuntimeException ignored) {
                // Keep the partial file for recovery.
            }
            try {
                recorder.reset();
                recorder.release();
            } catch (Exception ignored) {}
            recorder = null;
        }
        releaseWakeLock();
        releaseMicrophoneLock();
        if (recordingId != null) {
            status = "interrupted";
            try {
                persistManifest(message);
            } catch (Exception ignored) {}
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private long durationMs() {
        if (startedAtMs <= 0L) {
            return 0L;
        }
        long end = "paused".equals(status) && pauseStartedAtMs > 0L
            ? pauseStartedAtMs
            : System.currentTimeMillis();
        return Math.max(0L, end - startedAtMs - pausedDurationMs);
    }

    private void persistManifest(String errorMessage) throws Exception {
        if (recordingId == null || outputFile == null || manifestFile == null) {
            return;
        }
        JSONObject json = new JSONObject();
        json.put("id", recordingId);
        json.put("status", status);
        json.put("createdAt", isoDate(startedAtMs));
        json.put("updatedAt", isoDate(System.currentTimeMillis()));
        json.put("updatedAtMs", System.currentTimeMillis());
        json.put("startedAtMs", startedAtMs);
        json.put("pausedDurationMs", pausedDurationMs);
        json.put("pauseStartedAtMs", pauseStartedAtMs);
        json.put("durationMs", durationMs());
        json.put("format", format);
        json.put("mimeType", "aac".equals(format) ? "audio/aac" : "audio/mp4");
        json.put("fileName", outputFile.getName());
        json.put("uri", Uri.fromFile(outputFile).toString());
        json.put("sizeBytes", outputFile.exists() ? outputFile.length() : 0L);
        json.put("recoverable", outputFile.exists() && outputFile.length() > 0L && "aac".equals(format));
        if (errorMessage != null) {
            json.put("error", errorMessage);
        }
        writeAtomic(manifestFile, json.toString());
        writeAtomic(new File(recordingsDirectory(), "active-state.json"), json.toString());
    }

    private void writeAtomic(File target, String content) throws Exception {
        File temporary = new File(target.getParentFile(), target.getName() + ".tmp");
        try (FileOutputStream stream = new FileOutputStream(temporary, false)) {
            stream.write(content.getBytes("UTF-8"));
            stream.flush();
            stream.getFD().sync();
        }
        Os.rename(temporary.getAbsolutePath(), target.getAbsolutePath());
    }

    private File recordingsDirectory() {
        return new File(getFilesDir(), "recordings");
    }

    private String isoDate(long timestamp) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(timestamp));
    }

    private void releaseMicrophoneLock() {
        CollectorMicrophoneLock lock = microphoneLock;
        microphoneLock = null;
        if (lock != null) lock.close();
    }

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            return;
        }
        PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
        if (powerManager == null) {
            return;
        }
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Collector:Recorder");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire();
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        wakeLock = null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < 26) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Înregistrare Collector",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Notificare persistentă cât timp Collector înregistrează audio.");
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification(String message) {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            this,
            4107,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent stopIntent = new Intent(this, CollectorRecordingService.class);
        stopIntent.setAction(ACTION_STOP);
        stopIntent.putExtra(EXTRA_ID, recordingId);
        PendingIntent stopPendingIntent = PendingIntent.getService(
            this,
            4108,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_collector)
            .setContentTitle("Collector · reportofon")
            .setContentText(message)
            .setContentIntent(contentIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .addAction(0, "Oprește", stopPendingIntent)
            .build();
    }

    private void updateNotification(String message) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, buildNotification(message));
        }
    }

    @Override
    public void onDestroy() {
        if (recorder != null) {
            recorder.setOnErrorListener(null);
            try {
                recorder.stop();
            } catch (RuntimeException ignored) {}
            try {
                recorder.reset();
                recorder.release();
            } catch (Exception ignored) {}
            recorder = null;
            status = "interrupted";
            try {
                persistManifest("Serviciul Android a fost întrerupt înainte de oprirea normală.");
            } catch (Exception ignored) {}
        }
        releaseWakeLock();
        releaseMicrophoneLock();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
