package dev.agentgitu.mobile.ui.screens

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.agentgitu.mobile.data.model.*
import dev.agentgitu.mobile.ui.components.*
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette
import dev.agentgitu.mobile.ui.viewmodel.AppUiState
import dev.agentgitu.mobile.ui.viewmodel.GituAppViewModel
import dev.agentgitu.mobile.ui.viewmodel.MainTab
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

private sealed interface CodingChatItem {
    val key: String

    data class UserBubble(
        override val key: String,
        val text: String,
        val time: String,
    ) : CodingChatItem

    data class AgentBubble(
        override val key: String,
        val text: String,
        val time: String,
        val filesChanged: List<String> = emptyList(),
        val verification: List<String> = emptyList(),
        val blockers: List<String> = emptyList(),
        val files: List<RunFile> = emptyList(),
        val badge: String? = null,
    ) : CodingChatItem

    data class SystemPill(
        override val key: String,
        val text: String,
    ) : CodingChatItem
}

/**
 * Coding Chat modeled directly after Cowork Chat:
 * Full-bleed scrolling conversational stream with FLOATING official AI character,
 * FLOATING frosted workspace pill & circular action buttons, collapsible reasoning
 * & tool activity pills, inline approval/plan/question gates, and FLOATING bottom composer.
 */
