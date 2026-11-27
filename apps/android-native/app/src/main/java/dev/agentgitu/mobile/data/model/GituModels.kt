package dev.agentgitu.mobile.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

// --- Auth & Server Status ---

@Serializable
data class HealthStatus(
    val status: String = "ok",
    val uptime: Double? = null,
)

@Serializable
data class AuthStatus(
    val required: Boolean = false,
    val configured: Boolean = false,
    val requiresEmail: Boolean = false,
    val authenticated: Boolean = false,
)

@Serializable
data class MobileStatus(
    val app: String = "",
    val mobileProtocol: Int = 0,
    val version: String? = null,
)

@Serializable
data class ErrorPayload(
    val error: String? = null,
    val code: String? = null,
)

// --- Projects, Workspace & Files ---

@Serializable
data class ProjectInfo(
    val name: String = "",
    val repoRoot: String = "",
)

@Serializable
data class HomeInfo(
    val workspace: String = "",
    val projectsPath: String = "",
    val autonomy: AutonomySettings? = null,
)

@Serializable
data class AutonomySettings(
    val persistent: Boolean = true,
    val maxCostUsd: Double? = null,
)

@Serializable
data class BrowseResponse(
    val dirs: List<String> = emptyList(),
)

@Serializable
data class Project(
    val name: String,
    val path: String,
)

@Serializable
data class FileEntry(
    val name: String = "",
    val path: String = "",
    val directory: Boolean = false,
)

@Serializable
data class FileListing(
    val root: String = "",
    val path: String = "",
    val writable: Boolean = false,
    val entries: List<FileEntry>? = null,
    val content: String? = null,
    val revision: String? = null,
)

// --- Git ---

@Serializable
data class GitChangedFile(
    val path: String = "",
    val status: String = "",
)

@Serializable
data class GitStatus(
    val root: String = "",
    val isRepo: Boolean = false,
    val branch: String = "",
    val clean: Boolean = true,
    val ahead: Int = 0,
    val behind: Int = 0,
    val changed: List<GitChangedFile> = emptyList(),
    val staged: List<String> = emptyList(),
    val modified: List<String> = emptyList(),
    val untracked: List<String> = emptyList(),
)

@Serializable
data class GitDiffResponse(
    val diff: String = "",
)

// --- Agent Runs & Events ---

@Serializable
data class PendingApproval(
    val id: String = "",
    val tool: String = "",
    val why: String = "",
    val summary: String = "",
)

@Serializable
data class PlanStepItem(
    val description: String = "",
    val verification: String = "",
)

@Serializable
data class PendingPlanReview(
    val id: String = "",
    val criteria: List<String> = emptyList(),
    val steps: List<PlanStepItem> = emptyList(),
)

@Serializable
data class ClarificationQuestion(
    val question: String = "",
    val options: List<String> = emptyList(),
)

@Serializable
data class PendingQuestions(
    val id: String = "",
    val questions: List<ClarificationQuestion> = emptyList(),
)

@Serializable
data class ConnectionRequirementSetup(
    val label: String? = null,
    val baseUrl: String? = null,
    val documentationUrl: String? = null,
    val validationPath: String? = null,
)

@Serializable
data class ConnectionRequirement(
    val providerHint: String = "",
    val label: String = "",
    val reason: String = "",
    val description: String? = null,
    val requiredFor: String? = null,
    val requestType: String? = null,
    val existingConnectionId: String? = null,
    val requiredFields: List<String> = emptyList(),
    val capabilities: List<String> = emptyList(),
    val baseUrl: String? = null,
    val validationPath: String? = null,
    val documentationUrl: String? = null,
    val setup: ConnectionRequirementSetup? = null,
)

@Serializable
data class PendingConnection(
    val id: String = "",
    val requirement: ConnectionRequirement? = null,
    val requestedAt: String = "",
)

@Serializable
data class RunUsage(
    val costUsd: Double? = null,
    val inputTokens: Long? = null,
    val outputTokens: Long? = null,
)

@Serializable
data class RunReport(
    val summary: String = "",
    val verification: List<String> = emptyList(),
    val filesChanged: List<String> = emptyList(),
    val blockers: List<String>? = null,
)

@Serializable
data class RunFile(
    val id: String = "",
    val name: String = "",
    val size: Long = 0,
    val mime: String = "",
    val downloadUrl: String = "",
)

