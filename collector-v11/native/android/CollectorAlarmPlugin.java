package com.collector.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "CollectorAlarms", permissions = {
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
})
public final class CollectorAlarmPlugin extends Plugin {
    private static final String PREFS = "collector_alarms";
    private static final String KEY = "items";

    @PluginMethod
    public void schedule(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
            return;
        }
        scheduleGranted(call);
    }

    @PermissionCallback
    public void notificationPermissionCallback(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            call.reject("Permisiunea pentru notificări este necesară pentru alarme.");
            return;
        }
        scheduleGranted(call);
    }

    private void scheduleGranted(PluginCall call) {
        String title = call.getString("title", "Reminder Collector").trim();
        long at = call.getLong("triggerAtMs", 0L);
        if (title.isEmpty() || title.length() > 120 || at <= System.currentTimeMillis()) {
            call.reject("Titlul sau momentul alarmei nu este valid.");
            return;
        }
        String id = UUID.randomUUID().toString();
        try {
            JSONObject item = new JSONObject();
            item.put("id", id);
            item.put("title", title);
            item.put("triggerAtMs", at);
            JSONArray all = readAll();
            all.put(item);
            writeAll(all);
            scheduleNative(item);
            JSObject result = new JSObject();
            result.put("id", id);
            result.put("title", title);
            result.put("triggerAtMs", at);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Nu am putut programa alarma locală.", error);
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String id = call.getString("id");
        if (id == null || !id.matches("[A-Za-z0-9-]{1,80}")) {
            call.reject("Identificator de alarmă invalid.");
            return;
        }
        try {
            cancelNative(id);
            JSONArray source = readAll();
            JSONArray next = new JSONArray();
            for (int i = 0; i < source.length(); i++) {
                JSONObject item = source.optJSONObject(i);
                if (item != null && !id.equals(item.optString("id"))) next.put(item);
            }
            writeAll(next);
            call.resolve();
        } catch (Exception error) {
            call.reject("Nu am putut anula alarma.", error);
        }
    }

    @PluginMethod
    public void list(PluginCall call) {
        try {
            JSONArray source = readAll();
            JSArray items = new JSArray();
            for (int i = 0; i < source.length(); i++) {
                JSONObject item = source.optJSONObject(i);
                if (item == null) continue;
                if (item.optLong("triggerAtMs", 0L) <= System.currentTimeMillis()) continue;
                JSObject row = new JSObject();
                row.put("id", item.optString("id"));
                row.put("title", item.optString("title"));
                row.put("triggerAtMs", item.optLong("triggerAtMs"));
                items.put(row);
            }
            JSObject result = new JSObject();
            result.put("alarms", items);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Nu am putut citi alarmele locale.", error);
        }
    }

    static void rescheduleAll(Context context) {
        try {
            JSONArray all = new JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]"));
            for (int i = 0; i < all.length(); i++) {
                JSONObject item = all.optJSONObject(i);
                if (item != null && item.optLong("triggerAtMs", 0L) > System.currentTimeMillis()) {
                    scheduleNative(context, item);
                }
            }
        } catch (Exception ignored) {}
    }

    private JSONArray readAll() throws Exception {
        return new JSONArray(getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]"));
    }

    private void writeAll(JSONArray value) {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, value.toString()).apply();
    }

    private void scheduleNative(JSONObject item) throws Exception {
        scheduleNative(getContext(), item);
    }

    private static void scheduleNative(Context context, JSONObject item) throws Exception {
        String id = item.getString("id");
        Intent intent = new Intent(context, CollectorAlarmReceiver.class);
        intent.setAction(CollectorAlarmReceiver.ACTION_FIRE);
        intent.putExtra("id", id);
        intent.putExtra("title", item.optString("title", "Reminder Collector"));
        PendingIntent pending = PendingIntent.getBroadcast(context, id.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) throw new IllegalStateException("AlarmManager indisponibil.");
        manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, item.getLong("triggerAtMs"), pending);
    }

    private void cancelNative(String id) {
        Intent intent = new Intent(getContext(), CollectorAlarmReceiver.class);
        intent.setAction(CollectorAlarmReceiver.ACTION_FIRE);
        PendingIntent pending = PendingIntent.getBroadcast(getContext(), id.hashCode(), intent,
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        if (pending != null) {
            AlarmManager manager = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            if (manager != null) manager.cancel(pending);
            pending.cancel();
        }
    }
}