@Composable
fun AgentScreen(
    state: AppUiState,
    vm: GituAppViewModel,
) {
    val s = LocalStitchPalette.current
    var sidebarOpen by remember { mutableStateOf(false) }
    var codingMode by remember { mutableStateOf("agent") } // "agent" | "chat"
    var effort by remember { mutableStateOf("high") }
    var composer by remember { mutableStateOf("") }
    var showReasoning by remember { mutableStateOf(false) }
    var showActivity by remember { mutableStateOf(false) }
    var showCheckpoints by remember { mutableStateOf(false) }
    var showCreateProjectDialog by remember { mutableStateOf(false) }
    var showTagFolderDialog by remember { mutableStateOf(false) }
    var showModelPicker by remember { mutableStateOf(false) }

    // Isolate sessions & active run strictly to the currently selected project!
    val projectRuns = remember(state.runs, state.selectedProjectPath) {
        state.runs.filter { vm.isRunForProject(it, state.selectedProjectPath) }
    }
    val activeRun = state.activeRun?.takeIf { vm.isRunForProject(it, state.selectedProjectPath) }
    val selectedProject = state.projects.firstOrNull { it.path == state.selectedProjectPath }
    val codingTeammate = remember(state.teammates) {
        state.teammates.firstOrNull {
            it.name.equals("Forge", ignoreCase = true) ||
                it.tagline.contains("cod", ignoreCase = true) ||
                it.tagline.contains("eng", ignoreCase = true)
        }
    }
    val coderName = codingTeammate?.name ?: "Forge"
    val coderShape = codingTeammate?.avatar?.shape ?: "dot-hexa"
    val coderColor = codingTeammate?.avatar?.color ?: "#3fd68f"

    val reasoningText = remember(activeRun?.runId, state.activeRunEvents) {
        if (activeRun == null) "" else GituAppViewModel.extractReasoningText(state.activeRunEvents)
    }

    // Separate conversational bubbles from step/tool activity so Coding chat reads cleanly like Cowork
    val parsedStream = remember(activeRun, state.activeRunEvents) {
        buildCodingStream(activeRun, if (activeRun == null) emptyList() else state.activeRunEvents)
    }

    // Auto-select latest run ONLY for the current project (never another project's messages!)
    var userClearedRun by remember(state.selectedProjectPath) { mutableStateOf(false) }
    LaunchedEffect(state.selectedProjectPath, projectRuns, userClearedRun) {
        if (!userClearedRun && state.selectedRunId == null && projectRuns.isNotEmpty()) {
            vm.openRun(projectRuns.first().runId)
        }
    }

    val listState = rememberLazyListState()
    LaunchedEffect(activeRun?.runId, parsedStream.chatItems.size, parsedStream.activityEvents.size) {
        val lastIdx = listState.layoutInfo.totalItemsCount - 1
        if (lastIdx >= 0 && (parsedStream.chatItems.isNotEmpty() || activeRun != null)) {
            listState.animateScrollToItem(lastIdx)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(s.surface),
    ) {
        // 1. FULL-BLEED SCROLLABLE CODING CHAT STREAM
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                top = 130.dp,
                bottom = 108.dp,
                start = 12.dp,
                end = 12.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (state.offlineMode) {
                item(key = "offline_banner") {
                    StitchBanner("Offline — showing cached coding session.", isError = true)
                }
            }

            if (activeRun == null) {
                // Clean Cowork-style welcome bubble from the Coding character
                item(key = "welcome_chat") {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.Top,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        StitchCharacterAvatar(
                            label = coderName,
                            accentHex = coderColor,
                            shapeName = coderShape,
                            size = 26.dp,
                        )
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Text(coderName, style = MaterialTheme.typography.labelMedium, color = s.onSurface)
                                Text(
                                    text = "• ${if (codingMode == "chat") "Chat" else "Coding Agent"}",
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                                    color = s.onSurfaceVariant,
                                )
                            }
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 18.dp))
                                    .background(s.surfaceContainerLowest)
                                    .border(1.dp, s.outlineVariant, RoundedCornerShape(topStart = 4.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 18.dp))
                                    .padding(horizontal = 12.dp, vertical = 9.dp),
                                verticalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                Text(
                                    text = "Ready in ${selectedProject?.name ?: "your workspace"}. Tell me what to build, debug, or inspect — I'll handle edits, diffs, browser checks, and checkpoints right here.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = s.onSurface,
                                )
                            }
                        }
                    }
                }
            } else {
                // Conversational bubbles (User goals/follow-ups & Agent replies/report)
                items(parsedStream.chatItems, key = { it.key }) { item ->
                    when (item) {
                        is CodingChatItem.UserBubble -> {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                                Column(
                                    modifier = Modifier
                                        .widthIn(max = 290.dp)
                                        .clip(RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 4.dp))
                                        .background(s.primary)
                                        .padding(horizontal = 12.dp, vertical = 8.dp),
                                    verticalArrangement = Arrangement.spacedBy(2.dp),
                                ) {
                                    RichChatMessageContent(rawText = item.text, baseColor = s.onPrimary)
                                    if (item.time.isNotBlank()) {
                                        Text(
                                            text = item.time,
                                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp, lineHeight = 12.sp),
                                            color = s.onPrimary.copy(alpha = 0.72f),
                                            modifier = Modifier.align(Alignment.End),
                                        )
                                    }
                                }
                            }
                        }

                        is CodingChatItem.SystemPill -> {
                            val cleanSys = remember(item.text) { ChatMessageFilter.filterVisibleReply(item.text) }
                            if (cleanSys.isNotBlank()) {
                                Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(12.dp))
                                            .background(s.surfaceContainerLow)
                                            .border(1.dp, s.outlineVariant, RoundedCornerShape(12.dp))
                                            .padding(horizontal = 10.dp, vertical = 4.dp),
                                    ) {
                                        MarkdownTextContent(
                                            text = cleanSys.take(200),
                                            baseColor = s.onSurfaceVariant,
                                            fontSizeSp = 11.5f,
                                            lineHeightSp = 15f,
                                            onOpenRun = { runId -> vm.openRun(runId) },
                                        )
                                    }
                                }
                            }
                        }

                        is CodingChatItem.AgentBubble -> {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.Top,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                StitchCharacterAvatar(
                                    label = coderName,
                                    accentHex = coderColor,
                                    shapeName = coderShape,
                                    size = 26.dp,
                                )
                                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(5.dp),
                                    ) {
                                        Text(coderName, style = MaterialTheme.typography.labelMedium, color = s.onSurface)
                                        val badgeLabel = item.badge ?: activeRun.model?.substringAfterLast('/')?.take(14)
                                        if (!badgeLabel.isNullOrBlank()) {
                                            Text(
                                                text = "• $badgeLabel",
                                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                                                color = if (item.badge == "Verified") s.success else s.onSurfaceVariant,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis,
                                            )
                                        }
                                        Spacer(Modifier.weight(1f))
                                        activeRun.usage?.costUsd?.takeIf { item.badge == "Verified" }?.let { c ->
                                            Text("$${"%.2f".format(c)}", style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp), color = s.onSurfaceVariant)
                                        }
                                        if (item.time.isNotBlank()) {
                                            Text(item.time, style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp), color = s.onSurfaceVariant)
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
                                            rawText = item.text,
                                            baseColor = s.onSurface,
                                            onSendAction = { prompt ->
                                                if (activeRun.isRunning) {
                                                    vm.sendRunMessage(activeRun.runId, prompt)
                                                } else {
                                                    vm.startRun(
                                                        goal = prompt,
                                                        mode = codingMode,
                                                        provider = state.modelsCatalog.provider,
                                                        model = state.modelsCatalog.model,
                                                        effort = effort,
                                                    )
                                                }
                                            },
                                            onOpenRun = { runId -> vm.openRun(runId) },
                                        )

                                        if (item.filesChanged.isNotEmpty()) {
                                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                                Text(
                                                    text = "Changed files (${item.filesChanged.size})",
                                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                                                    color = s.onSurfaceVariant,
                                                )
                                                item.filesChanged.take(8).forEach { filePath ->
                                                    Row(
                                                        modifier = Modifier
                                                            .fillMaxWidth()
                                                            .clip(RoundedCornerShape(10.dp))
                                                            .background(s.surfaceContainerLow)
                                                            .border(1.dp, s.outlineVariant, RoundedCornerShape(10.dp))
                                                            .clickable { vm.openFilesExplorer() }
                                                            .padding(horizontal = 8.dp, vertical = 6.dp),
                                                        verticalAlignment = Alignment.CenterVertically,
                                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                                    ) {
                                                        Icon(Icons.Default.Description, contentDescription = null, tint = s.primary, modifier = Modifier.size(13.dp))
                                                        Text(
                                                            text = filePath,
                                                            style = MaterialTheme.typography.labelSmall.copy(fontFamily = FontFamily.Monospace, fontSize = 11.sp),
                                                            color = s.onSurface,
                                                            maxLines = 1,
                                                            overflow = TextOverflow.Ellipsis,
                                                            modifier = Modifier.weight(1f),
                                                        )
                                                    }
                                                }
                                            }
                                        }

                                        if (item.verification.isNotEmpty()) {
                                            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                                Text("Verification", style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp), color = s.onSurfaceVariant)
                                                item.verification.take(5).forEach { check ->
                                                    Row(
                                                        verticalAlignment = Alignment.CenterVertically,
                                                        horizontalArrangement = Arrangement.spacedBy(5.dp),
                                                    ) {
                                                        Icon(Icons.Default.CheckCircle, contentDescription = null, tint = s.success, modifier = Modifier.size(13.dp))
                                                        Text(check, style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp, lineHeight = 16.sp), color = s.onSurface)
                                                    }
                                                }
                                            }
                                        }

                                        if (item.blockers.isNotEmpty()) {
                                            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                                Text("Blockers", style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp), color = s.error)
                                                item.blockers.forEach { blocker ->
                                                    Text("• $blocker", style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp), color = s.onErrorContainer)
                                                }
                                            }
                                        }

                                        if (item.files.isNotEmpty()) {
                                            item.files.forEach { rf ->
                                                Row(
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .clip(RoundedCornerShape(12.dp))
                                                        .background(s.surfaceContainerLow)
                                                        .border(1.dp, s.outlineVariant, RoundedCornerShape(12.dp))
                                                        .clickable { vm.openFilesExplorer() }
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
                                                        text = rf.name,
                                                        style = MaterialTheme.typography.labelMedium,
                                                        color = s.onSurface,
                                                        maxLines = 1,
                                                        overflow = TextOverflow.Ellipsis,
                                                        modifier = Modifier.weight(1f),
                                                    )
                                                    Text("Files", style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp), color = s.onSurfaceVariant)
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Compact Expandable Reasoning & Tool Activity Pills (keeps chat clean like Cowork)
                if (reasoningText.isNotBlank() || parsedStream.activityEvents.isNotEmpty()) {
                    item(key = "activity_pills") {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                if (reasoningText.isNotBlank()) {
                                    Row(
                                        modifier = Modifier
                                            .clip(CircleShape)
                                            .background(s.surfaceContainerLow)
                                            .border(1.dp, s.outlineVariant, CircleShape)
                                            .clickable { showReasoning = !showReasoning }
                                            .padding(horizontal = 12.dp, vertical = 6.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        Icon(Icons.Default.Psychology, contentDescription = null, tint = s.primary, modifier = Modifier.size(14.dp))
                                        Text("Reasoned • ${reasoningText.length} chars", style = MaterialTheme.typography.labelSmall, color = s.onSurfaceVariant)
                                        Icon(
                                            if (showReasoning) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                                            contentDescription = null,
                                            tint = s.onSurfaceVariant,
                                            modifier = Modifier.size(14.dp),
                                        )
                                    }
                                }

                                if (parsedStream.activityEvents.isNotEmpty()) {
                                    Row(
                                        modifier = Modifier
                                            .clip(CircleShape)
                                            .background(s.surfaceContainerLow)
                                            .border(1.dp, s.outlineVariant, CircleShape)
                                            .clickable { showActivity = !showActivity }
                                            .padding(horizontal = 12.dp, vertical = 6.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        Icon(Icons.Default.Terminal, contentDescription = null, tint = s.primary, modifier = Modifier.size(14.dp))
                                        Text("Steps • ${parsedStream.activityEvents.size}", style = MaterialTheme.typography.labelSmall, color = s.onSurfaceVariant)
                                        Icon(
                                            if (showActivity) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                                            contentDescription = null,
                                            tint = s.onSurfaceVariant,
                                            modifier = Modifier.size(14.dp),
                                        )
                                    }
                                }

                                if (state.activeCheckpoints.isNotEmpty() || activeRun.status == "completed") {
                                    Row(
                                        modifier = Modifier
                                            .clip(CircleShape)
                                            .background(s.surfaceContainerLow)
                                            .border(1.dp, s.outlineVariant, CircleShape)
                                            .clickable {
                                                vm.loadCheckpoints(activeRun.runId)
                                                showCheckpoints = true
                                            }
                                            .padding(horizontal = 12.dp, vertical = 6.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        Icon(Icons.Default.History, contentDescription = null, tint = s.onSurfaceVariant, modifier = Modifier.size(14.dp))
                                        Text("Checkpoints (${state.activeCheckpoints.size})", style = MaterialTheme.typography.labelSmall, color = s.onSurfaceVariant)
                                    }
                                }
                            }

                            if (showReasoning && reasoningText.isNotBlank()) {
                                StitchCard(modifier = Modifier.fillMaxWidth(), containerColor = s.surfaceContainerLow) {
                                    Text(
                                        text = reasoningText,
                                        style = MaterialTheme.typography.labelSmall.copy(fontFamily = FontFamily.Monospace),
                                        color = s.onSurfaceVariant,
                                        modifier = Modifier.padding(12.dp),
                                    )
                                }
                            }

                            if (showActivity && parsedStream.activityEvents.isNotEmpty()) {
                                StitchCard(modifier = Modifier.fillMaxWidth(), containerColor = s.surfaceContainerLow) {
                                    Column(
                                        modifier = Modifier.padding(12.dp),
                                        verticalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        parsedStream.activityEvents.takeLast(40).forEach { ev ->
                                            Row(
                                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                                verticalAlignment = Alignment.Top,
                                            ) {
                                                Text(
                                                    text = ev.t.ifBlank { "step" },
                                                    style = MaterialTheme.typography.labelSmall.copy(fontFamily = FontFamily.Monospace),
                                                    color = s.primary,
                                                    maxLines = 1,
                                                )
                                                Text(
                                                    text = ev.text.take(220),
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = s.onSurfaceVariant,
                                                    modifier = Modifier.weight(1f),
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Inline Pending Approvals (same clean gate feel as Cowork)
                if (activeRun.pendingApprovals.isNotEmpty()) {
                    items(activeRun.pendingApprovals, key = { "appr_${it.id}" }) { approval ->
                        StitchCard(modifier = Modifier.fillMaxWidth(), containerColor = s.surfaceContainerLow) {
                            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Icon(Icons.Default.VerifiedUser, contentDescription = null, tint = s.tertiary, modifier = Modifier.size(18.dp))
                                    Text("Approval gate • ${approval.tool}", style = MaterialTheme.typography.labelMedium, color = s.onSurface)
                                }
                                if (approval.summary.isNotBlank()) Text(approval.summary, style = MaterialTheme.typography.bodySmall, color = s.onSurface)
                                if (approval.why.isNotBlank()) Text(approval.why, style = MaterialTheme.typography.bodySmall, color = s.onSurfaceVariant)
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    StitchPrimaryButton(text = "Approve", onClick = { vm.resolveApproval(approval.id, true) }, modifier = Modifier.weight(1f))
                                    StitchSecondaryButton(text = "Deny", onClick = { vm.resolveApproval(approval.id, false) }, danger = true, modifier = Modifier.weight(1f))
                                }
                            }
                        }
                    }
                }

                // Inline Pending Plan Review
                activeRun.pendingPlanReview?.let { review ->
                    item(key = "plan_${review.id}") {
                        var note by remember { mutableStateOf("") }
                        StitchCard(modifier = Modifier.fillMaxWidth(), containerColor = s.surfaceContainerLow) {
                            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text("Plan review", style = MaterialTheme.typography.titleMedium, color = s.onSurface)
                                review.criteria.forEach { Text("• $it", style = MaterialTheme.typography.bodySmall, color = s.onSurface) }
                                review.steps.forEachIndexed { idx, step ->
                                    Text("${idx + 1}. ${step.description}", style = MaterialTheme.typography.bodySmall, color = s.onSurface)
                                }
                                StitchInputField(value = note, onValueChange = { note = it }, label = "Review note", placeholder = "Optional feedback")
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    StitchPrimaryButton(text = "Approve plan", onClick = { vm.resolvePlanReview(review.id, true, note) }, modifier = Modifier.weight(1f))
                                    StitchSecondaryButton(text = "Revise", onClick = { vm.resolvePlanReview(review.id, false, note) }, outlined = true, modifier = Modifier.weight(1f))
                                }
                            }
                        }
                    }
                }

                // Inline Pending Clarification Questions
                activeRun.pendingQuestions?.let { pq ->
                    item(key = "q_${pq.id}") {
                        var ans by remember { mutableStateOf("") }
                        StitchCard(modifier = Modifier.fillMaxWidth(), containerColor = s.surfaceContainerLow) {
                            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text("Clarification needed", style = MaterialTheme.typography.titleMedium, color = s.onSurface)
                                pq.questions.forEach { q ->
                                    Text(q.question, style = MaterialTheme.typography.bodyMedium, color = s.onSurface)
                                    if (q.options.isNotEmpty()) {
                                        Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            q.options.forEach { opt ->
                                                StitchSecondaryButton(text = opt, onClick = { vm.submitAnswer(pq.id, opt) }, outlined = true)
                                            }
                                        }
                                    }
                                }
                                StitchInputField(value = ans, onValueChange = { ans = it }, label = "Answer", placeholder = "Type reply")
                                StitchPrimaryButton(text = "Submit", onClick = { vm.submitAnswer(pq.id, ans) }, enabled = ans.isNotBlank(), modifier = Modifier.fillMaxWidth())
                            }
                        }
                    }
                }

                // Inline Pending Connection Card (when coding agent requests an API/app connection)
                activeRun.pendingConnection?.let { pc ->
                    item(key = "conn_${pc.id}") {
                        val req = pc.requirement
                        var label by remember(pc.id) { mutableStateOf(req?.label?.ifBlank { req.providerHint } ?: "Service Connection") }
                        var baseUrl by remember(pc.id) { mutableStateOf(req?.baseUrl ?: "https://") }
                        var token by remember(pc.id) { mutableStateOf("") }
                        StitchCard(modifier = Modifier.fillMaxWidth(), containerColor = s.surfaceContainerLow) {
                            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Icon(Icons.Default.Link, contentDescription = null, tint = s.primary, modifier = Modifier.size(16.dp))
                                    Text(
                                        text = "Connect ${req?.label?.ifBlank { req.providerHint } ?: "service"}",
                                        style = MaterialTheme.typography.labelLarge,
                                        color = s.onSurface,
                                    )
                                }
                                if (!req?.reason.isNullOrBlank()) {
                                    Text(req!!.reason, style = MaterialTheme.typography.bodySmall, color = s.onSurfaceVariant)
                                }
                                StitchInputField(value = label, onValueChange = { label = it }, label = "Label")
                                StitchInputField(value = baseUrl, onValueChange = { baseUrl = it }, label = "Base URL", mono = true)
                                StitchInputField(
                                    value = token,
                                    onValueChange = { token = it },
                                    label = "API Key / Token",
                                    placeholder = "Stored securely — never saved in chat",
                                    mono = true,
                                    visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(),
                                )
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    StitchPrimaryButton(
                                        text = "Save & Connect",
                                        enabled = token.isNotBlank() && baseUrl.startsWith("http"),
                                        onClick = {
                                            vm.saveCustomConnection(
                                                label = label,
                                                provider = req?.providerHint?.ifBlank { "custom" } ?: "custom",
                                                baseUrl = baseUrl,
                                                token = token,
                                                validationPath = req?.validationPath ?: "/",
                                            )
                                        },
                                        modifier = Modifier.weight(1f),
                                    )
                                    StitchSecondaryButton(
                                        text = "Apps",
                                        outlined = true,
                                        onClick = { vm.openConnections() },
                                    )
                                }
                            }
                        }
                    }
                }

                // Live Working Indicator (rich animated plush character + active tool/app scanner)
                if (activeRun.isRunning) {
                    item(key = "working_row") {
                        val lastEv = parsedStream.activityEvents.lastOrNull()
                        val inferredProgress = remember(lastEv, activeRun.project, selectedProject?.name) {
                            val rawText = lastEv?.text?.trim().orEmpty()
                            val rawType = lastEv?.typed?.get("type")?.jsonPrimitive?.contentOrNull
                                ?: lastEv?.t.orEmpty()
                            val toolName = when {
                                rawType.contains("command", ignoreCase = true) || rawType.contains("shell", ignoreCase = true) -> "run_command"
                                rawType.contains("test", ignoreCase = true) -> "run_command"
                                rawType.contains("edit", ignoreCase = true) || rawType.contains("file_changed", ignoreCase = true) -> "apply_edit"
                                rawType.contains("read", ignoreCase = true) -> "read_file"
                                rawType.contains("browse", ignoreCase = true) || rawText.contains("http", ignoreCase = true) -> "browse"
                                else -> "gitu_task"
                            }
                            TeamProgress(
                                agentName = coderName,
                                text = rawText.ifBlank { "Working in ${activeRun.project ?: selectedProject?.name ?: "workspace"}…" },
                                detail = rawText.take(100),
                                tool = toolName,
                                phase = "working",
                            )
                        }
                        RichWorkingIndicator(
                            agentName = coderName,
                            accentHex = coderColor,
                            shapeName = coderShape,
                            progress = inferredProgress,
                            onClick = { showActivity = true },
                        )
                    }
                }

                // Error banner if run failed
                activeRun.error?.takeIf { it.isNotBlank() }?.let { err ->
                    item(key = "run_error") {
                        StitchBanner(text = err, isError = true)
                    }
                }
            }
        }

        // 2. FLOATING TOP OVERLAY: Compact Scrim + Floating AI Character + Floating Action Buttons
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
                // Floating Sidebar Menu Button (left)
                Box(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(top = 4.dp)
                        .shadow(6.dp, CircleShape),
                ) {
                    StitchCircleIconButton(
                        icon = Icons.Default.Menu,
                        contentDescription = "Sessions & workspace",
                        outlined = true,
                        size = 36.dp,
                        onClick = { sidebarOpen = true },
                    )
                }

                // Floating Official Coding Character + Compact Frosted Project/Status Pill (center)
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(3.dp),
                    modifier = Modifier.align(Alignment.TopCenter),
                ) {
                    StitchCharacterAvatar(
                        label = coderName,
                        accentHex = coderColor,
                        shapeName = coderShape,
                        size = 44.dp,
                        floating = true,
                        working = activeRun?.isRunning == true,
                        statusDotColor = if (activeRun?.isRunning == true) s.primary else s.success,
                    )

                    Surface(
                        shape = CircleShape,
                        color = s.surfaceContainerLowest.copy(alpha = 0.90f),
                        border = BorderStroke(1.dp, s.outlineVariant),
                        shadowElevation = 3.dp,
                        modifier = Modifier.clickable { sidebarOpen = true },
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(5.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(6.dp)
                                    .clip(CircleShape)
                                    .background(if (activeRun?.isRunning == true) s.primary else s.success),
                            )
                            Text(
                                text = selectedProject?.name ?: activeRun?.project ?: coderName,
                                style = MaterialTheme.typography.labelMedium,
                                color = s.onSurface,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            val subtitle = if (activeRun?.isRunning == true) {
                                "• working"
                            } else {
                                state.gitStatus?.branch?.ifBlank { activeRun?.branch } ?: activeRun?.branch
                            }
                            if (!subtitle.isNullOrBlank()) {
                                Text(
                                    text = if (subtitle.startsWith("•")) subtitle else "• $subtitle",
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                                    color = s.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }

                // Floating Action Buttons (right: Stop, Files/Diff, Browser)
                Row(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(top = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    if (activeRun?.isRunning == true) {
                        Box(modifier = Modifier.shadow(6.dp, CircleShape)) {
                            StitchCircleIconButton(
                                icon = Icons.Default.Stop,
                                contentDescription = "Stop run",
                                danger = true,
                                size = 36.dp,
                                onClick = { vm.stopRun(activeRun.runId) },
                            )
                        }
                    }
                    Box(modifier = Modifier.shadow(6.dp, CircleShape)) {
                        StitchCircleIconButton(
                            icon = Icons.Default.FolderOpen,
                            contentDescription = "Files & diff",
                            outlined = true,
                            size = 36.dp,
                            onClick = { vm.openFilesExplorer() },
                        )
                    }
                    Box(modifier = Modifier.shadow(6.dp, CircleShape)) {
                        StitchCircleIconButton(
                            icon = Icons.Default.Call,
                            contentDescription = "Voice call",
                            primary = true,
                            size = 36.dp,
                            onClick = { vm.startCodingVoiceCall() },
                        )
                    }
                    Box(modifier = Modifier.shadow(6.dp, CircleShape)) {
                        StitchCircleIconButton(
                            icon = Icons.Default.Language,
                            contentDescription = "Agent browser",
                            outlined = true,
                            size = 36.dp,
                            onClick = { vm.openServerBrowser() },
                        )
                    }
                }
            }

            // Floating Mode & Quick Context Pills (just like Cowork's floating thread pills)
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CodingFloatingPill(
                    label = "Agent",
                    selected = codingMode == "agent",
                    onClick = { codingMode = "agent" },
                )
                CodingFloatingPill(
                    label = "Chat",
                    selected = codingMode == "chat",
                    onClick = { codingMode = "chat" },
                )
                state.gitStatus?.takeIf { it.isRepo }?.let { git ->
                    val changes = git.changed.size + git.modified.size + git.untracked.size
                    CodingFloatingPill(
                        label = if (git.clean) "git clean" else "$changes changed",
                        selected = false,
                        onClick = { vm.openFilesExplorer() },
                    )
                }
                if (activeRun != null) {
                    CodingFloatingPill(
                        label = "+ New",
                        selected = false,
                        onClick = {
                            userClearedRun = true
                            vm.closeRun()
                        },
                    )
                }
            }
        }

        // 3. FLOATING BOTTOM COMPOSER OVERLAY (matching Cowork Chat)
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
                .imePadding()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // 1-tap AI Model Switcher Pill
                Surface(
                    shape = CircleShape,
                    color = s.surfaceContainerLowest.copy(alpha = 0.92f),
                    border = BorderStroke(1.dp, s.outlineVariant),
                    shadowElevation = 2.dp,
                    modifier = Modifier.clickable {
                        vm.refreshModels()
                        showModelPicker = true
                    },
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 3.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = s.primary, modifier = Modifier.size(12.dp))
                        Text(
                            text = state.modelsCatalog.effectiveModel?.substringAfterLast('/')?.take(18) ?: "Model",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                            color = s.onSurface,
                        )
                        Icon(Icons.Default.ExpandMore, contentDescription = null, tint = s.onSurfaceVariant, modifier = Modifier.size(12.dp))
                    }
                }
                // Effort toggle pill
                Surface(
                    shape = CircleShape,
                    color = s.surfaceContainerLowest.copy(alpha = 0.92f),
                    border = BorderStroke(1.dp, s.outlineVariant),
                    shadowElevation = 2.dp,
                    modifier = Modifier.clickable {
                        effort = when (effort) {
                            "low" -> "medium"
                            "medium" -> "high"
                            else -> "low"
                        }
                    },
                ) {
                    Text(
                        text = effort.replaceFirstChar { it.uppercase() },
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                        color = s.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 3.dp),
                    )
                }
                Surface(
                    shape = CircleShape,
                    color = s.surfaceContainerLowest.copy(alpha = 0.92f),
                    border = BorderStroke(1.dp, s.outlineVariant),
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
                    border = BorderStroke(1.dp, s.outlineVariant),
                    shadowElevation = 2.dp,
                    modifier = Modifier.clickable { vm.startCodingVoiceCall() },
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
                Surface(
                    shape = CircleShape,
                    color = s.surfaceContainerLowest.copy(alpha = 0.92f),
                    border = BorderStroke(1.dp, s.outlineVariant),
                    shadowElevation = 2.dp,
                    modifier = Modifier.clickable { sidebarOpen = true },
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 3.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(Icons.Default.History, contentDescription = null, tint = s.onSurface, modifier = Modifier.size(13.dp))
                        Text("Sessions (${projectRuns.size})", style = MaterialTheme.typography.labelMedium.copy(fontSize = 11.sp), color = s.onSurface)
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Surface(
                    shape = CircleShape,
                    color = s.surfaceContainerLowest.copy(alpha = 0.95f),
                    border = BorderStroke(1.dp, s.outlineVariant),
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
                                text = if (activeRun?.isRunning == true) "Steer run or follow up…" else "What should we build or fix?",
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
                // Dynamic Send ↔ Stop button: Stop while working & empty, Send as soon as user starts typing!
                val showStop = activeRun?.isRunning == true && composer.isBlank()
                Box(modifier = Modifier.shadow(6.dp, CircleShape)) {
                    StitchCircleIconButton(
                        icon = if (showStop) Icons.Default.Stop else Icons.Default.ArrowUpward,
                        contentDescription = if (showStop) "Stop run" else "Send",
                        primary = !showStop && composer.isNotBlank(),
                        outlined = !showStop && composer.isBlank(),
                        danger = showStop,
                        size = 38.dp,
                        onClick = {
                            if (showStop && activeRun != null) {
                                vm.stopRun(activeRun.runId)
                            } else {
                                val text = composer.trim()
                                if (text.isNotEmpty()) {
                                    userClearedRun = false
                                    if (activeRun != null && activeRun.isRunning) {
                                        vm.sendRunMessage(activeRun.runId, text)
                                    } else {
                                        vm.startRun(
                                            goal = text,
                                            mode = codingMode,
                                            provider = state.modelsCatalog.effectiveProvider,
                                            model = state.modelsCatalog.effectiveModel,
                                            effort = effort,
                                        )
                                    }
                                    composer = ""
                                }
                            }
                        },
                    )
                }
            }
        }

        // 4. SLIDE-OVER SESSIONS & WORKSPACE SIDEBAR DRAWER
        if (sidebarOpen) {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .statusBarsPadding(),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxHeight()
                        .fillMaxWidth(0.82f)
                        .background(s.surfaceContainerLowest)
                        .border(1.dp, s.outlineVariant)
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            StitchCharacterAvatar(
                                label = coderName,
                                accentHex = coderColor,
                                shapeName = coderShape,
                                size = 38.dp,
                            )
                            Text("Coding workspace", style = MaterialTheme.typography.headlineSmall, color = s.onSurface)
                        }
                        StitchCircleIconButton(icon = Icons.Default.Close, contentDescription = "Close", onClick = { sidebarOpen = false }, size = 36.dp)
                    }

                    // Workspace Features 2x2 Grid (Files / Git diff / Browser / Cron)
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            SidebarTile(Icons.Default.FolderOpen, "Files", Modifier.weight(1f)) {
                                sidebarOpen = false
                                vm.openFilesExplorer()
                            }
                            SidebarTile(Icons.Default.Commit, "Git diff", Modifier.weight(1f)) {
                                sidebarOpen = false
                                vm.openFilesExplorer()
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            SidebarTile(Icons.Default.Language, "Browser", Modifier.weight(1f)) {
                                sidebarOpen = false
                                vm.openServerBrowser()
                            }
                            SidebarTile(Icons.Default.Schedule, "Cron", Modifier.weight(1f)) {
                                sidebarOpen = false
                                vm.selectTab(MainTab.SETTINGS)
                            }
                        }
                    }

                    // Projects selector + Create Project
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("Projects (${state.projects.size})", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                        Text(
                            text = "+ Create project",
                            style = MaterialTheme.typography.labelMedium,
                            color = s.primary,
                            modifier = Modifier.clickable {
                                sidebarOpen = false
                                showCreateProjectDialog = true
                            },
                        )
                    }
                    if (state.projects.isNotEmpty()) {
                        Row(
                            modifier = Modifier.horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            state.projects.forEach { proj ->
                                val sel = proj.path == state.selectedProjectPath
                                Box(
                                    modifier = Modifier
                                        .clip(CircleShape)
                                        .background(if (sel) s.primary else s.surfaceContainerLow)
                                        .clickable { vm.selectProject(proj.path) }
                                        .padding(horizontal = 10.dp, vertical = 5.dp),
                                ) {
                                    Text(proj.name, style = MaterialTheme.typography.labelSmall, color = if (sel) s.onPrimary else s.onSurface)
                                }
                            }
                        }
                    }

                    // Sessions List (scoped strictly to the selected project)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("Sessions (${projectRuns.size})", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                        Text(
                            text = "+ New",
                            style = MaterialTheme.typography.labelMedium,
                            color = s.primary,
                            modifier = Modifier.clickable {
                                userClearedRun = true
                                vm.closeRun()
                                sidebarOpen = false
                            },
                        )
                    }

                    if (projectRuns.isEmpty()) {
                        Text(
                            text = "No sessions in this project yet.",
                            style = MaterialTheme.typography.bodySmall,
                            color = s.onSurfaceVariant,
                        )
                    } else {
                        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(projectRuns, key = { "sb_${it.runId}" }) { run ->
                            val isSel = run.runId == activeRun?.runId
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(if (isSel) s.secondaryContainer else s.surfaceContainerLow)
                                    .clickable {
                                        userClearedRun = false
                                        vm.openRun(run.runId)
                                        sidebarOpen = false
                                    }
                                    .padding(10.dp),
                                verticalArrangement = Arrangement.spacedBy(2.dp),
                            ) {
                                Text(
                                    text = run.goal.ifBlank { "Untitled session" },
                                    style = MaterialTheme.typography.labelMedium,
                                    color = if (isSel) s.onSecondaryContainer else s.onSurface,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    text = "${run.status.replaceFirstChar { it.uppercase() }} • ${run.project ?: "workspace"}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = s.onSurfaceVariant,
                                    maxLines = 1,
                                )
                            }
                        }
                    }
                    }
                }
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .background(Color.Black.copy(alpha = 0.45f))
                        .clickable { sidebarOpen = false },
                )
            }
        }
    }

    if (showCheckpoints && activeRun != null) {
        AlertDialog(
            onDismissRequest = { showCheckpoints = false },
            containerColor = s.surfaceContainerLowest,
            title = { Text("Git Checkpoints", color = s.onSurface) },
            text = {
                if (state.activeCheckpoints.isEmpty()) {
                    Text("No checkpoints recorded for this run yet.", color = s.onSurfaceVariant)
                } else {
                    Column(
                        modifier = Modifier.verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        state.activeCheckpoints.forEach { cp ->
                            StitchCard(modifier = Modifier.fillMaxWidth(), containerColor = s.surfaceContainerLow) {
                                Row(
                                    modifier = Modifier.padding(10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(cp.label.ifBlank { cp.id }, style = MaterialTheme.typography.titleSmall, color = s.onSurface)
                                        Text(cp.ref.ifBlank { cp.createdAt }, style = MaterialTheme.typography.labelSmall, color = s.onSurfaceVariant)
                                    }
                                    TextButton(onClick = {
                                        vm.restoreCheckpoint(activeRun.runId, cp.id)
                                        showCheckpoints = false
                                    }) { Text("Restore", color = s.primary) }
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showCheckpoints = false }) { Text("Close", color = s.onSurfaceVariant) } },
        )
    }

    if (showCreateProjectDialog) {
        var projName by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showCreateProjectDialog = false },
            containerColor = s.surfaceContainerLowest,
            title = { Text("Create project", color = s.onSurface) },
            text = {
                StitchInputField(
                    value = projName,
                    onValueChange = { projName = it },
                    label = "Project name",
                    placeholder = "my-mobile-app",
                    mono = true,
                )
            },
            confirmButton = {
                TextButton(
                    enabled = projName.isNotBlank(),
                    onClick = {
                        vm.createProject(projName)
                        showCreateProjectDialog = false
                    },
                ) { Text("Create", color = s.primary) }
            },
            dismissButton = { TextButton(onClick = { showCreateProjectDialog = false }) { Text("Cancel", color = s.onSurfaceVariant) } },
        )
    }

    if (showTagFolderDialog) {
        var folderInput by remember { mutableStateOf(state.selectedProjectPath) }
        AlertDialog(
            onDismissRequest = { showTagFolderDialog = false },
            containerColor = s.surfaceContainerLowest,
            title = { Text("Tag folder in prompt", color = s.onSurface) },
            text = {
                Column(
                    modifier = Modifier.verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    state.projects.forEach { proj ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (folderInput == proj.path) s.secondaryContainer else s.surfaceContainerLow)
                                .clickable { folderInput = proj.path }
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
                    StitchInputField(
                        value = folderInput,
                        onValueChange = { folderInput = it },
                        label = "Folder path",
                        placeholder = "apps/android-native",
                        mono = true,
                    )
                }
            },
            confirmButton = {
                TextButton(
                    enabled = folderInput.isNotBlank(),
                    onClick = {
                        val tag = " [folder: ${folderInput.trim()}] "
                        composer = if (composer.isBlank()) tag.trimStart() else "$composer$tag"
                        showTagFolderDialog = false
                    },
                ) { Text("Insert tag", color = s.primary) }
            },
            dismissButton = { TextButton(onClick = { showTagFolderDialog = false }) { Text("Cancel", color = s.onSurfaceVariant) } },
        )
    }

    if (showModelPicker) {
        ModelPickerDialog(
            title = "Switch AI Model",
            catalog = state.modelsCatalog,
            currentProvider = state.modelsCatalog.effectiveProvider,
            currentModel = state.modelsCatalog.effectiveModel,
            onRefresh = { vm.refreshModels(forceRefresh = true) },
            onSelect = { provider, model -> vm.selectWorkspaceModel(provider, model) },
            onDismiss = { showModelPicker = false },
        )
    }
}