@Serializable
data class Run(
    val runId: String = "",
    val goal: String = "",
    val status: String = "running",
    val startedAt: String = "",
    val taskId: String? = null,
    val project: String? = null,
    val projectPath: String? = null,
    val worktreePath: String? = null,
    val branch: String? = null,
    val provider: String? = null,
    val model: String? = null,
    val mode: String? = null,
    val error: String? = null,
    val pendingApprovals: List<PendingApproval> = emptyList(),
    val pendingPlanReview: PendingPlanReview? = null,
    val pendingQuestions: PendingQuestions? = null,
    val pendingConnection: PendingConnection? = null,
    val usage: RunUsage? = null,
    val report: RunReport? = null,
    val files: List<RunFile> = emptyList(),
) {
    val isRunning: Boolean
        get() = status == "running" || status == "waiting_for_model"

    val needsInput: Boolean
        get() = pendingApprovals.isNotEmpty() ||
            pendingPlanReview != null ||
            pendingQuestions != null ||
            pendingConnection != null
}

@Serializable
data class RunEvent(
    val i: Int = 0,
    val t: String = "",
    val text: String = "",
    val typed: JsonObject? = null,
)

@Serializable
data class EventPage(
    val session: Run,
    val events: List<RunEvent> = emptyList(),
    val cursor: Int = -1,
    val more: Boolean = false,
)

@Serializable
data class StartRunResponse(
    val runId: String = "",
)

@Serializable
data class RunCheckpoint(
    val id: String = "",
    val label: String = "",
    val ref: String = "",
    val createdAt: String = "",
    val step: Int? = null,
)

@Serializable
data class CheckpointsResponse(
    val checkpoints: List<RunCheckpoint> = emptyList(),
)

// --- Cowork / AI Teams ---

@Serializable
data class TeammateAvatar(
    val color: String? = null,
    val kind: String? = null,
    val shape: String? = null,
    val imageUrl: String? = null,
)

@Serializable
data class UploadAvatarResponse(
    val ok: Boolean = true,
    val agent: Teammate? = null,
    val imageUrl: String? = null,
)

@Serializable
data class Teammate(
    val id: String = "",
    val name: String = "",
    val tagline: String = "",
    val systemPrompt: String = "",
    val avatar: TeammateAvatar = TeammateAvatar(),
    val provider: String? = null,
    val model: String? = null,
    val effort: String? = null,
    val skills: List<String> = emptyList(),
    val allowShell: Boolean = false,
    val allowWrites: Boolean = false,
    val allowConfig: Boolean = false,
    val useHostComputer: Boolean = true,
    val chiefOfStaff: Boolean = false,
)

@Serializable
data class TeamConversation(
    val id: String = "",
    val kind: String = "dm",
    val title: String = "",
    val memberIds: List<String> = emptyList(),
    val chiefId: String? = null,
    val updatedAt: String = "",
)

@Serializable
data class TeamMessage(
    val id: String = "",
    val seq: Int = 0,
    val role: String = "agent",
    val agentName: String? = null,
    val text: String = "",
    val ts: String = "",
    val revision: Int = 0,
    val attempt: Int = 0,
    val status: String = "sent",
    val artifactIds: List<String>? = null,
    val referencedMessageIds: List<String>? = null,
)

@Serializable
data class AgentComputerHandoff(
    val reason: String = "",
    val requestId: String? = null,
)

@Serializable
data class AgentComputerStatus(
    val agentId: String = "",
    val name: String = "",
    val state: String = "stopped",
    val control: String = "shared",
    val handoff: AgentComputerHandoff? = null,
    val workspace: String = "/workspace",
    val error: String? = null,
    val reason: String? = null,
    val useHostComputer: Boolean = false,
) {
    val isRunning: Boolean
        get() = !useHostComputer && state == "running"

    val isUserControl: Boolean
        get() = control == "user"
}

@Serializable
data class AgentComputerResponse(
    val computer: AgentComputerStatus = AgentComputerStatus(),
    val agent: Teammate? = null,
)

@Serializable
data class TeamAppSuggestion(
    val service: String = "",
    val name: String = "",
    val logo: String? = null,
    val reason: String = "",
    val resumeWork: Boolean = false,
)

@Serializable
data class TeamCredentialField(
    val id: String = "",
    val label: String = "",
    val secret: Boolean = true,
    val required: Boolean = true,
    val inputType: String? = null,
    val header: String? = null,
    val prefix: String? = null,
)

