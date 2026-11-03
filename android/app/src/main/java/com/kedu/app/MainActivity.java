package com.kedu.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GuardWatchPlugin.class);
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(SystemBarsPlugin.class);
        super.onCreate(savedInstanceState);
        // 不要给 android.R.id.content 设置 WindowInsets listener 或 padding：
        // 那会覆盖 Capacitor 自己的 insets 处理，把 WebView 父容器压扁，看起来像白屏。
    }
}
