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
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.agentgitu.mobile.data.model.*
import dev.agentgitu.mobile.ui.components.*
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette
import dev.agentgitu.mobile.ui.viewmodel.AppUiState
import dev.agentgitu.mobile.ui.viewmodel.GituAppViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InboxWorkspaceSheet(
    room: InboxRoom,
    state: AppUiState,
    vm: GituAppViewModel,
    initialTab: String = "notes",
    onDismiss: () -> Unit,
) {
    val s = LocalStitchPalette.current
    val isOwner = state.inboxState?.role != "member"
    val workspace = state.inboxWorkspace
    val notes = workspace?.notes.orEmpty()
    val tasks = workspace?.tasks.orEmpty()
    val visibility = workspace?.notesVisibility ?: room.notesVisibility
    val projectPath = workspace?.projectPath ?: room.projectPath.orEmpty()
    val projects = state.inboxState?.projects.orEmpty()
    val pendingApprovals = remember(tasks) { tasks.filter { it.status == "pending_approval" } }
    val regularTasks = remember(tasks) { tasks.filter { it.status != "pending_approval" } }
    val openTasks = remember(tasks) { tasks.filter { it.status != "done" && it.status != "pending_approval" } }

    var activeTab by remember(initialTab) { mutableStateOf(initialTab) }
    var showAddNote by remember { mutableStateOf(false) }
    var noteKind by remember { mutableStateOf("note") }
    var noteTitle by remember { mutableStateOf("") }
    var noteContent by remember { mutableStateOf("") }

    var showAddTask by remember { mutableStateOf(false) }
    var taskTitle by remember { mutableStateOf("") }
    var taskDesc by remember { mutableStateOf("") }
    var taskKind by remember { mutableStateOf("action") }
    var taskAssignee by remember { mutableStateOf("") }

    var shareTarget by remember { mutableStateOf<InboxRoomNote?>(null) }
    var shareDraft by remember { mutableStateOf("") }
    var shareIncludeTasks by remember { mutableStateOf(true) }

    LaunchedEffect(shareTarget, shareIncludeTasks, openTasks) {
        val target = shareTarget ?: return@LaunchedEffect
        val base = buildString {
            append("**${target.title}**\n\n${target.content}")
            if (shareIncludeTasks && openTasks.isNotEmpty()) {
                append("\n\n**Next Steps**\n")
                append(
                    openTasks.joinToString("\n") { t ->
                        "- [ ] ${t.title}${if (!t.assignee.isNullOrBlank()) " (${t.assignee})" else ""}"
                    },
                )
            }
        }
        shareDraft = base
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = s.surface,
        contentColor = s.onSurface,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.88f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
                .padding(bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = if (isOwner) "Notes & Tasks" else "Shared Meeting Notes",
                        style = MaterialTheme.typography.titleLarge,
                        color = s.onSurface,
                    )
                    Text(
                        text = if (visibility == "owner_only") {
                            "${room.title} • Owner-private"
                        } else {
                            "${room.title} • Shared read-only"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = s.onSurfaceVariant,
                    )
                }
                StitchBadge(
                    text = if (visibility == "owner_only") "Private" else "Shared",
                    tone = if (visibility == "owner_only") BadgeTone.PRIMARY else BadgeTone.NEUTRAL,
                )
            }

            if (isOwner) {
                StitchCard(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier.padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Icon(
                                imageVector = if (visibility == "owner_only") Icons.Default.Lock else Icons.Default.Visibility,
                                contentDescription = null,
                                tint = s.onSurface,
                                modifier = Modifier.size(16.dp),
                            )
                            Text(
                                text = "Who can see Notes & Tasks",
                                style = MaterialTheme.typography.labelMedium,
                                color = s.onSurfaceVariant,
                            )
                        }
                        StitchSegmentedPills(
                            items = listOf(
                                "owner_only" to "Owner-private",
                                "shared_readonly" to "Shared read-only",
                            ),
                            selected = visibility,
                            onSelect = { next ->
                                vm.updateInboxRoom(room.id, notesVisibility = next)
                            },
                        )

                        if (projects.isNotEmpty()) {
                            Text(
                                text = "Linked project for coding delegations",
                                style = MaterialTheme.typography.labelMedium,
                                color = s.onSurfaceVariant,
                            )
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                InboxChipPill(
                                    label = "Workspace default",
                                    selected = projectPath.isBlank(),
                                    onClick = { vm.updateInboxRoom(room.id, clearProjectPath = true) },
                                )
                                projects.forEach { proj ->
                                    InboxChipPill(
                                        label = proj.name,
                                        selected = projectPath == proj.path,
                                        onClick = { vm.updateInboxRoom(room.id, projectPath = proj.path) },
                                    )
                                }
                            }
                        }

                        StitchPrimaryButton(
                            text = if (state.inboxSummarizing) "Summarizing meeting…" else "Summarize Meeting & Save Tasks",
                            icon = Icons.Default.AutoAwesome,
                            busy = state.inboxSummarizing,
                            enabled = state.inboxMessages.isNotEmpty(),
                            modifier = Modifier.fillMaxWidth(),
                            onClick = {
                                vm.summarizeInboxMeeting(room.id) {
                                    activeTab = "notes"
                                }
                            },
                        )
                    }
                }
            }

            if (isOwner && pendingApprovals.isNotEmpty()) {
                StitchCard(
                    modifier = Modifier.fillMaxWidth(),
                    containerColor = s.warningContainer,
                    borderColor = s.warning,
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Icon(Icons.Default.VerifiedUser, contentDescription = null, tint = s.onWarningContainer, modifier = Modifier.size(18.dp))
                            Text(
                                text = "Client Coding Proposals (${pendingApprovals.size})",
                                style = MaterialTheme.typography.titleSmall,
                                color = s.onWarningContainer,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                        Text(
                            text = "Guests cannot run code directly. Approve to run privately in Code.",
                            style = MaterialTheme.typography.bodySmall,
                            color = s.onWarningContainer,
                        )
                        pendingApprovals.forEach { task ->
                            val busy = state.inboxDelegatingTaskId == task.id
                            StitchCard(modifier = Modifier.fillMaxWidth()) {
                                Column(
                                    modifier = Modifier.padding(12.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Text(task.title, style = MaterialTheme.typography.titleSmall, color = s.onSurface)
                                    if (!task.description.isNullOrBlank()) {
                                        Text(task.description, style = MaterialTheme.typography.bodySmall, color = s.onSurfaceVariant)
                                    }
                                    Text(
                                        text = "Requested by ${task.requestedByName}",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = s.onSurfaceVariant,
                                    )
                                    Row(
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        modifier = Modifier.fillMaxWidth(),
                                    ) {
                                        StitchPrimaryButton(
                                            text = if (busy) "Starting…" else "Approve & Run",
                                            icon = Icons.Default.Code,
                                            busy = busy,
                                            modifier = Modifier.weight(1f),
                                            onClick = { vm.delegateInboxTaskCode(room.id, task.id) },
                                        )
                                        StitchSecondaryButton(
                                            text = "To-Do",
                                            enabled = !busy,
                                            onClick = { vm.updateInboxTaskStatus(room.id, task.id, "todo") },
                                        )
                                        StitchCircleIconButton(
                                            icon = Icons.Default.DeleteOutline,
                                            contentDescription = "Dismiss proposal",
                                            danger = true,
                                            onClick = { vm.deleteInboxTask(room.id, task.id) },
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            StitchSegmentedPills(
                items = listOf(
                    "notes" to "Notes (${notes.size})",
                    "tasks" to "Tasks (${regularTasks.size})",
                ),
                selected = activeTab,
                onSelect = { activeTab = it },
            )

            if (state.inboxWorkspaceLoading && workspace == null) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 24.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp, color = s.primary)
                }
            } else if (activeTab == "notes") {
                if (isOwner) {
                    if (showAddNote) {
                        StitchCard(modifier = Modifier.fillMaxWidth()) {
                            Column(
                                modifier = Modifier.padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                StitchSegmentedPills(
                                    items = listOf("note" to "Note", "decision" to "Decision", "summary" to "Summary"),
                                    selected = noteKind,
                                    onSelect = { noteKind = it },
                                )
                                StitchInputField(
                                    value = noteTitle,
                                    onValueChange = { noteTitle = it },
                                    label = "Title",
                                    placeholder = "Client requirements & timeline",
                                )
                                StitchInputField(
                                    value = noteContent,
                                    onValueChange = { noteContent = it },
                                    label = "Content",
                                    placeholder = "Write meeting notes or decisions…",
                                    singleLine = false,
                                    minLines = 3,
                                )
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                                ) {
                                    StitchSecondaryButton(text = "Cancel", onClick = { showAddNote = false })
                                    StitchPrimaryButton(
                                        text = "Save Note",
                                        enabled = noteContent.isNotBlank(),
                                        onClick = {
                                            vm.addInboxNote(
                                                room.id,
                                                noteKind,
                                                noteTitle.ifBlank { noteKind.replaceFirstChar { it.uppercase() } },
                                                noteContent,
                                            )
                                            noteTitle = ""
                                            noteContent = ""
                                            showAddNote = false
                                        },
                                    )
                                }
                            }
                        }
                    } else {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = "Ask an agent to take notes, or add one here.",
                                style = MaterialTheme.typography.bodySmall,
                                color = s.onSurfaceVariant,
                                modifier = Modifier.weight(1f),
                            )
                            StitchSecondaryButton(
                                text = "Add Note",
                                icon = Icons.Default.Add,
                                onClick = { showAddNote = true },
                            )
                        }
                    }
                }

                if (notes.isEmpty()) {
                    StitchCard(modifier = Modifier.fillMaxWidth(), containerColor = s.surfaceContainerLow) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("No notes or summaries yet", style = MaterialTheme.typography.titleSmall, color = s.onSurface)
                            Text(
                                text = if (isOwner) {
                                    "Turn on Watch & Note, ask an agent to take notes, or tap Summarize Meeting."
                                } else {
                                    "No meeting notes have been shared in this room yet."
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = s.onSurfaceVariant,
                            )
                        }
                    }
                } else {
                    notes.forEach { note ->
                        StitchCard(modifier = Modifier.fillMaxWidth()) {
                            Column(
                                modifier = Modifier.padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.Top,
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(note.title.ifBlank { "Note" }, style = MaterialTheme.typography.titleSmall, color = s.onSurface)
                                        Text(
                                            text = "${note.kind.replaceFirstChar { it.uppercase() }} • ${note.createdByName}",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = s.onSurfaceVariant,
                                        )
                                    }
                                    if (note.sharedToChat) {
                                        StitchBadge(text = "Shared", tone = BadgeTone.SUCCESS)
                                    }
                                }
                                Text(note.content, style = MaterialTheme.typography.bodySmall, color = s.onSurface)
                                if (isOwner) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        StitchSecondaryButton(
                                            text = if (note.sharedToChat) "Share Again" else "Share to Chat",
                                            icon = Icons.AutoMirrored.Filled.Send,
                                            onClick = {
                                                shareIncludeTasks = note.kind == "summary"
                                                shareTarget = note
                                            },
                                        )
                                        StitchCircleIconButton(
                                            icon = Icons.Default.DeleteOutline,
                                            contentDescription = "Delete note",
                                            size = 36.dp,
                                            onClick = { vm.deleteInboxNote(room.id, note.id) },
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                // Tasks tab
                if (isOwner) {
                    if (showAddTask) {
                        StitchCard(modifier = Modifier.fillMaxWidth()) {
                            Column(
                                modifier = Modifier.padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                StitchInputField(
                                    value = taskTitle,
                                    onValueChange = { taskTitle = it },
                                    label = "Task",
                                    placeholder = "Build client onboarding flow",
                                )
                                StitchInputField(
                                    value = taskDesc,
                                    onValueChange = { taskDesc = it },
                                    label = "Details (optional)",
                                    placeholder = "Scope or acceptance criteria…",
                                    singleLine = false,
                                    minLines = 2,
                                )
                                StitchSegmentedPills(
                                    items = listOf("action" to "Action", "coding" to "Coding", "research" to "Research"),
                                    selected = taskKind,
                                    onSelect = { taskKind = it },
                                )
                                StitchInputField(
                                    value = taskAssignee,
                                    onValueChange = { taskAssignee = it },
                                    label = "Assignee (optional)",
                                    placeholder = "Owner / Client / Agent",
                                )
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                                ) {
                                    StitchSecondaryButton(text = "Cancel", onClick = { showAddTask = false })
                                    StitchPrimaryButton(
                                        text = "Save Task",
                                        enabled = taskTitle.isNotBlank(),
                                        onClick = {
                                            vm.addInboxTask(room.id, taskTitle, taskDesc.ifBlank { null }, taskKind, taskAssignee.ifBlank { null })
                                            taskTitle = ""
                                            taskDesc = ""
                                            taskAssignee = ""
                                            showAddTask = false
                                        },
                                    )
                                }
                            }
                        }
                    } else {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = "Delegate coding tasks privately to Code or Sub-Agents.",
                                style = MaterialTheme.typography.bodySmall,
                                color = s.onSurfaceVariant,
                                modifier = Modifier.weight(1f),
                            )
                            StitchSecondaryButton(
                                text = "Add Task",
                                icon = Icons.Default.Add,
                                onClick = { showAddTask = true },
                            )
                        }
                    }
                }

                if (regularTasks.isEmpty()) {
                    StitchCard(modifier = Modifier.fillMaxWidth(), containerColor = s.surfaceContainerLow) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("No saved tasks yet", style = MaterialTheme.typography.titleSmall, color = s.onSurface)
                            Text(
                                text = if (isOwner) {
                                    "Tasks from Summarize Meeting, Silent Watch, or agents appear here."
                                } else {
                                    "No tasks have been shared in this room yet."
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = s.onSurfaceVariant,
                            )
                        }
                    }
                } else {
                    regularTasks.forEach { task ->
                        val busy = state.inboxDelegatingTaskId == task.id
                        val done = task.status == "done"
                        val tone = when (task.status) {
                            "done" -> BadgeTone.SUCCESS
                            "in_progress" -> BadgeTone.PRIMARY
                            else -> BadgeTone.NEUTRAL
                        }
                        StitchCard(modifier = Modifier.fillMaxWidth()) {
                            Column(
                                modifier = Modifier.padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.Top,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    Icon(
                                        imageVector = if (done) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                                        contentDescription = if (done) "Completed" else "Open",
                                        tint = if (done) s.success else s.onSurfaceVariant,
                                        modifier = Modifier
                                            .size(22.dp)
                                            .then(
                                                if (isOwner) {
                                                    Modifier.clickable {
                                                        vm.updateInboxTaskStatus(room.id, task.id, if (done) "todo" else "done")
                                                    }
                                                } else Modifier,
                                            ),
                                    )
                                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                        Text(task.title, style = MaterialTheme.typography.titleSmall, color = s.onSurface)
                                        Text(
                                            text = buildString {
                                                append(task.kind.replaceFirstChar { it.uppercase() })
                                                if (!task.assignee.isNullOrBlank()) append(" • ${task.assignee}")
                                                if (!task.codeRunStatus.isNullOrBlank()) append(" • Code: ${task.codeRunStatus}")
                                            },
                                            style = MaterialTheme.typography.labelSmall,
                                            color = s.onSurfaceVariant,
                                        )
                                    }
                                    StitchBadge(
                                        text = when (task.status) {
                                            "done" -> "Done"
                                            "in_progress" -> "Running"
                                            else -> "To do"
                                        },
                                        tone = tone,
                                    )
                                }
                                if (!task.description.isNullOrBlank()) {
                                    Text(task.description, style = MaterialTheme.typography.bodySmall, color = s.onSurfaceVariant)
                                }
                                if (isOwner && !task.delegationSummary.isNullOrBlank()) {
                                    StitchCard(modifier = Modifier.fillMaxWidth(), containerColor = s.surfaceContainerLow, cornerRadius = 12.dp) {
                                        Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                            Text(
                                                text = if (!task.subAgentRole.isNullOrBlank()) {
                                                    "Sub-agent (${task.subAgentRole}) output"
                                                } else {
                                                    "Delegation result"
                                                },
                                                style = MaterialTheme.typography.labelSmall,
                                                color = s.primary,
                                                fontWeight = FontWeight.SemiBold,
                                            )
                                            Text(task.delegationSummary, style = MaterialTheme.typography.bodySmall, color = s.onSurface)
                                        }
                                    }
                                }
                                if (isOwner) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            if (!task.codeRunId.isNullOrBlank()) {
                                                StitchPrimaryButton(
                                                    text = "Open in Code",
                                                    icon = Icons.AutoMirrored.Filled.OpenInNew,
                                                    onClick = {
                                                        onDismiss()
                                                        vm.openInboxCodeRun(task.codeRunId)
                                                    },
                                                )
                                            } else {
                                                StitchSecondaryButton(
                                                    text = if (busy) "Starting…" else "Run in Code",
                                                    icon = Icons.Default.Code,
                                                    enabled = !busy,
                                                    onClick = { vm.delegateInboxTaskCode(room.id, task.id) },
                                                )
                                            }
                                            StitchSecondaryButton(
                                                text = if (busy) "Working…" else "Sub-Agent",
                                                icon = Icons.Default.SmartToy,
                                                outlined = true,
                                                enabled = !busy,
                                                onClick = { vm.delegateInboxTaskSubAgent(room.id, task.id) },
                                            )
                                        }
                                        StitchCircleIconButton(
                                            icon = Icons.Default.DeleteOutline,
                                            contentDescription = "Delete task",
                                            size = 36.dp,
                                            onClick = { vm.deleteInboxTask(room.id, task.id) },
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

    val target = shareTarget
    if (target != null) {
        AlertDialog(
            onDismissRequest = { shareTarget = null },
            containerColor = s.surfaceContainerLowest,
            title = { Text("Share Summary to Chat", color = s.onSurface) },
            text = {
                Column(
                    modifier = Modifier.verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text(
                        text = "Review or edit what will be posted to \"${room.title}\". Private coding runs and paths are never included.",
                        style = MaterialTheme.typography.bodySmall,
                        color = s.onSurfaceVariant,
                    )
                    if (openTasks.isNotEmpty()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                text = "Include open tasks (${openTasks.size})",
                                style = MaterialTheme.typography.labelMedium,
                                color = s.onSurface,
                            )
                            Switch(checked = shareIncludeTasks, onCheckedChange = { shareIncludeTasks = it })
                        }
                    }
                    StitchInputField(
                        value = shareDraft,
                        onValueChange = { shareDraft = it },
                        label = "Message to post",
                        singleLine = false,
                        minLines = 5,
                    )
                }
            },
            confirmButton = {
                TextButton(
                    enabled = shareDraft.isNotBlank(),
                    onClick = {
                        vm.shareInboxNote(room.id, target.id, shareDraft, includeTasks = false)
                        shareTarget = null
                    },
                ) { Text("Post to Chat", color = s.primary) }
            },
            dismissButton = {
                TextButton(onClick = { shareTarget = null }) { Text("Cancel", color = s.onSurfaceVariant) }
            },
        )
    }
}

