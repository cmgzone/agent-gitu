package dev.agentgitu.mobile

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import dev.agentgitu.mobile.push.PushDeepLink

class GituApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                PushDeepLink.CHANNEL_ID,
                "Agent Gitu Workspace",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Task completions, approval gates, clarification questions, and Cowork replies."
                enableVibration(true)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }
}
