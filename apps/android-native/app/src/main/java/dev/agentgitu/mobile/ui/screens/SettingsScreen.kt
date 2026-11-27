package dev.agentgitu.mobile.ui.screens

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.agentgitu.mobile.data.local.ThemePreference
import dev.agentgitu.mobile.ui.components.*
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette
import dev.agentgitu.mobile.ui.viewmodel.AppUiState
import dev.agentgitu.mobile.ui.viewmodel.GituAppViewModel

/**
 * Exact Stitch Settings & Server Pairing screen (settings_server_pairing/code.html)
 * with Active Server Card, 2x2 Governance & Bridges Grid, and divided Preferences Card.
 */
@Composable
fun SettingsScreen(
    state: AppUiState,
    vm: GituAppViewModel,
) {
    val s = LocalStitchPalette.current
    var showChiefDialog by remember { mutableStateOf(false) }
    var showLocalLinkDialog by remember { mutableStateOf(false) }
    var showSpendDialog by remember { mutableStateOf(false) }
    var showModelPicker by remember { mutableStateOf(false) }

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) vm.enablePushNotifications()
    }

    val peersOnline = state.localLinkStatus?.hub?.peers?.count { it.online } ?: 0

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(s.surface)
            .statusBarsPadding(),
    ) {
        // Top Header: Settings + Lock app pill
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text("Settings", style = MaterialTheme.typography.headlineMedium, color = s.onSurface)
            Row(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(s.surfaceContainerLow)
                    .border(1.dp, s.outlineVariant, CircleShape)
                    .clickable { vm.disconnect() }
                    .padding(horizontal = 12.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Icon(Icons.Default.Lock, contentDescription = null, tint = s.onSurface, modifier = Modifier.size(15.dp))
                Text("Lock app", style = MaterialTheme.typography.labelMedium, color = s.onSurface)
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
            // Active Server Card
            StitchCard(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.Top,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(s.success))
                                Text(
                                    text = state.connectedAgentName.ifBlank {
                                        if (state.pikpamSignedIn) "Pikpam Cloud Agent" else "Connected Server"
                                    },
                                    style = MaterialTheme.typography.titleMedium,
                                    color = s.onSurface,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            Text(
                                text = state.serverUrl,
                                style = MaterialTheme.typography.labelSmall,
                                color = s.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            if (state.pikpamSignedIn && state.pikpamCreditsLabel.isNotBlank()) {
                                Text(
                                    text = "${state.pikpamEmail} • ${state.pikpamCreditsLabel}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = s.onSurfaceVariant,
                                )
                            }
                        }
                        StitchBadge(text = "Online", tone = BadgeTone.SUCCESS)
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        StitchPrimaryButton(
                            text = "Web UI",
                            icon = Icons.Default.OpenInBrowser,
                            onClick = { vm.openFullWebWorkspace("Full Agent Gitu Web Console") },
                            modifier = Modifier.weight(1f),
                        )
                        StitchSecondaryButton(
                            text = "Switch host",
                            icon = Icons.Default.SwapHoriz,
                            onClick = { vm.disconnect() },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }

            // Governance & Bridges 2x2 Grid (exact Stitch layout)
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    GovernanceTile(
                        icon = Icons.Default.Shield,
                        title = "Chief of Staff",
                        subtitle = state.chiefSettings.settings.preset,
                        onClick = { showChiefDialog = true },
                        modifier = Modifier.weight(1f),
                    )
                    GovernanceTile(
                        icon = Icons.Default.Link,
                        title = "Local PC Link",
                        subtitle = if (peersOnline > 0) "$peersOnline online" else "No paired PC",
                        highlightSubtitle = peersOnline > 0,
                        onClick = { showLocalLinkDialog = true },
                        modifier = Modifier.weight(1f),
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    GovernanceTile(
                        icon = Icons.Default.Extension,
                        title = "Connections",
                        subtitle = "Apps, Mail, APIs",
                        onClick = { vm.openConnections() },
                        modifier = Modifier.weight(1f),
                    )
                    GovernanceTile(
                        icon = Icons.Default.CalendarMonth,
                        title = "Schedules",
                        subtitle = if (state.schedules.isNotEmpty()) "${state.schedules.count { it.enabled }} active · ${state.schedules.size} total" else "Calendar & routines",
                        highlightSubtitle = state.schedules.any { it.enabled },
                        onClick = { vm.openSchedules() },
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            // Divided Preferences Card (Models, Spend ceiling, Coding access, Appearance, FCM Push)
            StitchCard(modifier = Modifier.fillMaxWidth()) {
                // Row 1: Models & fallbacks (Native Model Picker!)
                PreferenceRow(
                    title = "AI Model & Provider",
                    subtitle = state.modelsCatalog.effectiveModel?.ifBlank { "Server default" } ?: "Server default",
                    monoSubtitle = true,
                    trailing = { Icon(Icons.Default.ChevronRight, contentDescription = null, tint = s.onSurfaceVariant) },
                    onClick = {
                        vm.refreshModels()
                        showModelPicker = true
                    },
                )
                HorizontalDivider(color = s.outlineVariant)

                // Row 2: Spend ceiling & Autonomy
                val ceiling = state.homeInfo?.autonomy?.maxCostUsd
                PreferenceRow(
                    title = "Spend ceiling & autonomy",
                    subtitle = buildString {
                        append(if (state.homeInfo?.autonomy?.persistent != false) "Persistent" else "Fail-fast")
                        append(" • ")
                        append(if (ceiling != null) "$${"%.2f".format(ceiling)} USD cap" else "No USD cap")
                    },
                    monoSubtitle = true,
                    trailing = {
                        Box(
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(s.surfaceContainerLow)
                                .padding(horizontal = 10.dp, vertical = 4.dp),
                        ) {
                            Text("Edit", style = MaterialTheme.typography.labelMedium, color = s.onSurface)
                        }
                    },
                    onClick = { showSpendDialog = true },
                )
                HorizontalDivider(color = s.outlineVariant)

                // Row 3: Coding tool permissions
                val fullAccess = state.codingPermissions.access == "full"
                PreferenceRow(
                    title = "Full coding access",
                    subtitle = if (fullAccess) "Skip routine coding prompts" else "Ask before risky actions",
                    trailing = {
                        Switch(
                            checked = fullAccess,
                            onCheckedChange = { vm.updateCodingPermissions(if (it) "full" else "ask") },
                        )
                    },
                )
                HorizontalDivider(color = s.outlineVariant)

                // Row 4: Theme Switcher
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("Appearance", style = MaterialTheme.typography.labelLarge, color = s.onSurface)
                    StitchSegmentedPills(
                        items = listOf(
                            ThemePreference.DARK to "Dark",
                            ThemePreference.LIGHT to "Light",
                            ThemePreference.SYSTEM to "System",
                        ),
                        selected = state.themePreference,
                        onSelect = { vm.setThemePreference(it) },
                    )
                }
                HorizontalDivider(color = s.outlineVariant)

                // Row 5: Push alerts (FCM)
                PreferenceRow(
                    title = "Push alerts (FCM)",
                    subtitle = when {
                        !state.pushStatus.available -> "Configure FCM on server first"
                        state.pushStatus.enabled -> "Gates, completions & Cowork replies"
                        else -> "Tap to enable background alerts"
                    },
                    trailing = {
                        Switch(
                            checked = state.pushStatus.enabled,
                            enabled = !state.pushBusy && (state.pushStatus.available || state.pushStatus.enabled),
                            onCheckedChange = { wantEnable ->
                                if (wantEnable) {
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                        notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                                    } else {
                                        vm.enablePushNotifications()
                                    }
                                } else {
                                    vm.disablePushNotifications()
                                }
                            },
                        )
                    },
                )
                if (state.pushStatus.enabled) {
                    HorizontalDivider(color = s.outlineVariant)
                    Box(modifier = Modifier.padding(12.dp)) {
                        StitchSecondaryButton(
                            text = "Send test notification",
                            onClick = { vm.sendTestPush() },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
        }
    }

    if (showChiefDialog) {
        AlertDialog(
            onDismissRequest = { showChiefDialog = false },
            containerColor = s.surfaceContainerLowest,
            title = { Text("Chief of Staff Authority", color = s.onSurface) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (state.chiefSettings.presets.isEmpty()) {
                        Text("Current policy: ${state.chiefSettings.settings.preset}", color = s.onSurfaceVariant)
                    } else {
                        state.chiefSettings.presets.forEach { preset ->
                            val active = state.chiefSettings.settings.preset == preset.id
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(if (active) s.surfaceContainer else s.surfaceContainerLow)
                                    .clickable {
                                        vm.updateChiefPreset(preset.id)
                                        showChiefDialog = false
                                    }
                                    .padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(preset.label, style = MaterialTheme.typography.titleSmall, color = s.onSurface)
                                    Text(preset.description, style = MaterialTheme.typography.bodySmall, color = s.onSurfaceVariant)
                                }
                                if (active) StitchBadge(text = "Active", tone = BadgeTone.PRIMARY)
                            }
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showChiefDialog = false }) { Text("Close", color = s.primary) } },
        )
    }

    if (showLocalLinkDialog) {
        AlertDialog(
            onDismissRequest = { showLocalLinkDialog = false },
            containerColor = s.surfaceContainerLowest,
            title = { Text("Local PC Link", color = s.onSurface) },
            text = {
                val peers = state.localLinkStatus?.hub?.peers.orEmpty()
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (peers.isEmpty()) {
                        Text("No local PCs paired yet. Pair a computer in desktop Settings → Local PC Link.", color = s.onSurfaceVariant)
                    } else {
                        peers.forEach { peer ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(peer.deviceName, color = s.onSurface, style = MaterialTheme.typography.bodyMedium)
                                StitchBadge(
                                    text = if (peer.online) "Online" else "Offline",
                                    tone = if (peer.online) BadgeTone.SUCCESS else BadgeTone.NEUTRAL,
                                )
                            }
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showLocalLinkDialog = false }) { Text("Close", color = s.primary) } },
        )
    }

    if (showSpendDialog) {
        var persistent by remember { mutableStateOf(state.homeInfo?.autonomy?.persistent != false) }
        var ceilingText by remember { mutableStateOf(state.homeInfo?.autonomy?.maxCostUsd?.toString().orEmpty()) }
        AlertDialog(
            onDismissRequest = { showSpendDialog = false },
            containerColor = s.surfaceContainerLowest,
            title = { Text("Autonomy & Spend Ceiling", color = s.onSurface) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("Persistent autonomy", color = s.onSurface)
                        Switch(checked = persistent, onCheckedChange = { persistent = it })
                    }
                    StitchInputField(
                        value = ceilingText,
                        onValueChange = { ceilingText = it },
                        label = "Spend ceiling (USD)",
                        placeholder = "25.00",
                        mono = true,
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    vm.updateAutonomy(persistent, ceilingText.trim().toDoubleOrNull())
                    showSpendDialog = false
                }) { Text("Save", color = s.primary) }
            },
            dismissButton = { TextButton(onClick = { showSpendDialog = false }) { Text("Cancel", color = s.onSurfaceVariant) } },
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

@Composable
private fun GovernanceTile(
    icon: ImageVector,
    title: String,
    subtitle: String,
    highlightSubtitle: Boolean = false,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val s = LocalStitchPalette.current
    StitchCard(modifier = modifier, onClick = onClick) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Icon(icon, contentDescription = null, tint = s.primary, modifier = Modifier.size(20.dp))
            Text(title, style = MaterialTheme.typography.titleMedium, color = s.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                text = subtitle,
                style = MaterialTheme.typography.labelSmall,
                color = if (highlightSubtitle) s.successContainer else s.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun PreferenceRow(
    title: String,
    subtitle: String,
    monoSubtitle: Boolean = false,
    trailing: @Composable () -> Unit,
    onClick: (() -> Unit)? = null,
) {
    val s = LocalStitchPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, style = MaterialTheme.typography.labelLarge, color = s.onSurface)
            Text(
                text = subtitle,
                style = if (monoSubtitle) MaterialTheme.typography.labelSmall else MaterialTheme.typography.bodySmall,
                color = s.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(10.dp))
        trailing()
    }
}
