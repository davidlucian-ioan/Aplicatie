package com.collector.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;

public final class CollectorAlarmReceiver extends BroadcastReceiver {
    static final String ACTION_FIRE = "com.collector.app.alarm.FIRE";
    static final String ACTION_SNOOZE = "com.collector.app.alarm.SNOOZE";
    private static final String CHANNEL = "collector-reminders";
    private static final String PREFS = "collector_alarms";
    private static final String KEY = "items";

    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String id = intent.getStringExtra("id");
        String title = intent.getStringExtra("title");
        if (id == null || id.isEmpty()) return;
        if (ACTION_SNOOZE.equals(intent.getAction())) {
            try {
                JSONObject item = new JSONObject();
                item.put("id", id);
                item.put("title", title == null ? "Reminder Collector" : title);
                item.put("triggerAtMs", System.currentTimeMillis() + 10L * 60L * 1000L);
                Intent next = new Intent(context, CollectorAlarmReceiver.class);
                next.setAction(ACTION_FIRE);
                next.putExtra("id", id);
                next.putExtra("title", item.optString("title"));
                PendingIntent pending = PendingIntent.getBroadcast(context, id.hashCode(), next,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
                if (manager != null) manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, item.getLong("triggerAtMs"), pending);
                upsert(context, item);
                return;
            } catch (Exception ignored) { return; }
        }
        remove(context, id);
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Remindere Collector", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Alarme locale și remindere pentru activități.");
            manager.createNotificationChannel(channel);
        }
        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent openPending = open == null ? null : PendingIntent.getActivity(context, 7001, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent snooze = new Intent(context, CollectorAlarmReceiver.class);
        snooze.setAction(ACTION_SNOOZE);
        snooze.putExtra("id", id);
        snooze.putExtra("title", title);
        PendingIntent snoozePending = PendingIntent.getBroadcast(context, id.hashCode(), snooze,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(context, CHANNEL)
            : new Notification.Builder(context);
        builder.setSmallIcon(R.drawable.ic_stat_collector)
            .setContentTitle(title == null || title.isEmpty() ? "Reminder Collector" : title)
            .setContentText("Este momentul pentru activitatea programată.")
            .setCategory(Notification.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setPriority(Notification.PRIORITY_HIGH)
            .addAction(0, "Amână 10 min", snoozePending);
        if (openPending != null) builder.setContentIntent(openPending);
        manager.notify(id.hashCode(), builder.build());
    }

    private static void remove(Context context, String id) {
        try {
            JSONArray all = new JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]"));
            JSONArray next = new JSONArray();
            for (int i = 0; i < all.length(); i++) {
                JSONObject item = all.optJSONObject(i);
                if (item != null && !id.equals(item.optString("id"))) next.put(item);
            }
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, next.toString()).apply();
        } catch (Exception ignored) {}
    }

    private static void upsert(Context context, JSONObject value) throws Exception {
        JSONArray all = new JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]"));
        JSONArray next = new JSONArray();
        for (int i = 0; i < all.length(); i++) {
            JSONObject item = all.optJSONObject(i);
            if (item != null && !value.optString("id").equals(item.optString("id"))) next.put(item);
        }
        next.put(value);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, next.toString()).apply();
    }
}
