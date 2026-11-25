package dev.agentgitu.mobile.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.unit.dp
import dev.agentgitu.mobile.ui.components.*
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette
import dev.agentgitu.mobile.ui.viewmodel.AppUiState
import dev.agentgitu.mobile.ui.viewmodel.GituAppViewModel

/**
 * Exact Stitch Shared Inbox Room & Invites screen (shared_inbox_room_invites/code.html).
 */
@Composable
fun InboxRoomDetailScreen(
    roomId: String,
    state: AppUiState,
    vm: GituAppViewModel,
) {
    val s = LocalStitchPalette.current
    val room = state.inboxState?.rooms?.firstOrNull { it.id == roomId }
    val activeInvite = state.inboxState?.invites?.firstOrNull { it.revokedAt.isNullOrBlank() }
    var composer by remember { mutableStateOf("") }
    var showCreateInvite by remember { mutableStateOf(false) }

    Scaffold(
        containerColor = s.surface,
        topBar = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(s.surface)
                    .statusBarsPadding(),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        StitchCircleIconButton(
                            icon = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            outlined = true,
                            onClick = { vm.closeInboxRoom() },
                        )
                        StitchCircleIconButton(
                            icon = Icons.Default.PersonAdd,
                            contentDescription = "Invite collaborator",
                            primary = true,
                            onClick = { showCreateInvite = true },
                        )
                    }

                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.align(Alignment.TopCenter),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .clip(CircleShape)
                                .background(s.surfaceContainerLowest)
                                .border(2.dp, s.outlineVariant, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(Icons.Default.Groups, contentDescription = null, tint = s.onSurface, modifier = Modifier.size(22.dp))
                        }
                        Spacer(Modifier.height(4.dp))
                        Text(room?.title?.ifBlank { "Shared Room" } ?: "Shared Room", style = MaterialTheme.typography.titleMedium, color = s.onSurface)
                        Text(
                            text = "${room?.memberIds?.size ?: 0} collaborators • ${room?.activeAgentIds?.size ?: 0} agents",
                            style = MaterialTheme.typography.labelSmall,
                            color = s.onSurfaceVariant,
                        )
                    }
                }
                HorizontalDivider(color = s.outlineVariant)
            }
        },
        bottomBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(s.surface)
                    .navigationBarsPadding()
                    .imePadding()
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .clip(CircleShape)
                        .background(s.surfaceContainerLow)
                        .padding(horizontal = 16.dp, vertical = 11.dp),
                ) {
                    Box(modifier = Modifier.weight(1f)) {
                        if (composer.isEmpty()) Text("Message room…", style = MaterialTheme.typography.bodyMedium, color = s.onSurfaceVariant)
                        BasicTextField(
                            value = composer,
                            onValueChange = { composer = it },
                            textStyle = MaterialTheme.typography.bodyMedium.copy(color = s.onSurface),
                            cursorBrush = SolidColor(s.primary),
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
                StitchCircleIconButton(
                    icon = Icons.Default.ArrowUpward,
                    contentDescription = "Send",
                    primary = composer.isNotBlank(),
                    onClick = {
                        if (composer.isNotBlank()) {
                            vm.sendInboxMessage(composer)
                            composer = ""
                        }
                    },
                )
            }
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // 2-Column Room Policy & Trigger Grid
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StitchCard(modifier = Modifier.weight(1f)) {
                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Text("Agent trigger", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                            Text(room?.agentTriggerMode ?: "mention", style = MaterialTheme.typography.labelSmall, color = s.onSurface)
                        }
                    }
                    StitchCard(modifier = Modifier.weight(1f)) {
                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Text("Tool policy", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                            Text(room?.toolPolicyOverride ?: "read_only", style = MaterialTheme.typography.labelSmall, color = s.primary)
                        }
                    }
                }
            }

            // Invite Link Card
            activeInvite?.let { inv ->
                item {
                    StitchCard(modifier = Modifier.fillMaxWidth(), containerColor = s.surfaceContainerLow) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(inv.code ?: inv.label ?: "Invite link", style = MaterialTheme.typography.labelSmall, color = s.onSurface)
                                Text("Policy: ${inv.toolPolicy} • ${inv.usedCount}/${inv.maxUses} used", style = MaterialTheme.typography.bodySmall, color = s.onSurfaceVariant)
                            }
                            StitchBadge(text = inv.toolPolicy, tone = BadgeTone.NEUTRAL, mono = true)
                        }
                    }
                }
            }

            // Messages
            items(state.inboxMessages, key = { it.id }) { msg ->
                val isOwner = msg.senderType == "owner"
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = if (isOwner) Arrangement.End else Arrangement.Start,
                ) {
                    Column(
                        modifier = Modifier.widthIn(max = 300.dp),
                        horizontalAlignment = if (isOwner) Alignment.End else Alignment.Start,
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text("${msg.senderName} • ${msg.senderType}", style = MaterialTheme.typography.labelSmall, color = s.onSurfaceVariant)
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(20.dp))
                                .background(if (isOwner) s.primary else s.surfaceContainerLowest)
                                .border(1.dp, if (isOwner) s.primary else s.outlineVariant, RoundedCornerShape(20.dp))
                                .padding(horizontal = 14.dp, vertical = 10.dp),
                        ) {
                            Text(msg.text, style = MaterialTheme.typography.bodyMedium, color = if (isOwner) s.onPrimary else s.onSurface)
                        }
                    }
                }
            }
        }
    }

    if (showCreateInvite) {
        var label by remember { mutableStateOf("") }
        var policy by remember { mutableStateOf("read_only") }
        AlertDialog(
            onDismissRequest = { showCreateInvite = false },
            containerColor = s.surfaceContainerLowest,
            title = { Text("Create collaborator invite", color = s.onSurface) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    StitchInputField(value = label, onValueChange = { label = it }, label = "Label", placeholder = "Design partner")
                    StitchSegmentedPills(
                        items = listOf("chat_only" to "Chat", "read_only" to "Read", "standard" to "Standard"),
                        selected = policy,
                        onSelect = { policy = it },
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    vm.createInboxInvite(label.ifBlank { "Mobile invite" }, policy)
                    showCreateInvite = false
                }) { Text("Create", color = s.primary) }
            },
            dismissButton = { TextButton(onClick = { showCreateInvite = false }) { Text("Cancel", color = s.onSurfaceVariant) } },
        )
    }
}
