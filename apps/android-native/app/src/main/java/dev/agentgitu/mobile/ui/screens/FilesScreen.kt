package dev.agentgitu.mobile.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.agentgitu.mobile.data.model.FileEntry
import dev.agentgitu.mobile.ui.components.*
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette
import dev.agentgitu.mobile.ui.viewmodel.AppUiState
import dev.agentgitu.mobile.ui.viewmodel.GituAppViewModel

/**
 * Exact Stitch File Explorer & Git Diff screen (file_explorer_git_diff/code.html)
 * with typographic "Diff  Files" header switch, 2-column Git Summary Grid,
 * staged files card, inline color-coded diff preview, and full workspace file editor.
 */
@Composable
fun FilesScreen(
    state: AppUiState,
    vm: GituAppViewModel,
) {
    val s = LocalStitchPalette.current
    var viewMode by remember { mutableStateOf("diff") } // "diff" | "files"
    var commitMessage by remember { mutableStateOf("") }

    val listing = state.fileListing
    val projectPath = state.selectedProjectPath
    val projectName = state.projects.firstOrNull { it.path == projectPath }?.name ?: "agent-gitu"
    var editedContent by remember(listing?.path, listing?.revision) {
        mutableStateOf(listing?.content.orEmpty())
    }
    val isDirty = listing?.content != null && editedContent != listing.content

    LaunchedEffect(projectPath) {
        if (projectPath.isNotBlank()) {
            vm.refreshGit(projectPath)
            if (state.fileListing == null) vm.loadFiles(projectPath, "")
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(s.surface)
            .statusBarsPadding()
            .navigationBarsPadding(),
    ) {
        // Contextual Header with "Diff  Files" Typographic Switch
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.weight(1f),
            ) {
                StitchCircleIconButton(
                    icon = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back",
                    outlined = true,
                    onClick = {
                        if (viewMode == "files" && listing != null && listing.path.isNotBlank()) {
                            val parent = listing.path.trimEnd('/').substringBeforeLast('/', "")
                            vm.loadFiles(listing.root, parent)
                        } else {
                            vm.closeFilesExplorer()
                        }
                    },
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(projectName, style = MaterialTheme.typography.titleMedium, color = s.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        text = if (viewMode == "files" && !listing?.path.isNullOrBlank()) listing!!.path else state.gitStatus?.branch?.ifBlank { "main" } ?: "git",
                        style = MaterialTheme.typography.labelSmall,
                        color = s.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Text(
                    text = "Diff",
                    style = MaterialTheme.typography.headlineSmall,
                    color = if (viewMode == "diff") s.onSurface else s.onSurfaceVariant,
                    modifier = Modifier.clickable { viewMode = "diff" },
                )
                Text(
                    text = "Files",
                    style = MaterialTheme.typography.headlineSmall,
                    color = if (viewMode == "files") s.onSurface else s.onSurfaceVariant,
                    modifier = Modifier.clickable {
                        viewMode = "files"
                        if (state.fileListing == null && projectPath.isNotBlank()) vm.loadFiles(projectPath, "")
                    },
                )
            }
        }
        HorizontalDivider(color = s.outlineVariant)

        if (viewMode == "diff") {
            val git = state.gitStatus
            val diffLines = remember(state.gitDiff) { state.gitDiff.lines() }
            val addedCount = remember(diffLines) { diffLines.count { it.startsWith("+") && !it.startsWith("+++") } }
            val removedCount = remember(diffLines) { diffLines.count { it.startsWith("-") && !it.startsWith("---") } }
            val totalChanged = (git?.changed?.size ?: 0) + (git?.modified?.size ?: 0) + (git?.untracked?.size ?: 0)

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                // 2-Column Git Summary Grid
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StitchCard(modifier = Modifier.weight(1f)) {
                        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("Changed files", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                            Text("$totalChanged files", style = MaterialTheme.typography.headlineSmall, color = s.onSurface)
                        }
                    }
                    StitchCard(modifier = Modifier.weight(1f)) {
                        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("Line delta", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                            Text("+$addedCount / -$removedCount", style = MaterialTheme.typography.headlineSmall, color = s.successContainer)
                        }
                    }
                }

                // Changed Files List Card
                if (totalChanged > 0) {
                    StitchCard(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("CHANGED IN WORKING TREE", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                            val fileNames = buildList {
                                git?.changed?.forEach { add(it.path) }
                                git?.modified?.forEach { if (it !in this) add(it) }
                                git?.untracked?.forEach { if (it !in this) add(it) }
                            }
                            fileNames.take(15).forEach { fname ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(s.surfaceContainerLow)
                                        .clickable {
                                            viewMode = "files"
                                            vm.loadFiles(projectPath, fname)
                                        }
                                        .padding(horizontal = 12.dp, vertical = 9.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(
                                        text = fname,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = s.onSurface,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                        modifier = Modifier.weight(1f),
                                    )
                                    Icon(Icons.Default.ChevronRight, contentDescription = null, tint = s.onSurfaceVariant, modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                    }
                }

                // Inline Diff Preview Card
                StitchCard(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text("Git diff preview", style = MaterialTheme.typography.labelSmall, color = s.onSurface)
                            Text(
                                text = "Refresh",
                                style = MaterialTheme.typography.labelMedium,
                                color = s.onSurfaceVariant,
                                modifier = Modifier.clickable { vm.refreshGit(projectPath) },
                            )
                        }

                        if (state.gitDiff.isBlank()) {
                            Text("Working tree is clean — no uncommitted diffs.", style = MaterialTheme.typography.bodySmall, color = s.onSurfaceVariant)
                        } else {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(14.dp))
                                    .border(1.dp, s.outlineVariant, RoundedCornerShape(14.dp))
                                    .horizontalScroll(rememberScrollState()),
                            ) {
                                diffLines.take(220).forEach { line ->
                                    val (bg, fg) = when {
                                        line.startsWith("@@") -> s.surfaceContainerLow to s.onSurfaceVariant
                                        line.startsWith("+") && !line.startsWith("+++") -> s.successContainer to s.onSuccessContainer
                                        line.startsWith("-") && !line.startsWith("---") -> s.errorContainer to s.onErrorContainer
                                        else -> s.surfaceContainerLowest to s.onSurfaceVariant
                                    }
                                    Text(
                                        text = line,
                                        color = fg,
                                        style = MaterialTheme.typography.labelSmall.copy(fontFamily = FontFamily.Monospace),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .background(bg)
                                            .padding(horizontal = 10.dp, vertical = 2.dp),
                                    )
                                }
                            }
                        }

                        StitchInputField(
                            value = commitMessage,
                            onValueChange = { commitMessage = it },
                            label = "Commit message",
                            placeholder = "feat: describe changes",
                        )

                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            StitchPrimaryButton(
                                text = "Commit",
                                onClick = {
                                    vm.gitCommit(commitMessage)
                                    commitMessage = ""
                                },
                                enabled = commitMessage.isNotBlank(),
                                modifier = Modifier.weight(1f),
                            )
                            StitchSecondaryButton(
                                text = "Push",
                                onClick = { vm.gitPush() },
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
            }
        } else {
            // Files Browser + Monospace Editor
            when {
                listing == null -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("Loading workspace files…", color = s.onSurfaceVariant)
                    }
                }
                listing.content != null -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = "${editedContent.lines().size} lines • ${if (listing.writable) "Revision-checked" else "Read-only"}",
                                style = MaterialTheme.typography.labelSmall,
                                color = s.onSurfaceVariant,
                            )
                            if (listing.writable && isDirty) {
                                StitchPrimaryButton(
                                    text = "Save",
                                    icon = Icons.Default.Save,
                                    onClick = { vm.saveFile(listing, editedContent) },
                                )
                            }
                        }
                        StitchCard(modifier = Modifier.fillMaxSize()) {
                            BasicTextField(
                                value = editedContent,
                                onValueChange = { if (listing.writable) editedContent = it },
                                readOnly = !listing.writable,
                                textStyle = MaterialTheme.typography.labelSmall.copy(
                                    fontFamily = FontFamily.Monospace,
                                    color = s.onSurface,
                                    lineHeight = 19.sp,
                                ),
                                cursorBrush = SolidColor(s.primary),
                                modifier = Modifier
                                    .fillMaxSize()
                                    .padding(14.dp),
                            )
                        }
                    }
                }
                else -> {
                    val entries = listing.entries.orEmpty().sortedWith(
                        compareByDescending<FileEntry> { it.directory }.thenBy { it.name.lowercase() },
                    )
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(entries, key = { it.path }) { entry ->
                            StitchCard(
                                modifier = Modifier.fillMaxWidth(),
                                cornerRadius = 14.dp,
                                onClick = { vm.loadFiles(listing.root, entry.path) },
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    Icon(
                                        imageVector = if (entry.directory) Icons.Default.Folder else Icons.Default.Description,
                                        contentDescription = null,
                                        tint = if (entry.directory) s.primary else s.onSurfaceVariant,
                                        modifier = Modifier.size(20.dp),
                                    )
                                    Text(
                                        text = entry.name,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = s.onSurface,
                                        modifier = Modifier.weight(1f),
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    Icon(Icons.Default.ChevronRight, contentDescription = null, tint = s.onSurfaceVariant, modifier = Modifier.size(18.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
