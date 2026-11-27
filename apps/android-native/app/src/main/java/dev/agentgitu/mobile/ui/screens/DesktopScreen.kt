package dev.agentgitu.mobile.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.agentgitu.mobile.ui.components.*
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette
import dev.agentgitu.mobile.ui.viewmodel.AppUiState
import dev.agentgitu.mobile.ui.viewmodel.GituAppViewModel

/**
 * Live Desktop & Computer Handoff Console:
 * - Real-time computer statuses for every teammate
 * - Live interactive noVNC / Server Browser panel directly embedded on screen
 * - Take control / Return to agent handoff, app launchers, Start / Wake / Sleep / Stop
 * - Pull-to-refresh by sliding down
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DesktopScreen(
    state: AppUiState,
    vm: GituAppViewModel,
) {
    val s = LocalStitchPalette.current
    var selectedAgentId by remember { mutableStateOf(state.teammates.firstOrNull()?.id.orEmpty()) }
    val selectedAgent = state.teammates.firstOrNull { it.id == selectedAgentId }
        ?: state.teammates.firstOrNull()

    LaunchedEffect(state.teammates) {
        if (selectedAgentId.isBlank() && state.teammates.isNotEmpty()) {
            selectedAgentId = state.teammates.first().id
        }
        vm.refreshAllAgentComputers()
    }

    LaunchedEffect(selectedAgent?.id) {
        val agId = selectedAgent?.id ?: return@LaunchedEffect
        vm.refreshAgentComputer(agId)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(s.surface)
            .statusBarsPadding(),
    ) {
        // Top Bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Live Computers", style = MaterialTheme.typography.headlineMedium, color = s.onSurface)
                Text(
                    text = selectedAgent?.let {
                        val comp = state.agentComputers[it.id]
                        val isHost = comp?.useHostComputer ?: it.useHostComputer
                        if (isHost) "${it.name} • Workspace Browser"
                        else "${it.name} • ${comp?.state?.replaceFirstChar { c -> c.uppercase() } ?: "Ready"}"
                    } ?: "Private desktops & agent browser",
                    style = MaterialTheme.typography.labelSmall,
                    color = s.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StitchCircleIconButton(
                    icon = Icons.Default.Language,
                    contentDescription = "Workspace browser",
                    outlined = true,
                    onClick = { vm.openServerBrowser() },
                )
                StitchCircleIconButton(
                    icon = Icons.Default.Refresh,
                    contentDescription = "Refresh computers",
                    outlined = true,
                    onClick = { vm.pullRefreshDesktop() },
                )
            }
        }

        // Teammate selector pills
        if (state.teammates.isNotEmpty()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                state.teammates.forEach { ag ->
                    val active = ag.id == selectedAgent?.id
                    val comp = state.agentComputers[ag.id]
                    val isRunning = comp?.isRunning == true
                    val isHandoff = comp?.isUserControl == true
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(if (active) s.primary else s.surfaceContainerLow)
                            .border(1.dp, if (active) s.primary else s.outlineVariant, CircleShape)
                            .stitchPressBounce(pressedScale = 0.94f) {
                                selectedAgentId = ag.id
                                vm.refreshAgentComputer(ag.id)
                            }
                            .padding(start = 6.dp, end = 10.dp, top = 4.dp, bottom = 4.dp),
                    ) {
                        StitchCharacterAvatar(
                            label = ag.name,
                            accentHex = ag.avatar.color,
                            shapeName = ag.avatar.shape,
                            imageUrl = ag.avatar.imageUrl,
                            size = 24.dp,
                            statusDotColor = when {
                                isHandoff -> s.warning
                                isRunning -> s.success
                                else -> null
                            },
                        )
                        Text(
                            text = ag.name,
                            style = MaterialTheme.typography.labelMedium,
                            color = if (active) s.onPrimary else s.onSurface,
                        )
                    }
                }
            }
        }

        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = { vm.pullRefreshDesktop() },
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                if (selectedAgent != null) {
                    val comp = state.agentComputers[selectedAgent.id]
                    item(key = "active_computer_${selectedAgent.id}") {
                        InChatComputerPanel(
                            teammate = selectedAgent,
                            computer = comp,
                            busy = selectedAgent.id in state.computerActionBusy,
                            handoffActive = comp?.isUserControl == true,
                            handoffReason = comp?.handoff?.reason.orEmpty(),
                            computerViewUrl = vm.agentComputerViewUrl(selectedAgent.id, preview = false),
                            serverBrowserViewUrl = vm.serverBrowserViewUrl(selectedAgent.id),
                            authHeaders = vm.mediaAuthHeaders(),
                            onSyncCookies = { wv -> vm.syncCookiesForWebView(wv) },
                            onAction = { action -> vm.performComputerAction(selectedAgent.id, action) },
                            onLaunchApp = { app -> vm.launchComputerApp(selectedAgent.id, app) },
                            onServerBrowserControl = { action -> vm.performServerBrowserControl(selectedAgent.id, action) },
                            onExpandFullscreen = { vm.openLiveDesktop(selectedAgent.id, selectedAgent.name) },
                            screenHeight = 360.dp,
                            modifier = Modifier.animateItem(),
                        )
                    }
                }

                // All Teammate Computers overview
                if (state.teammates.isNotEmpty()) {
                    item(key = "section_all") {
                        Text("All teammate computers", style = MaterialTheme.typography.titleMedium, color = s.onSurface)
                    }
                    items(state.teammates, key = { "desktop_${it.id}" }) { ag ->
                        val comp = state.agentComputers[ag.id]
                        val isHost = comp?.useHostComputer ?: ag.useHostComputer
                        val isRunning = comp?.isRunning == true
                        val isUserCtrl = comp?.isUserControl == true
                        StitchCard(
                            modifier = Modifier
                                .fillMaxWidth()
                                .animateItem(),
                            onClick = {
                                selectedAgentId = ag.id
                                vm.refreshAgentComputer(ag.id)
                            },
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                StitchCharacterAvatar(
                                    label = ag.name,
                                    accentHex = ag.avatar.color,
                                    shapeName = ag.avatar.shape,
                                    imageUrl = ag.avatar.imageUrl,
                                    size = 44.dp,
                                    statusDotColor = when {
                                        isUserCtrl -> s.warning
                                        isRunning || isHost -> s.success
                                        else -> null
                                    },
                                )
                                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text(ag.name, style = MaterialTheme.typography.titleSmall, color = s.onSurface)
                                    Text(
                                        text = when {
                                            isHost -> "Workspace browser • Host mode"
                                            isUserCtrl -> "Your turn • User has control"
                                            isRunning -> "Running • Live shared desktop"
                                            comp?.state == "starting" -> "Starting private desktop…"
                                            comp?.state == "sleeping" -> "Sleeping • Apps preserved"
                                            else -> "Private Linux desktop • Stopped"
                                        },
                                        style = MaterialTheme.typography.bodySmall,
                                        color = if (isUserCtrl) s.primary else s.onSurfaceVariant,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                                StitchSecondaryButton(
                                    text = if (isRunning || isHost) "Open" else "Start",
                                    outlined = true,
                                    onClick = {
                                        if (isRunning || isHost) {
                                            vm.openLiveDesktop(ag.id, ag.name)
                                        } else {
                                            selectedAgentId = ag.id
                                            vm.performComputerAction(ag.id, "start")
                                        }
                                    },
                                )
                            }
                        }
                    }
                }

                // Quick Workspace Browser & Full Web Tools
                item(key = "workspace_tools") {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        StitchSecondaryButton(
                            text = "Workspace browser",
                            icon = Icons.Default.Language,
                            outlined = true,
                            onClick = { vm.openServerBrowser() },
                            modifier = Modifier.weight(1f),
                        )
                        StitchSecondaryButton(
                            text = "Full Web UI",
                            icon = Icons.Default.OpenInBrowser,
                            outlined = true,
                            onClick = { vm.openFullWebWorkspace("Full desktop & workspace controls") },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }
    }
}