private data class ParsedCodingStream(
    val chatItems: List<CodingChatItem>,
    val activityEvents: List<RunEvent>,
)

private fun buildCodingStream(run: Run?, events: List<RunEvent>): ParsedCodingStream {
    if (run == null) return ParsedCodingStream(emptyList(), emptyList())
    val chat = mutableListOf<CodingChatItem>()
    val activity = mutableListOf<RunEvent>()

    if (run.goal.isNotBlank()) {
        chat.add(
            CodingChatItem.UserBubble(
                key = "goal_${run.runId}",
                text = run.goal,
                time = formatShortTime(run.startedAt),
            ),
        )
    }

    for (ev in events) {
        val text = ev.text.trim()
        if (text.isEmpty()) continue
        val typedType = ev.typed?.get("type")?.jsonPrimitive?.contentOrNull?.lowercase().orEmpty()
        val rawKind = ev.t.trim().lowercase()

        when {
            typedType == "reasoning" || typedType == "thought_summary" || rawKind == "reasoning" || rawKind == "thought" -> {
                // Already collected into the expandable "Reasoned" pill
            }
            rawKind == "user" || rawKind == "user_message" || rawKind == "steer" || typedType == "user_message" -> {
                if (text != run.goal.trim()) {
                    chat.add(CodingChatItem.UserBubble(key = "u_${ev.i}", text = text, time = ""))
                }
            }
            rawKind == "assistant" || rawKind == "message" || rawKind == "reply" || rawKind == "text" ||
                rawKind == "final" || rawKind == "answer" || rawKind == "chat" ||
                typedType == "assistant_message" || typedType == "message" || typedType == "chat_reply" -> {
                chat.add(CodingChatItem.AgentBubble(key = "a_${ev.i}", text = text, time = ""))
            }
            rawKind == "system" || rawKind == "info" -> {
                if (text.length <= 160) {
                    chat.add(CodingChatItem.SystemPill(key = "s_${ev.i}", text = text))
                } else {
                    activity.add(ev)
                }
            }
            else -> {
                activity.add(ev)
            }
        }
    }

    // Final verified report bubble (always shown cleanly as an Agent chat reply with changed files & verification)
    val report = run.report
    if (report != null && (report.summary.isNotBlank() || report.filesChanged.isNotEmpty() || report.verification.isNotEmpty())) {
        chat.add(
            CodingChatItem.AgentBubble(
                key = "report_${run.runId}",
                text = report.summary.ifBlank { "Task completed." },
                time = "",
                filesChanged = report.filesChanged,
                verification = report.verification,
                blockers = report.blockers.orEmpty(),
                files = run.files,
                badge = "Verified",
            ),
        )
    } else if (!run.isRunning && chat.none { it is CodingChatItem.AgentBubble } && activity.isNotEmpty()) {
        // Fallback so completed runs without an explicit assistant/report event still show a clean summary reply
        val lastText = activity.last().text.trim()
        if (lastText.isNotEmpty()) {
            chat.add(
                CodingChatItem.AgentBubble(
                    key = "fallback_${run.runId}",
                    text = lastText,
                    time = "",
                    files = run.files,
                ),
            )
        }
    }

    return ParsedCodingStream(chatItems = chat, activityEvents = activity)
}

@Composable
private fun CodingFloatingPill(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val s = LocalStitchPalette.current
    Surface(
        shape = CircleShape,
        color = if (selected) s.primary else s.surfaceContainerLowest.copy(alpha = 0.92f),
        border = BorderStroke(1.dp, if (selected) s.primary else s.outlineVariant),
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
private fun SidebarTile(icon: ImageVector, label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val s = LocalStitchPalette.current
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(s.surfaceContainerLow)
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(icon, contentDescription = null, tint = s.primary, modifier = Modifier.size(18.dp))
        Text(label, style = MaterialTheme.typography.labelMedium, color = s.onSurface)
    }
}
