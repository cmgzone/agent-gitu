package dev.agentgitu.mobile.ui.screens

import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.ImageLoader
import coil.compose.SubcomposeAsyncImage
import coil.request.ImageRequest
import dev.agentgitu.mobile.data.model.*
import dev.agentgitu.mobile.ui.components.*
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette
import dev.agentgitu.mobile.ui.viewmodel.AppUiState
import dev.agentgitu.mobile.ui.viewmodel.GituAppViewModel
import dev.agentgitu.mobile.ui.viewmodel.MainTab

private enum class HubFilter {
    ALL,
    TEAMS,
    DMS,
    INBOX,
}

internal fun chiefOfStaffPresenceTeammates(teammates: List<Teammate>): List<Teammate> =
    teammates.filter { it.chiefOfStaff }

/**
 * Exact Stitch Cowork Hub (cowork_hub_redesigned/code.html),
 * AI Teammates Roster (ai_teammates_roster/code.html),
 * Cowork Group/DM Chat (cowork_group_chat/code.html),
 * and integrated Shared Inbox rooms.
 */
@Composable
fun CoworkScreen(
    state: AppUiState,
    vm: GituAppViewModel,
) {
    var showRoster by remember { mutableStateOf(false) }
    var editingTeammate by remember { mutableStateOf<Teammate?>(null) }
    var showCreateTeammate by remember { mutableStateOf(false) }
    var showNewChatDialog by remember { mutableStateOf(false) }
    var showNewInboxRoomDialog by remember { mutableStateOf(false) }
    var showInboxInviteDialog by remember { mutableStateOf(false) }
    var showInboxMembersSheet by remember { mutableStateOf(false) }
    var showInboxInvitesSheet by remember { mutableStateOf(false) }
    var showSearch by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf(HubFilter.ALL) }

    val profileAgent = state.selectedProfileAgentId?.let { id -> state.teammates.firstOrNull { it.id == id } }
    if (profileAgent != null) {
        AgentProfileScreen(
            teammate = profileAgent,
            state = state,
            vm = vm,
            onBack = { vm.closeAgentProfile() },
            onEdit = { editingTeammate = profileAgent },
            onStartDm = {
                vm.closeAgentProfile()
                val existing = state.conversations.firstOrNull { it.kind == "dm" && it.memberIds == listOf(profileAgent.id) }
                if (existing != null) vm.openConversation(existing.id)
                else vm.createConversation(listOf(profileAgent.id), profileAgent.name, null)
            },
        )
    } else if (state.selectedInboxRoomId != null) {
        InboxRoomDetailScreen(roomId = state.selectedInboxRoomId, state = state, vm = vm)
    } else if (state.selectedConversationId != null) {
        CoworkChatScreen(state = state, vm = vm)
    } else if (showRoster) {
        TeammatesRosterScreen(
            state = state,
            onBack = { showRoster = false },
            onNewTeammate = { showCreateTeammate = true },
            onEditTeammate = { editingTeammate = it },
            onOpenProfile = { vm.openAgentProfile(it.id) },
            onStartDm = { ag ->
                showRoster = false
                val existing = state.conversations.firstOrNull { it.kind == "dm" && it.memberIds == listOf(ag.id) }
                if (existing != null) vm.openConversation(existing.id)
                else vm.createConversation(listOf(ag.id), ag.name, null)
            },
            onVoiceCall = { ag -> vm.startCoworkVoiceCall(agentId = ag.id) },
        )
    } else {
        CoworkHubContent(
            state = state,
            vm = vm,
            filter = filter,
            onFilterChange = { filter = it },
            showSearch = showSearch,
            searchQuery = searchQuery,
            onToggleSearch = {
                showSearch = !showSearch
                if (!showSearch) searchQuery = ""
            },
            onSearchChange = { searchQuery = it },
            onOpenRoster = { showRoster = true },
            onNewChat = {
                if (filter == HubFilter.INBOX) showNewInboxRoomDialog = true
                else showNewChatDialog = true
            },
            onNewInboxRoom = { showNewInboxRoomDialog = true },
            onInviteInbox = { showInboxInviteDialog = true },
            onOpenInboxMembers = { showInboxMembersSheet = true },
            onOpenInboxInvites = { showInboxInvitesSheet = true },
        )
    }

    if (showNewChatDialog) {
        CreateConversationDialog(
            teammates = state.teammates,
            onDismiss = { showNewChatDialog = false },
            onCreate = { memberIds, title, chiefId ->
                showNewChatDialog = false
                vm.createConversation(memberIds, title, chiefId)
            },
        )
    }

    if (showNewInboxRoomDialog) {
        CreateInboxRoomDialog(
            state = state,
            vm = vm,
            onDismiss = { showNewInboxRoomDialog = false },
        )
    }

    if (showInboxInviteDialog) {
        CreateInboxInviteDialog(
            state = state,
            vm = vm,
            onDismiss = { showInboxInviteDialog = false },
        )
    }

    if (showInboxMembersSheet) {
        InboxMembersSheet(
            state = state,
            vm = vm,
            onInviteClick = {
                showInboxMembersSheet = false
                showInboxInviteDialog = true
            },
            onDismiss = { showInboxMembersSheet = false },
        )
    }

    if (showInboxInvitesSheet) {
        InboxInvitesSheet(
            state = state,
            vm = vm,
            onCreateClick = {
                showInboxInvitesSheet = false
                showInboxInviteDialog = true
            },
            onDismiss = { showInboxInvitesSheet = false },
        )
    }

    if (showCreateTeammate || editingTeammate != null) {
        SaveTeammateDialog(
            initial = editingTeammate,
            onDismiss = {
                showCreateTeammate = false
                editingTeammate = null
            },
            onSave = { id, name, tagline, prompt, color, shape, allowShell, allowWrites, chief, pendingAvatarDataUrl, removeAvatar ->
                showCreateTeammate = false
                editingTeammate = null
                vm.saveTeammate(
                    id = id,
                    name = name,
                    tagline = tagline,
                    systemPrompt = prompt,
                    color = color,
                    shape = shape,
                    allowShell = allowShell,
                    allowWrites = allowWrites,
                    chiefOfStaff = chief,
                    pendingAvatarDataUrl = pendingAvatarDataUrl,
                    removeAvatar = removeAvatar,
                )
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CoworkHubContent(
    state: AppUiState,
    vm: GituAppViewModel,
    filter: HubFilter,
    onFilterChange: (HubFilter) -> Unit,
    showSearch: Boolean,
    searchQuery: String,
    onToggleSearch: () -> Unit,
    onSearchChange: (String) -> Unit,
    onOpenRoster: () -> Unit,
    onNewChat: () -> Unit,
    onNewInboxRoom: () -> Unit,
    onInviteInbox: () -> Unit,
    onOpenInboxMembers: () -> Unit,
    onOpenInboxInvites: () -> Unit,
) {
    val s = LocalStitchPalette.current
    val hostLabel = remember(state.serverUrl, state.connectedAgentName) {
        if (state.connectedAgentName.isNotBlank()) {
            "Cloud • ${state.connectedAgentName}"
        } else {
            val host = state.serverUrl.removePrefix("https://").removePrefix("http://")
            "Server • $host"
        }
    }
    val pendingRunWithApproval = state.runs.firstOrNull { it.pendingApprovals.isNotEmpty() }
    val pendingApproval = pendingRunWithApproval?.pendingApprovals?.firstOrNull()

    val q = searchQuery.trim().lowercase()
    val filteredConvs = state.conversations.filter { conv ->
        val matchesTab = when (filter) {
            HubFilter.ALL -> true
            HubFilter.TEAMS -> conv.kind == "group"
            HubFilter.DMS -> conv.kind != "group"
            HubFilter.INBOX -> false
        }
        val matchesQuery = q.isEmpty() || conv.title.lowercase().contains(q)
        matchesTab && matchesQuery
    }
    val filteredInboxRooms = if (filter == HubFilter.ALL || filter == HubFilter.INBOX) {
        state.inboxState?.rooms.orEmpty().filter { q.isEmpty() || it.title.lowercase().contains(q) }
    } else {
        emptyList()
    }
    val presenceChiefs = remember(state.teammates) {
        chiefOfStaffPresenceTeammates(state.teammates)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(s.surface)
            .statusBarsPadding(),
    ) {
        // Clean Messenger-Native Top Header (cowork_hub_redesigned/code.html)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clickable { vm.selectTab(MainTab.SETTINGS) },
            ) {
                Text("Cowork", style = MaterialTheme.typography.headlineMedium, color = s.onSurface)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(if (state.offlineMode) s.error else s.success),
                    )
                    Text(
                        text = hostLabel,
                        style = MaterialTheme.typography.labelSmall,
                        color = s.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Icon(Icons.Default.ExpandMore, contentDescription = null, tint = s.onSurfaceVariant, modifier = Modifier.size(14.dp))
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StitchCircleIconButton(
                    icon = Icons.Default.Extension,
                    contentDescription = "Connections",
                    onClick = { vm.openConnections() },
                )
                StitchCircleIconButton(
                    icon = if (showSearch) Icons.Default.Close else Icons.Default.Search,
                    contentDescription = "Search",
                    onClick = onToggleSearch,
                )
                StitchCircleIconButton(
                    icon = Icons.Default.EditNote,
                    contentDescription = "New thread",
                    primary = true,
                    onClick = onNewChat,
                )
            }
        }

        if (showSearch) {
            Box(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                StitchInputField(
                    value = searchQuery,
                    onValueChange = onSearchChange,
                    label = "Filter threads",
                    placeholder = "Search chats or inbox rooms…",
                )
            }
        }

        if (state.offlineMode) {
            StitchBanner(
                text = "Offline — showing cached Cowork state. Reconnecting…",
                isError = true,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
            )
        }

        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = { vm.pullRefreshCoworkHub() },
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                // Chief of Staff Presence Strip (No heavy boxes — exact Stitch spec)
                item(key = "presence_strip") {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        presenceChiefs.forEach { ag ->
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(5.dp),
                                modifier = Modifier
                                    .width(64.dp)
                                    .clip(RoundedCornerShape(14.dp))
                                    .stitchPressBounce(pressedScale = 0.93f) {
                                        val dm = state.conversations.firstOrNull {
                                            it.kind == "dm" && it.memberIds == listOf(ag.id)
                                        }
                                        if (dm != null) vm.openConversation(dm.id)
                                        else vm.createConversation(listOf(ag.id), ag.name, null)
                                    },
                            ) {
                                StitchCharacterAvatar(
                                    label = ag.name,
                                    accentHex = ag.avatar.color,
                                    shapeName = ag.avatar.shape,
                                    imageUrl = ag.avatar.imageUrl,
                                    size = 58.dp,
                                    floating = true,
                                    statusDotColor = s.success,
                                )
                                Text(
                                    text = ag.name,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = s.onSurface,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }

                        // Dashed "+ Hire" Roster Button
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(5.dp),
                            modifier = Modifier
                                .width(64.dp)
                                .clip(RoundedCornerShape(14.dp))
                                .stitchPressBounce(pressedScale = 0.93f, onClick = onOpenRoster),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(56.dp)
                                    .clip(CircleShape)
                                    .background(s.surfaceContainerLow)
                                    .border(1.dp, s.outline, CircleShape),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(Icons.Default.PersonAdd, contentDescription = "Hire teammate", tint = s.onSurfaceVariant, modifier = Modifier.size(22.dp))
                            }
                            Text("Hire", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                        }
                    }
                }

                // Compact Inline Escalation Strip (appears when any coding gate needs approval)
                if (pendingApproval != null && pendingRunWithApproval != null) {
                    item(key = "escalation_strip") {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .animateItem()
                                .clip(RoundedCornerShape(20.dp))
                                .background(s.tertiaryContainer)
                                .padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            val escalationPres = remember(pendingApproval) {
                                cardActionPresentation(pendingApproval.tool, pendingApproval.why, pendingApproval.summary)
                            }
                            Icon(Icons.Default.VerifiedUser, contentDescription = null, tint = s.onTertiaryContainer, modifier = Modifier.size(20.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = escalationPres.title,
                                    style = MaterialTheme.typography.labelLarge,
                                    color = s.onTertiaryContainer,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    text = escalationPres.detail.ifBlank { pendingRunWithApproval.goal },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = s.onTertiaryContainer.copy(alpha = 0.85f),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            Box(
                                modifier = Modifier
                                    .clip(CircleShape)
                                    .background(s.tertiary)
                                    .stitchPressBounce(pressedScale = 0.92f) { vm.resolveApproval(pendingApproval.id, true) }
                                    .padding(horizontal = 12.dp, vertical = 6.dp),
                            ) {
                                Text("Approve", style = MaterialTheme.typography.labelMedium, color = s.onTertiary)
                            }
                        }
                    }
                }

                // Conversations Filter Tabs (All | Teams | DMs | Inbox)
                item(key = "filter_tabs") {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            listOf(
                                HubFilter.ALL to "All",
                                HubFilter.TEAMS to "Teams",
                                HubFilter.DMS to "DMs",
                                HubFilter.INBOX to "Inbox",
                            ).forEach { (tab, label) ->
                                val active = filter == tab
                                Box(
                                    modifier = Modifier
                                        .clip(CircleShape)
                                        .background(if (active) s.primary else Color.Transparent)
                                        .stitchPressBounce(pressedScale = 0.93f) { onFilterChange(tab) }
                                        .padding(horizontal = 14.dp, vertical = 6.dp),
                                ) {
                                    Text(
                                        text = label,
                                        style = MaterialTheme.typography.labelMedium,
                                        color = if (active) s.onPrimary else s.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                        HorizontalDivider(color = s.outlineVariant)
                    }
                }

                // Owner Inbox Hub Controls (New Room · Invite Human · Members · Invites)
                if (filter == HubFilter.INBOX && state.inboxState?.role != "member") {
                    item(key = "inbox_actions") {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            InboxChipPill(
                                label = "New Room",
                                selected = true,
                                icon = Icons.Default.Add,
                                onClick = onNewInboxRoom,
                            )
                            InboxChipPill(
                                label = "Invite Human",
                                selected = false,
                                icon = Icons.Default.PersonAdd,
                                onClick = onInviteInbox,
                            )
                            InboxChipPill(
                                label = "Members (${state.inboxState?.members?.size ?: 0})",
                                selected = false,
                                icon = Icons.Default.Shield,
                                onClick = onOpenInboxMembers,
                            )
                            InboxChipPill(
                                label = "Invites (${state.inboxState?.invites?.size ?: 0})",
                                selected = false,
                                icon = Icons.Default.Link,
                                onClick = onOpenInboxInvites,
                            )
                        }
                    }
                }

                // Separated Thread Cards
                if (filteredConvs.isEmpty() && filteredInboxRooms.isEmpty()) {
                    item(key = "empty_hub") {
                        StitchCard(modifier = Modifier.fillMaxWidth().animateItem()) {
                            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(
                                    text = if (filter == HubFilter.INBOX) "No Inbox rooms yet" else "No conversations here yet",
                                    style = MaterialTheme.typography.titleMedium,
                                    color = s.onSurface,
                                )
                                Text(
                                    text = if (filter == HubFilter.INBOX) {
                                        "Create a shared Inbox room to collaborate with clients and AI teammates, take private notes, and delegate coding tasks."
                                    } else {
                                        "Tap the compose button above or a Chief of Staff avatar to start a Cowork thread."
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = s.onSurfaceVariant,
                                )
                                if (filter == HubFilter.INBOX && state.inboxState?.role != "member") {
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        StitchPrimaryButton(text = "New Room", icon = Icons.Default.Add, onClick = onNewInboxRoom)
                                        StitchSecondaryButton(text = "Invite", icon = Icons.Default.PersonAdd, onClick = onInviteInbox)
                                    }
                                }
                            }
                        }
                    }
                } else {
                    items(filteredConvs, key = { "conv_${it.id}" }) { conv ->
                        val convAgents = conv.memberIds.mapNotNull { id -> state.teammates.firstOrNull { it.id == id } }
                        val firstAgent = convAgents.firstOrNull()
                        val memberNames = convAgents.map { it.name }
                        StitchCard(
                            modifier = Modifier
                                .fillMaxWidth()
                                .animateItem(),
                            onClick = { vm.openConversation(conv.id) },
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                if (convAgents.size > 1) {
                                    Box(modifier = Modifier.width(54.dp).height(46.dp)) {
                                        StitchCharacterAvatar(
                                            label = convAgents[0].name,
                                            accentHex = convAgents[0].avatar.color,
                                            shapeName = convAgents[0].avatar.shape,
                                            imageUrl = convAgents[0].avatar.imageUrl,
                                            size = 38.dp,
                                        )
                                        Box(modifier = Modifier.align(Alignment.BottomEnd)) {
                                            StitchCharacterAvatar(
                                                label = convAgents[1].name,
                                                accentHex = convAgents[1].avatar.color,
                                                shapeName = convAgents[1].avatar.shape,
                                                imageUrl = convAgents[1].avatar.imageUrl,
                                                size = 32.dp,
                                            )
                                        }
                                    }
                                } else {
                                    StitchCharacterAvatar(
                                        label = firstAgent?.name ?: conv.title,
                                        accentHex = firstAgent?.avatar?.color,
                                        shapeName = firstAgent?.avatar?.shape,
                                        imageUrl = firstAgent?.avatar?.imageUrl,
                                        size = 48.dp,
                                        statusDotColor = s.success,
                                    )
                                }
                                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                    ) {
                                        Text(
                                            text = conv.title.ifBlank { memberNames.joinToString(", ").ifBlank { "Conversation" } },
                                            style = MaterialTheme.typography.titleMedium,
                                            color = s.onSurface,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                            modifier = Modifier.weight(1f),
                                        )
                                        Text(
                                            text = formatShortTime(conv.updatedAt).ifBlank { conv.kind.uppercase() },
                                            style = MaterialTheme.typography.labelSmall,
                                            color = s.onSurfaceVariant,
                                        )
                                    }
                                    Text(
                                        text = if (conv.kind == "group") {
                                            "Team • ${memberNames.joinToString(", ").ifBlank { "${conv.memberIds.size} members" }}"
                                        } else {
                                            firstAgent?.tagline?.ifBlank { "Direct message with ${firstAgent.name}" } ?: "Direct message"
                                        },
                                        style = MaterialTheme.typography.bodySmall,
                                        color = s.onSurfaceVariant,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                        }
                    }

                    items(filteredInboxRooms, key = { "inbox_${it.id}" }) { room ->
                        StitchCard(
                            modifier = Modifier
                                .fillMaxWidth()
                                .animateItem(),
                            onClick = { vm.openInboxRoom(room.id) },
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.Top,
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(44.dp)
                                        .clip(CircleShape)
                                        .background(s.surfaceContainer),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Icon(
                                        imageVector = if (room.agentTriggerMode == "watch") Icons.Default.Visibility else Icons.Default.Group,
                                        contentDescription = null,
                                        tint = s.onSurfaceVariant,
                                        modifier = Modifier.size(22.dp),
                                    )
                                }
                                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                    ) {
                                        Text(
                                            text = room.title.ifBlank { "Shared Room" },
                                            style = MaterialTheme.typography.titleMedium,
                                            color = s.onSurface,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                            modifier = Modifier.weight(1f),
                                        )
                                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                            if (room.pendingApprovalCount > 0) {
                                                StitchBadge(
                                                    text = "${room.pendingApprovalCount} approval",
                                                    tone = BadgeTone.WARNING,
                                                )
                                            } else if (room.agentTriggerMode == "watch") {
                                                StitchBadge(text = "Watch", tone = BadgeTone.PRIMARY)
                                            }
                                        }
                                    }
                                    Text(
                                        text = buildString {
                                            append("Shared Inbox • ${room.memberIds.size} guests • ${room.activeAgentIds.size} agents")
                                            val items = room.noteCount + room.openTaskCount
                                            if (items > 0) append(" • $items notes/tasks")
                                        },
                                        style = MaterialTheme.typography.bodySmall,
                                        color = s.onSurfaceVariant,
                                        maxLines = 2,
                                    )
                                }
                            }
                        }
                    }
                }

                // Quick LiveKit Voice Bar (exact Stitch rounded-full bar)
                item(key = "voice_bar") {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(CircleShape)
                            .background(s.surfaceContainerLow)
                            .border(1.dp, s.outlineVariant, CircleShape)
                            .stitchPressBounce(pressedScale = 0.97f) { vm.startCoworkVoiceCall() }
                            .padding(horizontal = 14.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            modifier = Modifier.weight(1f),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(36.dp)
                                    .clip(CircleShape)
                                    .background(s.primary),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(Icons.Default.Call, contentDescription = null, tint = s.onPrimary, modifier = Modifier.size(18.dp))
                            }
                            Column {
                                Text("Voice check-in with Chief", style = MaterialTheme.typography.labelLarge, color = s.onSurface)
                                Text("Ask, steer, or queue without stopping runs", style = MaterialTheme.typography.bodySmall, color = s.onSurfaceVariant)
                            }
                        }
                        Icon(Icons.Default.ChevronRight, contentDescription = null, tint = s.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

/** Stitch AI Teammates Roster 2-Column Grid (ai_teammates_roster/code.html). */
@Composable
private fun TeammatesRosterScreen(
    state: AppUiState,
    onBack: () -> Unit,
    onNewTeammate: () -> Unit,
    onEditTeammate: (Teammate) -> Unit,
    onOpenProfile: (Teammate) -> Unit,
    onStartDm: (Teammate) -> Unit,
    onVoiceCall: (Teammate) -> Unit,
) {
    val s = LocalStitchPalette.current
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(s.surface)
            .statusBarsPadding(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StitchCircleIconButton(icon = Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", onClick = onBack)
                Column {
                    Text("AI Teammates", style = MaterialTheme.typography.headlineSmall, color = s.onSurface)
                    Text("${state.teammates.size} active profiles", style = MaterialTheme.typography.labelSmall, color = s.onSurfaceVariant)
                }
            }
            StitchPrimaryButton(text = "New", icon = Icons.Default.PersonAdd, onClick = onNewTeammate)
        }
        HorizontalDivider(color = s.outlineVariant)

        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(state.teammates.chunked(2)) { pair ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    pair.forEach { ag ->
                        StitchCard(
                            modifier = Modifier.weight(1f),
                            onClick = { onOpenProfile(ag) },
                        ) {
                            Column(
                                modifier = Modifier.padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.Top,
                                ) {
                                    val charSpec = resolveOfficialCharacter(ag.avatar.shape, ag.avatar.color, ag.name)
                                    StitchCharacterAvatar(
                                        label = ag.name,
                                        accentHex = ag.avatar.color,
                                        shapeName = ag.avatar.shape,
                                        imageUrl = ag.avatar.imageUrl,
                                        size = 54.dp,
                                        floating = true,
                                        statusDotColor = s.success,
                                    )
                                    StitchBadge(
                                        text = if (ag.chiefOfStaff) "Chief" else charSpec.displayName,
                                        tone = BadgeTone.NEUTRAL,
                                    )
                                }
                                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Text(ag.name, style = MaterialTheme.typography.titleMedium, color = s.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(
                                        ag.tagline.ifBlank { "AI Teammate" },
                                        style = MaterialTheme.typography.bodySmall,
                                        color = s.onSurfaceVariant,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Box(
                                        modifier = Modifier
                                            .weight(1f)
                                            .clip(RoundedCornerShape(10.dp))
                                            .background(s.surfaceContainerLow)
                                            .padding(vertical = 4.dp, horizontal = 4.dp),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Text(
                                            text = ag.model?.substringAfterLast('/')?.take(8) ?: "Default",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = s.onSurfaceVariant,
                                            maxLines = 1,
                                        )
                                    }
                                    Box(
                                        modifier = Modifier
                                            .weight(1f)
                                            .clip(RoundedCornerShape(10.dp))
                                            .background(s.surfaceContainerLow)
                                            .padding(vertical = 4.dp, horizontal = 4.dp),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Text(
                                            text = if (ag.useHostComputer) "Local" else "Cloud",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = s.onSurfaceVariant,
                                            maxLines = 1,
                                        )
                                    }
                                }
                                HorizontalDivider(color = s.outlineVariant)
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    StitchCircleIconButton(
                                        icon = if (ag.chiefOfStaff) Icons.Default.Call else Icons.Default.ChatBubble,
                                        contentDescription = if (ag.chiefOfStaff) "Voice call" else "Message",
                                        onClick = { if (ag.chiefOfStaff) onVoiceCall(ag) else onStartDm(ag) },
                                        size = 36.dp,
                                    )
                                    Box(
                                        modifier = Modifier
                                            .clip(CircleShape)
                                            .background(s.surfaceContainerLow)
                                            .clickable { onEditTeammate(ag) }
                                            .padding(horizontal = 12.dp, vertical = 6.dp),
                                    ) {
                                        Text("Edit", style = MaterialTheme.typography.labelMedium, color = s.onSurface)
                                    }
                                }
                            }
                        }
                    }
                    if (pair.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
    }
}

/**
 * Full-bleed Cowork Chat with FLOATING character avatar, FLOATING circular action buttons,
 * FLOATING pill composer, auto-scroll to latest message, and inline-only document previews.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CoworkChatScreen(
    state: AppUiState,
    vm: GituAppViewModel,
) {
    val s = LocalStitchPalette.current
    val clipboard = LocalClipboardManager.current
    val convId = state.selectedConversationId ?: return
    val conv = state.conversations.firstOrNull { it.id == convId }
    val view = state.activeTeamView
    val context = LocalContext.current
    var composer by remember { mutableStateOf("") }
    var showNewThreadDialog by remember { mutableStateOf(false) }
    var showTagFolderDialog by remember { mutableStateOf(false) }
    var inlineMailAgentId by remember { mutableStateOf<String?>(null) }
    var inlineApiKeyConnect by remember { mutableStateOf<Triple<String, ConnectedServiceItem, String>?>(null) }
    var editingMessage by remember { mutableStateOf<TeamMessage?>(null) }
    var deletingMessage by remember { mutableStateOf<TeamMessage?>(null) }
    var fullViewMessage by remember { mutableStateOf<TeamMessage?>(null) }

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenMultipleDocuments(),
    ) { uris: List<Uri> ->
        uris.forEach { uri ->
            runCatching {
                val cr = context.contentResolver
                val mime = cr.getType(uri) ?: "application/octet-stream"
                var fileName = "attachment"
                cr.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        if (idx >= 0) fileName = cursor.getString(idx) ?: fileName
                    }
                }
                val bytes = cr.openInputStream(uri)?.use { it.readBytes() } ?: return@runCatching
                if (bytes.size <= 6 * 1024 * 1024) {
                    val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                    vm.addPendingAttachment(
                        PendingAttachment(
                            name = fileName,
                            mime = mime,
                            dataUrl = "data:$mime;base64,$b64",
                            sizeBytes = bytes.size.toLong(),
                        ),
                    )
                }
            }
        }
    }

    val members = conv?.memberIds.orEmpty().mapNotNull { id -> state.teammates.firstOrNull { it.id == id } }
    val primaryAgent = members.firstOrNull()
    val isGroupChat = conv?.kind == "group" || members.size > 1
    val showSideAgentAvatar = isGroupChat

    val activeBubbleColor = remember(primaryAgent, s.primary) {
        if (primaryAgent != null) {
            parseHexColor(
                resolveCharacterColorHex(primaryAgent.avatar.shape, primaryAgent.avatar.color, primaryAgent.name),
                fallback = s.primary,
            )
        } else {
            s.primary
        }
    }
    val activeBubbleInk = remember(activeBubbleColor) { contrastInkFor(activeBubbleColor) }
    val artifactById = remember(view?.artifacts) {
        view?.artifacts.orEmpty().associateBy { it.id }
    }
    val visibleMessages = remember(view?.messages) {
        view?.messages.orEmpty()
    }
    val messageById = remember(visibleMessages) {
        visibleMessages.associateBy { it.id }
    }
    // Only show open/pending request cards — once accepted, approved, answered, declined, or swiped they smoothly disappear!
    val visibleRequests = remember(view?.requests, state.settledRequestIds) {
        view?.requests.orEmpty().filter { req ->
            val isOpen = req.status == "open" || req.status == "pending"
            req.hiddenAt.isNullOrBlank() && isOpen && req.id !in state.settledRequestIds
        }
    }

    // Active In-Chat Computer & Handoff detection (matching Web ui-cowork-computer.ts)
    val openHandoffRequest = remember(visibleRequests) {
        visibleRequests.firstOrNull { it.desktopHandoff }
    }
    val computerAgent = remember(state.inlineComputerAgentId, openHandoffRequest, members, state.teammates, primaryAgent) {
        state.inlineComputerAgentId?.let { id ->
            members.firstOrNull { it.id == id } ?: state.teammates.firstOrNull { it.id == id }
        } ?: openHandoffRequest?.agentId?.let { id ->
            members.firstOrNull { it.id == id } ?: state.teammates.firstOrNull { it.id == id }
        } ?: primaryAgent
    }
    val computerStatus = computerAgent?.id?.let { state.agentComputers[it] }
    val hasComputerHandoff = openHandoffRequest != null ||
        computerStatus?.isUserControl == true ||
        !computerStatus?.handoff?.reason.isNullOrBlank()
    val agentUsingDesktop = view?.busy == true && view.progresses.any {
        it.tool == "desktop_input" || it.tool == "desktop_screenshot"
    }
    val autoComputerDismissKey = "${convId}:${openHandoffRequest?.id ?: computerStatus?.control ?: "auto"}"
    val showInlineComputer = computerAgent != null && (
        state.inlineComputerAgentId == computerAgent.id ||
            ((hasComputerHandoff || agentUsingDesktop) && state.inlineComputerDismissedKey != autoComputerDismissKey)
        )

    // Interleave messages & open inline request cards chronologically
    val timelineEntries = remember(visibleMessages, visibleRequests) {
        val list = mutableListOf<Pair<String, Any>>()
        visibleMessages.forEach { m -> list.add((m.ts.ifBlank { "0" }) to m) }
        visibleRequests.forEach { r -> list.add((r.createdAt.ifBlank { "9999-12-31T23:59:59Z" }) to r) }
        list.sortBy { it.first }
        list
    }

    val uriHandler = LocalUriHandler.current
    LaunchedEffect(state.pendingOAuthUrl) {
        val url = state.pendingOAuthUrl
        if (!url.isNullOrBlank() && (url.startsWith("http://") || url.startsWith("https://"))) {
            runCatching { uriHandler.openUri(url) }
            vm.clearPendingOAuthUrl()
        }
    }

    // Deduplicate threads so "#main" never appears twice
    val uniqueThreads = remember(view?.threads) {
        val out = mutableListOf(TeamThread(id = "main", title = "main"))
        val seenIds = mutableSetOf("main")
        val seenTitles = mutableSetOf("main")
        for (t in view?.threads.orEmpty()) {
            val cleanId = t.id.trim()
            val cleanTitle = t.title.trim().ifBlank { cleanId }
            if (cleanId.isNotBlank() && seenIds.add(cleanId) && seenTitles.add(cleanTitle.lowercase())) {
                out.add(t.copy(title = cleanTitle))
            }
        }
        out
    }

    val listState = rememberLazyListState()
    LaunchedEffect(convId, state.selectedThreadId, timelineEntries.size, showInlineComputer) {
        val lastIdx = listState.layoutInfo.totalItemsCount - 1
        if (lastIdx >= 0 && (timelineEntries.isNotEmpty() || showInlineComputer)) {
            listState.animateScrollToItem(lastIdx)
        }
    }

    val pullState = rememberPullToRefreshState()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(s.surface),
    ) {
        // 1. FULL-BLEED SCROLLABLE CHAT STREAM WITH PULL-TO-REFRESH
        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = { vm.pullRefreshActiveConversation() },
            state = pullState,
            indicator = {
                PullToRefreshDefaults.Indicator(
                    state = pullState,
                    isRefreshing = state.isRefreshing,
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .padding(top = if (uniqueThreads.size > 1) 120.dp else 92.dp),
                )
            },
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(
                    top = if (uniqueThreads.size > 1) 128.dp else 98.dp,
                    bottom = if (state.referencedMessageIds.isNotEmpty()) 142.dp else 112.dp,
                    start = 12.dp,
                    end = 12.dp,
                ),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(
                    items = timelineEntries,
                    key = { (_, entry) ->
                        when (entry) {
                            is TeamMessage -> "m_${entry.id}_${entry.revision}"
                            is TeamRequest -> "req_${entry.id}_${entry.status}"
                            else -> entry.hashCode().toString()
                        }
                    },
                ) { (_, entry) ->
                    when (entry) {
                        is TeamMessage -> {
                            val attachedArtifacts = entry.artifactIds.orEmpty().mapNotNull { artifactById[it] }
                            StitchChatMessageRow(
                                msg = entry,
                                teammates = state.teammates,
                                showAgentAvatar = showSideAgentAvatar,
                                isReferenced = entry.id in state.referencedMessageIds,
                                userBubbleColor = activeBubbleColor,
                                userBubbleInk = activeBubbleInk,
                                attachedArtifacts = attachedArtifacts,
                                artifactUrlFor = { artId -> vm.artifactInlineUrl(artId) },
                                onPreviewArtifact = { art -> vm.openArtifactPreview(art.id, art.name) },
                                onSendAction = { prompt -> vm.sendTeamMessage(prompt) },
                                onOpenRun = { runId ->
                                    vm.closeConversation()
                                    vm.selectTab(MainTab.CODING)
                                    vm.openRun(runId)
                                },
                                onCopyMessage = { text -> clipboard.setText(AnnotatedString(text)) },
                                onEditMessage = { m -> editingMessage = m },
                                onRetryMessage = { m -> vm.retryTeamMessage(m.id, m.attempt) },
                                onReferenceMessage = { m -> vm.toggleReferencedMessage(m.id) },
                                onOpenFullView = { m -> fullViewMessage = m },
                                onDeleteMessage = { m -> deletingMessage = m },
                                modifier = Modifier.animateItem(),
                            )
                        }
                        is TeamRequest -> {
                            val svcSpec = entry.appConnection?.let { app ->
                                state.connectedApps.services.firstOrNull { it.slug.equals(app.service, ignoreCase = true) }
                            }
                            val alreadyActive = entry.appConnection?.let { app ->
                                (state.connectedApps.accounts + state.connectedApps.mail.accounts).any {
                                    it.toolkit.equals(app.service, ignoreCase = true) && !it.disabled && it.status.equals("ACTIVE", ignoreCase = true)
                                }
                            } == true
                            val matchingAvailable = entry.appConnection?.let { app ->
                                (state.connectedApps.availableAccounts + state.connectedApps.mail.available).firstOrNull {
                                    it.toolkit.equals(app.service, ignoreCase = true) && !it.disabled && it.status.equals("ACTIVE", ignoreCase = true)
                                }
                            }
                            val appApproval = remember(entry) { parseAppApprovalAction(entry) }
                            val quickQuestionAnswer = entry.recommended?.takeIf { it.isNotBlank() }
                                ?: entry.options.firstOrNull()?.takeIf { it.isNotBlank() }

                            val (enableAcceptSwipe, swipeAcceptLabel) = when {
                                entry.appConnection != null -> true to (if (matchingAvailable != null) "Assign" else "Connect")
                                entry.kind == "permission" -> true to "Allow"
                                entry.kind == "recommendation" -> true to "Accept"
                                appApproval != null -> true to "Approve"
                                entry.desktopHandoff -> true to "Open computer"
                                entry.kind == "question" && !quickQuestionAnswer.isNullOrBlank() -> true to quickQuestionAnswer.take(18)
                                else -> false to "Accept"
                            }

                            SwipeableRequestCard(
                                acceptLabel = swipeAcceptLabel,
                                deleteLabel = "Delete",
                                enableAcceptSwipe = enableAcceptSwipe,
                                enableDeleteSwipe = true,
                                onAccept = {
                                    when {
                                        entry.appConnection != null -> {
                                            val app = entry.appConnection
                                            if (matchingAvailable != null) {
                                                vm.assignAppAccount(entry.agentId, matchingAvailable.id)
                                                vm.resolveTeamRequest(entry.id, "accept", "Connected")
                                                true
                                            } else if (app.service.equals("mail", ignoreCase = true)) {
                                                inlineMailAgentId = entry.agentId
                                                false
                                            } else if (svcSpec != null && !svcSpec.supportsDirectOAuth && svcSpec.apiKeyAuthConfig != null) {
                                                inlineApiKeyConnect = Triple(entry.agentId, svcSpec, entry.id)
                                                false
                                            } else {
                                                vm.connectAppService(entry.agentId, app.service, entry.id)
                                                false
                                            }
                                        }
                                        entry.kind == "permission" -> {
                                            vm.resolveTeamRequest(entry.id, "approve")
                                            true
                                        }
                                        entry.kind == "recommendation" -> {
                                            vm.resolveTeamRequest(entry.id, "accept")
                                            true
                                        }
                                        appApproval != null -> {
                                            vm.resolveTeamRequest(entry.id, "accept")
                                            true
                                        }
                                        entry.desktopHandoff -> {
                                            vm.openInlineComputer(entry.agentId)
                                            false
                                        }
                                        entry.kind == "question" && !quickQuestionAnswer.isNullOrBlank() -> {
                                            vm.resolveTeamRequest(entry.id, "answer", quickQuestionAnswer)
                                            true
                                        }
                                        else -> false
                                    }
                                },
                                onDelete = {
                                    vm.deleteTeamRequest(entry.id)
                                    true
                                },
                                modifier = Modifier.animateItem(),
                            ) {
                                StitchTeamRequestCard(
                                    request = entry,
                                    teammate = state.teammates.firstOrNull { it.id == entry.agentId },
                                    showAvatar = showSideAgentAvatar,
                                    servicesCatalog = state.connectedApps.services,
                                    authLink = state.appAuthLinksByRequest[entry.id],
                                    liveConnected = alreadyActive,
                                    availableAccount = matchingAvailable,
                                    onAssignExisting = { agentId, accountId ->
                                        vm.assignAppAccount(agentId, accountId)
                                        vm.resolveTeamRequest(entry.id, "accept", "Connected")
                                    },
                                    onConnectApp = { agentId, service, reqId ->
                                        when {
                                            service.equals("mail", ignoreCase = true) -> inlineMailAgentId = agentId
                                            svcSpec != null && !svcSpec.supportsDirectOAuth && svcSpec.apiKeyAuthConfig != null -> {
                                                inlineApiKeyConnect = Triple(agentId, svcSpec, reqId)
                                            }
                                            else -> vm.connectAppService(agentId, service, reqId)
                                        }
                                    },
                                    onOpenAuthUrl = { url -> runCatching { uriHandler.openUri(url) } },
                                    onManageApps = { agentId -> vm.openConnections(agentId) },
                                    onOpenComputer = { agentId, _ -> vm.openInlineComputer(agentId) },
                                    onSubmitCredential = { reqId, label, provider, baseUrl, token, valPath, setupJson, values ->
                                        vm.submitInlineCredential(
                                            requestId = reqId,
                                            label = label,
                                            provider = provider,
                                            baseUrl = baseUrl,
                                            token = token,
                                            validationPath = valPath,
                                            setupJson = setupJson,
                                            values = values,
                                        )
                                    },
                                    onProbeSshHostKey = { reqId, baseUrl, onRes ->
                                        vm.probeSshHostKey(reqId, baseUrl, onRes)
                                    },
                                    onSubmitSshCredential = { reqId, label, baseUrl, password, fp ->
                                        vm.submitSshCredential(reqId, label, baseUrl, password, fp)
                                    },
                                    onSubmitBrowserAuth = { reqId, setupJson, values, terms ->
                                        vm.submitBrowserAuth(reqId, setupJson, values, terms)
                                    },
                                    onAction = { action, resp, reviewedArgs, rememberChief, chiefPat, chiefScope ->
                                        vm.resolveTeamRequest(
                                            requestId = entry.id,
                                            action = action,
                                            response = resp,
                                            reviewedArgs = reviewedArgs,
                                            rememberForChief = rememberChief,
                                            chiefPattern = chiefPat,
                                            chiefScope = chiefScope,
                                        )
                                    },
                                )
                            }
                        }
                    }
                }

                // Live Interactive In-Chat Computer & Handoff Panel (directly inside chat, matching Web!)
                if (showInlineComputer && computerAgent != null) {
                    item(key = "inline_computer_${computerAgent.id}") {
                        InChatComputerPanel(
                            teammate = computerAgent,
                            computer = computerStatus,
                            busy = computerAgent.id in state.computerActionBusy,
                            handoffActive = hasComputerHandoff,
                            handoffReason = openHandoffRequest?.detail.orEmpty().ifBlank {
                                computerStatus?.handoff?.reason.orEmpty()
                            },
                            computerViewUrl = vm.agentComputerViewUrl(computerAgent.id, preview = false),
                            serverBrowserViewUrl = vm.serverBrowserViewUrl(computerAgent.id),
                            authHeaders = vm.mediaAuthHeaders(),
                            onSyncCookies = { wv -> vm.syncCookiesForWebView(wv) },
                            onAction = { action -> vm.performComputerAction(computerAgent.id, action) },
                            onLaunchApp = { app -> vm.launchComputerApp(computerAgent.id, app) },
                            onServerBrowserControl = { action -> vm.performServerBrowserControl(computerAgent.id, action) },
                            onExpandFullscreen = { vm.openLiveDesktop(computerAgent.id, computerAgent.name) },
                            onClose = { vm.closeInlineComputer(autoComputerDismissKey) },
                            screenHeight = 330.dp,
                            modifier = Modifier.animateItem(),
                        )
                    }
                }

                // Live Working Indicator (rich animated plush character + active app/website scanner badge)
                val activeProgresses = view?.progresses.orEmpty().filter {
                    !it.text.isNullOrBlank() || !it.tool.isNullOrBlank() || !it.appService.isNullOrBlank() || !it.webUrl.isNullOrBlank()
                }
                if (activeProgresses.isNotEmpty()) {
                    activeProgresses.forEachIndexed { pIdx, prog ->
                        item(key = "prog_${prog.agentId ?: pIdx}") {
                            val progAgent = state.teammates.firstOrNull {
                                it.id == prog.agentId || it.name.equals(prog.agentName, ignoreCase = true)
                            }
                            RichWorkingIndicator(
                                agentName = prog.agentName.ifBlank { progAgent?.name ?: "AI" },
                                accentHex = progAgent?.avatar?.color,
                                shapeName = progAgent?.avatar?.shape,
                                imageUrl = progAgent?.avatar?.imageUrl,
                                progress = prog,
                            )
                        }
                    }
                } else if (view?.busy == true) {
                    item(key = "prog_busy") {
                        RichWorkingIndicator(
                            agentName = primaryAgent?.name ?: "AI",
                            accentHex = primaryAgent?.avatar?.color,
                            shapeName = primaryAgent?.avatar?.shape,
                            imageUrl = primaryAgent?.avatar?.imageUrl,
                            progress = null,
                            fallbackText = view.working?.ifBlank { "Working…" } ?: "Working…",
                        )
                    }
                }
            }
        }

        // 2. FLOATING TOP OVERLAY: Compact Scrim + Floating Character + Floating Action Buttons
        Column(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(
                        colorStops = arrayOf(
                            0.0f to s.surface.copy(alpha = 0.94f),
                            0.72f to s.surface.copy(alpha = 0.72f),
                            1.0f to Color.Transparent,
                        ),
                    ),
                )
                .statusBarsPadding()
                .padding(horizontal = 12.dp, vertical = 6.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Box(modifier = Modifier.fillMaxWidth()) {
                // Floating Back Button (left)
                Box(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(top = 4.dp)
                        .shadow(6.dp, CircleShape),
                ) {
                    StitchCircleIconButton(
                        icon = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Back",
                        outlined = true,
                        size = 36.dp,
                        onClick = { vm.closeConversation() },
                    )
                }

                // Floating Character Avatar + Compact Frosted Pill Title (tap to open Agent Profile!)
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(3.dp),
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .clickable(enabled = primaryAgent != null) {
                            primaryAgent?.let { vm.openAgentProfile(it.id) }
                        },
                ) {
                    if (members.size > 1) {
                        Row(horizontalArrangement = Arrangement.spacedBy((-10).dp)) {
                            members.take(3).forEach { ag ->
                                StitchCharacterAvatar(
                                    label = ag.name,
                                    accentHex = ag.avatar.color,
                                    shapeName = ag.avatar.shape,
                                    imageUrl = ag.avatar.imageUrl,
                                    size = 38.dp,
                                    floating = true,
                                    working = view?.busy == true,
                                    statusDotColor = s.success,
                                )
                            }
                        }
                    } else {
                        StitchCharacterAvatar(
                            label = primaryAgent?.name ?: conv?.title ?: "AI",
                            accentHex = primaryAgent?.avatar?.color,
                            shapeName = primaryAgent?.avatar?.shape,
                            imageUrl = primaryAgent?.avatar?.imageUrl,
                            size = 44.dp,
                            floating = true,
                            working = view?.busy == true,
                            statusDotColor = s.success,
                        )
                    }

                    // Floating frosted title pill
                    Surface(
                        shape = CircleShape,
                        color = s.surfaceContainerLowest.copy(alpha = 0.90f),
                        border = androidx.compose.foundation.BorderStroke(1.dp, s.outlineVariant),
                        shadowElevation = 3.dp,
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(5.dp),
                        ) {
                            Box(modifier = Modifier.size(6.dp).clip(CircleShape).background(s.success))
                            Text(
                                text = conv?.title?.ifBlank { primaryAgent?.name ?: "Cowork" } ?: "Cowork",
                                style = MaterialTheme.typography.labelMedium,
                                color = s.onSurface,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            if (view?.busy == true) {
                                Text(
                                    text = "• working",
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                                    color = s.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }

                // Floating Action Buttons (right: Stop, In-Chat Computer w/ live dot, Voice Call)
                Row(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(top = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    if (view?.busy == true) {
                        Box(modifier = Modifier.shadow(6.dp, CircleShape)) {
                            StitchCircleIconButton(
                                icon = Icons.Default.Stop,
                                contentDescription = "Stop",
                                danger = true,
                                size = 36.dp,
                                onClick = { vm.stopTeamChat() },
                            )
                        }
                    }
                    computerAgent?.let { ag ->
                        Box {
                            Box(modifier = Modifier.shadow(6.dp, CircleShape)) {
                                StitchCircleIconButton(
                                    icon = Icons.Default.DesktopWindows,
                                    contentDescription = if (showInlineComputer) "Hide computer" else "Open computer in chat",
                                    primary = showInlineComputer,
                                    outlined = !showInlineComputer,
                                    size = 36.dp,
                                    onClick = {
                                        if (showInlineComputer) {
                                            vm.closeInlineComputer(autoComputerDismissKey)
                                        } else {
                                            vm.openInlineComputer(ag.id)
                                        }
                                    },
                                )
                            }
                            if (hasComputerHandoff || computerStatus?.isRunning == true) {
                                Box(
                                    modifier = Modifier
                                        .align(Alignment.TopEnd)
                                        .size(10.dp)
                                        .clip(CircleShape)
                                        .background(if (hasComputerHandoff) activeBubbleColor else s.success)
                                        .border(1.5.dp, s.surface, CircleShape),
                                )
                            }
                        }
                    }
                    Box(modifier = Modifier.shadow(6.dp, CircleShape)) {
                        StitchCircleIconButton(
                            icon = Icons.Default.Call,
                            contentDescription = "Voice call",
                            primary = true,
                            size = 36.dp,
                            onClick = {
                                vm.startCoworkVoiceCall(
                                    conversationId = state.selectedConversationId,
                                    threadId = state.selectedThreadId,
                                    agentId = primaryAgent?.id,
                                )
                            },
                        )
                    }
                }
            }

            // Floating Topic Threads & Tagged Folders Pills
            val taggedFolders = view?.folders.orEmpty()
            if (uniqueThreads.size > 1 || taggedFolders.isNotEmpty()) {
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (uniqueThreads.size > 1) {
                        uniqueThreads.forEach { thread ->
                            StitchThreadPill(
                                label = "#${thread.title}",
                                selected = state.selectedThreadId == thread.id,
                            ) { vm.switchThread(thread.id) }
                        }
                    }
                    taggedFolders.forEach { folder ->
                        val label = folder.label?.ifBlank { folder.path.substringAfterLast('/').substringAfterLast('\\') }
                            ?: folder.path.substringAfterLast('/').substringAfterLast('\\')
                        Surface(
                            shape = CircleShape,
                            color = s.surfaceContainerLowest.copy(alpha = 0.92f),
                            border = androidx.compose.foundation.BorderStroke(1.dp, s.outlineVariant),
                            shadowElevation = 3.dp,
                            modifier = Modifier.clickable { vm.removeConversationFolder(folder.id) },
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Icon(Icons.Default.Folder, contentDescription = null, tint = s.primary, modifier = Modifier.size(12.dp))
                                Text(label, style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp), color = s.onSurface)
                                Icon(Icons.Default.Close, contentDescription = "Remove folder", tint = s.onSurfaceVariant, modifier = Modifier.size(11.dp))
                            }
                        }
                    }
                    Box(
                        modifier = Modifier
                            .size(24.dp)
                            .shadow(3.dp, CircleShape)
                            .clip(CircleShape)
                            .background(s.surfaceContainerLowest)
                            .border(1.dp, s.outlineVariant, CircleShape)
                            .stitchPressBounce(pressedScale = 0.88f) { showNewThreadDialog = true },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Default.Add, contentDescription = "Add thread", tint = s.primary, modifier = Modifier.size(14.dp))
                    }
                }
            }
        }

        // 3. FLOATING BOTTOM COMPOSER OVERLAY
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(
                        colorStops = arrayOf(
                            0.0f to Color.Transparent,
                            0.35f to s.surface.copy(alpha = 0.85f),
                            1.0f to s.surface.copy(alpha = 0.98f),
                        ),
                    ),
                )
                .navigationBarsPadding()
                .imePadding()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            // Referenced message chips (matching Web cwReferences)
            if (state.referencedMessageIds.isNotEmpty()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    state.referencedMessageIds.forEach { refId ->
                        val refMsg = messageById[refId]
                        val snippet = refMsg?.text?.replace('\n', ' ')?.trim()?.take(28)?.ifBlank { "Message" } ?: "Referenced message"
                        val author = if (refMsg?.role == "user") "You" else refMsg?.agentName?.ifBlank { "Agent" } ?: "Ref"
                        Surface(
                            shape = CircleShape,
                            color = s.surfaceContainerLowest.copy(alpha = 0.96f),
                            border = androidx.compose.foundation.BorderStroke(1.dp, activeBubbleColor),
                            shadowElevation = 2.dp,
                            modifier = Modifier.clickable { vm.removeReferencedMessage(refId) },
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(5.dp),
                            ) {
                                Icon(Icons.Default.FormatQuote, contentDescription = null, tint = activeBubbleColor, modifier = Modifier.size(13.dp))
                                Text(
                                    text = "$author: $snippet",
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                                    color = s.onSurface,
                                    maxLines = 1,
                                )
                                Icon(Icons.Default.Close, contentDescription = "Remove reference", tint = s.onSurfaceVariant, modifier = Modifier.size(12.dp))
                            }
                        }
                    }
                }
            }

            // Pending file/photo attachment chips
            if (state.pendingAttachments.isNotEmpty()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    state.pendingAttachments.forEachIndexed { idx, att ->
                        Surface(
                            shape = CircleShape,
                            color = s.surfaceContainerLowest.copy(alpha = 0.95f),
                            border = androidx.compose.foundation.BorderStroke(1.dp, s.primary),
                            shadowElevation = 2.dp,
                            modifier = Modifier.clickable { vm.removePendingAttachment(idx) },
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(5.dp),
                            ) {
                                Icon(
                                    imageVector = when {
                                        att.mime.startsWith("image/") -> Icons.Default.Image
                                        att.mime.startsWith("video/") -> Icons.Default.Videocam
                                        else -> Icons.Default.AttachFile
                                    },
                                    contentDescription = null,
                                    tint = s.primary,
                                    modifier = Modifier.size(13.dp),
                                )
                                Text(
                                    text = att.name.take(22),
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                                    color = s.onSurface,
                                    maxLines = 1,
                                )
                                Icon(Icons.Default.Close, contentDescription = "Remove", tint = s.onSurfaceVariant, modifier = Modifier.size(12.dp))
                            }
                        }
                    }
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                members.forEach { ag ->
                    Surface(
                        shape = CircleShape,
                        color = s.surfaceContainerLowest.copy(alpha = 0.92f),
                        border = androidx.compose.foundation.BorderStroke(1.dp, s.outlineVariant),
                        shadowElevation = 2.dp,
                        modifier = Modifier.stitchPressBounce(pressedScale = 0.94f) {
                            composer = if (composer.isBlank()) "@${ag.name} " else "$composer @${ag.name} "
                        },
                    ) {
                        Text(
                            text = "@${ag.name}",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                            color = s.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 9.dp, vertical = 3.dp),
                        )
                    }
                }
                Surface(
                    shape = CircleShape,
                    color = s.surfaceContainerLowest.copy(alpha = 0.92f),
                    border = androidx.compose.foundation.BorderStroke(1.dp, s.outlineVariant),
                    shadowElevation = 2.dp,
                    modifier = Modifier.stitchPressBounce(pressedScale = 0.94f) { showTagFolderDialog = true },
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 3.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(Icons.Default.CreateNewFolder, contentDescription = null, tint = s.onSurfaceVariant, modifier = Modifier.size(13.dp))
                        Text("Tag folder", style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp), color = s.onSurfaceVariant)
                    }
                }
                Spacer(Modifier.weight(1f))
                Surface(
                    shape = CircleShape,
                    color = s.surfaceContainerLowest.copy(alpha = 0.92f),
                    border = androidx.compose.foundation.BorderStroke(1.dp, s.outlineVariant),
                    shadowElevation = 2.dp,
                    modifier = Modifier.stitchPressBounce(pressedScale = 0.94f) {
                        vm.startCoworkVoiceCall(
                            conversationId = state.selectedConversationId,
                            threadId = state.selectedThreadId,
                            agentId = primaryAgent?.id,
                        )
                    },
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 3.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(Icons.Default.GraphicEq, contentDescription = null, tint = s.onSurface, modifier = Modifier.size(13.dp))
                        Text("LiveKit", style = MaterialTheme.typography.labelMedium.copy(fontSize = 11.sp), color = s.onSurface)
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Box(modifier = Modifier.shadow(6.dp, CircleShape)) {
                    StitchCircleIconButton(
                        icon = Icons.Default.AttachFile,
                        contentDescription = "Attach photo, video, or file",
                        outlined = true,
                        size = 38.dp,
                        onClick = { filePickerLauncher.launch(arrayOf("*/*")) },
                    )
                }
                Surface(
                    shape = CircleShape,
                    color = s.surfaceContainerLowest.copy(alpha = 0.95f),
                    border = androidx.compose.foundation.BorderStroke(1.dp, s.outlineVariant),
                    shadowElevation = 6.dp,
                    modifier = Modifier.weight(1f),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 9.dp),
                    ) {
                        if (composer.isEmpty()) {
                            Text(
                                "What can I do for you?",
                                style = MaterialTheme.typography.bodySmall,
                                color = s.onSurfaceVariant,
                            )
                        }
                        BasicTextField(
                            value = composer,
                            onValueChange = { composer = it },
                            textStyle = MaterialTheme.typography.bodySmall.copy(color = s.onSurface),
                            cursorBrush = SolidColor(s.primary),
                            maxLines = 4,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
                // Animated Send <-> Stop morphing button
                val canSend = composer.isNotBlank() || state.pendingAttachments.isNotEmpty()
                val showStop = view?.busy == true && !canSend
                Box(modifier = Modifier.shadow(6.dp, CircleShape)) {
                    AnimatedContent(
                        targetState = showStop,
                        transitionSpec = { (fadeIn() + scaleIn(initialScale = 0.82f)) togetherWith (fadeOut() + scaleOut(targetScale = 0.82f)) },
                        label = "sendStopMorph",
                    ) { stopping ->
                        StitchCircleIconButton(
                            icon = if (stopping) Icons.Default.Stop else Icons.Default.ArrowUpward,
                            contentDescription = if (stopping) "Stop agent" else "Send",
                            primary = !stopping && canSend,
                            outlined = !stopping && !canSend,
                            danger = stopping,
                            size = 38.dp,
                            onClick = {
                                if (stopping) {
                                    vm.stopTeamChat()
                                } else if (canSend) {
                                    vm.sendTeamMessage(composer)
                                    composer = ""
                                }
                            },
                        )
                    }
                }
            }
        }
    }

    // Edit user message dialog (from ... -> Edit)
    editingMessage?.let { targetMsg ->
        var editText by remember(targetMsg.id, targetMsg.revision) { mutableStateOf(targetMsg.text) }
        AlertDialog(
            onDismissRequest = { editingMessage = null },
            containerColor = s.surfaceContainerLowest,
            title = { Text("Edit message", color = s.onSurface) },
            text = {
                StitchInputField(
                    value = editText,
                    onValueChange = { editText = it },
                    label = "Message",
                    singleLine = false,
                    minLines = 2,
                    maxLines = 6,
                )
            },
            confirmButton = {
                TextButton(
                    enabled = editText.isNotBlank() && editText.trim() != targetMsg.text.trim(),
                    onClick = {
                        vm.editTeamMessage(targetMsg.id, editText, targetMsg.revision)
                        editingMessage = null
                    },
                ) { Text("Save", color = s.primary) }
            },
            dismissButton = {
                TextButton(onClick = { editingMessage = null }) { Text("Cancel", color = s.onSurfaceVariant) }
            },
        )
    }

    // Confirm delete message dialog (from ... -> Delete)
    deletingMessage?.let { targetMsg ->
        AlertDialog(
            onDismissRequest = { deletingMessage = null },
            containerColor = s.surfaceContainerLowest,
            title = { Text("Delete message?", color = s.onSurface) },
            text = {
                Text(
                    text = "This removes the message from this conversation across mobile and web.",
                    style = MaterialTheme.typography.bodySmall,
                    color = s.onSurfaceVariant,
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        vm.deleteTeamMessage(targetMsg.id)
                        deletingMessage = null
                    },
                ) { Text("Delete", color = s.error) }
            },
            dismissButton = {
                TextButton(onClick = { deletingMessage = null }) { Text("Cancel", color = s.onSurfaceVariant) }
            },
        )
    }

    // Full-view reader dialog (from ... -> Open full view, matching Web Workbench)
    fullViewMessage?.let { targetMsg ->
        AlertDialog(
            onDismissRequest = { fullViewMessage = null },
            containerColor = s.surfaceContainerLowest,
            title = {
                Text(
                    text = if (targetMsg.role == "user") "Your message" else targetMsg.agentName?.ifBlank { "Agent" } ?: "Agent",
                    color = s.onSurface,
                )
            },
            text = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState()),
                ) {
                    RichChatMessageContent(
                        rawText = targetMsg.text,
                        baseColor = s.onSurface,
                        mentionNames = state.teammates.map { it.name },
                        onSendAction = { prompt ->
                            fullViewMessage = null
                            vm.sendTeamMessage(prompt)
                        },
                        onOpenRun = { runId ->
                            fullViewMessage = null
                            vm.closeConversation()
                            vm.selectTab(MainTab.CODING)
                            vm.openRun(runId)
                        },
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        clipboard.setText(AnnotatedString(targetMsg.text))
                        fullViewMessage = null
                    },
                ) { Text("Copy", color = s.primary) }
            },
            dismissButton = {
                TextButton(onClick = { fullViewMessage = null }) { Text("Close", color = s.onSurfaceVariant) }
            },
        )
    }

    if (showNewThreadDialog) {
        var title by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showNewThreadDialog = false },
            containerColor = s.surfaceContainerLowest,
            title = { Text("New topic thread", color = s.onSurface) },
            text = { StitchInputField(value = title, onValueChange = { title = it }, label = "Thread name", placeholder = "mobile-fcm", mono = true) },
            confirmButton = {
                TextButton(
                    onClick = {
                        vm.createThread(title)
                        showNewThreadDialog = false
                    },
                    enabled = title.isNotBlank(),
                ) { Text("Create", color = s.primary) }
            },
            dismissButton = { TextButton(onClick = { showNewThreadDialog = false }) { Text("Cancel", color = s.onSurfaceVariant) } },
        )
    }

    if (showTagFolderDialog) {
        var folderPath by remember { mutableStateOf(state.selectedProjectPath) }
        var folderLabel by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showTagFolderDialog = false },
            containerColor = s.surfaceContainerLowest,
            title = { Text("Tag folder in chat", color = s.onSurface) },
            text = {
                Column(
                    modifier = Modifier.verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    if (state.projects.isNotEmpty()) {
                        Text("Workspace projects", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                        state.projects.forEach { proj ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(if (folderPath == proj.path) s.secondaryContainer else s.surfaceContainerLow)
                                    .clickable {
                                        folderPath = proj.path
                                        folderLabel = proj.name
                                    }
                                    .padding(horizontal = 10.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Icon(Icons.Default.Folder, contentDescription = null, tint = s.primary, modifier = Modifier.size(16.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(proj.name, style = MaterialTheme.typography.labelMedium, color = s.onSurface)
                                    Text(proj.path, style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp), color = s.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }
                    }
                    StitchInputField(
                        value = folderPath,
                        onValueChange = { folderPath = it },
                        label = "Folder path",
                        placeholder = "/workspace/my-project",
                        mono = true,
                    )
                    StitchInputField(
                        value = folderLabel,
                        onValueChange = { folderLabel = it },
                        label = "Label (optional)",
                        placeholder = "Frontend",
                    )
                }
            },
            confirmButton = {
                TextButton(
                    enabled = folderPath.isNotBlank(),
                    onClick = {
                        vm.tagConversationFolder(folderPath, folderLabel)
                        showTagFolderDialog = false
                    },
                ) { Text("Tag folder", color = s.primary) }
            },
            dismissButton = { TextButton(onClick = { showTagFolderDialog = false }) { Text("Cancel", color = s.onSurfaceVariant) } },
        )
    }

    // Inline real Mailbox connection dialog (launched right from a chat mail Connect card!)
    inlineMailAgentId?.let { mailAgent ->
        var address by remember(mailAgent) { mutableStateOf("") }
        var password by remember(mailAgent) { mutableStateOf("") }
        var imapHost by remember(mailAgent) { mutableStateOf("imap.gmail.com") }
        var imapPort by remember(mailAgent) { mutableStateOf("993") }
        var smtpHost by remember(mailAgent) { mutableStateOf("smtp.gmail.com") }
        var smtpPort by remember(mailAgent) { mutableStateOf("465") }
        var detectNote by remember(mailAgent) { mutableStateOf<String?>(null) }

        AlertDialog(
            onDismissRequest = { inlineMailAgentId = null },
            containerColor = s.surfaceContainerLowest,
            title = { Text("Connect Mailbox", color = s.onSurface) },
            text = {
                Column(
                    modifier = Modifier.verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    StitchInputField(value = address, onValueChange = { address = it }, label = "Email address", placeholder = "you@domain.com")
                    StitchSecondaryButton(
                        text = "Auto-detect mail servers",
                        outlined = true,
                        enabled = address.contains("@"),
                        onClick = {
                            detectNote = "Detecting…"
                            vm.detectMailbox(address) { res ->
                                if (res?.found == true) {
                                    res.imap?.let { imapHost = it.host; imapPort = it.port.toString() }
                                    res.smtp?.let { smtpHost = it.host; smtpPort = it.port.toString() }
                                    detectNote = "Detected servers for ${res.domain ?: address}"
                                } else {
                                    detectNote = "No auto-config found — enter IMAP/SMTP below."
                                }
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    detectNote?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = s.onSurfaceVariant) }
                    StitchInputField(value = password, onValueChange = { password = it }, label = "App Password", visualTransformation = PasswordVisualTransformation())
                    StitchInputField(value = imapHost, onValueChange = { imapHost = it }, label = "IMAP Host", mono = true)
                    StitchInputField(value = smtpHost, onValueChange = { smtpHost = it }, label = "SMTP Host", mono = true)
                }
            },
            confirmButton = {
                TextButton(
                    enabled = address.contains("@") && password.isNotBlank() && imapHost.isNotBlank() && smtpHost.isNotBlank(),
                    onClick = {
                        vm.connectMailbox(
                            agentId = mailAgent,
                            address = address,
                            password = password,
                            imapHost = imapHost,
                            imapPort = imapPort.toIntOrNull() ?: 993,
                            smtpHost = smtpHost,
                            smtpPort = smtpPort.toIntOrNull() ?: 465,
                        )
                        inlineMailAgentId = null
                    },
                ) { Text("Connect", color = s.primary) }
            },
            dismissButton = { TextButton(onClick = { inlineMailAgentId = null }) { Text("Cancel", color = s.onSurfaceVariant) } },
        )
    }

    // Inline real per-app API Key / Bearer / Basic credential dialog (from service authConfigs)
    inlineApiKeyConnect?.let { (agentId, svc, reqId) ->
        val auth = svc.apiKeyAuthConfig
        val fields = remember(svc.slug) {
            auth?.fields?.takeIf { it.isNotEmpty() }
                ?: listOf(
                    ServiceAuthField(
                        name = "api_key",
                        label = if (auth?.scheme.equals("BEARER_TOKEN", ignoreCase = true)) "Bearer token" else "API key",
                        required = true,
                        secret = true,
                    ),
                )
        }
        val values = remember(svc.slug) { mutableStateMapOf<String, String>() }
        var alias by remember(svc.slug) { mutableStateOf("") }

        AlertDialog(
            onDismissRequest = { inlineApiKeyConnect = null },
            containerColor = s.surfaceContainerLowest,
            title = { Text("Connect ${svc.name.ifBlank { svc.slug }}", color = s.onSurface) },
            text = {
                Column(
                    modifier = Modifier.verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = "Credentials are sent securely over your session and never stored in chat.",
                        style = MaterialTheme.typography.bodySmall,
                        color = s.onSurfaceVariant,
                    )
                    fields.forEach { f ->
                        StitchInputField(
                            value = values[f.name].orEmpty(),
                            onValueChange = { values[f.name] = it },
                            label = (f.label ?: f.name) + if (f.required) " *" else "",
                            placeholder = f.description.orEmpty(),
                            mono = f.secret,
                            visualTransformation = if (f.secret) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
                        )
                    }
                    StitchInputField(value = alias, onValueChange = { alias = it }, label = "Connection name (optional)")
                }
            },
            confirmButton = {
                val allReqFilled = fields.filter { it.required }.all { !values[it.name].isNullOrBlank() }
                TextButton(
                    enabled = allReqFilled,
                    onClick = {
                        vm.connectAppService(
                            agentId = agentId,
                            service = svc.slug,
                            requestId = reqId,
                            fields = values.toMap(),
                            authConfigId = auth?.id?.takeIf { it.isNotBlank() },
                            authScheme = auth?.scheme?.takeIf { it.isNotBlank() },
                            alias = alias.trim().takeIf { it.isNotBlank() },
                        )
                        inlineApiKeyConnect = null
                    },
                ) { Text("Connect app", color = s.primary) }
            },
            dismissButton = { TextButton(onClick = { inlineApiKeyConnect = null }) { Text("Cancel", color = s.onSurfaceVariant) } },
        )
    }
}

@Composable
private fun StitchThreadPill(label: String, selected: Boolean, onClick: () -> Unit) {
    val s = LocalStitchPalette.current
    Surface(
        shape = CircleShape,
        color = if (selected) s.primary else s.surfaceContainerLowest.copy(alpha = 0.92f),
        border = androidx.compose.foundation.BorderStroke(1.dp, if (selected) s.primary else s.outlineVariant),
        shadowElevation = 3.dp,
        modifier = Modifier.clickable(onClick = onClick),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
            color = if (selected) s.onPrimary else s.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
        )
    }
}

