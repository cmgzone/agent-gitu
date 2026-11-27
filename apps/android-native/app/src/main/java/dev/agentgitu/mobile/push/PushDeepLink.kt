package dev.agentgitu.mobile.push

data class PushNavigationTarget(
    val target: String, // "run" | "cowork" | "home"
    val targetId: String,
    val threadId: String? = null,
    val workspaceId: String? = null,
)

data class LiveActivityUpdate(
    val kind: String, // "working" | "reply" | "attention" | "completed" | "failed"
    val title: String,
    val body: String,
    val agentName: String = "",
    val phase: String = "",
    val progress: Int? = null, // 0..100 or null for indeterminate when working
    val isWorking: Boolean = kind == "working",
    val target: PushNavigationTarget? = null,
)

object PushDeepLink {
    const val CHANNEL_ID = "gitu-workspace"
    const val LIVE_ACTIVITY_CHANNEL_ID = "gitu-live-activity"
    const val LIVE_ACTIVITY_NOTIFICATION_ID = 70421
    const val ACTION_DISMISS_LIVE_ACTIVITY = "dev.agentgitu.mobile.ACTION_DISMISS_LIVE_ACTIVITY"

    const val EXTRA_TARGET = "gitu_push_target"
    const val EXTRA_TARGET_ID = "gitu_push_target_id"
    const val EXTRA_THREAD_ID = "gitu_push_thread_id"
    const val EXTRA_WORKSPACE_ID = "gitu_push_workspace_id"

    fun parsePayload(data: Map<String, String>): PushNavigationTarget? {
        val target = data["target"]?.trim()?.lowercase() ?: return null
        if (target !in setOf("run", "cowork", "home")) return null
        val targetId = data["targetId"]?.trim().orEmpty()
        if (target != "home" && targetId.isBlank()) return null
        return PushNavigationTarget(
            target = target,
            targetId = targetId,
            threadId = data["threadId"]?.trim()?.ifBlank { null },
            workspaceId = data["workspaceId"]?.trim()?.ifBlank { null },
        )
    }

    fun parseLiveActivity(data: Map<String, String>, fallbackTitle: String? = null, fallbackBody: String? = null): LiveActivityUpdate? {
        val kind = data["kind"]?.trim()?.lowercase().orEmpty()
        val isExplicit = data["liveActivity"] == "1" || kind in setOf("working", "reply", "attention", "completed", "failed")
        if (!isExplicit && fallbackTitle.isNullOrBlank() && fallbackBody.isNullOrBlank()) return null
        val resolvedKind = kind.ifBlank { "reply" }
        val agentName = data["agentName"]?.trim().orEmpty()
        val title = data["title"]?.trim()?.ifBlank { null }
            ?: fallbackTitle?.trim()?.ifBlank { null }
            ?: agentName.ifBlank { "Agent Gitu" }
        val body = data["body"]?.trim()?.ifBlank { null }
            ?: fallbackBody?.trim()?.ifBlank { null }
            ?: when (resolvedKind) {
                "working" -> "Agent is working…"
                "attention" -> "Waiting for your review or answer."
                "completed" -> "Task completed."
                "failed" -> "Task needs your attention."
                else -> "New update from Agent Gitu."
            }
        val phase = data["phase"]?.trim().orEmpty()
        val progress = data["progress"]?.trim()?.toIntOrNull()?.coerceIn(0, 100)
        return LiveActivityUpdate(
            kind = resolvedKind,
            title = title,
            body = body,
            agentName = agentName,
            phase = phase,
            progress = progress,
            isWorking = resolvedKind == "working",
            target = parsePayload(data),
        )
    }
}
