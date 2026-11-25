package dev.agentgitu.mobile.push

import android.Manifest
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dev.agentgitu.mobile.MainActivity
import dev.agentgitu.mobile.R
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

class GituMessagingService : FirebaseMessagingService() {

    companion object {
        private val _tokenUpdates = MutableSharedFlow<String>(extraBufferCapacity = 4)
        val tokenUpdates: SharedFlow<String> = _tokenUpdates.asSharedFlow()
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        _tokenUpdates.tryEmit(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val parsed = PushDeepLink.parsePayload(message.data)
        val title = message.notification?.title ?: "Agent Gitu"
        val body = message.notification?.body ?: "Agent Gitu has an update."

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (parsed != null) {
                putExtra(PushDeepLink.EXTRA_TARGET, parsed.target)
                putExtra(PushDeepLink.EXTRA_TARGET_ID, parsed.targetId)
                parsed.threadId?.let { putExtra(PushDeepLink.EXTRA_THREAD_ID, it) }
                parsed.workspaceId?.let { putExtra(PushDeepLink.EXTRA_WORKSPACE_ID, it) }
            }
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            (parsed?.targetId ?: title).hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(this, PushDeepLink.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_gitu)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        ) {
            NotificationManagerCompat.from(this)
                .notify((parsed?.targetId ?: System.currentTimeMillis().toString()).hashCode(), notification)
        }
    }
}
