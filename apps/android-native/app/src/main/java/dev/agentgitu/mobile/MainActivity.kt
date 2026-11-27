package dev.agentgitu.mobile

import android.Manifest
import android.content.Intent
import android.graphics.Color as AndroidColor
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.ImageLoader
import coil.decode.SvgDecoder
import dev.agentgitu.mobile.data.local.ThemePreference
import dev.agentgitu.mobile.push.PushDeepLink
import dev.agentgitu.mobile.push.PushNavigationTarget
import dev.agentgitu.mobile.ui.components.GituMediaContext
import dev.agentgitu.mobile.ui.components.LocalGituMediaContext
import dev.agentgitu.mobile.ui.components.StitchFloatingPillNav
import dev.agentgitu.mobile.ui.components.StitchOrbPulse
import dev.agentgitu.mobile.ui.screens.*
import dev.agentgitu.mobile.ui.theme.AgentGituTheme
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette
import dev.agentgitu.mobile.ui.viewmodel.GituAppViewModel
import dev.agentgitu.mobile.ui.viewmodel.MainTab

class MainActivity : ComponentActivity() {

    private val vm: GituAppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handleIncomingIntent(intent)

        setContent {
            val state by vm.uiState.collectAsStateWithLifecycle()
            val systemDark = isSystemInDarkTheme()
            val isDark = when (state.themePreference) {
                ThemePreference.SYSTEM -> systemDark
                ThemePreference.LIGHT -> false
                ThemePreference.DARK -> true
            }
            LaunchedEffect(isDark) {
                val style = if (isDark) {
                    SystemBarStyle.dark(AndroidColor.TRANSPARENT)
                } else {
                    SystemBarStyle.light(AndroidColor.TRANSPARENT, AndroidColor.TRANSPARENT)
                }
                enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
            }
            AgentGituTheme(preference = state.themePreference) {
                AgentGituRoot(vm = vm)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncomingIntent(intent)
    }

    private fun handleIncomingIntent(intent: Intent?) {
        if (intent == null) return
        intent.dataString?.let { raw ->
            vm.applyConnectLink(raw)
        }
        val pushTarget = intent.getStringExtra(PushDeepLink.EXTRA_TARGET)
        if (!pushTarget.isNullOrBlank()) {
            vm.handlePushDeepLink(
                PushNavigationTarget(
                    target = pushTarget,
                    targetId = intent.getStringExtra(PushDeepLink.EXTRA_TARGET_ID).orEmpty(),
                    threadId = intent.getStringExtra(PushDeepLink.EXTRA_THREAD_ID),
                    workspaceId = intent.getStringExtra(PushDeepLink.EXTRA_WORKSPACE_ID),
                ),
            )
        }
    }
}

private val STITCH_NAV_ITEMS = listOf(
    Triple(MainTab.COWORK, "Cowork", Icons.Default.Forum),
    Triple(MainTab.CODING, "Coding", Icons.Default.Code),
    Triple(MainTab.DESKTOP, "Desktop", Icons.Default.Devices),
    Triple(MainTab.SETTINGS, "Settings", Icons.Default.Tune),
)

@Composable
private fun AgentGituRoot(vm: GituAppViewModel) {
    val s = LocalStitchPalette.current
    val state by vm.uiState.collectAsStateWithLifecycle()
    val voiceState by vm.voiceState.collectAsStateWithLifecycle()
    val pendingMicTarget by vm.pendingMicPermissionTarget.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    val micPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        vm.onMicPermissionResult(granted)
    }

    LaunchedEffect(pendingMicTarget) {
        if (pendingMicTarget != null) {
            micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    LaunchedEffect(state.bannerMessage, state.errorMessage) {
        val message = state.errorMessage ?: state.bannerMessage
        if (!message.isNullOrBlank() && state.connected) {
            snackbarHostState.showSnackbar(message)
            vm.clearNotices()
        }
    }

    if (!state.initialized) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(s.surface),
            contentAlignment = Alignment.Center,
        ) {
            StitchOrbPulse(size = 56.dp)
        }
        return
    }

