package com.collector.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.speech.RecognitionSupport;
import android.speech.RecognitionSupportCallback;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.List;
import java.util.Locale;

@CapacitorPlugin(name = "CollectorSpeech")
public final class CollectorSpeechPlugin extends Plugin {

    @PluginMethod
    public void getOfflineSupport(PluginCall call) {
        String language = call.getString("language", "ro-RO").trim();
        if (language.isEmpty() || language.length() > 35) {
            call.reject("Eticheta limbii nu este validă.");
            return;
        }

        if (Build.VERSION.SDK_INT < 31) {
            JSObject result = baseResult(language);
            result.put("status", "unsupported-api");
            result.put("onDeviceAvailable", false);
            result.put("languageStatus", "unknown");
            result.put("message", "Recunoașterea on-device necesită Android 12 (API 31) sau mai nou.");
            call.resolve(result);
            return;
        }


        boolean available = SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
        if (!available) {
            JSObject result = baseResult(language);
            result.put("status", "on-device-unavailable");
            result.put("onDeviceAvailable", false);
            result.put("languageStatus", "unknown");
            result.put("message", "Dispozitivul nu expune un serviciu de recunoaștere vocală on-device.");
            call.resolve(result);
            return;
        }

        if (getContext().checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            JSObject result = baseResult(language);
            result.put("status", "permission-required");
            result.put("onDeviceAvailable", true);
            result.put("languageStatus", "unknown");
            result.put("message", "Acordă permisiunea pentru microfon pentru a verifica disponibilitatea limbii. Nu am pornit microfonul.");
            call.resolve(result);
            return;
        }

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
