package com.collector.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class CollectorAlarmBootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
            || "android.intent.action.MY_PACKAGE_REPLACED".equals(action)
            || "android.intent.action.TIME_SET".equals(action)
            || "android.intent.action.TIMEZONE_CHANGED".equals(action)) {
            CollectorAlarmPlugin.rescheduleAll(context);
        }
    }
}