    if (!state.connected) {
        ConnectScreen(
            state = state,
            onPikpamSignIn = { email, pass -> vm.signInWithPikpam(email, pass) },
            onPikpamSignOut = { vm.signOutPikpam() },
            onRefreshPikpamAgents = { vm.refreshPikpamAgents() },
            onConnectPikpamAgent = { inst -> vm.connectToPikpamAgent(inst) },
            onClaimFreeCloud = { name -> vm.claimFreePikpamCloud(name) },
            onConnectDirect = { url, mode, key, email, pass, usePikpam ->
                vm.connect(url, mode, key, email, pass, usePikpam)
            },
            onPing = { vm.pingServer(it) },
            onPasteConnectLink = { vm.applyConnectLink(it) },
        )
        return
    }

    val context = LocalContext.current
    val mediaContext = remember(state.connected, state.serverUrl) {
        val okClient = vm.mediaOkHttpClient()
        val loader = ImageLoader.Builder(context)
            .apply { if (okClient != null) okHttpClient(okClient) }
            .components { add(SvgDecoder.Factory()) }
            .crossfade(true)
            .build()
        GituMediaContext(
            baseUrl = vm.serverBaseUrl().ifBlank { state.serverUrl },
            authHeaders = vm.mediaAuthHeaders(),
            imageLoader = loader,
        )
    }

    CompositionLocalProvider(LocalGituMediaContext provides mediaContext) {
        Box(modifier = Modifier.fillMaxSize()) {
            val liveSurface = state.liveSurface
            if (liveSurface != null) {
                LiveSurfaceScreen(
                    request = liveSurface,
                    state = state,
                    vm = vm,
                    onClose = { vm.closeLiveSurface() },
                )
            } else if (state.showConnectionsScreen) {
                ConnectionsScreen(
                    state = state,
                    vm = vm,
                    onBack = { vm.closeConnections() },
                )
            } else {
                val showBottomBar = state.selectedConversationId == null &&
                    state.selectedInboxRoomId == null &&
                    state.selectedProfileAgentId == null &&
                    !state.showFilesExplorer

                val badgeTabs = buildSet {
                    if (state.runs.any { it.needsInput }) add(MainTab.CODING)
                }

                Scaffold(
                    containerColor = s.surface,
                    snackbarHost = { SnackbarHost(snackbarHostState) },
                    bottomBar = {
                        if (showBottomBar) {
                            StitchFloatingPillNav(
                                items = STITCH_NAV_ITEMS,
                                selected = state.activeTab,
                                badgeTabs = badgeTabs,
                                onSelect = { vm.selectTab(it) },
                            )
                        }
                    },
                ) { padding ->
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(s.surface)
                            .padding(bottom = padding.calculateBottomPadding()),
                    ) {
                        when (state.activeTab) {
                            MainTab.COWORK -> CoworkScreen(state = state, vm = vm)
                            MainTab.CODING -> {
                                if (state.showFilesExplorer) {
                                    FilesScreen(state = state, vm = vm)
                                } else {
                                    AgentScreen(state = state, vm = vm)
                                }
                            }
                            MainTab.DESKTOP -> DesktopScreen(state = state, vm = vm)
                            MainTab.SETTINGS -> SettingsScreen(state = state, vm = vm)
                        }
                    }
                }
            }

            // Native LiveKit Voice Call Overlay (Full Stage, Minimized Floating Pill, and Setup Dialog)
            VoiceCallHostOverlay(
                voiceState = voiceState,
                onToggleMute = { vm.toggleVoiceMute() },
                onToggleSpeaker = { vm.toggleVoiceSpeaker() },
                onToggleMinimized = { vm.setVoiceMinimized(it) },
                onEndCall = { vm.endVoiceCall() },
                onRetryCall = { vm.retryVoiceCall() },
                onOpenByokSetup = { vm.openLiveKitByokSetup() },
                onSaveConfig = { url, key, secret -> vm.saveLiveKitConfig(url, key, secret) },
                onDismissSetup = { vm.dismissLiveKitSetup() },
                modifier = Modifier.align(Alignment.TopCenter),
            )
        }
    }
}
