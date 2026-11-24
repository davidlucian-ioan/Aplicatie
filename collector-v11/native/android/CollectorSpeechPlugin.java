package com.collector.app;

import android.Manifest;
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
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@CapacitorPlugin(
    name = "CollectorSpeech",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public final class CollectorSpeechPlugin extends Plugin {

    private final Handler speechHandler = new Handler(Looper.getMainLooper());
    private SpeechRecognizer activeRecognizer;
    private boolean speechSessionActive = false;
    private boolean speechStopRequested = false;
    private boolean speechContinuous = true;
    private String speechSessionId = null;
    private String speechLanguage = "ro-RO";
    private int speechSegmentIndex = 0;
    private int speechRetryCount = 0;
    private long speechSessionStartedAtMs = 0L;
    private long speechSegmentStartedAtMs = 0L;
    private long speechSegmentStartedElapsedMs = 0L;
    private long speechSegmentEndedAtMs = 0L;
    private long speechSegmentEndedElapsedMs = 0L;


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


    @PluginMethod
    public void startListening(PluginCall call) {
        String language = call.getString("language", "ro-RO").trim();
        boolean continuous = call.getBoolean("continuous", true);
        if (language.isEmpty() || language.length() > 35) {
            call.reject("Eticheta limbii nu este validă.");
            return;
        }
        if (Build.VERSION.SDK_INT < 31) {
            call.reject("Transcrierea on-device necesită Android 12 (API 31) sau mai nou.");
            return;
        }
        if (!SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext())) {
            call.reject("Dispozitivul nu oferă un recognizer on-device. Nu folosesc recunoaștere cloud ca fallback.");
            return;
        }
        if (speechSessionActive) {
            call.reject("Există deja o sesiune de transcriere activă.");
            return;
        }
        if (CollectorMicrophoneArbiter.isRecorderBusy(getContext())) {
            call.reject("Reportofonul Android folosește microfonul. Oprește înregistrarea înainte de transcriere.");
            return;
        }
        call.getData().put("collectorSpeechLanguage", language);
        call.getData().put("collectorSpeechContinuous", continuous);
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "speechMicrophonePermissionCallback");
            return;
        }
        checkLanguageAndStart(call, language, continuous);
    }

    @PermissionCallback
    public void speechMicrophonePermissionCallback(PluginCall call) {
        String language = call.getString("collectorSpeechLanguage", "ro-RO");
        boolean continuous = call.getBoolean("collectorSpeechContinuous", true);
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("Permisiunea pentru microfon nu a fost acordată. Nu am pornit capturarea.");
            return;
        }
        checkLanguageAndStart(call, language, continuous);
    }

    private void checkLanguageAndStart(PluginCall call, String language, boolean continuous) {
        if (Build.VERSION.SDK_INT < 33) {
            startOnDeviceSession(call, language, continuous);
            return;
        }
        SpeechRecognizer probe = null;
        try {
            probe = SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
            Intent intent = speechIntent(language);
            SpeechRecognizer finalProbe = probe;
            probe.checkRecognitionSupport(intent, getContext().getMainExecutor(), new RecognitionSupportCallback() {
                @Override
                public void onSupportResult(RecognitionSupport support) {
                    try {
                        if (!containsLanguage(support.getInstalledOnDeviceLanguages(), language)) {
                            call.reject("Modelul on-device pentru " + language + " nu este instalat. Nu pornesc recunoașterea și nu descarc automat modelul.");
                            return;
                        }
                    } finally {
                        finalProbe.destroy();
                    }
                    startOnDeviceSession(call, language, continuous);
                }

                @Override
                public void onError(int error) {
                    try {
                        call.reject("Nu am putut confirma instalarea modelului on-device pentru " + language + ". Cod Android: " + error);
                    } finally {
                        finalProbe.destroy();
                    }
                }
            });
        } catch (Exception error) {
            if (probe != null) {
                try { probe.destroy(); } catch (Exception ignored) {}
            }
            call.reject("Nu am putut verifica modelul local de recunoaștere.", error);
        }
    }

    private void startOnDeviceSession(PluginCall call, String language, boolean continuous) {
        if (CollectorMicrophoneArbiter.isRecorderBusy(getContext())) {
            call.reject("Reportofonul Android folosește microfonul. Oprește înregistrarea înainte de transcriere.");
            return;
        }
        if (!CollectorMicrophoneArbiter.tryAcquire("speech")) {
            call.reject("Microfonul este deja rezervat de o altă operație Collector.");
            return;
        }
        try {
            activeRecognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
            activeRecognizer.setRecognitionListener(recognitionListener);
            speechSessionId = UUID.randomUUID().toString();
            speechLanguage = language;
            speechContinuous = continuous;
            speechSessionActive = true;
            speechStopRequested = false;
            speechRetryCount = 0;
            speechSegmentIndex = 0;
            speechSessionStartedAtMs = System.currentTimeMillis();
            startRecognizerSegment();
            JSObject result = new JSObject();
            result.put("status", "starting");
            result.put("sessionId", speechSessionId);
            result.put("language", speechLanguage);
            result.put("provider", "android-speech-recognizer-on-device");
            result.put("audioUploaded", false);
            result.put("continuous", speechContinuous);
            call.resolve(result);
        } catch (Exception error) {
            finishSpeechSession("start-error");
            call.reject("Nu am putut porni recognizerul on-device.", error);
        }
    }

    private Intent speechIntent(String language) {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
        return intent;
    }

    private void startRecognizerSegment() {
        if (!speechSessionActive || speechStopRequested || activeRecognizer == null) return;
        try {
            speechSegmentStartedAtMs = System.currentTimeMillis();
            speechSegmentStartedElapsedMs = SystemClock.elapsedRealtime();
            speechSegmentEndedAtMs = 0L;
            speechSegmentEndedElapsedMs = 0L;
            activeRecognizer.startListening(speechIntent(speechLanguage));
        } catch (Exception error) {
            notifySpeechError(-1, error.getMessage());
            finishSpeechSession("start-error");
        }
    }

    private final RecognitionListener recognitionListener = new RecognitionListener() {
        @Override public void onReadyForSpeech(Bundle params) {
            speechSegmentStartedAtMs = System.currentTimeMillis();
            speechSegmentStartedElapsedMs = SystemClock.elapsedRealtime();
            JSObject event = speechEventBase();
            event.put("segmentIndex", speechSegmentIndex);
            notifyListeners("speechReady", event);
        }

        @Override public void onBeginningOfSpeech() {
            if (speechSegmentStartedElapsedMs == 0L) {
                speechSegmentStartedAtMs = System.currentTimeMillis();
                speechSegmentStartedElapsedMs = SystemClock.elapsedRealtime();
            }
        }

        @Override public void onEndOfSpeech() {
            speechSegmentEndedAtMs = System.currentTimeMillis();
            speechSegmentEndedElapsedMs = SystemClock.elapsedRealtime();
        }

        @Override public void onResults(Bundle results) {
            String text = firstTranscript(results);
            if (!text.isEmpty()) {
                if (speechSegmentEndedAtMs == 0L) {
                    speechSegmentEndedAtMs = System.currentTimeMillis();
                    speechSegmentEndedElapsedMs = SystemClock.elapsedRealtime();
                }
                JSObject event = speechEventBase();
                event.put("segmentIndex", speechSegmentIndex++);
                event.put("text", text);
                event.put("isFinal", true);
                event.put("confidence", firstConfidence(results));
                event.put("segmentStartAtMs", speechSegmentStartedAtMs);
                event.put("segmentEndAtMs", speechSegmentEndedAtMs);
                event.put("segmentStartElapsedMs", speechSegmentStartedElapsedMs);
                event.put("segmentEndElapsedMs", speechSegmentEndedElapsedMs);
                notifyListeners("speechResult", event);
            }
            speechRetryCount = 0;
            if (speechStopRequested || !speechContinuous) {
                finishSpeechSession("completed");
            } else {
                speechHandler.postDelayed(() -> startRecognizerSegment(), 250L);
            }
        }

        @Override public void onPartialResults(Bundle results) {
            String text = firstTranscript(results);
            if (text.isEmpty()) return;
            JSObject event = speechEventBase();
            event.put("segmentIndex", speechSegmentIndex);
            event.put("text", text);
            event.put("isFinal", false);
            event.put("confidence", firstConfidence(results));
            notifyListeners("speechPartial", event);
        }

        @Override public void onError(int error) {
            notifySpeechError(error, "Android SpeechRecognizer error " + error);
            if (speechStopRequested) {
                finishSpeechSession("stopped");
                return;
            }
            if ((error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT)
                && speechContinuous && speechRetryCount < 2) {
                speechRetryCount++;
                speechHandler.postDelayed(() -> startRecognizerSegment(), 350L);
                return;
            }
            finishSpeechSession("error");
        }

        @Override public void onRmsChanged(float rmsdB) {}
        @Override public void onBufferReceived(byte[] buffer) {}
        @Override public void onEvent(int eventType, Bundle params) {}
    };

    private String firstTranscript(Bundle results) {
        if (results == null) return "";
        List<String> values = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return values == null || values.isEmpty() || values.get(0) == null ? "" : values.get(0).trim();
    }

    private Double firstConfidence(Bundle results) {
        if (results == null) return null;
        float[] scores = results.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES);
        if (scores == null || scores.length == 0 || scores[0] < 0f || scores[0] > 1f) return null;
        return (double) scores[0];
    }

    private JSObject speechEventBase() {
        JSObject event = new JSObject();
        event.put("sessionId", speechSessionId);
        event.put("language", speechLanguage);
        event.put("source", "android-on-device");
        event.put("sessionStartedAtMs", speechSessionStartedAtMs);
        return event;
    }

    private void notifySpeechError(int code, String message) {
        JSObject event = speechEventBase();
        event.put("code", code);
        event.put("message", message == null ? "Eroare de recunoaștere." : message);
        notifyListeners("speechError", event);
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        if (!speechSessionActive || activeRecognizer == null) {
            call.resolve(new JSObject());
            return;
        }
        speechStopRequested = true;
        try {
            activeRecognizer.stopListening();
            speechHandler.postDelayed(() -> {
                if (speechSessionActive) finishSpeechSession("stop-timeout");
            }, 5000L);
            JSObject result = new JSObject();
            result.put("status", "stopping");
            result.put("sessionId", speechSessionId);
            call.resolve(result);
        } catch (Exception error) {
            finishSpeechSession("stop-error");
            call.reject("Nu am putut opri transcrierea.", error);
        }
    }

    @PluginMethod
    public void cancelListening(PluginCall call) {
        finishSpeechSession("cancelled");
        JSObject result = new JSObject();
        result.put("status", "cancelled");
        call.resolve(result);
    }

    private void finishSpeechSession(String reason) {
        if (!speechSessionActive && activeRecognizer == null) return;
        String finishedId = speechSessionId;
        int segmentCount = speechSegmentIndex;
        speechSessionActive = false;
        speechStopRequested = true;
        speechHandler.removeCallbacksAndMessages(null);
        SpeechRecognizer recognizer = activeRecognizer;
        activeRecognizer = null;
        if (recognizer != null) {
            try { recognizer.cancel(); } catch (Exception ignored) {}
            try { recognizer.destroy(); } catch (Exception ignored) {}
        }
        CollectorMicrophoneArbiter.release("speech");
        JSObject event = new JSObject();
        event.put("sessionId", finishedId);
        event.put("reason", reason);
        event.put("segmentCount", segmentCount);
        event.put("endedAtMs", System.currentTimeMillis());
        notifyListeners("speechEnd", event);
        speechSessionId = null;
    }

    @Override
    protected void handleOnDestroy() {
        finishSpeechSession("plugin-destroyed");
        super.handleOnDestroy();
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
