package dev.agentgitu.mobile

import android.app.Application
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import dev.agentgitu.mobile.push.PushDeepLink

class GituApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java) ?: return
            val workspaceChannel = NotificationChannel(
                PushDeepLink.CHANNEL_ID,
                "Agent Gitu Workspace",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Task completions, approval gates, clarification questions, and Cowork replies."
                enableVibration(true)
            }
            val liveActivityChannel = NotificationChannel(
                PushDeepLink.LIVE_ACTIVITY_CHANNEL_ID,
                "Agent Live Activity",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = "Lock-screen live progress and replies while your AI teammates are working."
                setSound(null, null)
                enableVibration(false)
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            manager.createNotificationChannel(workspaceChannel)
            manager.createNotificationChannel(liveActivityChannel)
        }
    }
}
