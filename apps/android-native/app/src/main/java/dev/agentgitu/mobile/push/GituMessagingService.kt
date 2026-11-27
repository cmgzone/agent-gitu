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
import dev.agentgitu.mobile.data.local.SessionStore
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
        val data = message.data
        val parsed = PushDeepLink.parsePayload(data)
        val kind = data["kind"]?.trim()?.lowercase().orEmpty()
        val isLiveActivityPayload = data["liveActivity"] == "1" || kind == "working"
        val title = message.notification?.title
            ?: data["title"]?.trim()?.ifBlank { null }
            ?: "Agent Gitu"
        val body = message.notification?.body
            ?: data["body"]?.trim()?.ifBlank { null }
            ?: "Agent Gitu has an update."

        val liveEnabled = SessionStore.isLiveActivityEnabledSync(this)
        val showPreview = SessionStore.isLiveActivityPreviewEnabledSync(this) && data["showPreview"] != "0"

        // Update the compliant Android Lock-Screen Live Activity card whenever opted in.
        if (liveEnabled) {
            val liveUpdate = PushDeepLink.parseLiveActivity(data, fallbackTitle = title, fallbackBody = body)
            if (liveUpdate != null) {
                GituLiveActivityNotifier.showOrUpdate(
                    context = this,
                    update = liveUpdate,
                    forceShowPreview = showPreview,
                )
            }
        }

        // Silent working progress ticks only update the ongoing Live Activity card — never buzz!
        if (kind == "working") return
        // If this was a live-activity-only payload and the user disabled Live Activity locally, skip.
        if (isLiveActivityPayload && kind.isBlank() && message.notification == null) return

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

        val visibility = if (liveEnabled && showPreview) {
            NotificationCompat.VISIBILITY_PUBLIC
        } else {
            NotificationCompat.VISIBILITY_PRIVATE
        }

        val notification = NotificationCompat.Builder(this, PushDeepLink.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_gitu)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(visibility)
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
