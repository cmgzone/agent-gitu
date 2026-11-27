package dev.agentgitu.mobile.ui.viewmodel

import android.Manifest
import android.app.Application
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.messaging.FirebaseMessaging
import dev.agentgitu.mobile.data.local.SavedServerConfig
import dev.agentgitu.mobile.data.local.SessionStore
import dev.agentgitu.mobile.data.local.ThemePreference
import dev.agentgitu.mobile.data.model.*
import dev.agentgitu.mobile.data.network.ConnectionMode
import dev.agentgitu.mobile.data.network.GituApiClient
import dev.agentgitu.mobile.data.network.GituApiException
import dev.agentgitu.mobile.data.network.PikpamClient
import dev.agentgitu.mobile.data.network.PikpamCloudInstance
import dev.agentgitu.mobile.data.network.ServerUrlValidator
import dev.agentgitu.mobile.push.GituMessagingService
import dev.agentgitu.mobile.push.PushNavigationTarget
import dev.agentgitu.mobile.voice.LiveKitVoiceManager
import dev.agentgitu.mobile.voice.VoiceCallTarget
import dev.agentgitu.mobile.voice.VoiceCallUiState
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import java.util.UUID

enum class MainTab {
    COWORK,
    CODING,
    DESKTOP,
    SETTINGS,
}

data class LiveSurfaceRequest(
    val title: String,
    val url: String,
    val subtitle: String = "",
    val computerAgentId: String? = null,
    val isServerBrowser: Boolean = false,
)

data class AppUiState(
    val initialized: Boolean = false,
    val connected: Boolean = false,
    val connecting: Boolean = false,
    val isRefreshing: Boolean = false,
    val serverUrl: String = "http://10.0.2.2:8321",
    val connectionMode: ConnectionMode = ConnectionMode.LOCAL,
    val savedEmail: String = "",
    val serverVersion: String = "",
    val connectedAgentName: String = "",

    // Pikpam Direct Sign-in & Discovered Cloud Agents
    val pikpamSignedIn: Boolean = false,
    val pikpamBusy: Boolean = false,
    val pikpamUserName: String = "",
    val pikpamEmail: String = "",
    val pikpamCreditsLabel: String = "",
    val pikpamInstances: List<PikpamCloudInstance> = emptyList(),
    val pikpamFreeClaimEligible: Boolean = false,
    val connectingInstanceId: String? = null,
    val themePreference: ThemePreference = ThemePreference.DARK,
    val deviceId: String = "",
    val activeTab: MainTab = MainTab.COWORK,
    val showFilesExplorer: Boolean = false,
    val serverHealthOk: Boolean? = null,
    val bannerMessage: String? = null,
    val errorMessage: String? = null,
    val offlineMode: Boolean = false,

    // Agent Runs & Projects
    val projects: List<Project> = emptyList(),
    val selectedProjectPath: String = "",
    val runs: List<Run> = emptyList(),
    val selectedRunId: String? = null,
    val activeRun: Run? = null,
    val activeRunEvents: List<RunEvent> = emptyList(),
    val activeRunCursor: Int = -1,
    val activeCheckpoints: List<RunCheckpoint> = emptyList(),
    val settledCodingGateIds: Set<String> = emptySet(),
    val gitStatus: GitStatus? = null,
    val gitDiff: String = "",
    val modelsCatalog: ModelsCatalogResponse = ModelsCatalogResponse(),

    // Files
    val fileListing: FileListing? = null,
    val loadingFiles: Boolean = false,

    // Cowork
    val teammates: List<Teammate> = emptyList(),
    val conversations: List<TeamConversation> = emptyList(),
    val selectedConversationId: String? = null,
    val selectedThreadId: String = "main",
    val activeTeamView: TeamView? = null,
    val selectedProfileAgentId: String? = null,
    val pendingAttachments: List<PendingAttachment> = emptyList(),
    val referencedMessageIds: List<String> = emptyList(),
    val settledRequestIds: Set<String> = emptySet(),

    // Interactive Computer & Handoff
    val agentComputers: Map<String, AgentComputerStatus> = emptyMap(),
    val computerActionBusy: Set<String> = emptySet(),
    val inlineComputerAgentId: String? = null,
    val inlineComputerDismissedKey: String? = null,

    // Native Connections Page
    val showConnectionsScreen: Boolean = false,
    val connectionsAgentId: String = "",
    val connectedApps: ConnectedAppsResponse = ConnectedAppsResponse(),
    val customConnections: List<CustomConnectionProfile> = emptyList(),
    val connectionsLoading: Boolean = false,
    val pendingOAuthUrl: String? = null,
    val appAuthLinksByRequest: Map<String, String> = emptyMap(),

    // Inbox
    val inboxState: InboxStateResponse? = null,
    val selectedInboxRoomId: String? = null,
    val inboxMessages: List<InboxMessage> = emptyList(),
    val inboxActiveAgentTurnIds: List<String> = emptyList(),
    val inboxWatching: Boolean = false,
    val inboxWorkspace: InboxWorkspaceResponse? = null,
    val inboxWorkspaceLoading: Boolean = false,
    val inboxSummarizing: Boolean = false,
    val inboxDelegatingTaskId: String? = null,
    val latestInboxInviteUrl: String = "",

    // Settings
    val homeInfo: HomeInfo? = null,
    val codingPermissions: CodingPermissions = CodingPermissions(),
    val chiefSettings: ChiefSettingsResponse = ChiefSettingsResponse(),
    val cronJobs: List<CronJob> = emptyList(),
    val localLinkStatus: LocalLinkStatusResponse? = null,
    val pushStatus: PushStatus = PushStatus(),
    val pushBusy: Boolean = false,

    // Live Web Surface overlay (Desktop noVNC, Voice Call, Browser, Artifact Preview)
    val liveSurface: LiveSurfaceRequest? = null,
)

class GituAppViewModel(application: Application) : AndroidViewModel(application) {

    private val store = SessionStore(application.applicationContext)
    private val pikpam = PikpamClient()
    private var pikpamToken: String = ""
    private var api: GituApiClient? = null
    private var runPollJob: Job? = null
    private var teamPollJob: Job? = null
    private var inboxPollJob: Job? = null
    private var computerPollJob: Job? = null
    private var pendingPushTarget: PushNavigationTarget? = null

    private val _uiState = MutableStateFlow(AppUiState())
    val uiState: StateFlow<AppUiState> = _uiState.asStateFlow()

    private val voiceManager = LiveKitVoiceManager(
        appContext = application.applicationContext,
        scope = viewModelScope,
        pikpamClient = pikpam,
        onReplyAccepted = { target, replyRunId ->
            if (target.kind == "main") {
                if (!replyRunId.isNullOrBlank()) {
                    openRun(replyRunId)
                }
                refreshAgentWorkspace()
            } else if (target.kind == "cowork") {
                val convId = target.conversationId
                if (!convId.isNullOrBlank() && _uiState.value.selectedConversationId == convId) {
                    refreshActiveConversationOnce()
                }
                refreshCowork()
            }
        },
        onNotice = { message, isError ->
            _uiState.update {
                if (isError) it.copy(errorMessage = message) else it.copy(bannerMessage = message)
            }
        },
    )

    val voiceState: StateFlow<VoiceCallUiState> = voiceManager.state

    private val _pendingMicPermissionTarget = MutableStateFlow<VoiceCallTarget?>(null)
    val pendingMicPermissionTarget: StateFlow<VoiceCallTarget?> = _pendingMicPermissionTarget.asStateFlow()

    init {
        viewModelScope.launch {
            val saved: SavedServerConfig = store.loadConfig()
            val cachedRun = store.loadCachedRun()
            val cachedTeam = store.loadCachedTeam()
            _uiState.update {
                it.copy(
                    initialized = true,
                    serverUrl = saved.serverUrl,
                    connectionMode = saved.mode,
                    savedEmail = saved.lastEmail,
                    themePreference = saved.theme,
                    deviceId = saved.deviceId,
                    activeRun = cachedRun?.run,
                    activeRunEvents = cachedRun?.events.orEmpty(),
                    activeTeamView = cachedTeam?.view,
                )
            }
        }
        viewModelScope.launch {
            GituMessagingService.tokenUpdates.collect { newToken ->
                val client = api ?: return@collect
                val deviceId = _uiState.value.deviceId
                if (_uiState.value.pushStatus.enabled && deviceId.isNotBlank()) {
                    runCatching { client.registerPush(deviceId, newToken) }
                        .onSuccess { status -> _uiState.update { it.copy(pushStatus = status) } }
                }
            }
        }
    }

    fun applyConnectLink(rawLink: String?) {
        val parsed = ServerUrlValidator.parseConnectLink(rawLink) ?: return
        if (_uiState.value.connected) return
        _uiState.update {
            it.copy(
                serverUrl = parsed.server,
                connectionMode = parsed.mode,
                bannerMessage = "Server address filled from QR link. Confirm and sign in.",
                errorMessage = null,
            )
        }
    }

    fun handlePushDeepLink(target: PushNavigationTarget) {
        pendingPushTarget = target
        if (_uiState.value.connected) {
            consumePendingPushTarget()
        }
    }

    private fun consumePendingPushTarget() {
        val target = pendingPushTarget ?: return
        pendingPushTarget = null
        when (target.target) {
            "run" -> {
                _uiState.update { it.copy(activeTab = MainTab.CODING) }
                openRun(target.targetId)
            }
            "cowork" -> {
                _uiState.update { it.copy(activeTab = MainTab.COWORK) }
                openConversation(target.targetId, target.threadId ?: "main")
            }
            else -> _uiState.update { it.copy(activeTab = MainTab.COWORK) }
        }
    }

    fun clearNotices() {
        _uiState.update { it.copy(errorMessage = null, bannerMessage = null) }
    }

    fun setThemePreference(theme: ThemePreference) {
        _uiState.update { it.copy(themePreference = theme) }
        viewModelScope.launch { store.saveTheme(theme) }
    }

    fun selectTab(tab: MainTab) {
        _uiState.update { it.copy(activeTab = tab, showFilesExplorer = false) }
        if (!_uiState.value.connected) return
        when (tab) {
            MainTab.COWORK -> {
                refreshCowork()
                refreshInbox()
                refreshAgentWorkspace()
            }
            MainTab.CODING -> refreshAgentWorkspace()
            MainTab.DESKTOP -> {
                refreshCowork()
                refreshAllAgentComputers()
            }
            MainTab.SETTINGS -> refreshSettings()
        }
    }

    fun openFilesExplorer() {
        _uiState.update { it.copy(activeTab = MainTab.CODING, showFilesExplorer = true) }
        val path = _uiState.value.selectedProjectPath
        if (path.isNotBlank()) {
            loadFiles(path, "")
            refreshGit(path)
        }
    }

    fun closeFilesExplorer() {
        _uiState.update { it.copy(showFilesExplorer = false) }
    }

    fun pingServer(rawUrl: String) {
        viewModelScope.launch {
            runCatching {
                val client = GituApiClient(rawUrl)
                client.health()
            }.onSuccess { health ->
                _uiState.update {
                    it.copy(
                        serverHealthOk = true,
                        bannerMessage = "/healthz OK (${health.status}). Ready to sign in.",
                        errorMessage = null,
                    )
                }
            }.onFailure { err ->
                _uiState.update {
                    it.copy(
                        serverHealthOk = false,
                        errorMessage = err.message ?: "Server did not respond to /healthz.",
                    )
                }
            }
        }
    }