@Serializable
data class TeamCredentialAuth(
    val type: String = "",
    val header: String? = null,
    val prefix: String? = null,
    val fields: List<TeamCredentialField> = emptyList(),
    val tokenUrl: String? = null,
    val grantType: String? = null,
)

@Serializable
data class TeamCredentialRequest(
    val providerHint: String = "",
    val label: String? = null,
    val baseUrl: String? = null,
    val validationPath: String? = null,
    val documentationUrl: String? = null,
    val connectionId: String? = null,
    val auth: TeamCredentialAuth? = null,
)

@Serializable
data class TeamBrowserAuthField(
    val id: String = "",
    val label: String = "",
    val type: String = "text",
    val required: Boolean = false,
)

@Serializable
data class TeamBrowserAuthTerm(
    val id: String = "",
    val label: String = "",
    val url: String? = null,
    val required: Boolean = false,
)

@Serializable
data class TeamBrowserAuthCard(
    val origin: String = "",
    val mode: String = "signin",
    val iconUrl: String? = null,
    val challengeId: String = "",
    val computer: String = "",
    val expiresAt: Long = 0L,
    val fields: List<TeamBrowserAuthField> = emptyList(),
    val terms: List<TeamBrowserAuthTerm> = emptyList(),
)

@Serializable
data class TeamAppAction(
    val service: String = "",
    val accountId: String = "",
    val tool: String = "",
    val args: JsonObject = JsonObject(emptyMap()),
)

private val lenientModelJson = kotlinx.serialization.json.Json {
    ignoreUnknownKeys = true
    isLenient = true
    coerceInputValues = true
}

@Serializable
data class TeamRequest(
    val id: String = "",
    val agentId: String = "",
    val kind: String = "question",
    val title: String = "",
    val detail: String = "",
    val appConnection: TeamAppSuggestion? = null,
    val credential: JsonObject? = null,
    val browserAuth: JsonObject? = null,
    val appAction: TeamAppAction? = null,
    val reviewedAction: TeamAppAction? = null,
    val permission: String? = null,
    val desktopHandoff: Boolean = false,
    val delegatedGate: String? = null,
    val options: List<String> = emptyList(),
    val recommended: String? = null,
    val status: String = "open",
    val response: String? = null,
    val resolvedBy: String? = null,
    val resolvedByLabel: String? = null,
    val createdAt: String = "",
    val hiddenAt: String? = null,
) {
    val credentialSpec: TeamCredentialRequest?
        get() = credential?.let {
            runCatching { lenientModelJson.decodeFromJsonElement(TeamCredentialRequest.serializer(), it) }.getOrNull()
        }

    val credentialSetupJson: String?
        get() = credential?.toString()

    val browserAuthSpec: TeamBrowserAuthCard?
        get() = browserAuth?.let {
            runCatching { lenientModelJson.decodeFromJsonElement(TeamBrowserAuthCard.serializer(), it) }.getOrNull()
        }

    val browserAuthSetupJson: String?
        get() = browserAuth?.toString()
}

@Serializable
data class TeamThread(
    val id: String = "",
    val title: String = "",
    val topic: String? = null,
)

@Serializable
data class TeamProgress(
    val agentId: String? = null,
    val agentName: String = "",
    val text: String? = null,
    val reasoning: String? = null,
    val phase: String? = null,
    val tool: String? = null,
    val toolOk: Boolean? = null,
    val detail: String? = null,
    val mcpServer: String? = null,
    val appService: String? = null,
    val webUrl: String? = null,
)

@Serializable
data class TeamWorkItem(
    val id: String = "",
    val agentName: String = "",
    val tool: String = "",
    val ok: Boolean = true,
    val publicUpdate: String = "",
)

@Serializable
data class TeamMission(
    val id: String = "",
    val goal: String = "",
    val status: String = "",
)

@Serializable
data class TeamArtifact(
    val id: String = "",
    val name: String = "",
    val mime: String = "",
    val size: Long = 0,
) {
    val isImage: Boolean
        get() = mime.startsWith("image/", ignoreCase = true) ||
            name.lowercase().let { it.endsWith(".png") || it.endsWith(".jpg") || it.endsWith(".jpeg") || it.endsWith(".gif") || it.endsWith(".webp") }

    val isVideo: Boolean
        get() = mime.startsWith("video/", ignoreCase = true) ||
            name.lowercase().let { it.endsWith(".mp4") || it.endsWith(".webm") || it.endsWith(".mov") || it.endsWith(".mkv") }
}

