package dev.agentgitu.mobile.ui.screens

import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
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
            onNewChat = { showNewChatDialog = true },
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

    if (showCreateTeammate || editingTeammate != null) {
        SaveTeammateDialog(
            initial = editingTeammate,
            onDismiss = {
                showCreateTeammate = false
                editingTeammate = null
            },
            onSave = { id, name, tagline, prompt, color, shape, allowShell, allowWrites, chief ->
                showCreateTeammate = false
                editingTeammate = null
                vm.saveTeammate(id, name, tagline, prompt, color, shape, allowShell, allowWrites, chief)
            },
        )
    }
}

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

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Teammate Presence Strip (No heavy boxes — exact Stitch spec)
            item(key = "presence_strip") {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    state.teammates.forEach { ag ->
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(5.dp),
                            modifier = Modifier
                                .width(64.dp)
                                .clickable {
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
                            .clickable(onClick = onOpenRoster),
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
                            .clip(RoundedCornerShape(20.dp))
                            .background(s.tertiaryContainer)
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Icon(Icons.Default.VerifiedUser, contentDescription = null, tint = s.onTertiaryContainer, modifier = Modifier.size(20.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = pendingApproval.tool.ifBlank { "Approval needed" },
                                style = MaterialTheme.typography.labelLarge,
                                color = s.onTertiaryContainer,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = pendingApproval.summary.ifBlank { pendingRunWithApproval.goal },
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
                                .clickable { vm.resolveApproval(pendingApproval.id, true) }
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
                                    .clickable { onFilterChange(tab) }
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

            // Separated Thread Cards
            if (filteredConvs.isEmpty() && filteredInboxRooms.isEmpty()) {
                item(key = "empty_hub") {
                    StitchCard(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("No conversations here yet", style = MaterialTheme.typography.titleMedium, color = s.onSurface)
                            Text(
                                "Tap the compose button above or any teammate avatar to start a Cowork thread.",
                                style = MaterialTheme.typography.bodySmall,
                                color = s.onSurfaceVariant,
                            )
                        }
                    }
                }
            } else {
                items(filteredConvs, key = { "conv_${it.id}" }) { conv ->
                    val convAgents = conv.memberIds.mapNotNull { id -> state.teammates.firstOrNull { it.id == id } }
                    val firstAgent = convAgents.firstOrNull()
                    val memberNames = convAgents.map { it.name }
                    StitchCard(
                        modifier = Modifier.fillMaxWidth(),
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
                                        size = 38.dp,
                                    )
                                    Box(modifier = Modifier.align(Alignment.BottomEnd)) {
                                        StitchCharacterAvatar(
                                            label = convAgents[1].name,
                                            accentHex = convAgents[1].avatar.color,
                                            shapeName = convAgents[1].avatar.shape,
                                            size = 32.dp,
                                        )
                                    }
                                }
                            } else {
                                StitchCharacterAvatar(
                                    label = firstAgent?.name ?: conv.title,
                                    accentHex = firstAgent?.avatar?.color,
                                    shapeName = firstAgent?.avatar?.shape,
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
                        modifier = Modifier.fillMaxWidth(),
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
                                Icon(Icons.Default.Group, contentDescription = null, tint = s.onSurfaceVariant, modifier = Modifier.size(22.dp))
                            }
                            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(
                                    text = room.title.ifBlank { "Shared Room" },
                                    style = MaterialTheme.typography.titleMedium,
                                    color = s.onSurface,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    text = "Shared Inbox • ${room.memberIds.size} collaborators • Tool policy: ${room.toolPolicyOverride ?: "default"}",
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
                        .clickable { vm.startCoworkVoiceCall() }
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
@Composable
private fun CoworkChatScreen(
    state: AppUiState,
    vm: GituAppViewModel,
) {
    val s = LocalStitchPalette.current
    val convId = state.selectedConversationId ?: return
    val conv = state.conversations.firstOrNull { it.id == convId }
    val view = state.activeTeamView
    val context = LocalContext.current
    var composer by remember { mutableStateOf("") }
    var showNewThreadDialog by remember { mutableStateOf(false) }
    var showTagFolderDialog by remember { mutableStateOf(false) }
    var inlineMailAgentId by remember { mutableStateOf<String?>(null) }
    var inlineApiKeyConnect by remember { mutableStateOf<Triple<String, ConnectedServiceItem, String>?>(null) }

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
    val artifactById = remember(view?.artifacts) {
        view?.artifacts.orEmpty().associateBy { it.id }
    }
    val visibleMessages = remember(view?.messages) {
        view?.messages.orEmpty()
    }
    val visibleRequests = remember(view?.requests) {
        view?.requests.orEmpty().filter { req ->
            req.hiddenAt.isNullOrBlank() && (
                req.status == "open" ||
                    req.status == "pending" ||
                    req.appConnection != null ||
                    req.kind == "credential"
                )
        }
    }

    // Interleave messages & inline request/app-connection cards chronologically so Connect cards appear inline right in chat!
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
    LaunchedEffect(convId, state.selectedThreadId, timelineEntries.size) {
        if (timelineEntries.isNotEmpty()) {
            val lastIdx = listState.layoutInfo.totalItemsCount - 1
            if (lastIdx >= 0) listState.animateScrollToItem(lastIdx)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(s.surface),
    ) {
        // 1. FULL-BLEED SCROLLABLE CHAT STREAM (messages + inline app connection / approval cards)
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                top = if (uniqueThreads.size > 1) 128.dp else 98.dp,
                bottom = 108.dp,
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
                            attachedArtifacts = attachedArtifacts,
                            artifactUrlFor = { artId -> vm.artifactInlineUrl(artId) },
                            onPreviewArtifact = { art -> vm.openArtifactPreview(art.id, art.name) },
                            onSendAction = { prompt -> vm.sendTeamMessage(prompt) },
                            onOpenRun = { runId ->
                                vm.closeConversation()
                                vm.selectTab(MainTab.CODING)
                                vm.openRun(runId)
                            },
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
                        StitchTeamRequestCard(
                            request = entry,
                            teammate = state.teammates.firstOrNull { it.id == entry.agentId },
                            authLink = state.appAuthLinksByRequest[entry.id],
                            liveConnected = alreadyActive,
                            availableAccount = matchingAvailable,
                            onAssignExisting = { agentId, accountId -> vm.assignAppAccount(agentId, accountId) },
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
                            onSubmitCredential = { reqId, label, provider, baseUrl, token, valPath ->
                                vm.submitInlineCredential(reqId, label, provider, baseUrl, token, valPath)
                            },
                            onAction = { action, resp -> vm.resolveTeamRequest(entry.id, action, resp) },
                        )
                    }
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
                        progress = null,
                        fallbackText = view.working?.ifBlank { "Working…" } ?: "Working…",
                    )
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

                // Floating Action Buttons (right: Stop, Desktop, Voice Call)
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
                    primaryAgent?.let { ag ->
                        Box(modifier = Modifier.shadow(6.dp, CircleShape)) {
                            StitchCircleIconButton(
                                icon = Icons.Default.DesktopWindows,
                                contentDescription = "Desktop",
                                outlined = true,
                                size = 36.dp,
                                onClick = { vm.openLiveDesktop(ag.id, ag.name) },
                            )
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
                            .clickable { showNewThreadDialog = true },
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
                        modifier = Modifier.clickable {
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
                    modifier = Modifier.clickable { showTagFolderDialog = true },
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
                    modifier = Modifier.clickable {
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
                // Dynamic Send ↔ Stop button: Stop while agent is working & input empty, Send as soon as user starts writing!
                val canSend = composer.isNotBlank() || state.pendingAttachments.isNotEmpty()
                val showStop = view?.busy == true && !canSend
                Box(modifier = Modifier.shadow(6.dp, CircleShape)) {
                    StitchCircleIconButton(
                        icon = if (showStop) Icons.Default.Stop else Icons.Default.ArrowUpward,
                        contentDescription = if (showStop) "Stop agent" else "Send",
                        primary = !showStop && canSend,
                        outlined = !showStop && !canSend,
                        danger = showStop,
                        size = 38.dp,
                        onClick = {
                            if (showStop) {
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
    attachedArtifacts: List<TeamArtifact>,
    artifactUrlFor: (String) -> String,
    onPreviewArtifact: (TeamArtifact) -> Unit,
    onSendAction: (String) -> Unit,
    onOpenRun: (String) -> Unit,
) {
    val s = LocalStitchPalette.current
    val timeLabel = formatShortTime(msg.ts)
    val mentionNames = remember(teammates) { teammates.map { it.name } }

    if (msg.role == "system") {
        val cleanSystem = remember(msg.text) { ChatMessageFilter.filterVisibleReply(msg.text) }
        if (cleanSystem.isBlank()) return
        Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
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
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            Column(
                modifier = Modifier
                    .widthIn(max = 290.dp)
                    .clip(RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 4.dp))
                    .background(s.primary)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                RichChatMessageContent(
                    rawText = msg.text,
                    baseColor = s.onPrimary,
                    mentionNames = mentionNames,
                )
                if (timeLabel.isNotBlank()) {
                    Text(
                        text = timeLabel,
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp, lineHeight = 12.sp),
                        color = s.onPrimary.copy(alpha = 0.72f),
                        modifier = Modifier.align(Alignment.End),
                    )
                }
            }
        }
    } else {
        val ag = teammates.firstOrNull { it.name.equals(msg.agentName, ignoreCase = true) }
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            StitchCharacterAvatar(
                label = msg.agentName ?: "AI",
                accentHex = ag?.avatar?.color,
                shapeName = ag?.avatar?.shape,
                size = 26.dp,
            )
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
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
                    if (timeLabel.isNotBlank()) {
                        Text(
                            text = timeLabel,
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                            color = s.onSurfaceVariant,
                        )
                    }
                }
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 18.dp))
                        .background(s.surfaceContainerLowest)
                        .border(1.dp, s.outlineVariant, RoundedCornerShape(topStart = 4.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 18.dp))
                        .padding(horizontal = 12.dp, vertical = 9.dp),
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
                                        .clickable { onPreviewArtifact(art) }
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
            }
        }
    }
}

@Composable
private fun StitchTeamRequestCard(
    request: TeamRequest,
    teammate: Teammate?,
    authLink: String?,
    liveConnected: Boolean = false,
    availableAccount: ConnectedAppAccount? = null,
    onAssignExisting: (agentId: String, accountId: String) -> Unit = { _, _ -> },
    onConnectApp: (agentId: String, service: String, requestId: String) -> Unit,
    onOpenAuthUrl: (String) -> Unit,
    onManageApps: (agentId: String) -> Unit,
    onSubmitCredential: (requestId: String, label: String, provider: String, baseUrl: String, token: String, valPath: String) -> Unit,
    onAction: (action: String, response: String?) -> Unit,
) {
    val s = LocalStitchPalette.current
    val agentName = teammate?.name?.ifBlank { "Teammate" } ?: "Teammate"

    // 1. INLINE APP CONNECTION CARD (exact parity with web UI cwAppConnectionHtml)
    val app = request.appConnection
    if (app != null) {
        val isConnected = liveConnected || request.status == "accepted" || request.response.equals("Connected", ignoreCase = true)
        val isDismissed = request.status == "dismissed"
        val context = LocalContext.current
        val media = LocalGituMediaContext.current
        val loader = media.imageLoader ?: remember(context) { ImageLoader(context) }

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            StitchCharacterAvatar(
                label = agentName,
                accentHex = teammate?.avatar?.color,
                shapeName = teammate?.avatar?.shape,
                size = 26.dp,
            )
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 18.dp))
                    .background(s.surfaceContainerLowest)
                    .border(1.dp, s.outlineVariant, RoundedCornerShape(topStart = 4.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 18.dp))
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "$agentName • Suggested app",
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                        color = s.onSurfaceVariant,
                    )
                    if (request.createdAt.isNotBlank()) {
                        Text(
                            text = formatShortTime(request.createdAt),
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                            color = s.onSurfaceVariant,
                        )
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(s.surfaceContainerLow)
                            .border(1.dp, s.outlineVariant, RoundedCornerShape(10.dp)),
                        contentAlignment = Alignment.Center,
                    ) {
                        val logo = app.logo?.takeIf { it.startsWith("https://") }
                        if (logo != null) {
                            SubcomposeAsyncImage(
                                model = ImageRequest.Builder(context).data(logo).crossfade(true).build(),
                                imageLoader = loader,
                                contentDescription = app.name,
                                contentScale = ContentScale.Fit,
                                modifier = Modifier.size(22.dp),
                                error = {
                                    Icon(Icons.Default.Extension, contentDescription = null, tint = s.primary, modifier = Modifier.size(18.dp))
                                },
                            )
                        } else {
                            Icon(
                                imageVector = if (app.service == "mail") Icons.Default.Email else Icons.Default.Extension,
                                contentDescription = null,
                                tint = s.primary,
                                modifier = Modifier.size(18.dp),
                            )
                        }
                    }
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                        Text(
                            text = app.name.ifBlank { app.service.replaceFirstChar { it.uppercase() } },
                            style = MaterialTheme.typography.labelLarge.copy(fontSize = 13.5.sp),
                            color = s.onSurface,
                        )
                        Text(
                            text = "For $agentName only",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                            color = s.onSurfaceVariant,
                        )
                    }
                }

                val reason = app.reason.ifBlank { request.detail }
                if (reason.isNotBlank()) {
                    Text(text = reason, style = MaterialTheme.typography.bodySmall, color = s.onSurface)
                }

                when {
                    isConnected -> {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(5.dp),
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(s.successContainer)
                                .padding(horizontal = 10.dp, vertical = 4.dp),
                        ) {
                            Icon(Icons.Default.Check, contentDescription = null, tint = s.onSuccessContainer, modifier = Modifier.size(14.dp))
                            Text("Connected", style = MaterialTheme.typography.labelSmall, color = s.onSuccessContainer)
                        }
                    }
                    isDismissed -> {
                        Text("Skipped", style = MaterialTheme.typography.labelSmall, color = s.onSurfaceVariant)
                    }
                    else -> {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            if (!authLink.isNullOrBlank()) {
                                StitchPrimaryButton(
                                    text = "Continue sign-in",
                                    icon = Icons.Default.OpenInNew,
                                    onClick = { onOpenAuthUrl(authLink) },
                                )
                            } else if (availableAccount != null) {
                                StitchPrimaryButton(
                                    text = "Assign ${availableAccount.label?.take(12) ?: "account"}",
                                    icon = Icons.Default.Check,
                                    onClick = { onAssignExisting(request.agentId, availableAccount.id) },
                                )
                                StitchSecondaryButton(
                                    text = "New account",
                                    outlined = true,
                                    onClick = { onConnectApp(request.agentId, app.service, request.id) },
                                )
                            } else {
                                StitchPrimaryButton(
                                    text = "Connect",
                                    icon = Icons.Default.Link,
                                    onClick = { onConnectApp(request.agentId, app.service, request.id) },
                                )
                            }
                            StitchSecondaryButton(
                                text = "Use existing",
                                outlined = true,
                                onClick = { onManageApps(request.agentId) },
                            )
                            TextButton(onClick = { onAction("dismiss", null) }) {
                                Text("Skip", color = s.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
                            }
                        }
                    }
                }
            }
        }
        return
    }

    // 2. INLINE SECURE CREDENTIAL CARD (API key / Bearer connection request)
    if (request.kind == "credential") {
        val cred = request.credential
        val settled = request.status != "open" && request.status != "pending"
        var label by remember(request.id) { mutableStateOf(cred?.label ?: cred?.providerHint?.replaceFirstChar { it.uppercase() } ?: request.title.ifBlank { "API Connection" }) }
        var baseUrl by remember(request.id) { mutableStateOf(cred?.baseUrl ?: "https://") }
        var token by remember(request.id) { mutableStateOf("") }

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            StitchCharacterAvatar(
                label = agentName,
                accentHex = teammate?.avatar?.color,
                shapeName = teammate?.avatar?.shape,
                size = 26.dp,
            )
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 18.dp))
                    .background(s.surfaceContainerLowest)
                    .border(1.dp, s.outlineVariant, RoundedCornerShape(topStart = 4.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 18.dp))
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Default.Key, contentDescription = null, tint = s.primary, modifier = Modifier.size(16.dp))
                    Text(request.title.ifBlank { "Connect ${cred?.providerHint ?: "service"}" }, style = MaterialTheme.typography.labelLarge, color = s.onSurface)
                }
                if (request.detail.isNotBlank()) {
                    Text(request.detail, style = MaterialTheme.typography.bodySmall, color = s.onSurfaceVariant)
                }
                if (settled) {
                    StitchBadge(
                        text = request.status.replaceFirstChar { it.uppercase() },
                        tone = if (request.status == "provided" || request.status == "accepted") BadgeTone.SUCCESS else BadgeTone.NEUTRAL,
                    )
                } else {
                    StitchInputField(value = label, onValueChange = { label = it }, label = "Connection label")
                    StitchInputField(value = baseUrl, onValueChange = { baseUrl = it }, label = "Base URL", mono = true)
                    StitchInputField(
                        value = token,
                        onValueChange = { token = it },
                        label = "API Key / Token",
                        placeholder = "Stored securely — never saved in chat",
                        mono = true,
                        visualTransformation = PasswordVisualTransformation(),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        StitchPrimaryButton(
                            text = "Save & Connect",
                            enabled = token.isNotBlank() && baseUrl.startsWith("http"),
                            onClick = {
                                onSubmitCredential(
                                    request.id,
                                    label,
                                    cred?.providerHint?.ifBlank { "custom" } ?: "custom",
                                    baseUrl,
                                    token,
                                    cred?.validationPath ?: "/",
                                )
                            },
                            modifier = Modifier.weight(1f),
                        )
                        StitchSecondaryButton(
                            text = "Dismiss",
                            outlined = true,
                            onClick = { onAction("dismiss", null) },
                        )
                    }
                }
            }
        }
        return
    }

    // 3. PERMISSION / RECOMMENDATION / QUESTION INLINE CARD
    var answer by remember { mutableStateOf("") }
    StitchCard(
        modifier = Modifier.fillMaxWidth(),
        containerColor = s.surfaceContainerLow,
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.weight(1f)) {
                    Icon(Icons.Default.VerifiedUser, contentDescription = null, tint = s.tertiary, modifier = Modifier.size(16.dp))
                    Text(request.title.ifBlank { "Approval gate • ${request.kind}" }, style = MaterialTheme.typography.labelMedium, color = s.onSurface)
                }
                Text(
                    text = "Dismiss",
                    style = MaterialTheme.typography.labelSmall,
                    color = s.onSurfaceVariant,
                    modifier = Modifier.clickable { onAction("dismiss", null) },
                )
            }
            if (request.detail.isNotBlank()) {
                Text(request.detail, style = MaterialTheme.typography.bodySmall, color = s.onSurfaceVariant)
            }
            if (request.options.isNotEmpty()) {
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    request.options.forEach { opt ->
                        StitchThreadPill(label = opt, selected = opt == request.recommended) { onAction("answer", opt) }
                    }
                }
            }
            when (request.kind) {
                "permission" -> {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        StitchPrimaryButton(text = "Approve", onClick = { onAction("approve", null) }, modifier = Modifier.weight(1f))
                        StitchSecondaryButton(text = "Deny", onClick = { onAction("deny", null) }, outlined = true, modifier = Modifier.weight(1f))
                    }
                }
                "recommendation" -> {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        StitchPrimaryButton(text = "Accept", onClick = { onAction("accept", null) }, modifier = Modifier.weight(1f))
                        StitchSecondaryButton(text = "Dismiss", onClick = { onAction("dismiss", null) }, outlined = true, modifier = Modifier.weight(1f))
                    }
                }
                else -> {
                    StitchInputField(value = answer, onValueChange = { answer = it }, label = "Reply", placeholder = "Type answer")
                    StitchPrimaryButton(
                        text = "Send",
                        onClick = { onAction("answer", answer) },
                        enabled = answer.isNotBlank(),
                        modifier = Modifier.fillMaxWidth(),
                    )
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
    onSave: (String?, String, String, String, String, String, Boolean, Boolean, Boolean) -> Unit,
) {
    val s = LocalStitchPalette.current
    val initialSpec = remember(initial) {
        resolveOfficialCharacter(initial?.avatar?.shape, initial?.avatar?.color, initial?.name.orEmpty())
    }
    var name by remember { mutableStateOf(initial?.name.orEmpty()) }
    var tagline by remember { mutableStateOf(initial?.tagline.orEmpty()) }
    var prompt by remember { mutableStateOf(initial?.systemPrompt.orEmpty()) }
    var selectedShape by remember { mutableStateOf(initialSpec.shape) }
    var allowShell by remember { mutableStateOf(initial?.allowShell ?: false) }
    var allowWrites by remember { mutableStateOf(initial?.allowWrites ?: false) }
    var chief by remember { mutableStateOf(initial?.chiefOfStaff ?: false) }

    val selectedSpec = OFFICIAL_AI_CHARACTERS.firstOrNull { it.shape == selectedShape } ?: OFFICIAL_AI_CHARACTERS.first()

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = s.surfaceContainerLowest,
        title = { Text(if (initial == null) "New Teammate" else "Edit ${initial.name}", color = s.onSurface) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
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
                                    color = if (active) s.primary else s.outlineVariant,
                                    shape = RoundedCornerShape(14.dp),
                                )
                                .clickable { selectedShape = spec.shape }
                                .padding(horizontal = 8.dp, vertical = 6.dp),
                        ) {
                            StitchCharacterAvatar(
                                label = spec.displayName,
                                accentHex = spec.accentHex,
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
                        selectedSpec.accentHex,
                        selectedSpec.shape,
                        allowShell,
                        allowWrites,
                        chief,
                    )
                },
                enabled = name.isNotBlank() && prompt.isNotBlank(),
            ) { Text("Save", color = s.primary) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", color = s.onSurfaceVariant) } },
    )
}
