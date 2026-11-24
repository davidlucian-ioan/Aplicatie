package com.collector.app;

import android.Manifest;
import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "CollectorRecorder",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public final class CollectorRecorderPlugin extends Plugin {

    @PluginMethod
    public void startRecording(PluginCall call) {
        File activeStateFile = new File(recordingsDirectory(), "active-state.json");
        JSONObject existing = readActiveState();
        reconcileIfServiceStopped(existing);
        String status = existing.optString("status", "");
        boolean serviceRunning = isRecorderServiceRunning();
        if (isActiveStatus(status)) {
            call.reject("Există deja o înregistrare activă.");
            return;
        }
        if (serviceRunning) {
            call.reject("Serviciul reportofonului încă rulează. Așteaptă confirmarea opririi înainte de o nouă înregistrare.");
            return;
        }
        boolean knownInactive = "inactive".equals(status)
            || "complete".equals(status)
            || "interrupted".equals(status);
        if (!knownInactive && (existing.length() > 0 || activeStateFile.exists())) {
            call.reject("Nu pot confirma în siguranță starea reportofonului. Verifică înregistrările înainte de a porni alta.");
            return;
        }
        ensureMicrophonePermission(call);
    }

    private void ensureMicrophonePermission(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
            return;
        }
        ensureNotificationPermission(call);
    }

    @PermissionCallback
    public void microphonePermissionCallback(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("Permisiunea pentru microfon nu a fost acordată.");
            return;
        }
        ensureNotificationPermission(call);
    }

    private void ensureNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33
            && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
            return;
        }
        launchRecordingService(call);
    }

    @PermissionCallback
    public void notificationPermissionCallback(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33
            && getPermissionState("notifications") != PermissionState.GRANTED) {
            call.reject("Permisiunea pentru notificări este necesară pentru notificarea persistentă a reportofonului.");
            return;
        }
        launchRecordingService(call);
    }

    private void launchRecordingService(PluginCall call) {
        String id = java.util.UUID.randomUUID().toString();
        Intent intent = new Intent(getContext(), CollectorRecordingService.class);
        intent.setAction(CollectorRecordingService.ACTION_START);
        intent.putExtra(CollectorRecordingService.EXTRA_ID, id);
        intent.putExtra("bitRate", call.getInt("bitRate", 128000));
        intent.putExtra("sampleRate", call.getInt("sampleRate", 44100));
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                ContextCompat.startForegroundService(getContext(), intent);
            } else {
                getContext().startService(intent);
            }
            JSObject result = new JSObject();
            result.put("recordingId", id);
            result.put("status", "starting");
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Nu am putut porni serviciul nativ de înregistrare.", error);
        }
    }

    @PluginMethod
    public void pauseRecording(PluginCall call) {
        dispatch(call, CollectorRecordingService.ACTION_PAUSE);
    }

    @PluginMethod
    public void resumeRecording(PluginCall call) {
        dispatch(call, CollectorRecordingService.ACTION_RESUME);
    }

    @PluginMethod
    public void stopRecording(PluginCall call) {
        dispatch(call, CollectorRecordingService.ACTION_STOP);
    }

    private void dispatch(PluginCall call, String action) {
        String id = call.getString("recordingId");
        if (!validId(id)) {
            call.reject("Lipsește identificatorul înregistrării.");
            return;
        }
        JSONObject active = readActiveState();
        if (!id.equals(active.optString("id", "")) || !isActiveStatus(active.optString("status", ""))) {
            call.reject("Această înregistrare nu mai este activă.");
            return;
        }
        Intent intent = new Intent(getContext(), CollectorRecordingService.class);
        intent.setAction(action);
        intent.putExtra(CollectorRecordingService.EXTRA_ID, id);
        try {
            getContext().startService(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Nu am putut transmite comanda către serviciul audio.", error);
        }
    }

    @PluginMethod
    public void getRecordingState(PluginCall call) {
        File activeStateFile = new File(recordingsDirectory(), "active-state.json");
        JSONObject state = readActiveState();
        if (state.length() == 0) {
            JSObject unknown = new JSObject();
            if (activeStateFile.exists() || isRecorderServiceRunning()) {
                unknown.put("status", "unknown");
                unknown.put("error", "Starea reportofonului nu poate fi citită în siguranță.");
            } else {
                unknown.put("status", "inactive");
            }
            call.resolve(unknown);
            return;
        }
        reconcileIfServiceStopped(state);
        call.resolve(toJsObject(state));
    }

    @PluginMethod
    public void listRecordings(PluginCall call) {
        File directory = recordingsDirectory();
        if (!directory.exists()) {
            JSObject empty = new JSObject();
            empty.put("recordings", new JSArray());
            call.resolve(empty);
            return;
        }

        File[] files = directory.listFiles((dir, name) -> name.endsWith(".json") && !"active-state.json".equals(name));
        List<JSONObject> records = new ArrayList<>();
        if (files != null) {
            for (File file : files) {
                JSONObject record = readJson(file);
                if (record.length() == 0) {
                    continue;
                }
                reconcileIfServiceStopped(record);
                records.add(record);
            }
        }
        Collections.sort(records, (left, right) ->
            Long.compare(right.optLong("startedAtMs", 0L), left.optLong("startedAtMs", 0L))
        );

        JSArray array = new JSArray();
        for (JSONObject record : records) {
            array.put(toJsObject(record));
        }
        JSObject result = new JSObject();
        result.put("recordings", array);
        call.resolve(result);
    }

    @PluginMethod
    public void getRecording(PluginCall call) {
        String id = call.getString("recordingId");
        if (!validId(id)) {
            call.reject("Identificator de înregistrare invalid.");
            return;
        }
        JSONObject record = readJson(new File(recordingsDirectory(), id + ".json"));
        if (record.length() == 0) {
            call.reject("Înregistrarea nu există.");
            return;
        }
        reconcileIfServiceStopped(record);
        call.resolve(toJsObject(record));
    }

    @PluginMethod
    public void deleteRecording(PluginCall call) {
        String id = call.getString("recordingId");
        if (!validId(id)) {
            call.reject("Identificator de înregistrare invalid.");
            return;
        }
        JSONObject record = readJson(new File(recordingsDirectory(), id + ".json"));
        if (record.length() == 0) {
            call.reject("Înregistrarea nu există.");
            return;
        }
        if (isActiveStatus(record.optString("status", "")) && isRecorderServiceRunning()) {
            call.reject("Oprește înregistrarea înainte de ștergere.");
            return;
        }

        String fileName = record.optString("fileName", "");
        if (!fileName.isEmpty()) {
            File audio = new File(recordingsDirectory(), fileName);
            try {
                if (!audio.getCanonicalPath().startsWith(recordingsDirectory().getCanonicalPath() + File.separator)) {
                    call.reject("Calea fișierului audio nu este validă.");
                    return;
                }
            } catch (Exception error) {
                call.reject("Nu pot valida calea fișierului audio.", error);
                return;
            }
            if (audio.exists() && !audio.delete()) {
                call.reject("Nu am putut șterge fișierul audio.");
                return;
            }
        }

        File activeState = new File(recordingsDirectory(), "active-state.json");
        JSONObject current = readJson(activeState);
        if (id.equals(current.optString("id", "")) && activeState.exists() && !activeState.delete()) {
            call.reject("Fișierul audio a fost șters, dar starea activă nu a putut fi ștearsă.");
            return;
        }
        File manifest = new File(recordingsDirectory(), id + ".json");
        if (manifest.exists() && !manifest.delete()) {
            call.reject("Fișierul audio a fost șters, dar metadatele nu au putut fi șterse.");
            return;
        }
        call.resolve();
    }

    private JSONObject readActiveState() {
        return readJson(new File(recordingsDirectory(), "active-state.json"));
    }

    private File recordingsDirectory() {
        return new File(getContext().getFilesDir(), "recordings");
    }

    private JSONObject readJson(File file) {
        if (!file.exists()) {
            return new JSONObject();
        }
        try {
            try (FileInputStream input = new FileInputStream(file); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                }
                return new JSONObject(new String(output.toByteArray(), StandardCharsets.UTF_8));
            }
        } catch (Exception ignored) {
            return new JSONObject();
        }
    }

    private void reconcileIfServiceStopped(JSONObject state) {
        String status = state.optString("status", "inactive");
        if (!isActiveStatus(status) || isRecorderServiceRunning()) {
            return;
        }
        long lastUpdate = state.optLong("updatedAtMs", 0L);
        if (lastUpdate > 0L && System.currentTimeMillis() - lastUpdate < 8000L) {
            return;
        }
        long startedAt = state.optLong("startedAtMs", 0L);
        long pausedDuration = state.optLong("pausedDurationMs", 0L);
        long pauseStarted = state.optLong("pauseStartedAtMs", 0L);
        long end = "paused".equals(status) && pauseStarted > 0L ? pauseStarted : System.currentTimeMillis();
        state.remove("error");
        try {
            if (startedAt > 0L) {
                state.put("durationMs", Math.max(0L, end - startedAt - pausedDuration));
            }
            state.put("status", "interrupted");
            state.put("updatedAt", new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).format(new java.util.Date()));
            state.put("updatedAtMs", System.currentTimeMillis());
            String fileName = state.optString("fileName", "");
            File audio = fileName.isEmpty() ? null : new File(recordingsDirectory(), fileName);
            boolean exists = audio != null && audio.exists() && audio.length() > 0L;
            state.put("sizeBytes", exists ? audio.length() : 0L);
            state.put("recoverable", exists && "aac".equals(state.optString("format", "")));
            state.put("error", "Serviciul Android nu mai rulează. A fost păstrat fișierul parțial disponibil.");
            String id = state.optString("id", "");
            if (validId(id)) {
                writeJsonAtomic(new File(recordingsDirectory(), id + ".json"), state.toString());
            }
            writeJsonAtomic(new File(recordingsDirectory(), "active-state.json"), state.toString());
        } catch (Exception ignored) {
            // Keep the original metadata if reconciliation cannot be committed.
        }
    }

    private void writeJsonAtomic(File target, String value) throws Exception {
        File temporary = new File(target.getParentFile(), target.getName() + ".tmp");
        try (FileOutputStream output = new FileOutputStream(temporary, false)) {
            output.write(value.getBytes(StandardCharsets.UTF_8));
            output.flush();
            output.getFD().sync();
        }
        android.system.Os.rename(temporary.getAbsolutePath(), target.getAbsolutePath());
    }

    private boolean isRecorderServiceRunning() {
        ActivityManager manager = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        if (manager == null) {
            return false;
        }
        for (ActivityManager.RunningServiceInfo service : manager.getRunningServices(1000)) {
            if (CollectorRecordingService.class.getName().equals(service.service.getClassName())) {
                return true;
            }
        }
        return false;
    }

    private boolean isActiveStatus(String status) {
        return "starting".equals(status) || "recording".equals(status) || "paused".equals(status);
    }

    private boolean validId(String id) {
        return id != null && id.matches("[A-Za-z0-9-]{1,80}");
    }

    private JSObject toJsObject(JSONObject source) {
        JSObject result = new JSObject();
        String status = source.optString("status", "inactive");
        long startedAt = source.optLong("startedAtMs", 0L);
        long pausedDuration = source.optLong("pausedDurationMs", 0L);
        long pauseStarted = source.optLong("pauseStartedAtMs", 0L);
        if (startedAt > 0L && isActiveStatus(status)) {
            long end = "paused".equals(status) && pauseStarted > 0L ? pauseStarted : System.currentTimeMillis();
            try { source.put("durationMs", Math.max(0L, end - startedAt - pausedDuration)); } catch (Exception ignored) {}
        }
        JSONArray names = source.names();
        if (names == null) {
            return result;
        }
        for (int index = 0; index < names.length(); index++) {
            String key = names.optString(index);
            Object value = source.opt(key);
            if (value != null && value != JSONObject.NULL) {
                result.put(key, value);
            }
        }
        return result;
    }
}