@Serializable
data class TeamFolder(
    val id: String = "",
    val path: String = "",
    val label: String? = null,
)

data class PendingAttachment(
    val name: String,
    val mime: String,
    val dataUrl: String,
    val sizeBytes: Long,
)

@Serializable
data class TeamView(
    val messages: List<TeamMessage> = emptyList(),
    val threads: List<TeamThread> = emptyList(),
    val threadId: String? = null,
    val folders: List<TeamFolder> = emptyList(),
    val busy: Boolean = false,
    val working: String? = null,
    val queued: Int = 0,
    val progresses: List<TeamProgress> = emptyList(),
    val workHistory: List<TeamWorkItem> = emptyList(),
    val requests: List<TeamRequest> = emptyList(),
    val missions: List<TeamMission> = emptyList(),
    val artifacts: List<TeamArtifact> = emptyList(),
    val deleted: Boolean = false,
)

// --- Connected Apps & Custom Connections ---

@Serializable
data class ServiceAuthField(
    val name: String = "",
    val label: String? = null,
    val description: String? = null,
    val required: Boolean = false,
    val secret: Boolean = false,
)

@Serializable
data class ServiceAuthConfig(
    val id: String = "",
    val scheme: String = "",
    val fields: List<ServiceAuthField> = emptyList(),
)

@Serializable
data class ConnectedServiceItem(
    val slug: String = "",
    val name: String = "",
    val description: String? = null,
    val logo: String? = null,
    val status: String? = null,
    val accountId: String? = null,
    val authConfigs: List<ServiceAuthConfig> = emptyList(),
) {
    val apiKeyAuthConfig: ServiceAuthConfig?
        get() = authConfigs.firstOrNull {
            it.scheme.uppercase() in setOf("API_KEY", "BEARER_TOKEN", "BASIC")
        }

    val supportsDirectOAuth: Boolean
        get() = authConfigs.isEmpty() || authConfigs.any { cfg ->
            cfg.scheme.uppercase() in setOf("OAUTH1", "OAUTH2", "DCR_OAUTH", "CIMD_OAUTH", "S2S_OAUTH2") &&
                cfg.fields.none { it.required }
        }
}

@Serializable
data class MailHostGuess(
    val host: String = "",
    val port: Int = 993,
    val secure: Boolean = true,
)

@Serializable
data class MailDetectResponse(
    val found: Boolean = false,
    val domain: String? = null,
    val username: String? = null,
    val imap: MailHostGuess? = null,
    val smtp: MailHostGuess? = null,
)

@Serializable
data class ConnectedAppAccount(
    val id: String = "",
    val toolkit: String = "",
    val status: String = "",
    val disabled: Boolean = false,
    val alias: String? = null,
    val address: String? = null,
    val label: String? = null,
)

@Serializable
data class ConnectedAppPermission(
    val id: String = "",
    val agentId: String = "",
    val agentName: String = "",
    val service: String = "",
    val tool: String = "",
    val accountId: String = "",
)

@Serializable
data class ConnectedMailState(
    val accounts: List<ConnectedAppAccount> = emptyList(),
    val available: List<ConnectedAppAccount> = emptyList(),
)

@Serializable
data class ConnectedAppsResponse(
    val configured: Boolean = false,
    val agentId: String = "",
    val services: List<ConnectedServiceItem> = emptyList(),
    val accounts: List<ConnectedAppAccount> = emptyList(),
    val availableAccounts: List<ConnectedAppAccount> = emptyList(),
    val appPermissions: List<ConnectedAppPermission> = emptyList(),
    val mail: ConnectedMailState = ConnectedMailState(),
)

@Serializable
data class ConnectAppResponse(
    val url: String? = null,
    val redirectUrl: String? = null,
    val accountId: String? = null,
    val status: String? = null,
)

@Serializable
data class CustomConnectionOperation(
    val id: String = "",
    val label: String = "",
    val capability: String = "",
    val method: String = "GET",
    val path: String = "/",
    val risk: String = "read",
)

