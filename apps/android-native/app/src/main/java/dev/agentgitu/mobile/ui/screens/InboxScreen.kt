package dev.agentgitu.mobile.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.agentgitu.mobile.ui.components.*
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette
import dev.agentgitu.mobile.ui.viewmodel.AppUiState
import dev.agentgitu.mobile.ui.viewmodel.GituAppViewModel

/**
 * Shared Inbox Room screen with full parity:
 * - Private owner whispers (owner_only, hidden from guests)
 * - Silent Watch & Note mode (agentTriggerMode = watch)
 * - Owner-private Notes, Meeting Summary & Saved Tasks sheet
 * - Safe Sub-Agent & Code run delegation with guest approval gates
 * - Room settings (rename, project link, agents, members, visibility, delete)
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InboxRoomDetailScreen(
    roomId: String,
    state: AppUiState,
    vm: GituAppViewModel,
) {
    val s = LocalStitchPalette.current
    val isOwner = state.inboxState?.role != "member"
    val room = state.inboxState?.rooms?.firstOrNull { it.id == roomId }
    val agentsById = remember(state.inboxState?.agents) {
        state.inboxState?.agents.orEmpty().associateBy { it.id }
    }
    val activeRoomAgents = remember(room?.activeAgentIds, agentsById) {
        room?.activeAgentIds.orEmpty().mapNotNull { agentsById[it] }
    }
    val workspace = state.inboxWorkspace
    val notesCount = workspace?.notes?.size ?: room?.noteCount ?: 0
    val tasks = workspace?.tasks.orEmpty()
    val pendingApprovalCount = remember(tasks, room?.pendingApprovalCount) {
        if (workspace != null) tasks.count { it.status == "pending_approval" } else (room?.pendingApprovalCount ?: 0)
    }
    val openTaskCount = remember(tasks, room?.openTaskCount) {
        if (workspace != null) tasks.count { it.status != "done" && it.status != "pending_approval" } else (room?.openTaskCount ?: 0)
    }
    val canViewWorkspace = isOwner || (room?.notesVisibility == "shared_readonly")
    val isWatchMode = isOwner && room?.agentTriggerMode == "watch"
    val thinkingNames = remember(state.inboxActiveAgentTurnIds, agentsById) {
        state.inboxActiveAgentTurnIds.mapNotNull { agentsById[it]?.name }
    }

    var composer by remember { mutableStateOf("") }
    var privateWhisper by remember(roomId) { mutableStateOf(false) }
    var showWorkspaceSheet by remember { mutableStateOf(false) }
    var workspaceInitialTab by remember { mutableStateOf("notes") }
    var showRoomSettings by remember { mutableStateOf(false) }
    var showCreateInvite by remember { mutableStateOf(false) }

    val listState = rememberLazyListState()
    LaunchedEffect(state.inboxMessages.size, roomId) {
        if (state.inboxMessages.isNotEmpty()) {
            listState.animateScrollToItem(state.inboxMessages.lastIndex)
        }
    }

    Scaffold(
        containerColor = s.surface,
        topBar = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(s.surface)
                    .statusBarsPadding(),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    StitchCircleIconButton(
                        icon = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Back",
                        outlined = true,
                        onClick = { vm.closeInboxRoom() },
                    )

                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Text(
                            text = room?.title?.ifBlank { "Shared Room" } ?: "Shared Room",
                            style = MaterialTheme.typography.titleMedium,
                            color = s.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = buildString {
                                append("${room?.memberIds?.size ?: 0} guests • ${activeRoomAgents.size} agents")
                                if (isWatchMode) append(" • Watching silently")
                            },
                            style = MaterialTheme.typography.labelSmall,
                            color = s.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }

                    if (canViewWorkspace) {
                        Box {
                            StitchCircleIconButton(
                                icon = Icons.Default.Description,
                                contentDescription = "Notes and Tasks",
                                primary = isOwner && pendingApprovalCount > 0,
                                outlined = !(isOwner && pendingApprovalCount > 0),
                                size = 38.dp,
                                onClick = {
                                    workspaceInitialTab = if (isOwner && pendingApprovalCount > 0) "tasks" else "notes"
                                    showWorkspaceSheet = true
                                },
                            )
                            if (isOwner && pendingApprovalCount > 0) {
                                Box(
                                    modifier = Modifier
                                        .align(Alignment.TopEnd)
                                        .size(10.dp)
                                        .clip(CircleShape)
                                        .background(s.warning),
                                )
                            }
                        }
                    }

                    if (isOwner) {
                        StitchCircleIconButton(
                            icon = Icons.Default.Tune,
                            contentDescription = "Room settings",
                            outlined = true,
                            size = 38.dp,
                            onClick = { showRoomSettings = true },
                        )
                        StitchCircleIconButton(
                            icon = Icons.Default.PersonAdd,
                            contentDescription = "Invite collaborator",
                            primary = true,
                            size = 38.dp,
                            onClick = { showCreateInvite = true },
                        )
                    }
                }
                HorizontalDivider(color = s.outlineVariant)
            }
        },
        bottomBar = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(s.surface)
                    .navigationBarsPadding()
                    .imePadding(),
            ) {
                HorizontalDivider(color = s.outlineVariant)

                // Quick-action pill strip: Private Whisper · Watch & Note · Notes & Tasks · Summarize · @Agents
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (isOwner) {
                        InboxChipPill(
                            label = if (privateWhisper) "Private: ON" else "Private",
                            selected = privateWhisper,
                            icon = Icons.Default.Lock,
                            onClick = { privateWhisper = !privateWhisper },
                        )
                    }
                    if (isOwner && room != null && activeRoomAgents.isNotEmpty()) {
                        InboxChipPill(
                            label = if (isWatchMode) "Watching silently" else "Watch & Note",
                            selected = isWatchMode,
                            icon = Icons.Default.Visibility,
                            onClick = {
                                vm.updateInboxRoom(
                                    room.id,
                                    agentTriggerMode = if (isWatchMode) "mention" else "watch",
                                )
                            },
                        )
                    }
                    if (canViewWorkspace) {
                        InboxChipPill(
                            label = when {
                                isOwner && pendingApprovalCount > 0 -> "Notes & Tasks • $pendingApprovalCount approval"
                                isOwner && (notesCount + openTaskCount) > 0 -> "Notes & Tasks (${notesCount + openTaskCount})"
                                isOwner -> "Notes & Tasks"
                                else -> "Meeting Notes ($notesCount)"
                            },
                            selected = false,
                            alert = isOwner && pendingApprovalCount > 0,
                            icon = Icons.Default.Description,
                            onClick = {
                                workspaceInitialTab = if (isOwner && pendingApprovalCount > 0) "tasks" else "notes"
                                showWorkspaceSheet = true
                            },
                        )
                    }
                    if (isOwner && room != null && state.inboxMessages.isNotEmpty()) {
                        InboxChipPill(
                            label = if (state.inboxSummarizing) "Summarizing…" else "Summarize",
                            selected = state.inboxSummarizing,
                            icon = Icons.Default.AutoAwesome,
                            onClick = {
                                if (!state.inboxSummarizing) {
                                    vm.summarizeInboxMeeting(room.id) {
                                        workspaceInitialTab = "notes"
                                        showWorkspaceSheet = true
                                    }
                                }
                            },
                        )
                    }
                    activeRoomAgents.forEach { ag ->
                        InboxChipPill(
                            label = "@${ag.name}",
                            selected = false,
                            onClick = {
                                val token = "@${ag.name} "
                                composer = if (composer.isBlank()) token else "${composer.trimEnd()} $token"
                            },
                        )
                    }
                }

                // Composer row
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 12.dp, end = 12.dp, bottom = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Row(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(24.dp))
                            .background(if (isOwner && privateWhisper) s.surfaceContainerLowest else s.surfaceContainerLow)
                            .border(
                                width = if (isOwner && privateWhisper) 1.5.dp else 1.dp,
                                color = if (isOwner && privateWhisper) s.primary else s.outlineVariant,
                                shape = RoundedCornerShape(24.dp),
                            )
                            .padding(horizontal = 16.dp, vertical = 11.dp),
                    ) {
                        Box(modifier = Modifier.weight(1f)) {
                            if (composer.isEmpty()) {
                                val placeholder = when {
                                    isOwner && privateWhisper -> if (activeRoomAgents.isNotEmpty()) {
                                        "Private whisper to ${activeRoomAgents.joinToString(", ") { it.name }} (hidden from guests)…"
                                    } else {
                                        "Private whisper (activate an agent in Room Settings)…"
                                    }
                                    isWatchMode -> "Message room — agents are watching & noting silently"
                                    activeRoomAgents.isNotEmpty() && room?.agentTriggerMode == "mention" ->
                                        "Message room — @${activeRoomAgents.first().name} summons an agent"
                                    else -> "Message room…"
                                }
                                Text(
                                    text = placeholder,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = s.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
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
                        icon = if (isOwner && privateWhisper) Icons.Default.Lock else Icons.Default.ArrowUpward,
                        contentDescription = if (isOwner && privateWhisper) "Send private whisper" else "Send",
                        primary = composer.isNotBlank(),
                        onClick = {
                            if (composer.isNotBlank()) {
                                vm.sendInboxMessage(composer, privateWhisper = isOwner && privateWhisper)
                                composer = ""
                            }
                        },
                    )
                }
            }
        },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = { vm.pullRefreshInboxRoom() },
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (state.inboxMessages.isEmpty()) {
                    item(key = "empty_room") {
                        StitchCard(modifier = Modifier.fillMaxWidth().animateItem(), containerColor = s.surfaceContainerLow) {
                            Column(
                                modifier = Modifier.padding(18.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Text(
                                    text = room?.title?.ifBlank { "Shared Room" } ?: "Shared Room",
                                    style = MaterialTheme.typography.titleMedium,
                                    color = s.onSurface,
                                )
                                Text(
                                    text = when {
                                        isWatchMode -> "Watch & Note mode is active. Chat normally — your agent silently records decisions, notes, and tasks without interrupting."
                                        activeRoomAgents.isNotEmpty() && room?.agentTriggerMode == "mention" ->
                                            "Start chatting below, mention @${activeRoomAgents.first().name} publicly, or toggle Private to whisper secretly to your agent."
                                        else -> "Send a message below to start collaborating in this room."
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = s.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }

                items(state.inboxMessages, key = { it.id }) { msg ->
                    val isPrivateMsg = msg.visibility == "owner_only"
                    val isSystem = msg.senderType == "system"
                    val isMine = if (isOwner) msg.senderType == "owner" else msg.senderType == "member"

                    if (isSystem) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .animateItem(),
                            contentAlignment = Alignment.Center,
                        ) {
                            StitchBadge(
                                text = if (isPrivateMsg) "Private • ${msg.text}" else msg.text,
                                tone = BadgeTone.NEUTRAL,
                            )
                        }
                    } else {
                        val senderAgent = if (msg.senderType == "agent") {
                            agentsById[msg.senderId] ?: state.inboxState?.agents?.firstOrNull {
                                it.name.equals(msg.senderName, ignoreCase = true)
                            }
                        } else null
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .animateItem(),
                            horizontalArrangement = if (isMine) Arrangement.End else Arrangement.Start,
                            verticalAlignment = Alignment.Top,
                        ) {
                            if (!isMine && senderAgent != null) {
                                StitchCharacterAvatar(
                                    label = senderAgent.name,
                                    accentHex = senderAgent.avatar?.color,
                                    shapeName = senderAgent.avatar?.shape,
                                    imageUrl = senderAgent.avatar?.imageUrl,
                                    size = 26.dp,
                                )
                                Spacer(Modifier.width(6.dp))
                            }
                            Column(
                                modifier = Modifier.widthIn(max = 310.dp),
                                horizontalAlignment = if (isMine) Alignment.End else Alignment.Start,
                                verticalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    if (isPrivateMsg) {
                                        Icon(
                                            Icons.Default.Lock,
                                            contentDescription = "Private",
                                            tint = s.primary,
                                            modifier = Modifier.size(12.dp),
                                        )
                                        Text(
                                            text = if (isMine) {
                                                "Private whisper • hidden from guests"
                                            } else {
                                                "${msg.senderName} • Private reply (only you)"
                                            },
                                            style = MaterialTheme.typography.labelSmall,
                                            color = s.primary,
                                            fontWeight = FontWeight.SemiBold,
                                        )
                                    } else {
                                        Text(
                                            text = "${msg.senderName} • ${msg.senderType}",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = s.onSurfaceVariant,
                                        )
                                    }
                                }
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(20.dp))
                                        .background(
                                            when {
                                                isPrivateMsg -> s.surfaceContainerLowest
                                                isMine -> s.primary
                                                else -> s.surfaceContainerLowest
                                            },
                                        )
                                        .border(
                                            width = if (isPrivateMsg) 1.5.dp else 1.dp,
                                            color = when {
                                                isPrivateMsg -> s.primary
                                                isMine -> s.primary
                                                else -> s.outlineVariant
                                            },
                                            shape = RoundedCornerShape(20.dp),
                                        )
                                        .padding(horizontal = 14.dp, vertical = 10.dp),
                                ) {
                                    Text(
                                        text = msg.text,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = if (isMine && !isPrivateMsg) s.onPrimary else s.onSurface,
                                    )
                                }
                            }
                        }
                    }
                }

                if (thinkingNames.isNotEmpty() || (isOwner && state.inboxWatching)) {
                    item(key = "live_status") {
                        Row(
                            modifier = Modifier
                                .animateItem()
                                .clip(CircleShape)
                                .background(s.surfaceContainerLow)
                                .border(1.dp, s.outlineVariant, CircleShape)
                                .padding(horizontal = 12.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(12.dp),
                                strokeWidth = 2.dp,
                                color = s.primary,
                            )
                            Text(
                                text = if (thinkingNames.isNotEmpty()) {
                                    "${thinkingNames.joinToString(", ")} ${if (thinkingNames.size == 1) "is" else "are"} working…"
                                } else {
                                    "Watching & noting silently…"
                                },
                                style = MaterialTheme.typography.labelSmall,
                                color = s.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }

    if (showWorkspaceSheet && room != null && canViewWorkspace) {
        InboxWorkspaceSheet(
            room = room,
            state = state,
            vm = vm,
            initialTab = workspaceInitialTab,
            onDismiss = { showWorkspaceSheet = false },
        )
    }

    if (showRoomSettings && room != null && isOwner) {
        InboxRoomSettingsDialog(
            room = room,
            state = state,
            vm = vm,
            onDismiss = { showRoomSettings = false },
        )
    }

    if (showCreateInvite && isOwner) {
        CreateInboxInviteDialog(
            state = state,
            vm = vm,
            defaultRoomId = roomId,
            onDismiss = { showCreateInvite = false },
        )
    }
}
