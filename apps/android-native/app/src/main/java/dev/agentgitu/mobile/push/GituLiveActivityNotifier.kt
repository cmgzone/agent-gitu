package dev.agentgitu.mobile.push

import android.Manifest
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import dev.agentgitu.mobile.MainActivity
import dev.agentgitu.mobile.R
import dev.agentgitu.mobile.data.local.SessionStore

/**
 * Google Play Policy compliant Lock-Screen Live Activity notifier.
 *
 * Uses standard Android Ongoing Notifications + NotificationCompat.CATEGORY_PROGRESS /
 * CATEGORY_MESSAGE on a dedicated silent channel (`gitu-live-activity`) with user opt-in
 * lock-screen visibility. Requires zero restricted permissions (no USE_FULL_SCREEN_INTENT,
 * no SYSTEM_ALERT_WINDOW, no background foreground-service polling when idle).
 */
object GituLiveActivityNotifier {

    fun hasNotificationPermission(context: Context): Boolean {
        val runtimeOk = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        return runtimeOk && NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    fun showOrUpdate(
        context: Context,
        update: LiveActivityUpdate,
        forceShowPreview: Boolean? = null,
    ) {
        if (!SessionStore.isLiveActivityEnabledSync(context)) return
        if (!hasNotificationPermission(context)) return

        val showPreview = forceShowPreview ?: SessionStore.isLiveActivityPreviewEnabledSync(context)
        val openIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            update.target?.let { parsed ->
                putExtra(PushDeepLink.EXTRA_TARGET, parsed.target)
                putExtra(PushDeepLink.EXTRA_TARGET_ID, parsed.targetId)
                parsed.threadId?.let { putExtra(PushDeepLink.EXTRA_THREAD_ID, it) }
                parsed.workspaceId?.let { putExtra(PushDeepLink.EXTRA_WORKSPACE_ID, it) }
            }
        }
        val openPending = PendingIntent.getActivity(
            context,
            PushDeepLink.LIVE_ACTIVITY_NOTIFICATION_ID,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val dismissIntent = Intent(context, LiveActivityDismissReceiver::class.java).apply {
            action = PushDeepLink.ACTION_DISMISS_LIVE_ACTIVITY
        }
        val dismissPending = PendingIntent.getBroadcast(
            context,
            PushDeepLink.LIVE_ACTIVITY_NOTIFICATION_ID + 1,
            dismissIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val statusLabel = when (update.kind) {
            "working" -> update.phase.ifBlank { "Working" }
            "attention" -> "Needs your input"
            "completed" -> "Completed"
            "failed" -> "Needs attention"
            else -> "Replied"
        }

        val publicSafeBody = when (update.kind) {
            "working" -> "${update.agentName.ifBlank { "Agent Gitu" }} is working…"
            "attention" -> "${update.agentName.ifBlank { "Agent Gitu" }} is waiting for your review."
            "completed" -> "Task completed. Unlock to view details."
            "failed" -> "Task needs your attention."
            else -> "New reply from ${update.agentName.ifBlank { "Agent Gitu" }}. Unlock to read."
        }

        val publicVersion = NotificationCompat.Builder(context, PushDeepLink.LIVE_ACTIVITY_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_gitu)
            .setContentTitle(update.title)
            .setContentText(publicSafeBody)
            .setSubText(statusLabel)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setOngoing(update.isWorking)
            .setUsesChronometer(update.isWorking)
            .apply {
                if (update.isWorking) {
                    if (update.progress != null) setProgress(100, update.progress, false)
                    else setProgress(100, 0, true)
                }
            }
            .build()

        val displayBody = if (showPreview) update.body else publicSafeBody

        val builder = NotificationCompat.Builder(context, PushDeepLink.LIVE_ACTIVITY_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_gitu)
            .setContentTitle(update.title)
            .setContentText(displayBody)
            .setSubText(statusLabel)
            .setStyle(
                NotificationCompat.BigTextStyle()
                    .bigText(displayBody)
                    .setSummaryText(statusLabel),
            )
            .setCategory(if (update.isWorking) NotificationCompat.CATEGORY_PROGRESS else NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setVisibility(if (showPreview) NotificationCompat.VISIBILITY_PUBLIC else NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion)
            .setOngoing(update.isWorking)
            .setUsesChronometer(update.isWorking)
            .setShowWhen(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setAutoCancel(!update.isWorking)
            .setContentIntent(openPending)
            .addAction(0, "Open", openPending)
            .addAction(0, "Dismiss", dismissPending)

        if (update.isWorking) {
            if (update.progress != null) {
                builder.setProgress(100, update.progress, false)
            } else {
                builder.setProgress(100, 0, true)
            }
        }

        runCatching {
            NotificationManagerCompat.from(context)
                .notify(PushDeepLink.LIVE_ACTIVITY_NOTIFICATION_ID, builder.build())
        }
    }

    fun dismiss(context: Context) {
        runCatching {
            NotificationManagerCompat.from(context).cancel(PushDeepLink.LIVE_ACTIVITY_NOTIFICATION_ID)
        }
    }
}

class LiveActivityDismissReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action == PushDeepLink.ACTION_DISMISS_LIVE_ACTIVITY) {
            GituLiveActivityNotifier.dismiss(context)
        }
    }
}