@Serializable
data class CustomConnectionProfile(
    val id: String = "",
    val label: String = "",
    val provider: String = "",
    val baseUrl: String = "",
    val documentationUrl: String? = null,
    val auth: TeamCredentialAuth? = null,
    val capabilities: List<String> = emptyList(),
    val operations: List<CustomConnectionOperation> = emptyList(),
    val status: String? = null,
) {
    val validationPath: String
        get() = operations.firstOrNull { it.id == "validate" }?.path
            ?: operations.firstOrNull { it.method.equals("GET", ignoreCase = true) && it.risk.equals("read", ignoreCase = true) }?.path
            ?: "/"
}

@Serializable
data class CustomConnectionsResponse(
    val connections: List<CustomConnectionProfile> = emptyList(),
)

@Serializable
data class SaveCustomConnectionResponse(
    val connection: CustomConnectionProfile = CustomConnectionProfile(),
)

@Serializable
data class ConversationFolderResponse(
    val folder: TeamFolder = TeamFolder(),
)

@Serializable
data class AgentsResponse(
    val agents: List<Teammate> = emptyList(),
)

@Serializable
data class SaveTeammateResponse(
    val agent: Teammate,
)

@Serializable
data class ConversationsResponse(
    val conversations: List<TeamConversation> = emptyList(),
)

@Serializable
data class CreateConversationResponse(
    val conversation: TeamConversation,
)

@Serializable
data class CreateThreadResponse(
    val thread: TeamThread,
)

@Serializable
data class SendTeamMessageResponse(
    val message: TeamMessage? = null,
)

// --- Shared Inbox ---

@Serializable
data class InboxAgentSummary(
    val id: String = "",
    val name: String = "",
    val tagline: String? = null,
    val avatar: TeammateAvatar? = null,
)

@Serializable
data class InboxProjectSummary(
    val name: String = "",
    val path: String = "",
)

@Serializable
data class InboxMember(
    val id: String = "",
    val name: String = "",
    val email: String? = null,
    val status: String? = "active",
    val allowedAgentIds: List<String> = emptyList(),
    val toolPolicy: String? = null,
    val joinedAt: String? = null,
)

@Serializable
data class InboxInvite(
    val id: String = "",
    val code: String? = null,
    val pikpamInviteUrl: String? = null,
    val label: String? = null,
    val scopeType: String = "dm",
    val roomId: String? = null,
    val targetEmail: String? = null,
    val defaultAgentIds: List<String> = emptyList(),
    val toolPolicy: String = "read_only",
    val maxUses: Int = 1,
    val usedCount: Int = 0,
    val expiresAt: String? = null,
    val createdAt: String = "",
    val revokedAt: String? = null,
)

@Serializable
data class InboxRoom(
    val id: String = "",
    val kind: String = "dm",
    val title: String = "",
    val memberIds: List<String> = emptyList(),
    val activeAgentIds: List<String> = emptyList(),
    val agentTriggerMode: String = "mention",
    val toolPolicyOverride: String? = null,
    val notesVisibility: String = "owner_only",
    val projectPath: String? = null,
    val noteCount: Int = 0,
    val openTaskCount: Int = 0,
    val pendingApprovalCount: Int = 0,
    val activeAgentTurnIds: List<String> = emptyList(),
    val watching: Boolean = false,
    val updatedAt: String = "",
)

@Serializable
data class InboxMessage(
    val id: String = "",
    val roomId: String = "",
    val seq: Int = 0,
    val senderType: String = "owner",
    val senderId: String = "",
    val senderName: String = "",
    val text: String = "",
    val visibility: String? = null,
    val ts: String = "",
)

@Serializable
data class InboxRoomNote(
    val id: String = "",
    val roomId: String = "",
    val kind: String = "note",
    val title: String = "",
    val content: String = "",
    val createdByType: String = "owner",
    val createdById: String = "",
    val createdByName: String = "",
    val sharedToChat: Boolean = false,
    val sharedMessageId: String? = null,
    val createdAt: String = "",
    val updatedAt: String = "",
)

@Serializable
data class InboxRoomTask(
    val id: String = "",
    val roomId: String = "",
    val title: String = "",
    val description: String? = null,
    val kind: String = "action",
    val status: String = "todo",
    val assignee: String? = null,
    val projectPath: String? = null,
    val requestedByType: String = "owner",
    val requestedByName: String = "",
    val codeRunId: String? = null,
    val codeRunStatus: String? = null,
    val delegationSummary: String? = null,
    val subAgentRole: String? = null,
    val createdAt: String = "",
    val updatedAt: String = "",
)