    fun signInWithPikpam(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Enter your Pikpam email and password.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(pikpamBusy = true, errorMessage = null, bannerMessage = null) }
            try {
                val login = pikpam.login(email.trim(), password)
                pikpamToken = login.token
                store.saveConnection(_uiState.value.serverUrl, ConnectionMode.REMOTE, email.trim())
                loadPikpamAccountInternal(fallbackEmail = login.user?.email ?: email.trim(), fallbackName = login.user?.name)
            } catch (err: Exception) {
                _uiState.update {
                    it.copy(
                        pikpamBusy = false,
                        errorMessage = err.message ?: "Pikpam sign-in failed.",
                    )
                }
            }
        }
    }

    fun refreshPikpamAgents() {
        if (pikpamToken.isBlank()) return
        viewModelScope.launch {
            _uiState.update { it.copy(pikpamBusy = true, errorMessage = null) }
            try {
                loadPikpamAccountInternal(
                    fallbackEmail = _uiState.value.pikpamEmail,
                    fallbackName = _uiState.value.pikpamUserName,
                )
            } catch (err: Exception) {
                _uiState.update {
                    it.copy(
                        pikpamBusy = false,
                        errorMessage = err.message ?: "Could not refresh Pikpam agents.",
                    )
                }
            }
        }
    }

    private suspend fun loadPikpamAccountInternal(fallbackEmail: String, fallbackName: String?) {
        val account = pikpam.fetchAccount(pikpamToken)
        val userEmail = account.user?.email?.ifBlank { fallbackEmail } ?: fallbackEmail
        val userName = account.user?.name?.ifBlank { fallbackName ?: userEmail.substringBefore('@') }
            ?: (fallbackName?.ifBlank { userEmail.substringBefore('@') } ?: userEmail.substringBefore('@'))
        val creditsLabel = account.credits?.let { c ->
            val avail = c.available ?: c.balance
            val formatted = c.currencyFormatted?.takeIf { it.isNotBlank() }
            if (formatted != null) "${"%.0f".format(avail)} credits ($formatted)" else "${"%.0f".format(avail)} credits"
        }.orEmpty()
        val eligible = account.freeClaim?.let { it.eligible && it.available && !it.claimed } == true
        val discoveredCount = account.instances.size
        _uiState.update {
            it.copy(
                pikpamSignedIn = true,
                pikpamBusy = false,
                pikpamEmail = userEmail,
                savedEmail = userEmail,
                pikpamUserName = userName,
                pikpamCreditsLabel = creditsLabel,
                pikpamInstances = account.instances,
                pikpamFreeClaimEligible = eligible,
                bannerMessage = if (discoveredCount > 0) {
                    "Found $discoveredCount Agent ${if (discoveredCount == 1) "instance" else "instances"} on your Pikpam account. Tap one to connect."
                } else {
                    "Signed in to Pikpam. No Cloud Agents found yet."
                },
            )
        }
    }

    fun signOutPikpam() {
        pikpamToken = ""
        api?.setPikpamToken("")
        _uiState.update {
            it.copy(
                pikpamSignedIn = false,
                pikpamInstances = emptyList(),
                pikpamCreditsLabel = "",
                pikpamFreeClaimEligible = false,
                connectingInstanceId = null,
                bannerMessage = "Signed out of Pikpam.",
                errorMessage = null,
            )
        }
    }

    fun claimFreePikpamCloud(instanceName: String) {
        if (pikpamToken.isBlank()) return
        viewModelScope.launch {
            _uiState.update { it.copy(pikpamBusy = true, errorMessage = null) }
            try {
                pikpam.claimFreeCloud(pikpamToken, instanceName.ifBlank { null })
                loadPikpamAccountInternal(_uiState.value.pikpamEmail, _uiState.value.pikpamUserName)
                _uiState.update { it.copy(bannerMessage = "Free Cloud Agent claimed! It will appear active once provisioning finishes.") }
            } catch (err: Exception) {
                _uiState.update { it.copy(pikpamBusy = false, errorMessage = err.message ?: "Could not claim free Cloud Agent.") }
            }
        }
    }

    fun connectToPikpamAgent(instance: PikpamCloudInstance) {
        if (pikpamToken.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Sign in with Pikpam first.") }
            return
        }
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    connecting = true,
                    connectingInstanceId = instance.id,
                    errorMessage = null,
                    bannerMessage = null,
                )
            }
            try {
                val access = pikpam.fetchInstanceAccess(pikpamToken, instance.id)
                if (!access.status.equals("ACTIVE", ignoreCase = true)) {
                    throw GituApiException(
                        access.error ?: "Agent \"${instance.name}\" is currently ${access.status}. Wait until it is ACTIVE.",
                    )
                }
                val rawUrl = access.agentUrl?.takeIf { it.isNotBlank() }
                    ?: instance.agentUrl?.takeIf { it.isNotBlank() }
                    ?: throw GituApiException("This Cloud Agent does not have an HTTPS endpoint yet.")

                val normalized = ServerUrlValidator.normalizeServerUrl(rawUrl)
                val client = GituApiClient(normalized)
                client.setPikpamToken(pikpamToken)
                val status = client.connectWithPikpamToken(pikpamToken, access.registrationToken)
                api = client
                store.saveConnection(normalized, ConnectionMode.REMOTE, _uiState.value.pikpamEmail)
                _uiState.update {
                    it.copy(
                        connected = true,
                        connecting = false,
                        connectingInstanceId = null,
                        offlineMode = false,
                        serverUrl = normalized,
                        connectionMode = ConnectionMode.REMOTE,
                        connectedAgentName = access.name?.ifBlank { instance.name } ?: instance.name,
                        serverVersion = status.version.orEmpty(),
                        bannerMessage = "Connected to ${instance.name}",
                    )
                }
                refreshAll()
                consumePendingPushTarget()
            } catch (err: Exception) {
                _uiState.update {
                    it.copy(
                        connecting = false,
                        connectingInstanceId = null,
                        errorMessage = err.message ?: "Could not connect to ${instance.name}.",
                    )
                }
            }
        }
    }

    fun connect(
        rawUrl: String,
        mode: ConnectionMode,
        accessKey: String,
        email: String,
        password: String,
        usePikpamAuth: Boolean = false,
    ) {
        viewModelScope.launch {
            _uiState.update { it.copy(connecting = true, errorMessage = null, bannerMessage = null) }
            try {
                val normalized = ServerUrlValidator.normalizeServerUrl(rawUrl)
                val client = GituApiClient(normalized, accessKey.trim())
                if (pikpamToken.isNotBlank()) client.setPikpamToken(pikpamToken)
                val status = when {
                    usePikpamAuth && pikpamToken.isNotBlank() ->
                        client.connectWithPikpamToken(pikpamToken)
                    usePikpamAuth ->
                        client.connectWithPikpamCredentials(email.trim(), password)
                    else ->
                        client.connect(email.trim(), password)
                }
                api = client
                store.saveConnection(normalized, mode, email.trim())
                _uiState.update {
                    it.copy(
                        connected = true,
                        connecting = false,
                        offlineMode = false,
                        serverUrl = normalized,
                        connectionMode = mode,
                        connectedAgentName = "",
                        savedEmail = email.trim(),
                        serverVersion = status.version.orEmpty(),
                        bannerMessage = "Connected to Agent Gitu",
                    )
                }
                refreshAll()
                consumePendingPushTarget()
            } catch (err: Exception) {
                _uiState.update {
                    it.copy(
                        connecting = false,
                        errorMessage = err.message ?: "Could not connect to Agent Gitu.",
                    )
                }
            }
        }
    }

    fun disconnect() {
        voiceManager.endCall()
        stopAllPolling()
        val client = api
        api = null
        viewModelScope.launch {
            runCatching { client?.disconnect() }
            _uiState.update {
                it.copy(
                    connected = false,
                    selectedRunId = null,
                    selectedConversationId = null,
                    selectedInboxRoomId = null,
                    liveSurface = null,
                    bannerMessage = "Signed out. Server tasks keep running in the background.",
                    errorMessage = null,
                )
            }
        }
    }

    fun refreshAll() {
        refreshAgentWorkspace()
        refreshCowork()
        refreshInbox()
        refreshSettings()
    }

    // --- Agent Runs, Git, Checkpoints ---

    fun refreshAgentWorkspace() {
        val client = api ?: return
        viewModelScope.launch {
            try {
                val projects = client.listProjects()
                val runs = client.listRuns()
                val models = runCatching { client.modelsCatalog() }.getOrElse { ModelsCatalogResponse() }
                _uiState.update { state ->
                    val projPath = state.selectedProjectPath.ifBlank { projects.firstOrNull()?.path.orEmpty() }
                    state.copy(
                        projects = projects,
                        selectedProjectPath = projPath,
                        runs = runs,
                        modelsCatalog = models,
                        offlineMode = false,
                    )
                }
                val activePath = _uiState.value.selectedProjectPath
                if (activePath.isNotBlank()) {
                    refreshGit(activePath)
                }
            } catch (err: Exception) {
                handleApiError(err)
            }
        }
    }

    fun selectProject(path: String) {
        val currentRun = _uiState.value.activeRun
        val sameProject = currentRun != null && isRunForProject(currentRun, path)
        if (!sameProject) {
            runPollJob?.cancel()
        }
        _uiState.update {
            it.copy(
                selectedProjectPath = path,
                fileListing = null,
                selectedRunId = if (sameProject) it.selectedRunId else null,
                activeRun = if (sameProject) it.activeRun else null,
                activeRunEvents = if (sameProject) it.activeRunEvents else emptyList(),
                activeRunCursor = if (sameProject) it.activeRunCursor else -1,
                activeCheckpoints = if (sameProject) it.activeCheckpoints else emptyList(),
            )
        }
        refreshGit(path)
        if (_uiState.value.showFilesExplorer) {
            loadFiles(path, "")
        }
    }

    fun isRunForProject(run: Run, projectPath: String): Boolean {
        if (projectPath.isBlank()) return true
        val normTarget = projectPath.trimEnd('/', '\\')
        val normRun = (run.projectPath ?: "").trimEnd('/', '\\')
        if (normRun.isNotBlank() && normRun.equals(normTarget, ignoreCase = true)) return true
        val projName = normTarget.substringAfterLast('/').substringAfterLast('\\')
        return !run.project.isNullOrBlank() && projName.isNotBlank() && run.project.equals(projName, ignoreCase = true)
    }

    fun startRun(goal: String, mode: String, provider: String?, model: String?, effort: String?) {
        val client = api ?: return
        val projectPath = _uiState.value.selectedProjectPath
        if (goal.isBlank()) return
        viewModelScope.launch {
            try {
                val started = client.startRun(
                    goal = goal.trim(),
                    projectPath = projectPath,
                    mode = mode,
                    provider = provider,
                    model = model,
                    effort = effort,
                )
                refreshAgentWorkspace()
                if (started.runId.isNotBlank()) {
                    openRun(started.runId)
                }
            } catch (err: Exception) {
                handleApiError(err)
            }
        }
    }

    fun openRun(runId: String) {
        runPollJob?.cancel()
        val existing = _uiState.value.runs.firstOrNull { it.runId == runId }
        _uiState.update {
            it.copy(
                selectedRunId = runId,
                activeRun = existing ?: it.activeRun?.takeIf { r -> r.runId == runId },
                activeRunEvents = if (it.activeRun?.runId == runId) it.activeRunEvents else emptyList(),
                activeRunCursor = -1,
                activeCheckpoints = emptyList(),
            )
        }
        val client = api ?: return
        runPollJob = viewModelScope.launch {
            var cursor = -1
            while (isActive) {
                try {
                    var more = true
                    var latestSession: Run? = null
                    var merged = _uiState.value.activeRunEvents
                    while (more && isActive) {
                        val page = client.runEvents(runId, cursor)
                        latestSession = page.session
                        merged = mergeRunEvents(merged, page.events)
                        cursor = maxOf(cursor, page.cursor)
                        more = page.more
                    }
                    if (latestSession != null) {
                        val session = latestSession
                        _uiState.update { state ->
                            state.copy(
                                activeRun = session,
                                activeRunEvents = merged,
                                activeRunCursor = cursor,
                                runs = state.runs.map { if (it.runId == session.runId) session else it },
                                offlineMode = false,
                            )
                        }
                        store.cacheRunSnapshot(session, merged)
                    }
                    val intervalMs = if (_uiState.value.activeRun?.isRunning == true) 1_500L else 5_000L
                    delay(intervalMs)
                } catch (err: Exception) {
                    if (err is GituApiException && err.code == "APP_LOCKED") {
                        handleApiError(err)
                        break
                    }
                    _uiState.update { it.copy(offlineMode = true) }
                    delay(4_000L)
                }
            }
        }
        loadCheckpoints(runId)
    }

    fun closeRun() {
        runPollJob?.cancel()
        _uiState.update {
            it.copy(
                selectedRunId = null,
                activeRun = null,
                activeRunEvents = emptyList(),
                activeRunCursor = -1,
                activeCheckpoints = emptyList(),
            )
        }
        refreshAgentWorkspace()
    }

    fun refreshModels(forceRefresh: Boolean = false) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.modelsCatalog(forceRefresh = forceRefresh) }
                .onSuccess { catalog ->
                    _uiState.update { it.copy(modelsCatalog = catalog) }
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun selectWorkspaceModel(provider: String?, model: String?) {
        val client = api ?: return
        if (provider.isNullOrBlank() || model.isNullOrBlank()) return
        viewModelScope.launch {
            runCatching { client.saveModelSelection(provider, model) }
                .onSuccess { sel ->
                    _uiState.update {
                        it.copy(
                            modelsCatalog = it.modelsCatalog.copy(
                                provider = sel.provider ?: provider,
                                model = sel.model ?: model,
                                selection = sel,
                            ),
                            bannerMessage = "Switched model to ${model.substringAfterLast('/')}",
                        )
                    }
                    refreshModels(forceRefresh = false)
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun updateTeammateModel(teammate: Teammate, provider: String?, model: String?) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching {
                client.saveTeammate(
                    id = teammate.id,
                    name = teammate.name,
                    tagline = teammate.tagline,
                    systemPrompt = teammate.systemPrompt,
                    color = teammate.avatar.color ?: "#3F3F46",
                    shape = teammate.avatar.shape,
                    allowShell = teammate.allowShell,
                    allowWrites = teammate.allowWrites,
                    chiefOfStaff = teammate.chiefOfStaff,
                    provider = provider,
                    model = model,
                    effort = teammate.effort,
                    updateModel = true,
                )
            }.onSuccess {
                _uiState.update {
                    it.copy(
                        bannerMessage = if (model.isNullOrBlank()) {
                            "${teammate.name} now uses workspace default model."
                        } else {
                            "${teammate.name} switched to ${model.substringAfterLast('/')}"
                        },
                    )
                }
                refreshCowork()
            }.onFailure { handleApiError(it) }
        }
    }

    fun sendRunMessage(runId: String, text: String) {
        val client = api ?: return
        if (text.isBlank()) return
        viewModelScope.launch {
            runCatching { client.sendRunMessage(runId, text.trim()) }
                .onFailure { handleApiError(it) }
        }
    }

    fun stopRun(runId: String) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.stopRun(runId) }
                .onSuccess { _uiState.update { it.copy(bannerMessage = "Stop requested.") } }
                .onFailure { handleApiError(it) }
        }
    }

    fun deleteRun(runId: String) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.deleteRun(runId) }
                .onSuccess {
                    if (_uiState.value.selectedRunId == runId) closeRun()
                    refreshAgentWorkspace()
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun resolveApproval(approvalId: String, approved: Boolean) {
        val client = api ?: return
        _uiState.update { it.copy(settledCodingGateIds = it.settledCodingGateIds + approvalId) }
        viewModelScope.launch {
            runCatching { client.resolveApproval(approvalId, approved) }
                .onSuccess {
                    _uiState.update {
                        it.copy(bannerMessage = if (approved) "Action approved." else "Action denied.")
                    }
                }
                .onFailure { err ->
                    _uiState.update { it.copy(settledCodingGateIds = it.settledCodingGateIds - approvalId) }
                    handleApiError(err)
                }
        }
    }

    fun resolvePlanReview(reviewId: String, approved: Boolean, note: String) {
        val client = api ?: return
        _uiState.update { it.copy(settledCodingGateIds = it.settledCodingGateIds + reviewId) }
        viewModelScope.launch {
            runCatching { client.resolvePlanReview(reviewId, approved, note.trim()) }
                .onSuccess {
                    _uiState.update {
                        it.copy(bannerMessage = if (approved) "Plan approved." else "Plan revision requested.")
                    }
                }
                .onFailure { err ->
                    _uiState.update { it.copy(settledCodingGateIds = it.settledCodingGateIds - reviewId) }
                    handleApiError(err)
                }
        }
    }

    fun submitAnswer(answerId: String, answer: String) {
        val client = api ?: return
        if (answer.isBlank()) return
        _uiState.update { it.copy(settledCodingGateIds = it.settledCodingGateIds + answerId) }
        viewModelScope.launch {
            runCatching { client.submitAnswer(answerId, answer.trim()) }
                .onSuccess { _uiState.update { it.copy(bannerMessage = "Answer sent.") } }
                .onFailure { err ->
                    _uiState.update { it.copy(settledCodingGateIds = it.settledCodingGateIds - answerId) }
                    handleApiError(err)
                }
        }
    }

    fun submitRunConnection(
        runId: String,
        label: String? = null,
        provider: String? = null,
        baseUrl: String? = null,
        documentationUrl: String? = null,
        validationPath: String? = null,
        capabilities: List<String> = emptyList(),
        token: String,
        existingConnectionId: String? = null,
    ) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching {
                client.submitRunConnection(
                    runId = runId,
                    label = label,
                    provider = provider,
                    baseUrl = baseUrl,
                    documentationUrl = documentationUrl,
                    validationPath = validationPath,
                    capabilities = capabilities,
                    token = token,
                    existingConnectionId = existingConnectionId,
                )
            }.onSuccess {
                _uiState.update { it.copy(bannerMessage = "Connection ready — continuing your task.") }
                refreshConnections()
            }.onFailure { handleApiError(it) }
        }
    }

    fun loadCheckpoints(runId: String) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.runCheckpoints(runId).checkpoints }
                .onSuccess { cps -> _uiState.update { it.copy(activeCheckpoints = cps) } }
        }
    }

    fun restoreCheckpoint(runId: String, checkpointId: String) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.restoreCheckpoint(runId, checkpointId) }
                .onSuccess { _uiState.update { it.copy(bannerMessage = "Checkpoint restored.") } }
                .onFailure { handleApiError(it) }
        }
    }

    fun refreshGit(projectPath: String = _uiState.value.selectedProjectPath) {
        val client = api ?: return
        if (projectPath.isBlank()) return
        viewModelScope.launch {
            runCatching {
                val status = client.gitStatus(projectPath)
                val diff = if (status.isRepo) runCatching { client.gitDiff(projectPath).diff }.getOrDefault("") else ""
                status to diff
            }.onSuccess { (status, diff) ->
                _uiState.update { it.copy(gitStatus = status, gitDiff = diff) }
            }
        }
    }

    fun gitCommit(message: String) {
        val client = api ?: return
        val path = _uiState.value.selectedProjectPath
        if (path.isBlank() || message.isBlank()) return
        viewModelScope.launch {
            runCatching { client.gitCommit(path, message.trim()) }
                .onSuccess {
                    _uiState.update { it.copy(bannerMessage = "Changes committed.") }
                    refreshGit(path)
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun gitPush() {
        val client = api ?: return
        val path = _uiState.value.selectedProjectPath
        if (path.isBlank()) return
        viewModelScope.launch {
            runCatching { client.gitPush(path) }
                .onSuccess {
                    _uiState.update { it.copy(bannerMessage = "Pushed to remote.") }
                    refreshGit(path)
                }
                .onFailure { handleApiError(it) }
        }
    }

    // --- Files ---

    fun loadFiles(root: String, path: String = "") {
        val client = api ?: return
        if (root.isBlank()) return
        viewModelScope.launch {
            _uiState.update { it.copy(loadingFiles = true) }
            runCatching { client.listFiles(root, path) }
                .onSuccess { listing ->
                    _uiState.update { it.copy(fileListing = listing, loadingFiles = false) }
                }
                .onFailure { err ->
                    _uiState.update { it.copy(loadingFiles = false) }
                    handleApiError(err)
                }
        }
    }

    fun saveFile(listing: FileListing, content: String) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.saveFile(listing.root, listing.path, listing.revision, content) }
                .onSuccess {
                    _uiState.update { it.copy(bannerMessage = "Saved ${listing.path}") }
                    loadFiles(listing.root, listing.path)
                }
                .onFailure { handleApiError(it) }
        }
    }

    // --- Cowork / AI Teams ---

    fun refreshCowork() {
        val client = api ?: return
        viewModelScope.launch {
            try {
                val agents = client.listTeammates()
                val convs = client.listConversations()
                _uiState.update { it.copy(teammates = agents, conversations = convs, offlineMode = false) }
            } catch (err: Exception) {
                handleApiError(err)
            }
        }
    }

    fun saveTeammate(
        id: String?,
        name: String,
        tagline: String,
        systemPrompt: String,
        color: String,
        shape: String? = null,
        allowShell: Boolean,
        allowWrites: Boolean,
        chiefOfStaff: Boolean,
        pendingAvatarDataUrl: String? = null,
        removeAvatar: Boolean = false,
    ) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching {
                val saved = client.saveTeammate(
                    id = id,
                    name = name.trim(),
                    tagline = tagline.trim(),
                    systemPrompt = systemPrompt.trim(),
                    color = color,
                    shape = shape,
                    allowShell = allowShell,
                    allowWrites = allowWrites,
                    chiefOfStaff = chiefOfStaff,
                )
                when {
                    !pendingAvatarDataUrl.isNullOrBlank() && saved.id.isNotBlank() -> {
                        client.uploadAgentAvatar(saved.id, pendingAvatarDataUrl)
                    }
                    removeAvatar && !id.isNullOrBlank() && saved.id.isNotBlank() -> {
                        client.deleteAgentAvatar(saved.id)
                    }
                }
                saved
            }.onSuccess {
                _uiState.update { it.copy(bannerMessage = "Teammate saved.") }
                refreshCowork()
            }.onFailure { handleApiError(it) }
        }
    }

    fun uploadAgentAvatar(agentId: String, dataUrl: String) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.uploadAgentAvatar(agentId, dataUrl) }
                .onSuccess {
                    _uiState.update { it.copy(bannerMessage = "Avatar photo updated.") }
                    refreshCowork()
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun deleteAgentAvatar(agentId: String) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.deleteAgentAvatar(agentId) }
                .onSuccess {
                    _uiState.update { it.copy(bannerMessage = "Switched back to plush avatar.") }
                    refreshCowork()
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun createConversation(memberIds: List<String>, title: String?, chiefId: String?) {
        val client = api ?: return
        if (memberIds.isEmpty()) return
        viewModelScope.launch {
            runCatching { client.createConversation(memberIds, title?.trim(), chiefId) }
                .onSuccess { conv ->
                    refreshCowork()
                    openConversation(conv.id)
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun openConversation(conversationId: String, threadId: String = "main") {
        teamPollJob?.cancel()
        val conv = _uiState.value.conversations.firstOrNull { it.id == conversationId }
        val primaryAgentId = conv?.memberIds?.firstOrNull().orEmpty()
        _uiState.update {
            it.copy(
                selectedConversationId = conversationId,
                selectedThreadId = threadId,
                referencedMessageIds = emptyList(),
                inlineComputerAgentId = null,
                inlineComputerDismissedKey = null,
            )
        }
        if (primaryAgentId.isNotBlank()) {
            refreshConnections(primaryAgentId)
            refreshAgentComputer(primaryAgentId)
        }
        val client = api ?: return
        teamPollJob = viewModelScope.launch {
            var pollTick = 0
            while (isActive) {
                try {
                    val view = client.teamChat(conversationId, _uiState.value.selectedThreadId)
                    _uiState.update { it.copy(activeTeamView = view, offlineMode = false) }
                    store.cacheTeamSnapshot(conversationId, _uiState.value.selectedThreadId, view)
                    val targetCompAgent = _uiState.value.inlineComputerAgentId
                        ?: view.requests.firstOrNull { it.desktopHandoff && (it.status == "open" || it.status == "pending") }?.agentId
                        ?: primaryAgentId
                    if (targetCompAgent.isNotBlank() && (pollTick % 2 == 0 || _uiState.value.inlineComputerAgentId != null || view.busy)) {
                        runCatching { client.getAgentComputer(targetCompAgent) }
                            .onSuccess { res ->
                                val cid = res.computer.agentId.ifBlank { targetCompAgent }
                                _uiState.update { st ->
                                    st.copy(agentComputers = st.agentComputers + (cid to res.computer.copy(agentId = cid)))
                                }
                            }
                    }
                    pollTick++
                    delay(if (view.busy) 1_500L else 4_500L)
                } catch (err: Exception) {
                    if (err is GituApiException && err.code == "APP_LOCKED") {
                        handleApiError(err)
                        break
                    }
                    _uiState.update { it.copy(offlineMode = true) }
                    delay(4_000L)
                }
            }
        }
    }

    fun closeConversation() {
        teamPollJob?.cancel()
        computerPollJob?.cancel()
        _uiState.update {
            it.copy(
                selectedConversationId = null,
                referencedMessageIds = emptyList(),
                inlineComputerAgentId = null,
                inlineComputerDismissedKey = null,
            )
        }
        refreshCowork()
    }

    fun switchThread(threadId: String) {
        val convId = _uiState.value.selectedConversationId ?: return
        openConversation(convId, threadId)
    }

    fun createThread(title: String) {
        val client = api ?: return
        val convId = _uiState.value.selectedConversationId ?: return
        if (title.isBlank()) return
        viewModelScope.launch {
            runCatching { client.createTeamThread(convId, title.trim()) }
                .onSuccess { thread -> openConversation(convId, thread.id) }
                .onFailure { handleApiError(it) }
        }
    }

    fun sendTeamMessage(text: String) {
        val client = api ?: return
        val convId = _uiState.value.selectedConversationId ?: return
        val threadId = _uiState.value.selectedThreadId
        val attachments = _uiState.value.pendingAttachments
        val refs = _uiState.value.referencedMessageIds
        if (text.isBlank() && attachments.isEmpty()) return
        val cleanText = text.trim().ifBlank { "Attached ${attachments.joinToString(", ") { it.name }}" }
        _uiState.update { it.copy(pendingAttachments = emptyList(), referencedMessageIds = emptyList()) }
        viewModelScope.launch {
            val msgId = "msg_${UUID.randomUUID().toString().replace("-", "").take(16)}"
            runCatching { client.sendTeamMessage(convId, msgId, cleanText, threadId, attachments, refs) }
                .onSuccess { refreshActiveConversationOnce() }
                .onFailure {
                    _uiState.update { st -> st.copy(pendingAttachments = attachments, referencedMessageIds = refs) }
                    handleApiError(it)
                }
        }
    }

    fun editTeamMessage(messageId: String, newText: String, revision: Int) {
        val client = api ?: return
        val convId = _uiState.value.selectedConversationId ?: return
        val clean = newText.trim()
        if (clean.isBlank()) return
        viewModelScope.launch {
            runCatching { client.editTeamMessage(convId, messageId, clean, revision) }
                .onSuccess {
                    _uiState.update { it.copy(bannerMessage = "Message updated.") }
                    refreshActiveConversationOnce()
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun retryTeamMessage(messageId: String, attempt: Int) {
        val client = api ?: return
        val convId = _uiState.value.selectedConversationId ?: return
        viewModelScope.launch {
            runCatching { client.retryTeamMessage(convId, messageId, attempt) }
                .onSuccess {
                    _uiState.update { it.copy(bannerMessage = "Retrying message…") }
                    refreshActiveConversationOnce()
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun deleteTeamMessage(messageId: String) {
        val client = api ?: return
        val convId = _uiState.value.selectedConversationId ?: return
        viewModelScope.launch {
            runCatching { client.deleteTeamMessage(convId, messageId) }
                .onSuccess {
                    _uiState.update { st ->
                        st.copy(
                            activeTeamView = st.activeTeamView?.copy(
                                messages = st.activeTeamView.messages.filterNot { it.id == messageId },
                            ),
                            referencedMessageIds = st.referencedMessageIds.filterNot { it == messageId },
                            bannerMessage = "Message deleted.",
                        )
                    }
                    refreshActiveConversationOnce()
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun toggleReferencedMessage(messageId: String) {
        _uiState.update { st ->
            val current = st.referencedMessageIds
            val next = if (messageId in current) {
                current.filterNot { it == messageId }
            } else {
                (current + messageId).takeLast(5)
            }
            st.copy(referencedMessageIds = next)
        }
    }

    fun removeReferencedMessage(messageId: String) {
        _uiState.update { st ->
            st.copy(referencedMessageIds = st.referencedMessageIds.filterNot { it == messageId })
        }
    }

    fun clearReferencedMessages() {
        _uiState.update { it.copy(referencedMessageIds = emptyList()) }
    }

    fun addPendingAttachment(attachment: PendingAttachment) {
        _uiState.update { it.copy(pendingAttachments = (it.pendingAttachments + attachment).take(6)) }
    }

    fun removePendingAttachment(index: Int) {
        _uiState.update { st ->
            st.copy(pendingAttachments = st.pendingAttachments.filterIndexed { i, _ -> i != index })
        }
    }

    fun openAgentProfile(agentId: String) {
        _uiState.update { it.copy(selectedProfileAgentId = agentId) }
        refreshConnections(agentId)
    }

    fun closeAgentProfile() {
        _uiState.update { it.copy(selectedProfileAgentId = null) }
    }

    fun deleteTeammate(agentId: String) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.deleteTeammate(agentId) }
                .onSuccess {
                    _uiState.update {
                        it.copy(
                            selectedProfileAgentId = null,
                            bannerMessage = "Teammate removed.",
                        )
                    }
                    refreshCowork()
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun createProject(name: String) {
        val client = api ?: return
        if (name.isBlank()) return
        viewModelScope.launch {
            runCatching { client.createProject(name.trim()) }
                .onSuccess { created ->
                    runPollJob?.cancel()
                    _uiState.update {
                        it.copy(
                            selectedProjectPath = created.path.ifBlank { it.selectedProjectPath },
                            selectedRunId = null,
                            activeRun = null,
                            activeRunEvents = emptyList(),
                            activeRunCursor = -1,
                            activeCheckpoints = emptyList(),
                            fileListing = null,
                            bannerMessage = "Project \"${created.name}\" created.",
                        )
                    }
                    refreshAgentWorkspace()
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun tagConversationFolder(path: String, label: String? = null) {
        val client = api ?: return
        val convId = _uiState.value.selectedConversationId ?: return
        if (path.isBlank()) return
        viewModelScope.launch {
            runCatching { client.addConversationFolder(convId, path.trim(), label?.trim()?.takeIf { it.isNotBlank() }) }
                .onSuccess {
                    _uiState.update { it.copy(bannerMessage = "Tagged folder in chat.") }
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun removeConversationFolder(folderId: String) {
        val client = api ?: return
        val convId = _uiState.value.selectedConversationId ?: return
        viewModelScope.launch {
            runCatching { client.removeConversationFolder(convId, folderId) }
                .onSuccess { _uiState.update { it.copy(bannerMessage = "Folder tag removed.") } }
                .onFailure { handleApiError(it) }
        }
    }

    // --- Native Connections Page ---

    fun openConnections(agentId: String = "") {
        val effectiveAgent = agentId.ifBlank { _uiState.value.teammates.firstOrNull()?.id.orEmpty() }
        _uiState.update {
            it.copy(
                showConnectionsScreen = true,
                connectionsAgentId = effectiveAgent,
                pendingOAuthUrl = null,
            )
        }
        refreshConnections(effectiveAgent)
    }

    fun closeConnections() {
        _uiState.update { it.copy(showConnectionsScreen = false, pendingOAuthUrl = null) }
    }

    fun refreshConnections(agentId: String = _uiState.value.connectionsAgentId, search: String = "") {
        val client = api ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(connectionsLoading = true, connectionsAgentId = agentId) }
            try {
                val apps = client.connectedApps(agentId = agentId, search = search)
                val custom = client.listCustomConnections()
                _uiState.update {
                    it.copy(
                        connectedApps = apps,
                        customConnections = custom,
                        connectionsLoading = false,
                    )
                }
            } catch (err: Exception) {
                _uiState.update { it.copy(connectionsLoading = false) }
                handleApiError(err)
            }
        }
    }

    fun connectAppService(
        agentId: String,
        service: String,
        requestId: String? = null,
        fields: Map<String, String> = emptyMap(),
        authConfigId: String? = null,
        authScheme: String? = null,
        alias: String? = null,
    ) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.connectApp(agentId, service, requestId, fields, authConfigId, authScheme, alias) }
                .onSuccess { res ->
                    val oauthUrl = res.url?.takeIf { it.isNotBlank() } ?: res.redirectUrl?.takeIf { it.isNotBlank() }
                    if (oauthUrl != null) {
                        _uiState.update {
                            it.copy(
                                pendingOAuthUrl = oauthUrl,
                                appAuthLinksByRequest = if (!requestId.isNullOrBlank()) {
                                    it.appAuthLinksByRequest + (requestId to oauthUrl)
                                } else it.appAuthLinksByRequest,
                                bannerMessage = "Finish sign-in in your browser — status updates automatically.",
                            )
                        }
                        // Background check a few times while user completes browser OAuth
                        viewModelScope.launch {
                            repeat(6) {
                                delay(4_000L)
                                refreshConnections(agentId)
                            }
                        }
                    } else {
                        _uiState.update { it.copy(bannerMessage = "Connected $service.") }
                        refreshConnections(agentId)
                    }
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun detectMailbox(address: String, onResult: (MailDetectResponse?) -> Unit) {
        val client = api ?: return
        if (!address.contains("@")) return
        viewModelScope.launch {
            val res = runCatching { client.detectMailbox(address) }.getOrNull()
            onResult(res)
        }
    }

    fun submitInlineCredential(
        requestId: String,
        label: String,
        provider: String,
        baseUrl: String,
        token: String,
        validationPath: String = "/",
        setupJson: String? = null,
        values: Map<String, String>? = null,
        documentationUrl: String? = null,
        authType: String = "auto",
        authHeader: String? = null,
        authPrefix: String? = null,
    ) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching {
                val created = if (!setupJson.isNullOrBlank()) {
                    client.saveCredentialForRequest(
                        requestId = requestId,
                        setupJson = setupJson,
                        token = if (values.isNullOrEmpty()) token else null,
                        values = values?.takeIf { it.isNotEmpty() },
                    )
                } else {
                    client.saveCustomConnection(
                        label = label,
                        provider = provider,
                        baseUrl = baseUrl,
                        token = token,
                        validationPath = validationPath,
                        documentationUrl = documentationUrl,
                        authType = authType,
                        authHeader = authHeader,
                        authPrefix = authPrefix,
                    )
                }
                client.resolveTeamRequest(
                    requestId = requestId,
                    action = "provide",
                    connectionId = created.id.takeIf { it.isNotBlank() },
                    setupJson = setupJson,
                )
                created
            }.onSuccess { saved ->
                _uiState.update {
                    it.copy(
                        settledRequestIds = it.settledRequestIds + requestId,
                        bannerMessage = "Credential saved securely for ${saved.label.ifBlank { provider }}.",
                    )
                }
                refreshConnections()
                refreshActiveConversationOnce()
            }.onFailure { handleApiError(it) }
        }
    }

    fun probeSshHostKey(requestId: String, baseUrl: String, onResult: (Result<String>) -> Unit) {
        val client = api ?: return
        viewModelScope.launch {
            val res = runCatching { client.probeSshHostKey(requestId, baseUrl) }
            onResult(res)
        }
    }

    fun submitSshCredential(
        requestId: String,
        label: String,
        baseUrl: String,
        password: String,
        hostFingerprint: String,
    ) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching {
                val connId = client.saveSshCredentialForRequest(requestId, label, baseUrl, password, hostFingerprint)
                client.resolveTeamRequest(requestId = requestId, action = "provide", connectionId = connId)
            }.onSuccess {
                _uiState.update {
                    it.copy(
                        settledRequestIds = it.settledRequestIds + requestId,
                        bannerMessage = "SSH connection verified and saved.",
                    )
                }
                refreshConnections()
                refreshActiveConversationOnce()
            }.onFailure { handleApiError(it) }
        }
    }

    fun submitBrowserAuth(
        requestId: String,
        setupJson: String,
        values: Map<String, String>,
        terms: List<String>,
    ) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.submitBrowserAuthForRequest(requestId, setupJson, values, terms) }
                .onSuccess {
                    _uiState.update {
                        it.copy(
                            settledRequestIds = it.settledRequestIds + requestId,
                            bannerMessage = "Website form submitted securely.",
                        )
                    }
                    refreshActiveConversationOnce()
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun clearPendingOAuthUrl() {
        _uiState.update { it.copy(pendingOAuthUrl = null) }
    }

    fun assignAppAccount(agentId: String, accountId: String) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.assignAppAccount(agentId, accountId) }
                .onSuccess {
                    _uiState.update { it.copy(bannerMessage = "Account assigned to teammate.") }
                    refreshConnections(agentId)
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun disconnectAppAccount(agentId: String, accountId: String) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.disconnectAppAccount(agentId, accountId) }
                .onSuccess {
                    _uiState.update { it.copy(bannerMessage = "Account disconnected.") }
                    refreshConnections(agentId)
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun revokeAppPermission(permissionId: String) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.revokeAppPermission(permissionId) }
                .onSuccess {
                    _uiState.update { it.copy(bannerMessage = "Permission revoked.") }
                    refreshConnections()
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun configureComposio(apiKey: String) {
        val client = api ?: return
        if (apiKey.isBlank()) return
        viewModelScope.launch {
            runCatching { client.configureComposio(apiKey) }
                .onSuccess {
                    _uiState.update { it.copy(bannerMessage = "Composio integration key saved.") }
                    refreshConnections()
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun connectMailbox(
        agentId: String,
        address: String,
        password: String,
        imapHost: String,
        imapPort: Int,
        smtpHost: String,
        smtpPort: Int,
    ) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.connectMailbox(agentId, address, password, imapHost, imapPort, smtpHost, smtpPort) }
                .onSuccess {
                    _uiState.update { it.copy(bannerMessage = "Mailbox connected.") }
                    refreshConnections(agentId)
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun saveCustomConnection(
        label: String,
        provider: String,
        baseUrl: String,
        token: String,
        validationPath: String = "/",
        id: String? = null,
        documentationUrl: String? = null,
        capabilities: List<String> = listOf("connection.discover"),
        authType: String = "auto",
        authHeader: String? = null,
        authPrefix: String? = null,
        existingOperations: List<CustomConnectionOperation> = emptyList(),
        structuredAuthJson: kotlinx.serialization.json.JsonElement? = null,
    ) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching {
                val created = client.saveCustomConnection(
                    label = label,
                    provider = provider,
                    baseUrl = baseUrl,
                    token = token,
                    validationPath = validationPath,
                    id = id,
                    documentationUrl = documentationUrl,
                    capabilities = capabilities,
                    authType = authType,
                    authHeader = authHeader,
                    authPrefix = authPrefix,
                    existingOperations = existingOperations,
                    structuredAuthJson = structuredAuthJson,
                )
                if (created.id.isNotBlank()) {
                    client.testCustomConnection(created.id)
                }
                created
            }.onSuccess { saved ->
                _uiState.update { it.copy(bannerMessage = "Connection \"${saved.label}\" saved and checked.") }
                refreshConnections()
            }.onFailure { err ->
                refreshConnections()
                handleApiError(err)
            }
        }
    }

    fun deleteCustomConnection(id: String) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.deleteCustomConnection(id) }
                .onSuccess {
                    _uiState.update { it.copy(bannerMessage = "Connection deleted.") }
                    refreshConnections()
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun artifactInlineUrl(artifactId: String): String = api?.artifactInlineUrl(artifactId).orEmpty()
    fun mediaOkHttpClient(): okhttp3.OkHttpClient? = api?.buildMediaOkHttpClient()
    fun mediaAuthHeaders(): Map<String, String> = api?.buildAuthHeaders().orEmpty()
    fun serverBaseUrl(): String = api?.baseUrl.orEmpty()

    fun stopTeamChat() {
        val client = api ?: return
        val convId = _uiState.value.selectedConversationId ?: return
        viewModelScope.launch {
            runCatching { client.stopTeamChat(convId) }
                .onSuccess { _uiState.update { it.copy(bannerMessage = "Stopped teammate turn.") } }
                .onFailure { handleApiError(it) }
        }
    }

    fun resolveTeamRequest(
        requestId: String,
        action: String,
        response: String? = null,
        reviewedArgs: kotlinx.serialization.json.JsonObject? = null,
        rememberForChief: Boolean = false,
        chiefPattern: String? = null,
        chiefScope: String? = null,
    ) {
        val client = api ?: return
        _uiState.update { it.copy(settledRequestIds = it.settledRequestIds + requestId) }
        viewModelScope.launch {
            runCatching {
                client.resolveTeamRequest(
                    requestId = requestId,
                    action = action,
                    response = response,
                    reviewedArgs = reviewedArgs,
                    rememberForChief = rememberForChief,
                    chiefPattern = chiefPattern,
                    chiefScope = chiefScope,
                )
            }.onSuccess {
                _uiState.update {
                    it.copy(
                        bannerMessage = when {
                            rememberForChief -> "Answered and saved for Chief of Staff."
                            action == "dismiss" || action == "deny" -> "Card dismissed."
                            else -> "Request updated."
                        },
                    )
                }
                refreshActiveConversationOnce()
            }.onFailure { err ->
                _uiState.update { it.copy(settledRequestIds = it.settledRequestIds - requestId) }
                handleApiError(err)
            }
        }
    }

    fun deleteTeamRequest(requestId: String) {
        val client = api ?: return
        _uiState.update { it.copy(settledRequestIds = it.settledRequestIds + requestId) }
        viewModelScope.launch {
            runCatching { client.deleteTeamRequest(requestId) }
                .onSuccess {
                    _uiState.update { it.copy(bannerMessage = "Card removed.") }
                    refreshActiveConversationOnce()
                }
                .onFailure { err ->
                    // Fallback to dismiss if an older server doesn't expose DELETE /api/cowork/requests/:id
                    runCatching { client.resolveTeamRequest(requestId = requestId, action = "dismiss") }
                        .onSuccess {
                            _uiState.update { it.copy(bannerMessage = "Card dismissed.") }
                            refreshActiveConversationOnce()
                        }
                        .onFailure {
                            _uiState.update { st -> st.copy(settledRequestIds = st.settledRequestIds - requestId) }
                            handleApiError(err)
                        }
                }
        }
    }

    // --- Inbox ---

    fun refreshInbox() {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.inboxState() }
                .onSuccess { state -> _uiState.update { it.copy(inboxState = state) } }
        }
    }

    fun refreshInboxWorkspace(roomId: String? = _uiState.value.selectedInboxRoomId) {
        val client = api ?: return
        val targetRoomId = roomId ?: return
        viewModelScope.launch {
            runCatching { client.inboxWorkspace(targetRoomId) }
                .onSuccess { ws ->
                    if (_uiState.value.selectedInboxRoomId == targetRoomId) {
                        _uiState.update { it.copy(inboxWorkspace = ws, inboxWorkspaceLoading = false) }
                    }
                }
        }
    }

    fun openInboxRoom(roomId: String) {
        inboxPollJob?.cancel()
        _uiState.update {
            it.copy(
                selectedInboxRoomId = roomId,
                inboxMessages = emptyList(),
                inboxActiveAgentTurnIds = emptyList(),
                inboxWatching = false,
                inboxWorkspace = null,
                inboxWorkspaceLoading = true,
            )
        }
        val client = api ?: return
        inboxPollJob = viewModelScope.launch {
            while (isActive) {
                runCatching { client.inboxMessagesResponse(roomId) }
                    .onSuccess { res ->
                        _uiState.update {
                            it.copy(
                                inboxMessages = res.messages,
                                inboxActiveAgentTurnIds = res.activeAgentTurnIds,
                                inboxWatching = res.watching,
                            )
                        }
                    }
                runCatching { client.inboxWorkspace(roomId) }
                    .onSuccess { ws ->
                        _uiState.update { it.copy(inboxWorkspace = ws, inboxWorkspaceLoading = false) }
                    }
                    .onFailure {
                        _uiState.update { it.copy(inboxWorkspaceLoading = false) }
                    }
                runCatching { client.inboxState() }
                    .onSuccess { state -> _uiState.update { it.copy(inboxState = state) } }
                delay(2_500L)
            }
        }
    }

    fun closeInboxRoom() {
        inboxPollJob?.cancel()
        _uiState.update {
            it.copy(
                selectedInboxRoomId = null,
                inboxActiveAgentTurnIds = emptyList(),
                inboxWatching = false,
                inboxWorkspace = null,
                inboxWorkspaceLoading = false,
            )
        }
        refreshInbox()
    }

    fun sendInboxMessage(text: String, privateWhisper: Boolean = false) {
        val client = api ?: return
        val roomId = _uiState.value.selectedInboxRoomId ?: return
        if (text.isBlank()) return
        val visibility = if (privateWhisper) "owner_only" else "public"
        viewModelScope.launch {
            runCatching { client.sendInboxMessage(roomId, text.trim(), visibility = visibility) }
                .onSuccess {
                    runCatching { client.inboxMessagesResponse(roomId) }
                        .onSuccess { res ->
                            _uiState.update {
                                it.copy(
                                    inboxMessages = res.messages,
                                    inboxActiveAgentTurnIds = res.activeAgentTurnIds,
                                    inboxWatching = res.watching,
                                )
                            }
                        }
                    refreshInboxWorkspace(roomId)
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun createInboxRoom(
        title: String,
        agentIds: List<String>,
        kind: String = "group",
        memberIds: List<String> = emptyList(),
        agentTriggerMode: String = if (kind == "group") "mention" else "auto",
        notesVisibility: String = "owner_only",
        projectPath: String? = null,
        openImmediately: Boolean = true,
    ) {
        val client = api ?: return
        if (title.isBlank()) return
        viewModelScope.launch {
            runCatching {
                client.createInboxRoom(
                    title = title.trim(),
                    kind = kind,
                    agentIds = agentIds,
                    memberIds = memberIds,
                    agentTriggerMode = agentTriggerMode,
                    notesVisibility = notesVisibility,
                    projectPath = projectPath,
                )
            }
                .onSuccess { res ->
                    _uiState.update { it.copy(bannerMessage = "Inbox room created.") }
                    refreshInbox()
                    val createdId = res.room?.id
                    if (openImmediately && !createdId.isNullOrBlank()) {
                        openInboxRoom(createdId)
                    }
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun updateInboxRoom(
        roomId: String,
        title: String? = null,
        memberIds: List<String>? = null,
        activeAgentIds: List<String>? = null,
        agentTriggerMode: String? = null,
        toolPolicyOverride: String? = null,
        clearToolPolicyOverride: Boolean = false,
        notesVisibility: String? = null,
        projectPath: String? = null,
        clearProjectPath: Boolean = false,
    ) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching {
                client.updateInboxRoom(
                    roomId = roomId,
                    title = title,
                    memberIds = memberIds,
                    activeAgentIds = activeAgentIds,
                    agentTriggerMode = agentTriggerMode,
                    toolPolicyOverride = toolPolicyOverride,
                    clearToolPolicyOverride = clearToolPolicyOverride,
                    notesVisibility = notesVisibility,
                    projectPath = projectPath,
                    clearProjectPath = clearProjectPath,
                )
            }
                .onSuccess {
                    refreshInbox()
                    refreshInboxWorkspace(roomId)
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun deleteInboxRoom(roomId: String) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.deleteInboxRoom(roomId) }
                .onSuccess {
                    _uiState.update { it.copy(bannerMessage = "Inbox room deleted.") }
                    if (_uiState.value.selectedInboxRoomId == roomId) {
                        closeInboxRoom()
                    } else {
                        refreshInbox()
                    }
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun summarizeInboxMeeting(roomId: String, focus: String? = null, onComplete: (() -> Unit)? = null) {
        val client = api ?: return
        if (_uiState.value.inboxSummarizing) return
        _uiState.update { it.copy(inboxSummarizing = true) }
        viewModelScope.launch {
            runCatching { client.summarizeInboxMeeting(roomId, focus) }
                .onSuccess { res ->
                    val count = res.createdTasks.size
                    val msg = if (count > 0) {
                        "Meeting summarized & $count task${if (count == 1) "" else "s"} saved (owner-private until shared)."
                    } else {
                        "Meeting summarized (owner-private until shared)."
                    }
                    _uiState.update { it.copy(inboxSummarizing = false, bannerMessage = msg) }
                    refreshInboxWorkspace(roomId)
                    refreshInbox()
                    onComplete?.invoke()
                }
                .onFailure { err ->
                    _uiState.update { it.copy(inboxSummarizing = false) }
                    handleApiError(err)
                }
        }
    }

    fun addInboxNote(roomId: String, kind: String, title: String, content: String) {
        val client = api ?: return
        if (content.isBlank()) return
        viewModelScope.launch {
            runCatching { client.addInboxNote(roomId, kind, title.trim(), content.trim()) }
                .onSuccess {
                    refreshInboxWorkspace(roomId)
                    refreshInbox()
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun deleteInboxNote(roomId: String, noteId: String) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.deleteInboxNote(roomId, noteId) }
                .onSuccess {
                    refreshInboxWorkspace(roomId)
                    refreshInbox()
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun shareInboxNote(roomId: String, noteId: String, text: String, includeTasks: Boolean = false) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.shareInboxNote(roomId, noteId, text = text, includeTasks = includeTasks) }
                .onSuccess {
                    _uiState.update { it.copy(bannerMessage = "Summary shared to room chat.") }
                    runCatching { client.inboxMessagesResponse(roomId) }
                        .onSuccess { res ->
                            _uiState.update {
                                it.copy(
                                    inboxMessages = res.messages,
                                    inboxActiveAgentTurnIds = res.activeAgentTurnIds,
                                    inboxWatching = res.watching,
                                )
                            }
                        }
                    refreshInboxWorkspace(roomId)
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun addInboxTask(roomId: String, title: String, description: String?, kind: String, assignee: String?) {
        val client = api ?: return
        if (title.isBlank()) return
        viewModelScope.launch {
            runCatching { client.addInboxTask(roomId, title.trim(), description, kind, assignee) }
                .onSuccess {
                    refreshInboxWorkspace(roomId)
                    refreshInbox()
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun updateInboxTaskStatus(roomId: String, taskId: String, status: String) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.updateInboxTask(roomId, taskId, status = status) }
                .onSuccess {
                    refreshInboxWorkspace(roomId)
                    refreshInbox()
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun deleteInboxTask(roomId: String, taskId: String) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.deleteInboxTask(roomId, taskId) }
                .onSuccess {
                    refreshInboxWorkspace(roomId)
                    refreshInbox()
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun delegateInboxTaskCode(roomId: String, taskId: String) {
        val client = api ?: return
        if (_uiState.value.inboxDelegatingTaskId != null) return
        _uiState.update { it.copy(inboxDelegatingTaskId = taskId) }
        viewModelScope.launch {
            runCatching { client.delegateInboxTaskCode(roomId, taskId) }
                .onSuccess { res ->
                    _uiState.update {
                        it.copy(
                            inboxDelegatingTaskId = null,
                            bannerMessage = "Delegated privately to Code (${res.runId}). Tap Open in Code to track.",
                        )
                    }
                    refreshInboxWorkspace(roomId)
                    refreshInbox()
                    refreshAgentWorkspace()
                }
                .onFailure { err ->
                    _uiState.update { it.copy(inboxDelegatingTaskId = null) }
                    handleApiError(err)
                }
        }
    }

    fun delegateInboxTaskSubAgent(roomId: String, taskId: String) {
        val client = api ?: return
        if (_uiState.value.inboxDelegatingTaskId != null) return
        _uiState.update { it.copy(inboxDelegatingTaskId = taskId) }
        viewModelScope.launch {
            runCatching { client.delegateInboxTaskSubAgent(roomId, taskId) }
                .onSuccess {
                    _uiState.update {
                        it.copy(
                            inboxDelegatingTaskId = null,
                            bannerMessage = "Sub-agent finished and saved findings to Notes.",
                        )
                    }
                    refreshInboxWorkspace(roomId)
                    refreshInbox()
                }
                .onFailure { err ->
                    _uiState.update { it.copy(inboxDelegatingTaskId = null) }
                    handleApiError(err)
                }
        }
    }

    fun openInboxCodeRun(runId: String) {
        closeInboxRoom()
        selectTab(MainTab.CODING)
        openRun(runId)
    }

    fun createInboxInvite(
        label: String,
        toolPolicy: String,
        roomId: String? = null,
        targetEmail: String? = null,
        defaultAgentIds: List<String> = emptyList(),
        maxUses: Int = 1,
    ) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching {
                client.createInboxInvite(
                    label = label.trim(),
                    scopeType = if (!roomId.isNullOrBlank()) "group" else "workspace",
                    toolPolicy = toolPolicy,
                    roomId = roomId,
                    targetEmail = targetEmail,
                    defaultAgentIds = defaultAgentIds,
                    maxUses = maxUses,
                )
            }
                .onSuccess { res ->
                    _uiState.update {
                        it.copy(
                            latestInboxInviteUrl = res.invite?.pikpamInviteUrl.orEmpty(),
                            bannerMessage = "Pikpam invite link created.",
                        )
                    }
                    refreshInbox()
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun clearLatestInboxInviteUrl() {
        _uiState.update { it.copy(latestInboxInviteUrl = "") }
    }

    fun revokeInboxInvite(inviteId: String) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.revokeInboxInvite(inviteId) }
                .onSuccess {
                    _uiState.update { it.copy(bannerMessage = "Invite revoked.") }
                    refreshInbox()
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun updateInboxMember(
        memberId: String,
        status: String? = null,
        toolPolicy: String? = null,
        allowedAgentIds: List<String>? = null,
    ) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.updateInboxMember(memberId, status, toolPolicy, allowedAgentIds) }
                .onSuccess { refreshInbox() }
                .onFailure { handleApiError(it) }
        }
    }

    // --- Settings & Push ---

    fun refreshSettings() {
        val client = api ?: return
        val deviceId = _uiState.value.deviceId
        viewModelScope.launch {
            val home = runCatching { client.homeInfo() }.getOrNull()
            val perms = runCatching { client.codingPermissions() }.getOrNull()
            val chief = runCatching { client.chiefSettings() }.getOrNull()
            val cron = runCatching { client.cronJobs() }.getOrElse { emptyList() }
            val link = runCatching { client.localLinkStatus() }.getOrNull()
            val push = if (deviceId.isNotBlank()) runCatching { client.pushStatus(deviceId) }.getOrNull() else null
            _uiState.update {
                it.copy(
                    homeInfo = home ?: it.homeInfo,
                    codingPermissions = perms ?: it.codingPermissions,
                    chiefSettings = chief ?: it.chiefSettings,
                    cronJobs = cron,
                    localLinkStatus = link ?: it.localLinkStatus,
                    pushStatus = push ?: it.pushStatus,
                )
            }
        }
    }

    fun updateAutonomy(persistent: Boolean, maxCostUsd: Double?) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.updateAutonomy(persistent, maxCostUsd) }
                .onSuccess { saved ->
                    _uiState.update {
                        it.copy(
                            homeInfo = (it.homeInfo ?: HomeInfo()).copy(autonomy = saved),
                            bannerMessage = "Autonomy updated.",
                        )
                    }
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun updateCodingPermissions(access: String) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.updateCodingPermissions(access) }
                .onSuccess { saved ->
                    _uiState.update {
                        it.copy(codingPermissions = saved, bannerMessage = "Coding access set to ${saved.access}.")
                    }
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun updateChiefPreset(preset: String) {
        val client = api ?: return
        viewModelScope.launch {
            runCatching { client.updateChiefPreset(preset) }
                .onSuccess {
                    _uiState.update { it.copy(bannerMessage = "Chief of staff policy set to $preset.") }
                    refreshSettings()
                }
                .onFailure { handleApiError(it) }
        }
    }

    fun enablePushNotifications() {
        val client = api ?: return
        val deviceId = _uiState.value.deviceId
        if (deviceId.isBlank()) return
        _uiState.update { it.copy(pushBusy = true, errorMessage = null) }
        try {
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { token ->
                    viewModelScope.launch {
                        runCatching { client.registerPush(deviceId, token) }
                            .onSuccess { status ->
                                _uiState.update {
                                    it.copy(
                                        pushStatus = status,
                                        pushBusy = false,
                                        bannerMessage = "Android push notifications enabled.",
                                    )
                                }
                            }
                            .onFailure { err ->
                                _uiState.update { it.copy(pushBusy = false) }
                                handleApiError(err)
                            }
                    }
                }
                .addOnFailureListener { err ->
                    _uiState.update {
                        it.copy(
                            pushBusy = false,
                            errorMessage = "Could not obtain FCM token. Confirm google-services.json and Play Services: ${err.message}",
                        )
                    }
                }
        } catch (err: Throwable) {
            _uiState.update {
                it.copy(
                    pushBusy = false,
                    errorMessage = "Firebase is not initialized in this APK build (${err.message}).",
                )
            }
        }
    }

    fun disablePushNotifications() {
        val client = api ?: return
        val deviceId = _uiState.value.deviceId
        if (deviceId.isBlank()) return
        viewModelScope.launch {
            _uiState.update { it.copy(pushBusy = true) }
            runCatching { client.unregisterPush(deviceId) }
                .onSuccess { status ->
                    _uiState.update {
                        it.copy(
                            pushStatus = status,
                            pushBusy = false,
                            bannerMessage = "Android push notifications disabled.",
                        )
                    }
                }
                .onFailure { err ->
                    _uiState.update { it.copy(pushBusy = false) }
                    handleApiError(err)
                }
        }
    }

    fun sendTestPush() {
        val client = api ?: return
        val deviceId = _uiState.value.deviceId
        if (deviceId.isBlank()) return
        viewModelScope.launch {
            runCatching { client.sendTestPush(deviceId) }
                .onSuccess { _uiState.update { it.copy(bannerMessage = "Test notification sent.") } }
                .onFailure { handleApiError(it) }
        }
    }

    // --- Pull-to-Refresh Actions ---

    fun pullRefreshCoworkHub() {
        val client = api ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }
            try {
                val agents = runCatching { client.listTeammates() }.getOrNull()
                val convs = runCatching { client.listConversations() }.getOrNull()
                val inbox = runCatching { client.inboxState() }.getOrNull()
                val runs = runCatching { client.listRuns() }.getOrNull()
                _uiState.update { st ->
                    st.copy(
                        teammates = agents ?: st.teammates,
                        conversations = convs ?: st.conversations,
                        inboxState = inbox ?: st.inboxState,
                        runs = runs ?: st.runs,
                        offlineMode = false,
                        isRefreshing = false,
                    )
                }
            } catch (err: Exception) {
                _uiState.update { it.copy(isRefreshing = false) }
                handleApiError(err)
            }
        }
    }

    fun pullRefreshActiveConversation() {
        val client = api ?: return
        val convId = _uiState.value.selectedConversationId ?: return
        val threadId = _uiState.value.selectedThreadId
        val conv = _uiState.value.conversations.firstOrNull { it.id == convId }
        val primaryAgentId = conv?.memberIds?.firstOrNull().orEmpty()
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }
            try {
                val view = client.teamChat(convId, threadId)
                _uiState.update { it.copy(activeTeamView = view, offlineMode = false) }
                store.cacheTeamSnapshot(convId, threadId, view)
                if (primaryAgentId.isNotBlank()) {
                    runCatching { client.connectedApps(agentId = primaryAgentId) }
                        .onSuccess { apps -> _uiState.update { it.copy(connectedApps = apps) } }
                    runCatching { client.getAgentComputer(primaryAgentId) }
                        .onSuccess { res ->
                            val cid = res.computer.agentId.ifBlank { primaryAgentId }
                            _uiState.update { st ->
                                st.copy(agentComputers = st.agentComputers + (cid to res.computer.copy(agentId = cid)))
                            }
                        }
                }
            } catch (err: Exception) {
                handleApiError(err)
            } finally {
                _uiState.update { it.copy(isRefreshing = false) }
            }
        }
    }

    fun pullRefreshCoding() {
        val client = api ?: return
        val projectPath = _uiState.value.selectedProjectPath
        val activeRunId = _uiState.value.selectedRunId
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }
            try {
                val runs = runCatching { client.listRuns() }.getOrNull()
                val projects = runCatching { client.listProjects() }.getOrNull()
                if (runs != null || projects != null) {
                    _uiState.update { st ->
                        st.copy(
                            runs = runs ?: st.runs,
                            projects = projects ?: st.projects,
                            offlineMode = false,
                        )
                    }
                }
                if (!activeRunId.isNullOrBlank()) {
                    val page = runCatching { client.runEvents(activeRunId, -1) }.getOrNull()
                    if (page != null) {
                        _uiState.update { st ->
                            st.copy(
                                activeRun = page.session,
                                activeRunEvents = page.events,
                                activeRunCursor = page.cursor,
                                runs = st.runs.map { if (it.runId == page.session.runId) page.session else it },
                                offlineMode = false,
                            )
                        }
                    }
                }
                if (projectPath.isNotBlank()) {
                    runCatching { client.gitStatus(projectPath) }
                        .onSuccess { status -> _uiState.update { it.copy(gitStatus = status) } }
                }
            } catch (err: Exception) {
                handleApiError(err)
            } finally {
                _uiState.update { it.copy(isRefreshing = false) }
            }
        }
    }

    fun pullRefreshInboxRoom() {
        val client = api ?: return
        val roomId = _uiState.value.selectedInboxRoomId ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }
            try {
                runCatching { client.inboxMessagesResponse(roomId) }
                    .onSuccess { res ->
                        _uiState.update {
                            it.copy(
                                inboxMessages = res.messages,
                                inboxActiveAgentTurnIds = res.activeAgentTurnIds,
                                inboxWatching = res.watching,
                            )
                        }
                    }
                runCatching { client.inboxWorkspace(roomId) }
                    .onSuccess { ws -> _uiState.update { it.copy(inboxWorkspace = ws, inboxWorkspaceLoading = false) } }
                runCatching { client.inboxState() }
                    .onSuccess { st -> _uiState.update { it.copy(inboxState = st) } }
            } finally {
                _uiState.update { it.copy(isRefreshing = false) }
            }
        }
    }

    fun pullRefreshConnections(agentId: String = _uiState.value.connectionsAgentId, search: String = "") {
        val client = api ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true, connectionsLoading = true, connectionsAgentId = agentId) }
            try {
                val apps = client.connectedApps(agentId = agentId, search = search)
                val custom = client.listCustomConnections()
                _uiState.update {
                    it.copy(
                        connectedApps = apps,
                        customConnections = custom,
                        connectionsLoading = false,
                        isRefreshing = false,
                    )
                }
            } catch (err: Exception) {
                _uiState.update { it.copy(connectionsLoading = false, isRefreshing = false) }
                handleApiError(err)
            }
        }
    }

    fun pullRefreshDesktop() {
        val client = api ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }
            try {
                val agents = runCatching { client.listTeammates() }.getOrElse { _uiState.value.teammates }
                _uiState.update { it.copy(teammates = agents) }
                val updated = LinkedHashMap(_uiState.value.agentComputers)
                for (ag in agents) {
                    runCatching { client.getAgentComputer(ag.id) }
                        .onSuccess { res ->
                            val cid = res.computer.agentId.ifBlank { ag.id }
                            updated[cid] = res.computer.copy(agentId = cid)
                        }
                }
                _uiState.update { it.copy(agentComputers = updated, offlineMode = false) }
            } finally {
                _uiState.update { it.copy(isRefreshing = false) }
            }
        }
    }

    // --- Interactive Computer & Handoff (In-Chat & Desktop Console) ---

    fun syncCookiesForWebView(webView: android.webkit.WebView) {
        api?.syncCookiesToWebView(webView)
    }

    fun agentComputerViewUrl(agentId: String, preview: Boolean = false): String =
        api?.agentComputerViewUrl(agentId, preview).orEmpty()

    fun serverBrowserViewUrl(agentId: String): String =
        api?.serverBrowserViewUrl(agentId).orEmpty()

    fun refreshAgentComputer(agentId: String) {
        val client = api ?: return
        if (agentId.isBlank()) return
        viewModelScope.launch {
            runCatching { client.getAgentComputer(agentId) }
                .onSuccess { res ->
                    val cid = res.computer.agentId.ifBlank { agentId }
                    _uiState.update { st ->
                        st.copy(agentComputers = st.agentComputers + (cid to res.computer.copy(agentId = cid)))
                    }
                }
        }
    }

    fun refreshAllAgentComputers() {
        val client = api ?: return
        val agents = _uiState.value.teammates
        if (agents.isEmpty()) return
        viewModelScope.launch {
            val updated = LinkedHashMap(_uiState.value.agentComputers)
            for (ag in agents) {
                runCatching { client.getAgentComputer(ag.id) }
                    .onSuccess { res ->
                        val cid = res.computer.agentId.ifBlank { ag.id }
                        updated[cid] = res.computer.copy(agentId = cid)
                    }
            }
            _uiState.update { it.copy(agentComputers = updated) }
        }
    }

    fun openInlineComputer(agentId: String) {
        val client = api ?: return
        if (agentId.isBlank()) return
        client.syncCookiesToWebView()
        _uiState.update {
            it.copy(
                inlineComputerAgentId = agentId,
                inlineComputerDismissedKey = null,
            )
        }
        startComputerPolling(agentId)
    }

    fun closeInlineComputer(dismissKey: String? = null) {
        computerPollJob?.cancel()
        _uiState.update {
            it.copy(
                inlineComputerAgentId = null,
                inlineComputerDismissedKey = dismissKey ?: it.inlineComputerDismissedKey,
            )
        }
    }

    private fun startComputerPolling(agentId: String) {
        val client = api ?: return
        computerPollJob?.cancel()
        computerPollJob = viewModelScope.launch {
            while (isActive) {
                runCatching { client.getAgentComputer(agentId) }
                    .onSuccess { res ->
                        val cid = res.computer.agentId.ifBlank { agentId }
                        _uiState.update { st ->
                            st.copy(agentComputers = st.agentComputers + (cid to res.computer.copy(agentId = cid)))
                        }
                    }
                val st = _uiState.value.agentComputers[agentId]?.state
                delay(if (st == "starting") 2_000L else 3_500L)
            }
        }
    }

    fun performComputerAction(agentId: String, action: String) {
        val client = api ?: return
        if (agentId.isBlank()) return
        viewModelScope.launch {
            _uiState.update { it.copy(computerActionBusy = it.computerActionBusy + agentId) }
            try {
                val res = client.agentComputerAction(agentId, action)
                val cid = res.computer.agentId.ifBlank { agentId }
                client.syncCookiesToWebView()
                _uiState.update { st ->
                    val nextTeammates = res.agent?.let { updatedAgent ->
                        st.teammates.map { if (it.id == updatedAgent.id) updatedAgent else it }
                    } ?: st.teammates
                    val clearedHandoffIds = if (action == "return-control") {
                        val openHandoffIds = st.activeTeamView?.requests.orEmpty()
                            .filter { it.agentId == agentId && it.desktopHandoff && (it.status == "open" || it.status == "pending") }
                            .map { it.id }
                        st.settledRequestIds + openHandoffIds
                    } else {
                        st.settledRequestIds
                    }
                    st.copy(
                        teammates = nextTeammates,
                        agentComputers = st.agentComputers + (cid to res.computer.copy(agentId = cid)),
                        settledRequestIds = clearedHandoffIds,
                        computerActionBusy = st.computerActionBusy - agentId,
                        bannerMessage = when (action) {
                            "take-control" -> "You now have control of the computer."
                            "return-control" -> "Returned control to the teammate."
                            "start" -> "Starting private desktop…"
                            "use-private" -> "Switched to private desktop — starting…"
                            "sleep" -> "Desktop paused and preserved."
                            "stop" -> "Desktop stopped."
                            else -> null
                        },
                    )
                }
                if (action == "start" || action == "use-private") {
                    startComputerPolling(agentId)
                }
                if (action == "return-control") {
                    refreshActiveConversationOnce()
                }
            } catch (err: Exception) {
                _uiState.update { it.copy(computerActionBusy = it.computerActionBusy - agentId) }
                handleApiError(err)
            }
        }
    }

    fun launchComputerApp(agentId: String, app: String) {
        val client = api ?: return
        if (agentId.isBlank()) return
        viewModelScope.launch {
            _uiState.update { it.copy(computerActionBusy = it.computerActionBusy + agentId) }
            try {
                val current = _uiState.value.agentComputers[agentId]
                if (app == "browser" && current?.isUserControl != true) {
                    val res = client.agentComputerAction(agentId, "take-control")
                    val cid = res.computer.agentId.ifBlank { agentId }
                    _uiState.update { st ->
                        st.copy(agentComputers = st.agentComputers + (cid to res.computer.copy(agentId = cid)))
                    }
                }
                client.agentComputerInput(
                    agentId,
                    kotlinx.serialization.json.buildJsonObject {
                        put("action", kotlinx.serialization.json.JsonPrimitive("launch"))
                        put("app", kotlinx.serialization.json.JsonPrimitive(app))
                    },
                )
                _uiState.update {
                    it.copy(
                        computerActionBusy = it.computerActionBusy - agentId,
                        bannerMessage = "Opened ${app.replace('_', ' ')} on desktop.",
                    )
                }
            } catch (err: Exception) {
                _uiState.update { it.copy(computerActionBusy = it.computerActionBusy - agentId) }
                handleApiError(err)
            }
        }
    }

    fun performServerBrowserControl(agentId: String, action: String) {
        val client = api ?: return
        if (agentId.isBlank()) return
        viewModelScope.launch {
            runCatching { client.serverBrowserAction(agentId, action) }
                .onSuccess {
                    _uiState.update {
                        it.copy(
                            bannerMessage = if (action == "take-control") "You have browser control." else "Returned browser control to agent.",
                        )
                    }
                }
                .onFailure { handleApiError(it) }
        }
    }

    // --- Live Embedded Interactive Surfaces ---

    fun openLiveDesktop(agentId: String, agentName: String) {
        val client = api ?: return
        client.syncCookiesToWebView()
        val teammate = _uiState.value.teammates.firstOrNull { it.id == agentId }
        val comp = _uiState.value.agentComputers[agentId]
        val isHost = comp?.useHostComputer ?: teammate?.useHostComputer ?: false
        startComputerPolling(agentId)
        _uiState.update {
            it.copy(
                liveSurface = LiveSurfaceRequest(
                    title = if (isHost) "$agentName · Live Browser" else "$agentName · Live Computer",
                    subtitle = if (isHost) "Browse, sign in, or take control" else "Touch, drag, type, or handoff control",
                    url = if (isHost) client.serverBrowserViewUrl(agentId) else client.agentComputerViewUrl(agentId, preview = false),
                    computerAgentId = agentId,
                    isServerBrowser = isHost,
                ),
            )
        }
    }

    fun openArtifactPreview(artifactId: String, artifactName: String) {
        val client = api ?: return
        client.syncCookiesToWebView()
        _uiState.update {
            it.copy(
                liveSurface = LiveSurfaceRequest(
                    title = artifactName.ifBlank { "Artifact preview" },
                    subtitle = "Safe document preview",
                    url = "${client.baseUrl}/api/cowork/artifacts/${GituApiClient.encodeQuery(artifactId)}/preview",
                ),
            )
        }
    }

    fun openServerBrowser() {
        val client = api ?: return
        client.syncCookiesToWebView()
        _uiState.update {
            it.copy(
                liveSurface = LiveSurfaceRequest(
                    title = "Agent Browser",
                    subtitle = "Live Chromium session",
                    url = "${client.baseUrl}/api/server-browser/view",
                    isServerBrowser = true,
                ),
            )
        }
    }

    fun openFullWebWorkspace(subtitle: String = "Voice calls, widgets, and full workspace") {
        val client = api ?: return
        client.syncCookiesToWebView()
        _uiState.update {
            it.copy(
                liveSurface = LiveSurfaceRequest(
                    title = "Agent Gitu Workspace",
                    subtitle = subtitle,
                    url = client.baseUrl,
                ),
            )
        }
    }

    fun closeLiveSurface() {
        if (_uiState.value.inlineComputerAgentId == null) {
            computerPollJob?.cancel()
        }
        _uiState.update { it.copy(liveSurface = null) }
    }

    // --- Native LiveKit Voice Calling ---

    fun startCoworkVoiceCall(
        conversationId: String? = null,
        threadId: String? = null,
        agentId: String? = null,
    ) {
        val client = api ?: return
        val state = _uiState.value
        val targetAgent = when {
            !agentId.isNullOrBlank() -> state.teammates.firstOrNull { it.id == agentId }
            !conversationId.isNullOrBlank() -> {
                val conv = state.conversations.firstOrNull { it.id == conversationId }
                conv?.memberIds?.firstNotNullOfOrNull { mid -> state.teammates.firstOrNull { it.id == mid } }
                    ?: state.teammates.firstOrNull { it.chiefOfStaff }
                    ?: state.teammates.firstOrNull()
            }
            else -> state.teammates.firstOrNull { it.chiefOfStaff } ?: state.teammates.firstOrNull()
        }

        val resolvedConversationId = conversationId
            ?: state.selectedConversationId?.takeIf { agentId == null }
            ?: targetAgent?.let { ag ->
                state.conversations.firstOrNull { it.kind == "dm" && it.memberIds.contains(ag.id) }?.id
            }
            ?: state.conversations.firstOrNull()?.id

        if (resolvedConversationId.isNullOrBlank()) {
            // Create a DM with Chief/teammate first, then dial immediately
            val agent = targetAgent
            if (agent == null) {
                _uiState.update { it.copy(errorMessage = "Create a teammate first to start a voice call.") }
                return
            }
            viewModelScope.launch {
                runCatching { client.createConversation(listOf(agent.id), agent.name, null) }
                    .onSuccess { conv ->
                        refreshCowork()
                        requestStartVoiceCall(
                            VoiceCallTarget(
                                kind = "cowork",
                                conversationId = conv.id,
                                threadId = null,
                                agentId = agent.id,
                                displayName = agent.name.ifBlank { "Chief" },
                                avatarShape = agent.avatar.shape,
                                avatarColor = agent.avatar.color,
                            ),
                        )
                    }
                    .onFailure { handleApiError(it) }
            }
            return
        }

        val convTitle = state.conversations.firstOrNull { it.id == resolvedConversationId }?.title
        requestStartVoiceCall(
            VoiceCallTarget(
                kind = "cowork",
                conversationId = resolvedConversationId,
                threadId = threadId?.takeIf { it.isNotBlank() && it != "main" },
                agentId = targetAgent?.id ?: agentId,
                displayName = targetAgent?.name?.ifBlank { convTitle } ?: convTitle ?: "Chief",
                avatarShape = targetAgent?.avatar?.shape,
                avatarColor = targetAgent?.avatar?.color,
            ),
        )
    }

    fun startCodingVoiceCall() {
        val state = _uiState.value
        val coder = state.teammates.firstOrNull { it.name.contains("coder", ignoreCase = true) }
            ?: state.teammates.firstOrNull { it.chiefOfStaff }
            ?: state.teammates.firstOrNull()
        val projectName = state.projects.firstOrNull { it.path == state.selectedProjectPath }?.name
        requestStartVoiceCall(
            VoiceCallTarget(
                kind = "main",
                runId = state.selectedRunId,
                provider = state.modelsCatalog.effectiveProvider,
                model = state.modelsCatalog.effectiveModel,
                projectPath = state.selectedProjectPath.takeIf { it.isNotBlank() },
                displayName = projectName?.let { "${coder?.name ?: "Coder"} · $it" } ?: coder?.name ?: "Coding Agent",
                avatarShape = coder?.avatar?.shape ?: "box",
                avatarColor = coder?.avatar?.color ?: "#2563EB",
            ),
        )
    }

    private fun requestStartVoiceCall(target: VoiceCallTarget) {
        val client = api ?: return
        val hasMic = ContextCompat.checkSelfPermission(
            getApplication(),
            Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED
        if (hasMic) {
            voiceManager.startCall(client, target)
        } else {
            _pendingMicPermissionTarget.value = target
        }
    }

    fun onMicPermissionResult(granted: Boolean) {
        val target = _pendingMicPermissionTarget.value
        _pendingMicPermissionTarget.value = null
        if (!granted) {
            _uiState.update { it.copy(errorMessage = "Allow microphone access to start a LiveKit voice call.") }
            return
        }
        val client = api ?: return
        if (target != null) {
            voiceManager.startCall(client, target)
        }
    }

    fun toggleVoiceMute() = voiceManager.toggleMute()
    fun toggleVoiceSpeaker() = voiceManager.toggleSpeaker()
    fun setVoiceMinimized(minimized: Boolean) = voiceManager.setMinimized(minimized)
    fun endVoiceCall() = voiceManager.endCall()
    fun retryVoiceCall() = voiceManager.retryLastCall()
    fun dismissLiveKitSetup() = voiceManager.dismissSetup()
    fun openLiveKitByokSetup() = voiceManager.openByokSetup()

    fun saveLiveKitConfig(url: String, apiKey: String, apiSecret: String) {
        val client = api ?: return
        voiceManager.saveLiveKitConfig(client, url, apiKey, apiSecret)
    }

    private fun refreshActiveConversationOnce() {
        val client = api ?: return
        val convId = _uiState.value.selectedConversationId ?: return
        val threadId = _uiState.value.selectedThreadId
        viewModelScope.launch {
            runCatching { client.teamChat(convId, threadId) }
                .onSuccess { view ->
                    if (_uiState.value.selectedConversationId == convId) {
                        _uiState.update { it.copy(activeTeamView = view) }
                    }
                }
        }
    }

    private fun handleApiError(err: Throwable) {
        if (err is GituApiException && err.code == "APP_LOCKED") {
            disconnect()
        }
        _uiState.update {
            it.copy(errorMessage = err.message ?: "Request failed.")
        }
    }

    private fun stopAllPolling() {
        runPollJob?.cancel()
        teamPollJob?.cancel()
        inboxPollJob?.cancel()
        computerPollJob?.cancel()
    }

    override fun onCleared() {
        voiceManager.endCall()
        stopAllPolling()
        super.onCleared()
    }

    companion object {
        fun mergeRunEvents(previous: List<RunEvent>, incoming: List<RunEvent>): List<RunEvent> {
            if (incoming.isEmpty()) return previous
            val map = LinkedHashMap<Int, RunEvent>(previous.size + incoming.size)
            for (ev in previous) map[ev.i] = ev
            for (ev in incoming) map[ev.i] = ev
            return map.values.sortedBy { it.i }.takeLast(2000)
        }

        fun extractReasoningText(events: List<RunEvent>): String {
            val sb = StringBuilder()
            for (ev in events) {
                val type = ev.typed?.get("type")?.jsonPrimitive?.contentOrNull
                if (type == "reasoning" || type == "thought_summary") {
                    val delta = ev.typed["text"]?.jsonPrimitive?.contentOrNull ?: ev.text
                    if (delta.isNotBlank()) {
                        if (sb.isNotEmpty()) sb.append("\n")
                        sb.append(delta)
                    }
                }
            }
            return sb.toString().takeLast(24_000)
        }
    }
}
