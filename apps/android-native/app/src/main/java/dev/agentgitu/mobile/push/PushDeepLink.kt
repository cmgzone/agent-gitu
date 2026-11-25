package dev.agentgitu.mobile.push

data class PushNavigationTarget(
    val target: String, // "run" | "cowork" | "home"
    val targetId: String,
    val threadId: String? = null,
    val workspaceId: String? = null,
)

object PushDeepLink {
    const val CHANNEL_ID = "gitu-workspace"
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
}