@Serializable
data class InboxStateResponse(
    val role: String = "owner",
    val workspaceName: String = "",
    val workspaceUrl: String? = null,
    val pikpamBaseUrl: String? = null,
    val pikpamConfigured: Boolean = false,
    val rooms: List<InboxRoom> = emptyList(),
    val members: List<InboxMember> = emptyList(),
    val invites: List<InboxInvite> = emptyList(),
    val agents: List<InboxAgentSummary> = emptyList(),
    val projects: List<InboxProjectSummary> = emptyList(),
)

@Serializable
data class InboxMessagesResponse(
    val messages: List<InboxMessage> = emptyList(),
    val activeAgentTurnIds: List<String> = emptyList(),
    val watching: Boolean = false,
)

@Serializable
data class InboxWorkspaceResponse(
    val notesVisibility: String = "owner_only",
    val projectPath: String? = null,
    val notes: List<InboxRoomNote> = emptyList(),
    val tasks: List<InboxRoomTask> = emptyList(),
)

@Serializable
data class InboxSummarizeResponse(
    val note: InboxRoomNote? = null,
    val createdTasks: List<InboxRoomTask> = emptyList(),
    val tasks: List<InboxRoomTask> = emptyList(),
)

@Serializable
data class InboxDelegateCodeResponse(
    val task: InboxRoomTask? = null,
    val runId: String = "",
    val projectPath: String? = null,
)

@Serializable
data class InboxDelegateSubAgentResponse(
    val task: InboxRoomTask? = null,
    val report: String = "",
    val note: InboxRoomNote? = null,
)

@Serializable
data class InboxCreateRoomResponse(
    val room: InboxRoom? = null,
)

@Serializable
data class InboxCreateInviteResponse(
    val invite: InboxInvite? = null,
)

// --- Settings, Models, Chief, Cron, Push, Local Link ---

@Serializable
data class CodingPermissions(
    val access: String = "ask",
)

@Serializable
data class ModelOption(
    val id: String = "",
    val label: String? = null,
    val name: String? = null,
    val provider: String? = null,
    val ownedBy: String? = null,
    val vision: Boolean = false,
)

@Serializable
data class ModelProviderInfo(
    val id: String = "",
    val label: String = "",
    val defaultModel: String = "",
    val hasKey: Boolean = false,
    val auth: String = "api-key",
    val signedIn: Boolean = false,
    val available: Boolean = true,
    val usable: Boolean = false,
    val models: List<ModelOption> = emptyList(),
)

@Serializable
data class ModelSelection(
    val provider: String? = null,
    val model: String? = null,
    val projectPath: String? = null,
)

@Serializable
data class ModelsCatalogResponse(
    val provider: String? = null,
    val model: String? = null,
    val selection: ModelSelection? = null,
    val models: List<ModelOption> = emptyList(),
    val providers: List<ModelProviderInfo> = emptyList(),
) {
    val effectiveProvider: String?
        get() = selection?.provider?.takeIf { it.isNotBlank() }
            ?: provider?.takeIf { it.isNotBlank() }
            ?: providers.firstOrNull { it.usable }?.id

    val effectiveModel: String?
        get() = selection?.model?.takeIf { it.isNotBlank() }
            ?: model?.takeIf { it.isNotBlank() }
            ?: providers.firstOrNull { it.id == effectiveProvider }?.defaultModel?.takeIf { it.isNotBlank() }
}

@Serializable
data class ChiefPreset(
    val id: String = "",
    val label: String = "",
    val description: String = "",
)

@Serializable
data class ChiefSettingsData(
    val preset: String = "balanced",
    val advisorEnabled: Boolean = true,
)

@Serializable
data class ChiefSettingsResponse(
    val settings: ChiefSettingsData = ChiefSettingsData(),
    val presets: List<ChiefPreset> = emptyList(),
)

@Serializable
data class CronJob(
    val id: String = "",
    val title: String = "",
    val name: String = "",
    val goal: String = "",
    val prompt: String = "",
    val every: String = "",
    val interval: String = "",
    val recurrence: String? = null,
    val atTime: String? = null,
    val daysOfWeek: List<Int> = emptyList(),
    val runAt: String? = null,
    val enabled: Boolean = true,
    val status: String? = null,
    val failures: Int = 0,
    val error: String? = null,
    val nextRunAt: String? = null,
    val lastRunAt: String? = null,
)

