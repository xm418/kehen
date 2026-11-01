package com.kedu.app;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Process;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** 读取手机当前在前台的应用，用来做专注期的娱乐戒断 */
@CapacitorPlugin(name = "GuardWatch")
public class GuardWatchPlugin extends Plugin {

    private boolean hasAccess() {
        Context ctx = getContext();
        AppOpsManager ops = (AppOpsManager) ctx.getSystemService(Context.APP_OPS_SERVICE);
        if (ops == null) return false;
        int mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.getPackageName());
        if (mode == AppOpsManager.MODE_ALLOWED) return true;
        // 部分 ROM 不看 AppOps，退回到权限位判断
        return ctx.checkCallingOrSelfPermission("android.permission.PACKAGE_USAGE_STATS")
                == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void hasUsageAccess(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasAccess());
        call.resolve(ret);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void current(PluginCall call) {
        if (!hasAccess()) {
            call.resolve(null);
            return;
        }
        Context ctx = getContext();
        long now = System.currentTimeMillis();
        UsageStatsManager usm = (UsageStatsManager) ctx.getSystemService(Context.USAGE_STATS_SERVICE);
        if (usm == null) {
            call.resolve(null);
            return;
        }

        // 只看最近 15 分钟的事件，够判断「现在在用什么」
        UsageEvents events = usm.queryEvents(now - 15 * 60 * 1000L, now);
        if (events == null) {
            call.resolve(null);
            return;
        }

        UsageEvents.Event e = new UsageEvents.Event();
        String pkg = null;
        long since = now;
        while (events.hasNextEvent()) {
            events.getNextEvent(e);
            int type = e.getEventType();
            if (type == UsageEvents.Event.ACTIVITY_RESUMED || type == UsageEvents.Event.MOVE_TO_FOREGROUND) {
                pkg = e.getPackageName();
                since = e.getTimeStamp();
            }
        }

        if (pkg == null || pkg.equals(ctx.getPackageName())) {
            call.resolve(null);
            return;
        }

        String label = pkg;
        try {
            PackageManager pm = ctx.getPackageManager();
            label = pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
        } catch (Exception ignored) {
            // 拿不到名字就用包名，前端不会因此崩掉
        }

        JSObject ret = new JSObject();
        ret.put("pkg", pkg);
        ret.put("label", label);
        ret.put("seconds", Math.max(0, (now - since) / 1000));
        call.resolve(ret);
    }
}
