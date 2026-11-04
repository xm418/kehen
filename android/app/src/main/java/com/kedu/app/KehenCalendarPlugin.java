package com.kedu.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.provider.CalendarContract;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Calendar;
import java.util.TimeZone;

/**
 * 把每日提醒写进系统日历。
 * 不走 .ics 文件：安卓上 text/calendar 基本只有聊天软件注册，系统日历收不到。
 * 改用 ACTION_INSERT 直接拉起日历的新建日程页，标题、时间、重复规则都能预填。
 */
@CapacitorPlugin(name = "KehenCalendar")
public class KehenCalendarPlugin extends Plugin {

    @PluginMethod
    public void insertDailyEvent(PluginCall call) {
        String title = call.getString("title", "刻痕提醒");
        String description = call.getString("description", "");
        Integer hour = call.getInt("hour", 21);
        Integer durationMinutes = call.getInt("durationMinutes", 15);
        String rrule = call.getString("rrule", "FREQ=DAILY");

        Calendar begin = Calendar.getInstance();
        begin.set(Calendar.HOUR_OF_DAY, hour);
        begin.set(Calendar.MINUTE, 0);
        begin.set(Calendar.SECOND, 0);
        begin.set(Calendar.MILLISECOND, 0);
        // 今天这个点已经过了就从明天开始，避免建一条已经过期的日程
        if (begin.getTimeInMillis() <= System.currentTimeMillis()) {
            begin.add(Calendar.DAY_OF_YEAR, 1);
        }
        long beginMillis = begin.getTimeInMillis();
        long endMillis = beginMillis + durationMinutes * 60_000L;

        Intent intent = new Intent(Intent.ACTION_INSERT);
        intent.setData(CalendarContract.Events.CONTENT_URI);
        intent.putExtra(CalendarContract.Events.TITLE, title);
        intent.putExtra(CalendarContract.Events.DESCRIPTION, description);
        intent.putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, beginMillis);
        intent.putExtra(CalendarContract.EXTRA_EVENT_END_TIME, endMillis);
        intent.putExtra(CalendarContract.Events.EVENT_TIMEZONE, TimeZone.getDefault().getID());
        intent.putExtra(CalendarContract.Events.RRULE, rrule);
        intent.putExtra(CalendarContract.Events.HAS_ALARM, 1);
        intent.putExtra(CalendarContract.Events.ACCESS_LEVEL, CalendarContract.Events.ACCESS_DEFAULT);

        try {
            getActivity().startActivity(intent);
        } catch (ActivityNotFoundException e) {
            call.reject("没找到可用的日历应用");
            return;
        }

        JSObject ret = new JSObject();
        ret.put("begin", beginMillis);
        ret.put("end", endMillis);
        call.resolve(ret);
    }
}