@Composable
fun InboxRoomSettingsDialog(
    room: InboxRoom,
    state: AppUiState,
    vm: GituAppViewModel,
    onDismiss: () -> Unit,
) {
    val s = LocalStitchPalette.current
    var title by remember(room.id) { mutableStateOf(room.title) }
    var triggerMode by remember(room.id, room.agentTriggerMode) { mutableStateOf(room.agentTriggerMode) }
    var notesVisibility by remember(room.id, room.notesVisibility) { mutableStateOf(room.notesVisibility) }
    var toolPolicy by remember(room.id, room.toolPolicyOverride) { mutableStateOf(room.toolPolicyOverride.orEmpty()) }
    var projectPath by remember(room.id, room.projectPath) { mutableStateOf(room.projectPath.orEmpty()) }
    var selectedAgents by remember(room.id, room.activeAgentIds) { mutableStateOf(room.activeAgentIds.toSet()) }
    var selectedMembers by remember(room.id, room.memberIds) { mutableStateOf(room.memberIds.toSet()) }
    val agents = state.inboxState?.agents.orEmpty()
    val members = state.inboxState?.members.orEmpty().filter { it.status != "revoked" }
    val projects = state.inboxState?.projects.orEmpty()

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = s.surfaceContainerLowest,
        title = { Text("Room Settings", color = s.onSurface) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                StitchInputField(value = title, onValueChange = { title = it }, label = "Room name")

                Text("Agent reply mode", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                StitchSegmentedPills(
                    items = listOf("mention" to "@mention", "watch" to "Watch", "auto" to "Auto"),
                    selected = triggerMode,
                    onSelect = { triggerMode = it },
                )

                Text("Notes & Tasks visibility", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                StitchSegmentedPills(
                    items = listOf("owner_only" to "Owner-private", "shared_readonly" to "Shared"),
                    selected = notesVisibility,
                    onSelect = { notesVisibility = it },
                )

                Text("Room tool policy override", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    listOf("" to "Default", "chat_only" to "Chat", "read_only" to "Read", "standard" to "Standard").forEach { (value, label) ->
                        InboxChipPill(label = label, selected = toolPolicy == value, onClick = { toolPolicy = value })
                    }
                }

                if (projects.isNotEmpty()) {
                    Text("Linked coding project", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        InboxChipPill(label = "Default", selected = projectPath.isBlank(), onClick = { projectPath = "" })
                        projects.forEach { proj ->
                            InboxChipPill(label = proj.name, selected = projectPath == proj.path, onClick = { projectPath = proj.path })
                        }
                    }
                }

                if (agents.isNotEmpty()) {
                    Text("Active agents in room", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                    agents.forEach { ag ->
                        val checked = ag.id in selectedAgents
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    selectedAgents = if (checked) selectedAgents - ag.id else selectedAgents + ag.id
                                },
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(ag.name, style = MaterialTheme.typography.bodyMedium, color = s.onSurface)
                            Switch(
                                checked = checked,
                                onCheckedChange = {
                                    selectedAgents = if (it) selectedAgents + ag.id else selectedAgents - ag.id
                                },
                            )
                        }
                    }
                }

                if (members.isNotEmpty()) {
                    Text("Invited humans in room", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                    members.forEach { m ->
                        val checked = m.id in selectedMembers
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    selectedMembers = if (checked) selectedMembers - m.id else selectedMembers + m.id
                                },
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(m.name, style = MaterialTheme.typography.bodyMedium, color = s.onSurface)
                            Switch(
                                checked = checked,
                                onCheckedChange = {
                                    selectedMembers = if (it) selectedMembers + m.id else selectedMembers - m.id
                                },
                            )
                        }
                    }
                }

                HorizontalDivider(color = s.outlineVariant)
                StitchSecondaryButton(
                    text = "Delete Room",
                    icon = Icons.Default.DeleteOutline,
                    danger = true,
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        vm.deleteInboxRoom(room.id)
                        onDismiss()
                    },
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    vm.updateInboxRoom(
                        roomId = room.id,
                        title = title.trim().ifBlank { room.title },
                        activeAgentIds = selectedAgents.toList(),
                        memberIds = selectedMembers.toList(),
                        agentTriggerMode = triggerMode,
                        toolPolicyOverride = toolPolicy.ifBlank { null },
                        clearToolPolicyOverride = toolPolicy.isBlank(),
                        notesVisibility = notesVisibility,
                        projectPath = projectPath.ifBlank { null },
                        clearProjectPath = projectPath.isBlank(),
                    )
                    onDismiss()
                },
            ) { Text("Save", color = s.primary) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel", color = s.onSurfaceVariant) }
        },
    )
}

