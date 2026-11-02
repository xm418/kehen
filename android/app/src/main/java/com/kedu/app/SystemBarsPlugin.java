package com.kedu.app;

import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** 让状态栏、手势条跟着 App 主题走，避免深色页面配一条白色系统栏 */
@CapacitorPlugin(name = "SystemBars")
public class SystemBarsPlugin extends Plugin {

    @PluginMethod
    public void apply(PluginCall call) {
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        int color = Color.parseColor(dark ? "#0a0a0a" : "#f6f6f4");
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            View decor = window.getDecorView();
            // Android 15 起强制全面屏，状态栏本身是透明的，露出来的是这层背景
            decor.setBackgroundColor(color);
            if (Build.VERSION.SDK_INT < 35) {
                window.setStatusBarColor(color);
                window.setNavigationBarColor(color);
            }
            WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, decor);
            bars.setAppearanceLightStatusBars(!dark);
            bars.setAppearanceLightNavigationBars(!dark);
            decor.requestApplyInsets();
        });
        call.resolve(new JSObject());
    }
}
