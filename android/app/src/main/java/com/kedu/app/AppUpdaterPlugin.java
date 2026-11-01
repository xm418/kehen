package com.kedu.app;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Environment;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** 用系统下载器拉新版本 APK，下完直接拉起安装界面 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private BroadcastReceiver receiver;
    private long pendingId = -1;

    @PluginMethod
    public void install(PluginCall call) {
        final String url = call.getString("url");
        final String fileName = call.getString("fileName", "kehen-update.apk");
        if (url == null || url.isEmpty()) {
            call.reject("没有下载地址");
            return;
        }

        Context ctx = getContext();
        DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
        if (dm == null) {
            call.reject("系统下载服务不可用");
            return;
        }

        DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
        req.setTitle("刻痕新版本");
        req.setDescription("下载完成后会提示安装");
        req.setMimeType("application/vnd.android.package-archive");
        req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        req.setDestinationInExternalFilesDir(ctx, Environment.DIRECTORY_DOWNLOADS, fileName);

        pendingId = dm.enqueue(req);

        try {
            if (receiver != null) ctx.unregisterReceiver(receiver);
        } catch (Exception ignored) {
            // 上一次的接收器可能已经注销
        }

        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (id != pendingId) return;
                Uri uri = dm.getUriForDownloadedFile(id);
                if (uri == null) return;
                Intent open = new Intent(Intent.ACTION_VIEW);
                open.setDataAndType(uri, "application/vnd.android.package-archive");
                open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try {
                    context.startActivity(open);
                } catch (Exception ignored) {
                    // 没给「安装未知应用」权限时系统会自己拦下来
                }
            }
        };

        ContextCompat.registerReceiver(
                ctx, receiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                ContextCompat.RECEIVER_NOT_EXPORTED);

        JSObject ret = new JSObject();
        ret.put("started", true);
        call.resolve(ret);
    }

    @Override
    protected void handleOnDestroy() {
        try {
            if (receiver != null) getContext().unregisterReceiver(receiver);
        } catch (Exception ignored) {
            // 页面销毁时接收器可能已经失效
        }
        receiver = null;
        super.handleOnDestroy();
    }
}
