package dev.agentgitu.mobile.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.agentgitu.mobile.ui.components.AuthenticatedInteractiveWebView
import dev.agentgitu.mobile.ui.components.ComputerActionChip
import dev.agentgitu.mobile.ui.components.StitchCircleIconButton
import dev.agentgitu.mobile.ui.components.parseHexColor
import dev.agentgitu.mobile.ui.components.resolveCharacterColorHex
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette
import dev.agentgitu.mobile.ui.viewmodel.AppUiState
import dev.agentgitu.mobile.ui.viewmodel.GituAppViewModel
import dev.agentgitu.mobile.ui.viewmodel.LiveSurfaceRequest

/**
 * Fullscreen Interactive Surface overlay (Live noVNC Linux Desktop, Interactive Server Browser,
 * Artifact Preview, or Full Workspace) with synced session cookies, auth headers, and live
 * Computer Handoff & App controls when viewing an agent's computer.
 */
@Composable
fun LiveSurfaceScreen(
    request: LiveSurfaceRequest,
    state: AppUiState,
    vm: GituAppViewModel,
    onClose: () -> Unit,
) {
    val s = LocalStitchPalette.current
    var reloadNonce by remember(request.url) { mutableIntStateOf(0) }
    var serverBrowserUserControl by remember(request.computerAgentId) { mutableStateOf(false) }

    val agentId = request.computerAgentId
    val teammate = remember(agentId, state.teammates) {
        if (agentId.isNullOrBlank()) null else state.teammates.firstOrNull { it.id == agentId }
    }
    val computer = agentId?.let { state.agentComputers[it] }
    val busy = agentId != null && agentId in state.computerActionBusy
    val isHost = request.isServerBrowser || (computer?.useHostComputer ?: teammate?.useHostComputer ?: false)
    val isRunning = !isHost && computer?.state == "running"
    val isUserControl = !isHost && computer?.control == "user"
    val handoffReason = computer?.handoff?.reason.orEmpty()
    val agentAccent = remember(teammate, s.primary) {
        if (teammate != null) {
            parseHexColor(resolveCharacterColorHex(teammate.avatar.shape, teammate.avatar.color, teammate.name), s.primary)
        } else {
            s.primary
        }
    }

    LaunchedEffect(agentId) {
        if (!agentId.isNullOrBlank()) {
            vm.refreshAgentComputer(agentId)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(s.surface)
            .statusBarsPadding()
            .navigationBarsPadding(),
    ) {
        // Top Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(s.surface)
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            StitchCircleIconButton(
                icon = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = "Back",
                outlined = true,
                size = 38.dp,
                onClick = onClose,
            )
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(
                    text = request.title,
                    style = MaterialTheme.typography.titleMedium,
                    color = s.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                val statusSub = when {
                    agentId != null && isHost -> "Live workspace browser · Touch or take control"
                    agentId != null && isRunning && isUserControl -> "Live · You have control"
                    agentId != null && isRunning -> "Live · Shared desktop"
                    agentId != null && computer?.state == "starting" -> "Starting private desktop…"
                    agentId != null && computer?.state == "sleeping" -> "Sleeping · Tap Wake below"
                    request.subtitle.isNotBlank() -> request.subtitle
                    else -> ""
                }
                if (statusSub.isNotBlank()) {
                    Text(
                        text = statusSub,
                        style = MaterialTheme.typography.labelSmall,
                        color = if (isUserControl) agentAccent else s.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            StitchCircleIconButton(
                icon = Icons.Default.Refresh,
                contentDescription = "Reload",
                outlined = true,
                size = 38.dp,
                onClick = {
                    if (!agentId.isNullOrBlank()) vm.refreshAgentComputer(agentId)
                    reloadNonce++
                },
            )
            StitchCircleIconButton(
                icon = Icons.Default.Close,
                contentDescription = "Close",
                outlined = true,
                size = 38.dp,
                onClick = onClose,
            )
        }

        // Handoff Banner when user has control or agent asked for handoff
        AnimatedVisibility(visible = agentId != null && !isHost && (isUserControl || handoffReason.isNotBlank())) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(agentAccent.copy(alpha = 0.14f))
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Default.PanTool, contentDescription = null, tint = agentAccent, modifier = Modifier.size(16.dp))
                Text(
                    text = handoffReason.ifBlank { "You have control. Return to ${teammate?.name ?: "agent"} when finished." },
                    style = MaterialTheme.typography.bodySmall,
                    color = s.onSurface,
                    modifier = Modifier.weight(1f),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        HorizontalDivider(color = s.outlineVariant)

        // Live Authenticated Interactive Surface
        val resolvedUrl = when {
            !agentId.isNullOrBlank() && isHost -> vm.serverBrowserViewUrl(agentId)
            !agentId.isNullOrBlank() -> vm.agentComputerViewUrl(agentId, preview = false)
            else -> request.url
        }

        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            if (!agentId.isNullOrBlank() && !isHost && !isRunning) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(s.surfaceContainerLow)
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    if (computer?.state == "starting" || busy) {
                        CircularProgressIndicator(color = agentAccent, strokeWidth = 3.dp)
                    } else {
                        Box(
                            modifier = Modifier
                                .size(64.dp)
                                .clip(CircleShape)
                                .background(agentAccent.copy(alpha = 0.14f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = if (computer?.state == "sleeping") Icons.Default.Bedtime else Icons.Default.DesktopWindows,
                                contentDescription = null,
                                tint = agentAccent,
                                modifier = Modifier.size(30.dp),
                            )
                        }
                    }
                    Spacer(Modifier.height(14.dp))
                    Text(
                        text = when (computer?.state) {
                            "starting" -> "Starting ${teammate?.name ?: "agent"}'s desktop…"
                            "sleeping" -> "Desktop is sleeping"
                            "unavailable" -> "Desktop unavailable"
                            else -> "Private desktop is stopped"
                        },
                        style = MaterialTheme.typography.titleMedium,
                        color = s.onSurface,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = computer?.error?.takeIf { it.isNotBlank() }
                            ?: if (computer?.state == "sleeping") "Your windows and apps are preserved. Wake to continue."
                            else "Start the desktop to view and interact with it live.",
                        style = MaterialTheme.typography.bodySmall,
                        color = s.onSurfaceVariant,
                    )
                }
            } else {
                AuthenticatedInteractiveWebView(
                    url = resolvedUrl,
                    authHeaders = vm.mediaAuthHeaders(),
                    onSyncCookies = { wv -> vm.syncCookiesForWebView(wv) },
                    reloadNonce = reloadNonce,
                    interactiveTouch = true,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }

        // Bottom Native Computer & Handoff Toolbar (when viewing a computer)
        if (!agentId.isNullOrBlank()) {
            HorizontalDivider(color = s.outlineVariant)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(s.surface)
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (isHost) {
                    ComputerActionChip(
                        label = if (serverBrowserUserControl) "Return to agent" else "Take control",
                        icon = if (serverBrowserUserControl) Icons.Default.SmartToy else Icons.Default.PanTool,
                        highlighted = true,
                        accent = agentAccent,
                        enabled = !busy,
                        onClick = {
                            val next = !serverBrowserUserControl
                            serverBrowserUserControl = next
                            vm.performServerBrowserControl(agentId, if (next) "take-control" else "return-control")
                        },
                    )
                    ComputerActionChip(
                        label = "Use private desktop",
                        icon = Icons.Default.DesktopWindows,
                        enabled = !busy,
                        onClick = { vm.performComputerAction(agentId, "use-private") },
                    )
                } else {
                    if (isRunning) {
                        ComputerActionChip(
                            label = if (isUserControl) "Return to agent" else "Take control",
                            icon = if (isUserControl) Icons.Default.SmartToy else Icons.Default.PanTool,
                            highlighted = true,
                            accent = agentAccent,
                            enabled = !busy,
                            onClick = { vm.performComputerAction(agentId, if (isUserControl) "return-control" else "take-control") },
                        )
                        ComputerActionChip(
                            label = "Browser",
                            icon = Icons.Default.Language,
                            enabled = !busy,
                            onClick = { vm.launchComputerApp(agentId, "browser") },
                        )
                        ComputerActionChip(
                            label = "Agent browser",
                            icon = Icons.Default.TravelExplore,
                            enabled = !busy,
                            onClick = { vm.launchComputerApp(agentId, "agent_browser") },
                        )
                        ComputerActionChip(
                            label = "Files",
                            icon = Icons.Default.Folder,
                            enabled = !busy,
                            onClick = { vm.launchComputerApp(agentId, "files") },
                        )
                        ComputerActionChip(
                            label = "Terminal",
                            icon = Icons.Default.Terminal,
                            enabled = !busy,
                            onClick = { vm.launchComputerApp(agentId, "terminal") },
                        )
                        ComputerActionChip(
                            label = "Sleep",
                            icon = Icons.Default.Bedtime,
                            enabled = !busy,
                            onClick = { vm.performComputerAction(agentId, "sleep") },
                        )
                    } else if (computer?.state != "starting") {
                        ComputerActionChip(
                            label = if (computer?.state == "sleeping") "Wake desktop" else "Start desktop",
                            icon = Icons.Default.PlayArrow,
                            highlighted = true,
                            accent = agentAccent,
                            enabled = !busy,
                            onClick = { vm.performComputerAction(agentId, "start") },
                        )
                    }
                    if (isRunning || computer?.state == "starting" || computer?.state == "sleeping") {
                        ComputerActionChip(
                            label = "Stop",
                            icon = Icons.Default.Stop,
                            danger = true,
                            enabled = !busy,
                            onClick = { vm.performComputerAction(agentId, "stop") },
                        )
                    }
                }
            }
        }
    }
}
