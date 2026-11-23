package com.collector.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public final class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(CollectorRecorderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