@Composable
private fun StitchChatMessageRow(
    msg: TeamMessage,
    teammates: List<Teammate>,
    showAgentAvatar: Boolean,
    isReferenced: Boolean,
    userBubbleColor: Color,
    userBubbleInk: Color,
    attachedArtifacts: List<TeamArtifact>,
    artifactUrlFor: (String) -> String,
    onPreviewArtifact: (TeamArtifact) -> Unit,
    onSendAction: (String) -> Unit,
    onOpenRun: (String) -> Unit,
    onCopyMessage: (String) -> Unit,
    onEditMessage: (TeamMessage) -> Unit,
    onRetryMessage: (TeamMessage) -> Unit,
    onReferenceMessage: (TeamMessage) -> Unit,
    onOpenFullView: (TeamMessage) -> Unit,
    onDeleteMessage: (TeamMessage) -> Unit,
    modifier: Modifier = Modifier,
) {
    val s = LocalStitchPalette.current
    val timeLabel = formatShortTime(msg.ts)
    val mentionNames = remember(teammates) { teammates.map { it.name } }
    var menuOpen by remember(msg.id, msg.revision) { mutableStateOf(false) }

    if (msg.role == "system") {
        val cleanSystem = remember(msg.text) { ChatMessageFilter.filterVisibleReply(msg.text) }
        if (cleanSystem.isBlank()) return
        Box(modifier = modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .background(s.surfaceContainerLow)
                    .border(1.dp, s.outlineVariant, RoundedCornerShape(12.dp))
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            ) {
                MarkdownTextContent(
                    text = cleanSystem.take(220),
                    baseColor = s.onSurfaceVariant,
                    fontSizeSp = 11.5f,
                    lineHeightSp = 15f,
                    onOpenRun = onOpenRun,
                )
            }
        }
        return
    }

    if (msg.role == "user") {
        Column(
            modifier = modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.End,
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Column(
                modifier = Modifier
                    .widthIn(min = 52.dp, max = 280.dp)
                    .clip(RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 4.dp))
                    .background(userBubbleColor)
                    .then(
                        if (isReferenced) Modifier.border(1.5.dp, s.onSurface, RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 4.dp))
                        else Modifier,
                    )
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                RichChatMessageContent(
                    rawText = msg.text,
                    baseColor = userBubbleInk,
                    mentionNames = mentionNames,
                    fillWidth = false,
                )
                if (timeLabel.isNotBlank()) {
                    Text(
                        text = timeLabel,
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp, lineHeight = 12.sp),
                        color = userBubbleInk.copy(alpha = 0.76f),
                        modifier = Modifier.align(Alignment.End),
                    )
                }
            }

            // ... actions row directly BELOW the user bubble (matching Web cwMessageActionsHtml)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.padding(end = 2.dp),
            ) {
                if (msg.status == "failed") {
                    Text(
                        text = "Failed",
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                        color = s.error,
                    )
                } else if (msg.revision > 0) {
                    Text(
                        text = "Edited",
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                        color = s.onSurfaceVariant,
                    )
                }
                if (isReferenced) {
                    Text(
                        text = "Referenced",
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                        color = userBubbleColor,
                    )
                }
                Box {
                    Row(
                        modifier = Modifier
                            .clip(CircleShape)
                            .clickable { menuOpen = true }
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.Default.MoreHoriz,
                            contentDescription = "Message actions",
                            tint = s.onSurfaceVariant,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        DropdownMenuItem(
                            text = { Text("Copy") },
                            leadingIcon = { Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp)) },
                            onClick = {
                                menuOpen = false
                                onCopyMessage(msg.text)
                            },
                        )
                        DropdownMenuItem(
                            text = { Text("Edit") },
                            leadingIcon = { Icon(Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(16.dp)) },
                            onClick = {
                                menuOpen = false
                                onEditMessage(msg)
                            },
                        )
                        if (msg.status == "failed") {
                            DropdownMenuItem(
                                text = { Text("Retry") },
                                leadingIcon = { Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp)) },
                                onClick = {
                                    menuOpen = false
                                    onRetryMessage(msg)
                                },
                            )
                        }
                        DropdownMenuItem(
                            text = { Text(if (isReferenced) "Remove reference" else "Reference") },
                            leadingIcon = { Icon(Icons.Default.FormatQuote, contentDescription = null, modifier = Modifier.size(16.dp)) },
                            onClick = {
                                menuOpen = false
                                onReferenceMessage(msg)
                            },
                        )
                        DropdownMenuItem(
                            text = { Text("Delete", color = s.error) },
                            leadingIcon = { Icon(Icons.Default.DeleteOutline, contentDescription = null, tint = s.error, modifier = Modifier.size(16.dp)) },
                            onClick = {
                                menuOpen = false
                                onDeleteMessage(msg)
                            },
                        )
                    }
                }
            }
        }
    } else {
        val ag = teammates.firstOrNull { it.name.equals(msg.agentName, ignoreCase = true) }
        Row(
            modifier = modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(if (showAgentAvatar) 6.dp else 0.dp),
        ) {
            if (showAgentAvatar) {
                StitchCharacterAvatar(
                    label = msg.agentName ?: "AI",
                    accentHex = ag?.avatar?.color,
                    shapeName = ag?.avatar?.shape,
                    imageUrl = ag?.avatar?.imageUrl,
                    size = 26.dp,
                )
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    if (showAgentAvatar) {
                        Text(
                            text = msg.agentName?.ifBlank { "Agent" } ?: "Agent",
                            style = MaterialTheme.typography.labelMedium,
                            color = s.onSurface,
                        )
                        if (!ag?.tagline.isNullOrBlank()) {
                            Text(
                                text = "• ${ag!!.tagline.take(18)}",
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                                color = s.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f, fill = false),
                            )
                        }
                        Spacer(Modifier.weight(1f))
                    } else {
                        Text(
                            text = msg.agentName?.ifBlank { "Agent" } ?: "Agent",
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Medium),
                            color = s.onSurfaceVariant,
                        )
                        Spacer(Modifier.weight(1f))
                    }
                    if (timeLabel.isNotBlank()) {
                        Text(
                            text = timeLabel,
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                            color = s.onSurfaceVariant,
                        )
                    }
                }
                val bubbleShape = RoundedCornerShape(
                    topStart = if (showAgentAvatar) 4.dp else 14.dp,
                    topEnd = 18.dp,
                    bottomStart = 18.dp,
                    bottomEnd = 18.dp,
                )
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(bubbleShape)
                        .background(s.surfaceContainerLowest)
                        .border(
                            width = if (isReferenced) 1.5.dp else 1.dp,
                            color = if (isReferenced) userBubbleColor else s.outlineVariant,
                            shape = bubbleShape,
                        )
                        .padding(horizontal = 13.dp, vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    RichChatMessageContent(
                        rawText = msg.text,
                        baseColor = s.onSurface,
                        mentionNames = mentionNames,
                        onSendAction = onSendAction,
                        onOpenRun = onOpenRun,
                    )

                    // Inline media (pictures/videos) & document preview cards ONLY for files attached to THIS specific message
                    attachedArtifacts.forEach { art ->
                        val directUrl = artifactUrlFor(art.id)
                        when {
                            art.isImage && directUrl.isNotBlank() -> {
                                InlineMediaImageCard(url = directUrl, caption = art.name)
                            }
                            art.isVideo && directUrl.isNotBlank() -> {
                                InlineMediaVideoCard(url = directUrl, title = art.name)
                            }
                            else -> {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(s.surfaceContainerLow)
                                        .border(1.dp, s.outlineVariant, RoundedCornerShape(12.dp))
                                        .stitchPressBounce(pressedScale = 0.97f) { onPreviewArtifact(art) }
                                        .padding(horizontal = 9.dp, vertical = 7.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(28.dp)
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(s.primary),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Icon(Icons.Default.Description, contentDescription = null, tint = s.onPrimary, modifier = Modifier.size(15.dp))
                                    }
                                    Text(
                                        text = art.name,
                                        style = MaterialTheme.typography.labelMedium,
                                        color = s.onSurface,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                        modifier = Modifier.weight(1f),
                                    )
                                    Text(
                                        text = "Preview",
                                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                                        color = s.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }
                }

                // ... actions row directly BELOW the agent bubble (matching Web cwMessageActionsHtml)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.padding(start = 2.dp),
                ) {
                    Box {
                        Row(
                            modifier = Modifier
                                .clip(CircleShape)
                                .clickable { menuOpen = true }
                                .padding(horizontal = 6.dp, vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(
                                imageVector = Icons.Default.MoreHoriz,
                                contentDescription = "Message actions",
                                tint = s.onSurfaceVariant,
                                modifier = Modifier.size(16.dp),
                            )
                        }
                        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                            DropdownMenuItem(
                                text = { Text("Copy") },
                                leadingIcon = { Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp)) },
                                onClick = {
                                    menuOpen = false
                                    onCopyMessage(msg.text)
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("Open full view") },
                                leadingIcon = { Icon(Icons.Default.OpenInFull, contentDescription = null, modifier = Modifier.size(16.dp)) },
                                onClick = {
                                    menuOpen = false
                                    onOpenFullView(msg)
                                },
                            )
                            DropdownMenuItem(
                                text = { Text(if (isReferenced) "Remove reference" else "Reference") },
                                leadingIcon = { Icon(Icons.Default.FormatQuote, contentDescription = null, modifier = Modifier.size(16.dp)) },
                                onClick = {
                                    menuOpen = false
                                    onReferenceMessage(msg)
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("Delete", color = s.error) },
                                leadingIcon = { Icon(Icons.Default.DeleteOutline, contentDescription = null, tint = s.error, modifier = Modifier.size(16.dp)) },
                                onClick = {
                                    menuOpen = false
                                    onDeleteMessage(msg)
                                },
                            )
                        }
                    }
                    if (isReferenced) {
                        Text(
                            text = "Referenced",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                            color = userBubbleColor,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CreateConversationDialog(
    teammates: List<Teammate>,
    onDismiss: () -> Unit,
    onCreate: (List<String>, String?, String?) -> Unit,
) {
    val s = LocalStitchPalette.current
    var title by remember { mutableStateOf("") }
    val selected = remember { mutableStateListOf<String>() }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = s.surfaceContainerLowest,
        title = { Text("New Cowork thread", color = s.onSurface) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                StitchInputField(value = title, onValueChange = { title = it }, label = "Title (optional)", placeholder = "Core Product Team")
                teammates.forEach { ag ->
                    val checked = ag.id in selected
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(if (checked) s.surfaceContainer else Color.Transparent)
                            .clickable { if (checked) selected.remove(ag.id) else selected.add(ag.id) }
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    ) {
                        Checkbox(checked = checked, onCheckedChange = { if (it) selected.add(ag.id) else selected.remove(ag.id) })
                        StitchCharacterAvatar(
                            label = ag.name,
                            accentHex = ag.avatar.color,
                            shapeName = ag.avatar.shape,
                            imageUrl = ag.avatar.imageUrl,
                            size = 30.dp,
                        )
                        Text(ag.name, color = s.onSurface, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val chief = teammates.firstOrNull { it.id in selected && it.chiefOfStaff }?.id
                    onCreate(selected.toList(), title.ifBlank { null }, chief)
                },
                enabled = selected.isNotEmpty(),
            ) { Text("Create", color = s.primary) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", color = s.onSurfaceVariant) } },
    )
}

@Composable
private fun SaveTeammateDialog(
    initial: Teammate?,
    onDismiss: () -> Unit,
    onSave: (
        id: String?,
        name: String,
        tagline: String,
        prompt: String,
        color: String,
        shape: String,
        allowShell: Boolean,
        allowWrites: Boolean,
        chief: Boolean,
        pendingAvatarDataUrl: String?,
        removeAvatar: Boolean,
    ) -> Unit,
) {
    val s = LocalStitchPalette.current
    val context = LocalContext.current
    val initialSpec = remember(initial) {
        resolveOfficialCharacter(initial?.avatar?.shape, initial?.avatar?.color, initial?.name.orEmpty())
    }
    val initialColor = remember(initial, initialSpec) {
        resolveCharacterColorHex(initial?.avatar?.shape, initial?.avatar?.color, initial?.name.orEmpty())
    }
    var name by remember { mutableStateOf(initial?.name.orEmpty()) }
    var tagline by remember { mutableStateOf(initial?.tagline.orEmpty()) }
    var prompt by remember { mutableStateOf(initial?.systemPrompt.orEmpty()) }
    var selectedShape by remember { mutableStateOf(initialSpec.shape) }
    var selectedColor by remember { mutableStateOf(initialColor) }
    var customColorPicked by remember(initial) {
        mutableStateOf(
            initial != null && !initialColor.equals(initialSpec.accentHex, ignoreCase = true),
        )
    }
    var pendingAvatarDataUrl by remember(initial) { mutableStateOf<String?>(null) }
    var removeAvatar by remember(initial) { mutableStateOf(false) }
    var allowShell by remember { mutableStateOf(initial?.allowShell ?: false) }
    var allowWrites by remember { mutableStateOf(initial?.allowWrites ?: false) }
    var chief by remember { mutableStateOf(initial?.chiefOfStaff ?: false) }

    val selectedSpec = OFFICIAL_AI_CHARACTERS.firstOrNull { it.shape == selectedShape } ?: OFFICIAL_AI_CHARACTERS.first()
    val effectivePreviewImageUrl = if (removeAvatar) null else (pendingAvatarDataUrl ?: initial?.avatar?.imageUrl)

    val avatarPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent(),
    ) { uri ->
        if (uri != null) {
            runCatching {
                val cr = context.contentResolver
                val rawMime = cr.getType(uri)?.lowercase().orEmpty()
                val mime = when {
                    rawMime.contains("png") -> "image/png"
                    rawMime.contains("webp") -> "image/webp"
                    else -> "image/jpeg"
                }
                val bytes = cr.openInputStream(uri)?.use { it.readBytes() } ?: return@runCatching
                if (bytes.size <= 4 * 1024 * 1024) {
                    val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                    pendingAvatarDataUrl = "data:$mime;base64,$b64"
                    removeAvatar = false
                }
            }
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = s.surfaceContainerLowest,
        title = { Text(if (initial == null) "New Teammate" else "Edit ${initial.name}", color = s.onSurface) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                // Live Avatar Preview + Custom Photo Upload / Remove controls
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(s.surfaceContainerLow)
                        .border(1.dp, s.outlineVariant, RoundedCornerShape(14.dp))
                        .padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    StitchCharacterAvatar(
                        label = name.ifBlank { selectedSpec.displayName },
                        accentHex = selectedColor,
                        shapeName = selectedShape,
                        imageUrl = effectivePreviewImageUrl,
                        size = 56.dp,
                        floating = true,
                    )
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = if (effectivePreviewImageUrl != null) "Custom photo" else selectedSpec.displayName,
                            style = MaterialTheme.typography.titleSmall,
                            color = s.onSurface,
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            StitchSecondaryButton(
                                text = if (effectivePreviewImageUrl != null) "Change" else "Upload photo",
                                icon = Icons.Default.PhotoCamera,
                                outlined = true,
                                onClick = { avatarPicker.launch("image/*") },
                            )
                            if (effectivePreviewImageUrl != null) {
                                TextButton(
                                    onClick = {
                                        pendingAvatarDataUrl = null
                                        removeAvatar = true
                                    },
                                ) { Text("Use plush", color = s.onSurfaceVariant, style = MaterialTheme.typography.labelSmall) }
                            }
                        }
                    }
                }

                // 10-color palette swatches matching Web CW_CHARACTER_PALETTE
                Text("Character & chat color", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OFFICIAL_COLOR_PALETTE.forEach { (colorName, hex) ->
                        val active = selectedColor.equals(hex, ignoreCase = true)
                        val swatchColor = parseHexColor(hex)
                        val swatchInk = contrastInkFor(swatchColor)
                        Box(
                            modifier = Modifier
                                .size(30.dp)
                                .clip(CircleShape)
                                .background(swatchColor)
                                .border(
                                    width = if (active) 2.5.dp else 1.dp,
                                    color = if (active) s.onSurface else s.outlineVariant,
                                    shape = CircleShape,
                                )
                                .clickable {
                                    selectedColor = hex
                                    customColorPicked = true
                                },
                            contentAlignment = Alignment.Center,
                        ) {
                            if (active) {
                                Icon(
                                    imageVector = Icons.Default.Check,
                                    contentDescription = colorName,
                                    tint = swatchInk,
                                    modifier = Modifier.size(16.dp),
                                )
                            }
                        }
                    }
                }

                Text("AI Character", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OFFICIAL_AI_CHARACTERS.forEach { spec ->
                        val active = spec.shape == selectedShape
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                            modifier = Modifier
                                .clip(RoundedCornerShape(14.dp))
                                .background(if (active) s.surfaceContainer else Color.Transparent)
                                .border(
                                    width = if (active) 1.5.dp else 1.dp,
                                    color = if (active) parseHexColor(selectedColor, s.primary) else s.outlineVariant,
                                    shape = RoundedCornerShape(14.dp),
                                )
                                .clickable {
                                    selectedShape = spec.shape
                                    if (!customColorPicked) selectedColor = spec.accentHex
                                }
                                .padding(horizontal = 8.dp, vertical = 6.dp),
                        ) {
                            StitchCharacterAvatar(
                                label = spec.displayName,
                                accentHex = if (active) selectedColor else spec.accentHex,
                                shapeName = spec.shape,
                                size = 40.dp,
                                floating = active,
                            )
                            Text(
                                text = spec.displayName,
                                style = MaterialTheme.typography.labelSmall,
                                color = if (active) s.onSurface else s.onSurfaceVariant,
                            )
                        }
                    }
                }
                StitchInputField(value = name, onValueChange = { name = it }, label = "Name", placeholder = "Kai")
                StitchInputField(value = tagline, onValueChange = { tagline = it }, label = "Role", placeholder = "Staff Engineer")
                StitchInputField(value = prompt, onValueChange = { prompt = it }, label = "System instructions", singleLine = false, minLines = 3)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                    Text("Allow shell", color = s.onSurface)
                    Switch(checked = allowShell, onCheckedChange = { allowShell = it })
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                    Text("Allow writes", color = s.onSurface)
                    Switch(checked = allowWrites, onCheckedChange = { allowWrites = it })
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                    Text("Chief of staff", color = s.onSurface)
                    Switch(checked = chief, onCheckedChange = { chief = it })
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    onSave(
                        initial?.id,
                        name,
                        tagline,
                        prompt,
                        selectedColor,
                        selectedSpec.shape,
                        allowShell,
                        allowWrites,
                        chief,
                        pendingAvatarDataUrl,
                        removeAvatar,
                    )
                },
                enabled = name.isNotBlank() && prompt.isNotBlank(),
            ) { Text("Save", color = s.primary) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", color = s.onSurfaceVariant) } },
    )
}
