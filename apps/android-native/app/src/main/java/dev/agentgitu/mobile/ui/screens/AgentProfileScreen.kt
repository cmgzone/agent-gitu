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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.agentgitu.mobile.data.model.Teammate
import dev.agentgitu.mobile.ui.components.*
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette
import dev.agentgitu.mobile.ui.viewmodel.AppUiState
import dev.agentgitu.mobile.ui.viewmodel.GituAppViewModel

/**
 * Native Agent Profile Screen showing the teammate's official AI character,
 * capabilities, connected apps, model/compute configuration, instructions,
 * and quick actions (DM, Desktop, Voice, Connections, Edit, Delete).
 */
@Composable
fun AgentProfileScreen(
    teammate: Teammate,
    state: AppUiState,
    vm: GituAppViewModel,
    onBack: () -> Unit,
    onEdit: () -> Unit,
    onStartDm: () -> Unit,
) {
    val s = LocalStitchPalette.current
    val charSpec = remember(teammate) {
        resolveOfficialCharacter(teammate.avatar.shape, teammate.avatar.color, teammate.name)
    }
    var confirmDelete by remember { mutableStateOf(false) }
    var showModelPicker by remember { mutableStateOf(false) }

    val agentAccounts = remember(state.connectedApps, state.connectionsAgentId, teammate.id) {
        if (state.connectionsAgentId == teammate.id) {
            state.connectedApps.accounts + state.connectedApps.mail.accounts
        } else {
            emptyList()
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
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StitchCircleIconButton(
                    icon = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back",
                    outlined = true,
                    size = 38.dp,
                    onClick = onBack,
                )
                Text("Agent Profile", style = MaterialTheme.typography.titleLarge, color = s.onSurface)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StitchCircleIconButton(
                    icon = Icons.Default.Edit,
                    contentDescription = "Edit teammate",
                    outlined = true,
                    size = 38.dp,
                    onClick = onEdit,
                )
                StitchCircleIconButton(
                    icon = Icons.Default.DeleteOutline,
                    contentDescription = "Remove teammate",
                    danger = true,
                    size = 38.dp,
                    onClick = { confirmDelete = true },
                )
            }
        }
        HorizontalDivider(color = s.outlineVariant)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // Hero Character Card
            StitchCard(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(18.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    StitchCharacterAvatar(
                        label = teammate.name,
                        accentHex = teammate.avatar.color,
                        shapeName = teammate.avatar.shape,
                        size = 84.dp,
                        floating = true,
                        statusDotColor = s.success,
                    )
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(teammate.name, style = MaterialTheme.typography.headlineSmall, color = s.onSurface)
                        Text(
                            text = teammate.tagline.ifBlank { "AI Teammate" },
                            style = MaterialTheme.typography.bodySmall,
                            color = s.onSurfaceVariant,
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        StitchBadge(text = charSpec.displayName, tone = BadgeTone.NEUTRAL)
                        if (teammate.chiefOfStaff) {
                            StitchBadge(text = "Chief of Staff", tone = BadgeTone.PRIMARY)
                        }
                        StitchBadge(
                            text = if (teammate.useHostComputer) "Local Computer" else "Cloud",
                            tone = BadgeTone.SUCCESS,
                        )
                    }

                    // Quick Action Row
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        StitchPrimaryButton(
                            text = "Message",
                            icon = Icons.Default.ChatBubble,
                            onClick = onStartDm,
                            modifier = Modifier.weight(1f),
                        )
                        StitchSecondaryButton(
                            text = "Call",
                            icon = Icons.Default.Call,
                            outlined = true,
                            onClick = { vm.startCoworkVoiceCall(agentId = teammate.id) },
                            modifier = Modifier.weight(0.85f),
                        )
                        StitchSecondaryButton(
                            text = "Desktop",
                            icon = Icons.Default.DesktopWindows,
                            outlined = true,
                            onClick = { vm.openLiveDesktop(teammate.id, teammate.name) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }

            // Connected Apps Card
            StitchCard(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("Connected Apps", style = MaterialTheme.typography.titleSmall, color = s.onSurface)
                        Text(
                            text = "Manage →",
                            style = MaterialTheme.typography.labelMedium,
                            color = s.primary,
                            modifier = Modifier.clickable { vm.openConnections(teammate.id) },
                        )
                    }
                    if (agentAccounts.isEmpty()) {
                        Text(
                            text = "No apps assigned to ${teammate.name} yet. Connect Gmail, GitHub, Slack, Calendar, or custom APIs.",
                            style = MaterialTheme.typography.bodySmall,
                            color = s.onSurfaceVariant,
                        )
                    } else {
                        agentAccounts.forEach { acc ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(s.surfaceContainerLow)
                                    .padding(horizontal = 10.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = acc.label ?: acc.address ?: acc.toolkit.replaceFirstChar { it.uppercase() },
                                        style = MaterialTheme.typography.labelMedium,
                                        color = s.onSurface,
                                    )
                                    Text(
                                        text = acc.toolkit.ifBlank { "mailbox" },
                                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                                        color = s.onSurfaceVariant,
                                    )
                                }
                                StitchBadge(
                                    text = if (!acc.disabled && acc.status.equals("ACTIVE", ignoreCase = true)) "Connected" else acc.status.ifBlank { "Active" },
                                    tone = BadgeTone.SUCCESS,
                                )
                            }
                        }
                    }
                    StitchSecondaryButton(
                        text = "Connect apps & mailboxes",
                        icon = Icons.Default.Extension,
                        outlined = true,
                        onClick = { vm.openConnections(teammate.id) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            // Runtime & Permissions Card
            StitchCard(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Model & Permissions", style = MaterialTheme.typography.titleSmall, color = s.onSurface)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .background(s.surfaceContainerLow)
                            .clickable {
                                vm.refreshModels()
                                showModelPicker = true
                            }
                            .padding(horizontal = 10.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("AI Model", style = MaterialTheme.typography.labelSmall, color = s.onSurfaceVariant)
                            Text(
                                text = teammate.model?.ifBlank { "Workspace default" } ?: "Workspace default",
                                style = MaterialTheme.typography.labelMedium,
                                color = s.onSurface,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Text("Change →", style = MaterialTheme.typography.labelMedium, color = s.primary)
                    }
                    ProfileKeyValue("Effort", teammate.effort?.replaceFirstChar { it.uppercase() } ?: "Default")
                    ProfileKeyValue("Shell access", if (teammate.allowShell) "Allowed" else "Read-only")
                    ProfileKeyValue("File writes", if (teammate.allowWrites) "Allowed" else "Read-only")
                    ProfileKeyValue("Self-config", if (teammate.allowConfig) "Allowed" else "Disabled")

                    if (teammate.skills.isNotEmpty()) {
                        HorizontalDivider(color = s.outlineVariant)
                        Text("Skills", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                        Row(
                            modifier = Modifier.horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            teammate.skills.forEach { sk ->
                                StitchBadge(text = sk, tone = BadgeTone.NEUTRAL, mono = true)
                            }
                        }
                    }
                }
            }

            // System Instructions Card
            if (teammate.systemPrompt.isNotBlank()) {
                StitchCard(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("System Instructions", style = MaterialTheme.typography.titleSmall, color = s.onSurface)
                        Text(
                            text = teammate.systemPrompt,
                            style = MaterialTheme.typography.bodySmall,
                            color = s.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            containerColor = s.surfaceContainerLowest,
            title = { Text("Remove ${teammate.name}?", color = s.onSurface) },
            text = { Text("This deletes the teammate profile from your Cowork roster.", color = s.onSurfaceVariant) },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmDelete = false
                        vm.deleteTeammate(teammate.id)
                    },
                ) { Text("Remove", color = s.error) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel", color = s.onSurfaceVariant) } },
        )
    }

    if (showModelPicker) {
        ModelPickerDialog(
            title = "Model for ${teammate.name}",
            catalog = state.modelsCatalog,
            currentProvider = teammate.provider,
            currentModel = teammate.model,
            allowWorkspaceDefault = true,
            onRefresh = { vm.refreshModels(forceRefresh = true) },
            onSelect = { provider, model -> vm.updateTeammateModel(teammate, provider, model) },
            onDismiss = { showModelPicker = false },
        )
    }
}

@Composable
private fun ProfileKeyValue(label: String, value: String) {
    val s = LocalStitchPalette.current
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = s.onSurfaceVariant)
        Text(
            text = value,
            style = MaterialTheme.typography.labelMedium,
            color = s.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
