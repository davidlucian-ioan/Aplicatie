package com.collector.app;

import android.Manifest;
import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.speech.RecognitionListener;
import android.speech.RecognitionSupport;
import android.speech.RecognitionSupportCallback;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
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
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "CollectorSpeech",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public final class CollectorSpeechPlugin extends Plugin {

    private final Handler speechHandler = new Handler(Looper.getMainLooper());
    private SpeechRecognizer activeRecognizer;
    private CollectorMicrophoneLock microphoneLock;
    private String activeSessionId;
    private String activeLanguage = "ro-RO";
    private boolean activeContinuous;
    private boolean speechStopping;
    private long sessionStartedAtMs;
    private long sessionStartedElapsedMs;
    private long utteranceStartedElapsedMs;
    private static final long RESTART_DELAY_MS = 300L;
    private static final long STOP_TIMEOUT_MS = 2200L;

    @PluginMethod
    public void getOfflineSupport(PluginCall call) {
        String language = call.getString("language", "ro-RO").trim();
        if (language.isEmpty() || language.length() > 35) {
            call.reject("Eticheta limbii nu este validă.");
            return;
        }

        // The user explicitly tapped the diagnostic control. Store only the requested
        // locale while Capacitor presents its standard Android permission prompt.
        call.getData().put("collectorLanguage", language);
        if (Build.VERSION.SDK_INT < 31) {
            resolveUnsupportedApi(call, language);
            return;
        }

        if (!SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext())) {
            JSObject result = baseResult(language);
            result.put("status", "on-device-unavailable");
            result.put("onDeviceAvailable", false);
            result.put("languageStatus", "unknown");
            result.put("message", "Dispozitivul nu expune un serviciu de recunoaștere vocală on-device.");
            call.resolve(result);
            return;
        }

        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
            return;
        }
        checkLanguageSupport(call, language);
    }

    @PermissionCallback
    public void microphonePermissionCallback(PluginCall call) {
        String language = call.getString("collectorLanguage", "ro-RO");
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            JSObject result = baseResult(language);
            result.put("status", "permission-required");
            result.put("onDeviceAvailable", true);
            result.put("languageStatus", "unknown");
            result.put("message", "Permisiunea pentru microfon nu a fost acordată. Nu am pornit microfonul și nu am capturat audio.");
            call.resolve(result);
            return;
        }
        checkLanguageSupport(call, language);
    }

    private void resolveUnsupportedApi(PluginCall call, String language) {
        JSObject result = baseResult(language);
        result.put("status", "unsupported-api");
        result.put("onDeviceAvailable", false);
        result.put("languageStatus", "unknown");
        result.put("message", "Recunoașterea on-device necesită Android 12 (API 31) sau mai nou.");
        call.resolve(result);
    }

    private void checkLanguageSupport(PluginCall call, String language) {
        if (Build.VERSION.SDK_INT < 33) {
            JSObject result = baseResult(language);
            result.put("status", "language-unverified");
            result.put("onDeviceAvailable", true);
            result.put("languageStatus", "unknown");
            result.put("supportCheckAvailable", false);
            result.put("message", "Serviciul on-device există, dar această versiune Android nu expune lista limbilor instalate. Limba română trebuie verificată printr-un test real pe dispozitiv.");
            call.resolve(result);
            return;
        }

        SpeechRecognizer recognizer = null;
        try {
            recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
            SpeechRecognizer finalRecognizer = recognizer;
            recognizer.checkRecognitionSupport(intent, getContext().getMainExecutor(), new RecognitionSupportCallback() {
                @Override
                public void onSupportResult(RecognitionSupport support) {
                    try {
                        List<String> installed = support.getInstalledOnDeviceLanguages();
                        List<String> supported = support.getSupportedOnDeviceLanguages();
                        List<String> pending = support.getPendingOnDeviceLanguages();
                        String languageStatus = containsLanguage(installed, language) ? "installed"
                            : containsLanguage(pending, language) ? "pending"
                            : containsLanguage(supported, language) ? "downloadable"
                            : "unsupported";
                        JSObject result = baseResult(language);
                        result.put("status", "checked");
                        result.put("onDeviceAvailable", true);
                        result.put("supportCheckAvailable", true);
                        result.put("languageStatus", languageStatus);
                        result.put("installedLanguages", toArray(installed));
                        result.put("supportedOnDeviceLanguages", toArray(supported));
                        result.put("pendingOnDeviceLanguages", toArray(pending));
                        result.put("message", messageFor(languageStatus, language));
                        call.resolve(result);
                    } finally {
                        finalRecognizer.destroy();
                    }
                }

                @Override
                public void onError(int error) {
                    try {
                        JSObject result = baseResult(language);
                        result.put("status", "support-check-error");
                        result.put("onDeviceAvailable", true);
                        result.put("supportCheckAvailable", true);
                        result.put("languageStatus", "unknown");
                        result.put("supportErrorCode", error);
                        result.put("message", "Android nu a putut verifica suportul local pentru limba solicitată.");
                        call.resolve(result);
                    } finally {
                        finalRecognizer.destroy();
                    }
                }
            });
        } catch (Exception error) {
            if (recognizer != null) {
                try { recognizer.destroy(); } catch (Exception ignored) {}
            }
            call.reject("Nu am putut verifica suportul STT on-device.", error);
        }
    }

    @PluginMethod
    public void startListening(PluginCall call) {
        String language = call.getString("language", "ro-RO").trim();
        boolean continuous = call.getBoolean("continuous", true);
        if (!"ro-RO".equalsIgnoreCase(language)) {
            call.reject("În această versiune este acceptată numai recunoașterea locală în limba română (ro-RO).");
            return;
        }
        if (Build.VERSION.SDK_INT < 31 || !SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext())) {
            call.reject("Recunoașterea vocală on-device nu este disponibilă pe acest dispozitiv. Nu există fallback cloud.");
            return;
        }
        if (isRecorderBusy()) {
            call.reject("Reportofonul folosește sau poate folosi microfonul. Oprește înregistrarea înainte de transcriere.");
            return;
        }
        if (activeRecognizer != null || activeSessionId != null) {
            call.reject("Există deja o sesiune de transcriere activă.");
            return;
        }
        call.getData().put("collectorSpeechLanguage", language);
        call.getData().put("collectorSpeechContinuous", continuous);
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "speechMicrophonePermissionCallback");
            return;
        }
        startListeningAfterPermission(call, language, continuous);
    }

    @PermissionCallback
    public void speechMicrophonePermissionCallback(PluginCall call) {
        String language = call.getString("collectorSpeechLanguage", "ro-RO");
        boolean continuous = call.getBoolean("collectorSpeechContinuous", true);
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("Permisiunea pentru microfon nu a fost acordată. Nu am pornit transcrierea.");
            return;
        }
        startListeningAfterPermission(call, language, continuous);
    }

    private void startListeningAfterPermission(PluginCall call, String language, boolean continuous) {
        if (isRecorderBusy()) {
            call.reject("Reportofonul folosește sau poate folosi microfonul. Oprește înregistrarea înainte de transcriere.");
            return;
        }
        if (activeRecognizer != null || activeSessionId != null) {
            call.reject("Există deja o sesiune de transcriere activă.");
            return;
        }
        SpeechRecognizer recognizer = null;
        try {
            activeSessionId = java.util.UUID.randomUUID().toString();
            microphoneLock = CollectorMicrophoneLock.tryAcquire(getContext(), "speech:" + activeSessionId);
            if (microphoneLock == null) {
                activeSessionId = null;
                call.reject("Microfonul este deja folosit de reportofon sau de altă sesiune Collector.");
                return;
            }
            recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
            activeRecognizer = recognizer;
            activeLanguage = language;
            activeContinuous = continuous;
            speechStopping = false;
            sessionStartedAtMs = System.currentTimeMillis();
            sessionStartedElapsedMs = SystemClock.elapsedRealtime();
            utteranceStartedElapsedMs = 0L;
            recognizer.setRecognitionListener(createRecognitionListener());
            Intent intent = recognitionIntent();
            recognizer.startListening(intent);

            JSObject result = new JSObject();
            result.put("sessionId", activeSessionId);
            result.put("status", "listening");
            result.put("language", activeLanguage);
            result.put("provider", "android-speech-recognizer-on-device");
            result.put("continuous", activeContinuous);
            result.put("startedAt", sessionStartedAtMs);
            result.put("audioUploaded", false);
            call.resolve(result);
            notifySpeechState("listening", "Transcriere on-device activă. Audio nu este trimis în cloud.");
        } catch (Exception error) {
            destroyRecognizer();
            call.reject("Nu am putut porni recunoașterea vocală on-device.", error);
        }
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        String requestedId = call.getString("sessionId");
        if (activeRecognizer == null || activeSessionId == null ||
            (requestedId != null && !activeSessionId.equals(requestedId))) {
            call.reject("Nu există o sesiune de transcriere activă pentru acest identificator.");
            return;
        }
        speechStopping = true;
        try {
            activeRecognizer.stopListening();
            speechHandler.removeCallbacks(stopTimeout);
            speechHandler.postDelayed(stopTimeout, STOP_TIMEOUT_MS);
            call.resolve();
        } catch (Exception error) {
            finishSpeechSession("stopped", "Sesiunea a fost oprită; ultimul segment poate fi incomplet.");
            call.reject("Nu am putut opri elegant recunoașterea vocală.", error);
        }
    }

    @PluginMethod
    public void cancelListening(PluginCall call) {
        String requestedId = call.getString("sessionId");
        if (activeRecognizer == null || activeSessionId == null ||
            (requestedId != null && !activeSessionId.equals(requestedId))) {
            call.resolve();
            return;
        }
        try { activeRecognizer.cancel(); } catch (Exception ignored) {}
        finishSpeechSession("cancelled", "Sesiunea de transcriere a fost anulată.");
        call.resolve();
    }

    private final Runnable stopTimeout = () ->
        finishSpeechSession("stopped", "Transcriere oprită.");

    private Intent recognitionIntent() {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, activeLanguage);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, activeLanguage);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
        return intent;
    }

    private RecognitionListener createRecognitionListener() {
        return new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) {
                notifySpeechState("listening", "Microfonul este pregătit pentru recunoaștere locală.");
            }

            @Override public void onBeginningOfSpeech() {
                utteranceStartedElapsedMs = SystemClock.elapsedRealtime();
            }

            @Override public void onRmsChanged(float rmsdB) {}
            @Override public void onBufferReceived(byte[] buffer) {}
            @Override public void onEndOfSpeech() {}

            @Override public void onError(int error) {
                if (activeRecognizer == null) return;
                if (speechStopping) {
                    finishSpeechSession("stopped", "Transcriere oprită.");
                    return;
                }
                if (activeContinuous &&
                    (error == SpeechRecognizer.ERROR_NO_MATCH ||
                     error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT)) {
                    scheduleRecognitionRestart();
                    return;
                }
                JSObject event = speechEventBase();
                event.put("errorCode", error);
                event.put("message", "Recunoașterea on-device s-a întrerupt (cod Android " + error + ").");
                notifyListeners("speechError", event);
                finishSpeechSession("error", "Recunoașterea on-device s-a întrerupt. Nu a fost folosit un serviciu cloud.");
            }

            @Override public void onResults(Bundle results) {
                if (activeRecognizer == null) return;
                emitFinalResult(results);
                if (speechStopping || !activeContinuous) {
                    finishSpeechSession("stopped", "Transcriere încheiată.");
                } else {
                    scheduleRecognitionRestart();
                }
            }

            @Override public void onPartialResults(Bundle partialResults) {
                if (activeRecognizer == null) return;
                ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (matches == null || matches.isEmpty()) return;
                if (utteranceStartedElapsedMs == 0L) utteranceStartedElapsedMs = SystemClock.elapsedRealtime();
                JSObject event = speechEventBase();
                event.put("text", matches.get(0));
                event.put("offsetMs", Math.max(0L, utteranceStartedElapsedMs - sessionStartedElapsedMs));
                event.put("receivedAt", System.currentTimeMillis());
                notifyListeners("speechPartial", event);
            }

            @Override public void onEvent(int eventType, Bundle params) {}
        };
    }

    private void emitFinalResult(Bundle results) {
        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (matches == null || matches.isEmpty()) return;
        String text = matches.get(0) == null ? "" : matches.get(0).trim();
        if (text.isEmpty()) return;
        long endElapsed = SystemClock.elapsedRealtime();
        long startElapsed = utteranceStartedElapsedMs > 0L ? utteranceStartedElapsedMs : endElapsed;
        float confidence = -1f;
        float[] scores = results.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES);
        if (scores != null && scores.length > 0) confidence = scores[0];
        JSObject event = speechEventBase();
        event.put("segmentId", java.util.UUID.randomUUID().toString());
        event.put("text", text);
        event.put("startOffsetMs", Math.max(0L, startElapsed - sessionStartedElapsedMs));
        event.put("endOffsetMs", Math.max(0L, endElapsed - sessionStartedElapsedMs));
        event.put("startedAt", sessionStartedAtMs + Math.max(0L, startElapsed - sessionStartedElapsedMs));
        event.put("endedAt", System.currentTimeMillis());
        event.put("confidence", confidence);
        event.put("final", true);
        notifyListeners("speechSegment", event);
        utteranceStartedElapsedMs = 0L;
    }

    private void scheduleRecognitionRestart() {
        speechHandler.removeCallbacks(restartRecognition);
        speechHandler.postDelayed(restartRecognition, RESTART_DELAY_MS);
    }

    private final Runnable restartRecognition = () -> {
        if (activeRecognizer == null || speechStopping) return;
        if (isRecorderBusy()) {
            JSObject event = speechEventBase();
            event.put("message", "Reportofonul a preluat microfonul. Transcrierea a fost oprită pentru a evita captură concurentă.");
            notifyListeners("speechError", event);
            finishSpeechSession("error", "Microfonul a fost revendicat de reportofon.");
            return;
        }
        try {
            utteranceStartedElapsedMs = 0L;
            activeRecognizer.startListening(recognitionIntent());
        } catch (Exception error) {
            JSObject event = speechEventBase();
            event.put("message", "Nu am putut relua recunoașterea on-device: " + error.getMessage());
            notifyListeners("speechError", event);
            finishSpeechSession("error", "Recunoașterea locală nu a putut fi reluată.");
        }
    };

    private void finishSpeechSession(String status, String message) {
        if (activeSessionId == null) return;
        speechHandler.removeCallbacks(restartRecognition);
        speechHandler.removeCallbacks(stopTimeout);
        JSObject event = speechEventBase();
        event.put("status", status);
        event.put("message", message);
        event.put("endedAt", System.currentTimeMillis());
        event.put("durationMs", Math.max(0L, SystemClock.elapsedRealtime() - sessionStartedElapsedMs));
        destroyRecognizer();
        notifyListeners("speechState", event);
    }

    private void destroyRecognizer() {
        speechHandler.removeCallbacks(restartRecognition);
        speechHandler.removeCallbacks(stopTimeout);
        SpeechRecognizer recognizer = activeRecognizer;
        activeRecognizer = null;
        activeSessionId = null;
        speechStopping = false;
        utteranceStartedElapsedMs = 0L;
        if (recognizer != null) {
            try { recognizer.cancel(); } catch (Exception ignored) {}
            try { recognizer.destroy(); } catch (Exception ignored) {}
        }
        CollectorMicrophoneLock lock = microphoneLock;
        microphoneLock = null;
        if (lock != null) lock.close();
    }

    private JSObject speechEventBase() {
        JSObject event = new JSObject();
        event.put("sessionId", activeSessionId);
        event.put("language", activeLanguage);
        event.put("provider", "android-speech-recognizer-on-device");
        event.put("audioUploaded", false);
        return event;
    }

    private void notifySpeechState(String status, String message) {
        JSObject event = speechEventBase();
        event.put("status", status);
        event.put("message", message);
        notifyListeners("speechState", event);
    }

    private boolean isRecorderBusy() {
        File activeFile = new File(getContext().getFilesDir(), "recordings/active-state.json");
        if (activeFile.exists()) {
            try (FileInputStream input = new FileInputStream(activeFile);
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[1024];
                int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                JSONObject state = new JSONObject(new String(output.toByteArray(), StandardCharsets.UTF_8));
                String status = state.optString("status", "unknown");
                if ("starting".equals(status) || "recording".equals(status) || "paused".equals(status)) return true;
                if (!("inactive".equals(status) || "complete".equals(status) || "interrupted".equals(status))) return true;
            } catch (Exception error) {
                return true; // Fail closed if recorder ownership cannot be established.
            }
        }
        ActivityManager manager = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        if (manager != null) {
            for (ActivityManager.RunningServiceInfo service : manager.getRunningServices(1000)) {
                if (CollectorRecordingService.class.getName().equals(service.service.getClassName())) return true;
            }
        }
        return false;
    }

    private JSObject baseResult(String language) {
        JSObject result = new JSObject();
        result.put("provider", "android-speech-recognizer-on-device");
        result.put("language", language);
        result.put("apiLevel", Build.VERSION.SDK_INT);
        result.put("audioCaptured", false);
        result.put("audioUploaded", false);
        return result;
    }

    private JSArray toArray(List<String> values) {
        JSArray array = new JSArray();
        if (values != null) {
            for (String value : values) array.put(value);
        }
        return array;
    }

    private boolean containsLanguage(List<String> values, String requested) {
        if (values == null) return false;
        String wanted = Locale.forLanguageTag(requested).getLanguage();
        for (String value : values) {
            if (wanted.equalsIgnoreCase(Locale.forLanguageTag(value).getLanguage())) return true;
        }
        return false;
    }

    private String messageFor(String status, String language) {
        switch (status) {
            case "installed":
                return "Modelul on-device pentru " + language + " este instalat. Recunoașterea reală trebuie încă testată pe dispozitiv.";
            case "downloadable":
                return "Limba " + language + " este suportată on-device, dar modelul nu este instalat. Descărcarea trebuie pornită separat, la cererea utilizatorului.";
            case "pending":
                return "Descărcarea modelului on-device pentru " + language + " este în așteptare.";
            default:
                return "Serviciul on-device nu raportează suport pentru limba " + language + ".";
        }
    }
}
