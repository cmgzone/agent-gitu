package dev.agentgitu.mobile.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.agentgitu.mobile.ui.components.*
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette
import dev.agentgitu.mobile.ui.viewmodel.AppUiState
import dev.agentgitu.mobile.ui.viewmodel.GituAppViewModel

private enum class ComputeTarget {
    MY_PC,
    PRIVATE,
    CLOUD,
}

/**
 * Stitch Live Remote Desktop mode (live_remote_desktop/code.html).
 */
@Composable
fun DesktopScreen(
    state: AppUiState,
    vm: GituAppViewModel,
) {
    val s = LocalStitchPalette.current
    var target by remember { mutableStateOf(ComputeTarget.PRIVATE) }
    var selectedAgentId by remember(state.teammates) {
        mutableStateOf(state.teammates.firstOrNull()?.id.orEmpty())
    }
    val activeAgent = state.teammates.firstOrNull { it.id == selectedAgentId } ?: state.teammates.firstOrNull()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(s.surface)
            .statusBarsPadding(),
    ) {
        // Top Header (matches live_remote_desktop/code.html)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column {
                Text("Desktop", style = MaterialTheme.typography.headlineMedium, color = s.onSurface)
                Text(
                    text = when (target) {
                        ComputeTarget.MY_PC -> "Host Workspace • Active"
                        ComputeTarget.PRIVATE -> "XFCE • Running (noVNC)"
                        ComputeTarget.CLOUD -> "Cloud Desktop • Encrypted SSH"
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = s.successContainer,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StitchCircleIconButton(
                    icon = Icons.Default.Bedtime,
                    contentDescription = "Sleep desktop",
                    onClick = { vm.openFullWebWorkspace("Desktop Power Controls") },
                )
                StitchCircleIconButton(
                    icon = Icons.Default.Fullscreen,
                    contentDescription = "Fullscreen desktop",
                    onClick = {
                        if (activeAgent != null) vm.openLiveDesktop(activeAgent.id, activeAgent.name)
                        else vm.openServerBrowser()
                    },
                )
            }
        }
        HorizontalDivider(color = s.outlineVariant)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // 3-way Compute Target Switcher
            StitchSegmentedPills(
                items = listOf(
                    ComputeTarget.MY_PC to "My PC",
                    ComputeTarget.PRIVATE to "Private",
                    ComputeTarget.CLOUD to "Cloud",
                ),
                selected = target,
                onSelect = { target = it },
            )

            // Teammate selector chips if multiple teammates
            if (state.teammates.size > 1) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    state.teammates.forEach { ag ->
                        val active = ag.id == activeAgent?.id
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(if (active) s.primary else s.surfaceContainerLow)
                                .border(1.dp, if (active) s.primary else s.outlineVariant, CircleShape)
                                .clickable { selectedAgentId = ag.id }
                                .padding(start = 6.dp, end = 12.dp, top = 4.dp, bottom = 4.dp),
                        ) {
                            StitchCharacterAvatar(
                                label = ag.name,
                                accentHex = ag.avatar.color,
                                shapeName = ag.avatar.shape,
                                size = 24.dp,
                            )
                            Text(
                                text = ag.name,
                                style = MaterialTheme.typography.labelMedium,
                                color = if (active) s.onPrimary else s.onSurfaceVariant,
                            )
                        }
                    }
                }
            }

            // Live Desktop Stream Viewport Card
            StitchCard(
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    if (activeAgent != null) vm.openLiveDesktop(activeAgent.id, activeAgent.name)
                    else vm.openServerBrowser()
                },
            ) {
                // 16:9 Live Stream Stage Preview
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(16f / 9f)
                        .background(
                            Brush.linearGradient(
                                listOf(s.surfaceDim, s.surfaceContainerLow, s.surfaceContainerLowest),
                            ),
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        if (activeAgent != null) {
                            StitchCharacterAvatar(
                                label = activeAgent.name,
                                accentHex = activeAgent.avatar.color,
                                shapeName = activeAgent.avatar.shape,
                                size = 66.dp,
                                floating = true,
                                statusDotColor = s.success,
                            )
                        } else {
                            Box(
                                modifier = Modifier
                                    .size(56.dp)
                                    .clip(CircleShape)
                                    .background(s.surfaceContainer)
                                    .border(1.dp, s.outlineVariant, CircleShape),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    imageVector = Icons.Default.DesktopWindows,
                                    contentDescription = null,
                                    tint = s.primary,
                                    modifier = Modifier.size(26.dp),
                                )
                            }
                        }
                        StitchBadge(
                            text = "${activeAgent?.name ?: "Agent"} · Tap to open live stream",
                            tone = BadgeTone.NEUTRAL,
                            mono = true,
                            showDot = true,
                        )
                    }
                }

                HorizontalDivider(color = s.outlineVariant)

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            text = "${activeAgent?.name ?: "Agent"} desktop ready",
                            style = MaterialTheme.typography.titleSmall,
                            color = s.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = "Tap to interact or take control",
                            style = MaterialTheme.typography.labelSmall,
                            color = s.onSurfaceVariant,
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    StitchPrimaryButton(
                        text = "Take control",
                        onClick = {
                            if (activeAgent != null) vm.openLiveDesktop(activeAgent.id, activeAgent.name)
                            else vm.openServerBrowser()
                        },
                    )
                }
            }

            // 3-Column Quick Remote Tools Grid (Files / Terminal / Browser)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                RemoteToolTile(
                    icon = Icons.Default.Folder,
                    label = "Files",
                    onClick = { vm.openFilesExplorer() },
                    modifier = Modifier.weight(1f),
                )
                RemoteToolTile(
                    icon = Icons.Default.Terminal,
                    label = "Terminal",
                    onClick = {
                        if (activeAgent != null) vm.openLiveDesktop(activeAgent.id, "${activeAgent.name} Terminal")
                        else vm.openFullWebWorkspace("Workspace Terminal")
                    },
                    modifier = Modifier.weight(1f),
                )
                RemoteToolTile(
                    icon = Icons.Default.Public,
                    label = "Browser",
                    onClick = { vm.openServerBrowser() },
                    modifier = Modifier.weight(1f),
                )
            }

            // Handoff Status Card
            StitchCard(
                modifier = Modifier.fillMaxWidth(),
                containerColor = s.surfaceContainerLow,
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Icon(
                        imageVector = Icons.Default.LockOpen,
                        contentDescription = null,
                        tint = s.onSurfaceVariant,
                        modifier = Modifier.size(20.dp),
                    )
                    Column {
                        Text("Agent input active", style = MaterialTheme.typography.labelLarge, color = s.onSurface)
                        Text(
                            "Taking control pauses agent shell and browser actions until you return control.",
                            style = MaterialTheme.typography.bodySmall,
                            color = s.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RemoteToolTile(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val s = LocalStitchPalette.current
    StitchCard(modifier = modifier, onClick = onClick) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 16.dp, horizontal = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(icon, contentDescription = null, tint = s.primary, modifier = Modifier.size(22.dp))
            Text(label, style = MaterialTheme.typography.labelMedium, color = s.onSurface)
        }
    }
}