@Composable
fun CreateInboxRoomDialog(
    state: AppUiState,
    vm: GituAppViewModel,
    onDismiss: () -> Unit,
) {
    val s = LocalStitchPalette.current
    var kind by remember { mutableStateOf("group") }
    var title by remember { mutableStateOf("") }
    var triggerMode by remember { mutableStateOf("mention") }
    var notesVisibility by remember { mutableStateOf("owner_only") }
    var projectPath by remember { mutableStateOf("") }
    var selectedAgents by remember { mutableStateOf(state.inboxState?.agents?.take(1)?.map { it.id }?.toSet().orEmpty()) }
    var selectedMembers by remember { mutableStateOf(emptySet<String>()) }
    val agents = state.inboxState?.agents.orEmpty()
    val members = state.inboxState?.members.orEmpty().filter { it.status != "revoked" }
    val projects = state.inboxState?.projects.orEmpty()

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = s.surfaceContainerLowest,
        title = { Text("New Inbox Room", color = s.onSurface) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                StitchSegmentedPills(
                    items = listOf("group" to "Group", "dm" to "Direct"),
                    selected = kind,
                    onSelect = {
                        kind = it
                        triggerMode = if (it == "group") "mention" else "auto"
                    },
                )
                StitchInputField(
                    value = title,
                    onValueChange = { title = it },
                    label = "Room title",
                    placeholder = "Acme Client Sync",
                )
                Text("Agent reply mode", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                StitchSegmentedPills(
                    items = listOf("mention" to "@mention", "watch" to "Watch", "auto" to "Auto"),
                    selected = triggerMode,
                    onSelect = { triggerMode = it },
                )
                Text("Notes & tasks visibility", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                StitchSegmentedPills(
                    items = listOf("owner_only" to "Owner-private", "shared_readonly" to "Shared"),
                    selected = notesVisibility,
                    onSelect = { notesVisibility = it },
                )
                if (projects.isNotEmpty()) {
                    Text("Linked coding project", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        InboxChipPill(label = "Default", selected = projectPath.isBlank(), onClick = { projectPath = "" })
                        projects.forEach { proj ->
                            InboxChipPill(label = proj.name, selected = projectPath == proj.path, onClick = { projectPath = proj.path })
                        }
                    }
                }
                if (agents.isNotEmpty()) {
                    Text("Active agents", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        agents.forEach { ag ->
                            val selected = ag.id in selectedAgents
                            InboxChipPill(
                                label = ag.name,
                                selected = selected,
                                onClick = {
                                    selectedAgents = if (selected) selectedAgents - ag.id else selectedAgents + ag.id
                                },
                            )
                        }
                    }
                }
                if (members.isNotEmpty()) {
                    Text("Include invited humans", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        members.forEach { m ->
                            val selected = m.id in selectedMembers
                            InboxChipPill(
                                label = m.name,
                                selected = selected,
                                onClick = {
                                    selectedMembers = if (selected) selectedMembers - m.id else selectedMembers + m.id
                                },
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = title.isNotBlank(),
                onClick = {
                    vm.createInboxRoom(
                        title = title,
                        agentIds = selectedAgents.toList(),
                        kind = kind,
                        memberIds = selectedMembers.toList(),
                        agentTriggerMode = triggerMode,
                        notesVisibility = notesVisibility,
                        projectPath = projectPath.ifBlank { null },
                    )
                    onDismiss()
                },
            ) { Text("Create", color = s.primary) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel", color = s.onSurfaceVariant) }
        },
    )
}

@Composable
fun CreateInboxInviteDialog(
    state: AppUiState,
    vm: GituAppViewModel,
    defaultRoomId: String? = null,
    onDismiss: () -> Unit,
) {
    val s = LocalStitchPalette.current
    val clipboard = LocalClipboardManager.current
    var label by remember { mutableStateOf("") }
    var targetEmail by remember { mutableStateOf("") }
    var selectedRoomId by remember(defaultRoomId) { mutableStateOf(defaultRoomId.orEmpty()) }
    var policy by remember { mutableStateOf("read_only") }
    var maxUses by remember { mutableStateOf("1") }
    var selectedAgents by remember { mutableStateOf(emptySet<String>()) }
    val rooms = state.inboxState?.rooms.orEmpty()
    val agents = state.inboxState?.agents.orEmpty()
    val generatedUrl = state.latestInboxInviteUrl

    AlertDialog(
        onDismissRequest = {
            vm.clearLatestInboxInviteUrl()
            onDismiss()
        },
        containerColor = s.surfaceContainerLowest,
        title = { Text("Invite Human via Pikpam", color = s.onSurface) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                StitchInputField(value = label, onValueChange = { label = it }, label = "Label (optional)", placeholder = "Sarah — Client")
                StitchInputField(value = targetEmail, onValueChange = { targetEmail = it }, label = "Restrict to email (optional)", placeholder = "sarah@acme.com")
                if (rooms.isNotEmpty()) {
                    Text("Assign to room", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        InboxChipPill(label = "Auto Direct Inbox", selected = selectedRoomId.isBlank(), onClick = { selectedRoomId = "" })
                        rooms.forEach { r ->
                            InboxChipPill(label = r.title, selected = selectedRoomId == r.id, onClick = { selectedRoomId = r.id })
                        }
                    }
                }
                Text("Tool policy", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                StitchSegmentedPills(
                    items = listOf("chat_only" to "Chat", "read_only" to "Read", "standard" to "Standard"),
                    selected = policy,
                    onSelect = { policy = it },
                )
                StitchInputField(value = maxUses, onValueChange = { maxUses = it.filter(Char::isDigit) }, label = "Max uses")
                if (agents.isNotEmpty()) {
                    Text("Allowed agents", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        agents.forEach { ag ->
                            val selected = ag.id in selectedAgents
                            InboxChipPill(
                                label = ag.name,
                                selected = selected,
                                onClick = {
                                    selectedAgents = if (selected) selectedAgents - ag.id else selectedAgents + ag.id
                                },
                            )
                        }
                    }
                }
                if (generatedUrl.isNotBlank()) {
                    StitchCard(modifier = Modifier.fillMaxWidth(), containerColor = s.surfaceContainerLow) {
                        Column(modifier = Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("Share this Pikpam link:", style = MaterialTheme.typography.labelSmall, color = s.onSurfaceVariant)
                            Text(generatedUrl, style = MaterialTheme.typography.labelSmall, color = s.onSurface)
                            StitchSecondaryButton(
                                text = "Copy Link",
                                icon = Icons.Default.ContentCopy,
                                onClick = { clipboard.setText(AnnotatedString(generatedUrl)) },
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    vm.createInboxInvite(
                        label = label.ifBlank { "Mobile invite" },
                        toolPolicy = policy,
                        roomId = selectedRoomId.ifBlank { null },
                        targetEmail = targetEmail.ifBlank { null },
                        defaultAgentIds = selectedAgents.toList(),
                        maxUses = maxUses.toIntOrNull()?.coerceAtLeast(1) ?: 1,
                    )
                },
            ) { Text("Generate Link", color = s.primary) }
        },
        dismissButton = {
            TextButton(
                onClick = {
                    vm.clearLatestInboxInviteUrl()
                    onDismiss()
                },
            ) { Text("Close", color = s.onSurfaceVariant) }
        },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InboxMembersSheet(
    state: AppUiState,
    vm: GituAppViewModel,
    onInviteClick: () -> Unit,
    onDismiss: () -> Unit,
) {
    val s = LocalStitchPalette.current
    val members = state.inboxState?.members.orEmpty()
    val agents = state.inboxState?.agents.orEmpty()

    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = s.surface, contentColor = s.onSurface) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.8f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
                .padding(bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Members & Access (${members.size})", style = MaterialTheme.typography.titleLarge, color = s.onSurface)
                StitchSecondaryButton(text = "Invite", icon = Icons.Default.PersonAdd, onClick = onInviteClick)
            }
            if (members.isEmpty()) {
                StitchCard(modifier = Modifier.fillMaxWidth(), containerColor = s.surfaceContainerLow) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("No invited humans yet", style = MaterialTheme.typography.titleSmall, color = s.onSurface)
                        Text("Create a Pikpam invite link to bring a collaborator into your Inbox.", style = MaterialTheme.typography.bodySmall, color = s.onSurfaceVariant)
                    }
                }
            } else {
                members.forEach { m ->
                    val revoked = m.status == "revoked"
                    StitchCard(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(m.name, style = MaterialTheme.typography.titleSmall, color = s.onSurface)
                                    if (!m.email.isNullOrBlank()) {
                                        Text(m.email, style = MaterialTheme.typography.bodySmall, color = s.onSurfaceVariant)
                                    }
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                                    StitchBadge(
                                        text = if (revoked) "Revoked" else "Active",
                                        tone = if (revoked) BadgeTone.ERROR else BadgeTone.SUCCESS,
                                    )
                                    StitchSecondaryButton(
                                        text = if (revoked) "Restore" else "Revoke",
                                        danger = !revoked,
                                        onClick = {
                                            vm.updateInboxMember(m.id, status = if (revoked) "active" else "revoked")
                                        },
                                    )
                                }
                            }
                            StitchSegmentedPills(
                                items = listOf("chat_only" to "Chat", "read_only" to "Read", "standard" to "Standard"),
                                selected = m.toolPolicy ?: "read_only",
                                onSelect = { policy -> vm.updateInboxMember(m.id, toolPolicy = policy) },
                            )
                            if (agents.isNotEmpty()) {
                                Row(
                                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    agents.forEach { ag ->
                                        val allowed = ag.id in m.allowedAgentIds
                                        InboxChipPill(
                                            label = ag.name,
                                            selected = allowed,
                                            onClick = {
                                                val next = if (allowed) m.allowedAgentIds - ag.id else m.allowedAgentIds + ag.id
                                                vm.updateInboxMember(m.id, allowedAgentIds = next)
                                            },
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
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InboxInvitesSheet(
    state: AppUiState,
    vm: GituAppViewModel,
    onCreateClick: () -> Unit,
    onDismiss: () -> Unit,
) {
    val s = LocalStitchPalette.current
    val clipboard = LocalClipboardManager.current
    val invites = state.inboxState?.invites.orEmpty()

    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = s.surface, contentColor = s.onSurface) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.8f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
                .padding(bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Pikpam Invites (${invites.size})", style = MaterialTheme.typography.titleLarge, color = s.onSurface)
                StitchPrimaryButton(text = "New Invite", icon = Icons.Default.Add, onClick = onCreateClick)
            }
            if (invites.isEmpty()) {
                StitchCard(modifier = Modifier.fillMaxWidth(), containerColor = s.surfaceContainerLow) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("No invite links yet", style = MaterialTheme.typography.titleSmall, color = s.onSurface)
                        Text("Generate a Pikpam invite link to let a client or teammate join specific rooms.", style = MaterialTheme.typography.bodySmall, color = s.onSurfaceVariant)
                    }
                }
            } else {
                invites.forEach { inv ->
                    val active = inv.revokedAt.isNullOrBlank() && inv.usedCount < inv.maxUses
                    StitchCard(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = inv.label?.ifBlank { null } ?: inv.targetEmail ?: "Invite (${inv.scopeType})",
                                        style = MaterialTheme.typography.titleSmall,
                                        color = s.onSurface,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Text(
                                        text = "Policy: ${inv.toolPolicy} • Used ${inv.usedCount}/${inv.maxUses}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = s.onSurfaceVariant,
                                    )
                                }
                                StitchBadge(
                                    text = if (active) "Active" else "Closed",
                                    tone = if (active) BadgeTone.SUCCESS else BadgeTone.NEUTRAL,
                                )
                            }
                            if (active) {
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    if (!inv.pikpamInviteUrl.isNullOrBlank()) {
                                        StitchSecondaryButton(
                                            text = "Copy Link",
                                            icon = Icons.Default.ContentCopy,
                                            onClick = { clipboard.setText(AnnotatedString(inv.pikpamInviteUrl)) },
                                        )
                                    }
                                    StitchSecondaryButton(
                                        text = "Revoke",
                                        danger = true,
                                        onClick = { vm.revokeInboxInvite(inv.id) },
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
internal fun InboxChipPill(
    label: String,
    selected: Boolean,
    alert: Boolean = false,
    icon: androidx.compose.ui.graphics.vector.ImageVector? = null,
    onClick: () -> Unit,
) {
    val s = LocalStitchPalette.current
    val bg = when {
        alert -> s.warningContainer
        selected -> s.primary
        else -> s.surfaceContainerLow
    }
    val fg = when {
        alert -> s.onWarningContainer
        selected -> s.onPrimary
        else -> s.onSurface
    }
    val border = when {
        alert -> s.warning
        selected -> s.primary
        else -> s.outlineVariant
    }
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(bg)
            .border(1.dp, border, CircleShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 11.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, tint = fg, modifier = Modifier.size(14.dp))
        }
        Text(text = label, style = MaterialTheme.typography.labelMedium, color = fg, maxLines = 1)
    }
}