@Serializable
data class CronListResponse(
    val jobs: List<CronJob> = emptyList(),
)

@Serializable
data class ScheduleItem(
    val id: String = "",
    val source: String = "cowork", // "cron" | "cowork" | "followup"
    val sourceId: String = "",
    val title: String = "",
    val goal: String = "",
    val every: String = "",
    val recurrence: String = "interval", // "interval" | "daily" | "weekdays" | "weekly" | "once"
    val atTime: String? = null,
    val daysOfWeek: List<Int> = emptyList(),
    val runAt: String? = null,
    val timezone: String? = null,
    val enabled: Boolean = true,
    val status: String = "scheduled",
    val lastRunAt: String? = null,
    val nextRunAt: String? = null,
    val lastRunId: String? = null,
    val failures: Int = 0,
    val error: String? = null,
    val agentId: String? = null,
    val agentName: String? = null,
    val agentColor: String? = null,
    val agentShape: String? = null,
    val agentAvatarUrl: String? = null,
    val conversationId: String? = null,
    val conversationTitle: String? = null,
)

@Serializable
data class ScheduleAgentSummary(
    val id: String = "",
    val name: String = "",
    val color: String? = null,
    val shape: String? = null,
    val avatarUrl: String? = null,
    val tagline: String? = null,
)

@Serializable
data class ScheduleConvSummary(
    val id: String = "",
    val kind: String = "dm",
    val title: String = "",
    val memberIds: List<String> = emptyList(),
    val hasSchedule: Boolean = false,
)

@Serializable
data class SchedulesResponse(
    val ok: Boolean = true,
    val message: String? = null,
    val timezone: String = "",
    val now: String = "",
    val hasProject: Boolean = false,
    val items: List<ScheduleItem> = emptyList(),
    val agents: List<ScheduleAgentSummary> = emptyList(),
    val conversations: List<ScheduleConvSummary> = emptyList(),
)

@Serializable
data class LocalLinkPeer(
    val id: String = "",
    val deviceName: String = "",
    val online: Boolean = false,
    val platform: String? = null,
    val hostname: String? = null,
)

@Serializable
data class LocalLinkHub(
    val peers: List<LocalLinkPeer> = emptyList(),
)

@Serializable
data class LocalLinkClientStatus(
    val configured: Boolean = false,
    val enabled: Boolean = false,
    val connected: Boolean = false,
    val deviceName: String = "",
)

@Serializable
data class LocalLinkStatusResponse(
    val hub: LocalLinkHub = LocalLinkHub(),
    val client: LocalLinkClientStatus = LocalLinkClientStatus(),
)

@Serializable
data class PushStatus(
    val available: Boolean = false,
    val enabled: Boolean = false,
    val workspaceId: String = "",
)

// --- Native LiveKit Voice Calling ---

@Serializable
data class VoiceWorkerStatus(
    val phase: String = "idle",
    val message: String = "",
    val agentId: String? = null,
)

@Serializable
data class VoiceWalletStatus(
    val spendableCredits: Double? = null,
    val eligible: Boolean = true,
)

@Serializable
data class VoicePricingInfo(
    val participantCreditsPerMin: Double? = null,
    val agentCreditsPerMin: Double? = null,
)

@Serializable
data class VoiceConfigStatus(
    val configured: Boolean = false,
    val mode: String = "",
    val url: String = "",
    val agentName: String = "gitu-voice",
    val pikpamConnected: Boolean = false,
    val pikpamAvailable: Boolean? = null,
    val worker: VoiceWorkerStatus? = null,
    val wallet: VoiceWalletStatus? = null,
    val pricing: VoicePricingInfo? = null,
)

@Serializable
data class VoiceCallStartResponse(
    val callId: String = "",
    val url: String = "",
    val token: String = "",
    val name: String = "",
    val mode: String = "",
)

@Serializable
data class VoiceReplyPayload(
    val text: String = "",
    val runId: String? = null,
)

// --- Offline Cache Envelopes ---

@Serializable
data class CachedRunSnapshot(
    val run: Run,
    val events: List<RunEvent> = emptyList(),
    val savedAtMs: Long = 0L,
)

@Serializable
data class CachedTeamSnapshot(
    val conversationId: String,
    val threadId: String = "main",
    val view: TeamView,
    val savedAtMs: Long = 0L,
)
