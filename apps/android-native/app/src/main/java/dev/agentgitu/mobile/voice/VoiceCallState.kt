package dev.agentgitu.mobile.voice

data class VoiceCallTarget(
    val kind: String,
    val conversationId: String? = null,
    val threadId: String? = null,
    val agentId: String? = null,
    val runId: String? = null,
    val provider: String? = null,
    val model: String? = null,
    val projectPath: String? = null,
    val displayName: String = "Agent Gitu",
    val avatarShape: String? = null,
    val avatarColor: String? = null,
)

data class VoiceCallUiState(
    val active: Boolean = false,
    val minimized: Boolean = false,
    val callId: String? = null,
    val mode: String = "",
    val target: VoiceCallTarget? = null,
    val title: String = "Agent Gitu",
    val subtitle: String = "LiveKit Voice",
    val avatarShape: String? = null,
    val avatarColor: String? = null,
    val phase: String = "idle",
    val statusText: String = "",
    val caption: String = "",
    val muted: Boolean = false,
    val speakerOn: Boolean = true,
    val audioLevel: Float = 0f,
    val elapsedSeconds: Int = 0,
    val error: String? = null,
    val insufficientCredits: Boolean = false,
    val canOpenByokSetup: Boolean = false,
    val needsSetup: Boolean = false,
    val configUrl: String = "",
    val configAgentName: String = "gitu-voice",
    val savingConfig: Boolean = false,
    val setupError: String? = null,
) {
    val isLive: Boolean
        get() = active && phase in setOf("listening", "thinking", "speaking", "reconnecting")

    val isConnecting: Boolean
        get() = active && phase in setOf("preparing", "connecting")
}
