package dev.agentgitu.mobile.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.agentgitu.mobile.data.model.CustomConnectionProfile
import dev.agentgitu.mobile.ui.components.*
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette
import dev.agentgitu.mobile.ui.viewmodel.AppUiState
import dev.agentgitu.mobile.ui.viewmodel.GituAppViewModel
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.encodeToJsonElement
import java.net.URI

private enum class ConnectionsTab {
    CONNECTED,
    CATALOG,
    CUSTOM_MAIL,
}

/**
 * Native Connections Page:
 * Manage per-teammate Connected Apps (OAuth & Composio catalog with real brand logos),
 * Always-Allowed App Permissions, Mailboxes (IMAP/SMTP), and Custom API Connections
 * (`/api/connections`) with full Web parity (presets dropdown, auth scheme dropdown,
 * Show/Hide API key, advanced settings, and editing).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConnectionsScreen(
    state: AppUiState,
    vm: GituAppViewModel,
    onBack: () -> Unit,
) {
    val s = LocalStitchPalette.current
    val uriHandler = LocalUriHandler.current
    var tab by remember { mutableStateOf(ConnectionsTab.CONNECTED) }
    var search by remember { mutableStateOf("") }
    var showAddCustomDialog by remember { mutableStateOf(false) }
    var editingCustomConnection by remember { mutableStateOf<CustomConnectionProfile?>(null) }
    var showAddMailDialog by remember { mutableStateOf(false) }
    var apiKeyConnectService by remember { mutableStateOf<dev.agentgitu.mobile.data.model.ConnectedServiceItem?>(null) }
    var composioKey by remember { mutableStateOf("") }

    val selectedAgent = state.teammates.firstOrNull { it.id == state.connectionsAgentId }
        ?: state.teammates.firstOrNull()
    val effectiveAgentId = selectedAgent?.id.orEmpty()

    // Automatically open OAuth URL in device browser when returned by server
    LaunchedEffect(state.pendingOAuthUrl) {
        val url = state.pendingOAuthUrl
        if (!url.isNullOrBlank() && (url.startsWith("http://") || url.startsWith("https://"))) {
            runCatching { uriHandler.openUri(url) }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(s.surface)
            .statusBarsPadding()
            .navigationBarsPadding(),
    ) {
        // Header
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
                Column {
                    Text("Connections", style = MaterialTheme.typography.titleLarge, color = s.onSurface)
                    Text(
                        text = selectedAgent?.let { "Apps & accounts for ${it.name}" } ?: "Apps, mailboxes & custom APIs",
                        style = MaterialTheme.typography.labelSmall,
                        color = s.onSurfaceVariant,
                    )
                }
            }
            StitchCircleIconButton(
                icon = Icons.Default.Refresh,
                contentDescription = "Refresh connections",
                outlined = true,
                size = 38.dp,
                onClick = { vm.refreshConnections(effectiveAgentId, search) },
            )
        }

        // Teammate selector strip
        if (state.teammates.isNotEmpty()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                state.teammates.forEach { ag ->
                    val active = ag.id == effectiveAgentId
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(if (active) s.primary else s.surfaceContainerLow)
                            .border(1.dp, if (active) s.primary else s.outlineVariant, CircleShape)
                            .clickable { vm.refreshConnections(ag.id, search) }
                            .padding(start = 6.dp, end = 10.dp, top = 4.dp, bottom = 4.dp),
                    ) {
                        StitchCharacterAvatar(
                            label = ag.name,
                            accentHex = ag.avatar.color,
                            shapeName = ag.avatar.shape,
                            imageUrl = ag.avatar.imageUrl,
                            size = 22.dp,
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

        // Segmented Tabs
        Box(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
            StitchSegmentedPills(
                items = listOf(
                    ConnectionsTab.CONNECTED to "Connected",
                    ConnectionsTab.CATALOG to "Apps",
                    ConnectionsTab.CUSTOM_MAIL to "Custom & Mail",
                ),
                selected = tab,
                onSelect = { tab = it },
            )
        }

        // Pending OAuth Sign-In Banner
        state.pendingOAuthUrl?.takeIf { it.isNotBlank() }?.let { oauthUrl ->
            StitchCard(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                containerColor = s.surfaceContainerLow,
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(Icons.Default.OpenInNew, contentDescription = null, tint = s.primary, modifier = Modifier.size(18.dp))
                    Text(
                        text = "Finish sign-in in your browser, then refresh.",
                        style = MaterialTheme.typography.bodySmall,
                        color = s.onSurface,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = { runCatching { uriHandler.openUri(oauthUrl) } }) {
                        Text("Open", color = s.primary)
                    }
                    TextButton(onClick = {
                        vm.clearPendingOAuthUrl()
                        vm.refreshConnections(effectiveAgentId, search)
                    }) {
                        Text("Done", color = s.onSurface)
                    }
                }
            }
        }

        if (state.connectionsLoading) {
            LinearProgressIndicator(
                modifier = Modifier.fillMaxWidth(),
                color = s.primary,
                trackColor = s.surfaceContainerLow,
            )
        }

        HorizontalDivider(color = s.outlineVariant)

        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = { vm.pullRefreshConnections(effectiveAgentId, search) },
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                when (tab) {
                    ConnectionsTab.CONNECTED -> {
                        val assigned = state.connectedApps.accounts + state.connectedApps.mail.accounts
                        if (assigned.isEmpty()) {
                            item(key = "empty_connected") {
                                StitchCard(modifier = Modifier.fillMaxWidth().animateItem()) {
                                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                        Text("No connected apps yet", style = MaterialTheme.typography.titleSmall, color = s.onSurface)
                                        Text(
                                            "Switch to Apps to connect Gmail, Calendar, GitHub, Slack, or use Custom & Mail for IMAP/SMTP and API keys.",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = s.onSurfaceVariant,
                                        )
                                    }
                                }
                            }
                        } else {
                            items(assigned, key = { "acc_${it.id}" }) { acc ->
                                val displayName = acc.label ?: acc.address ?: humanizeActionWords(acc.toolkit.ifBlank { "mail" })
                                StitchCard(modifier = Modifier.fillMaxWidth().animateItem()) {
                                    Row(
                                        modifier = Modifier.padding(12.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    ) {
                                        AppServiceLogo(
                                            serviceSlug = acc.toolkit.ifBlank { "mail" },
                                            fallbackLabel = displayName,
                                            servicesCatalog = state.connectedApps.services,
                                            size = 38.dp,
                                        )
                                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                            Text(
                                                text = displayName,
                                                style = MaterialTheme.typography.labelLarge,
                                                color = s.onSurface,
                                            )
                                            Text(
                                                text = "${humanizeActionWords(acc.toolkit.ifBlank { "account" })} • ${acc.status.ifBlank { "ACTIVE" }}",
                                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                                                color = s.onSurfaceVariant,
                                            )
                                        }
                                        if (effectiveAgentId.isNotBlank()) {
                                            TextButton(onClick = { vm.disconnectAppAccount(effectiveAgentId, acc.id) }) {
                                                Text("Remove", color = s.error)
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        val available = state.connectedApps.availableAccounts + state.connectedApps.mail.available
                        if (available.isNotEmpty() && effectiveAgentId.isNotBlank()) {
                            item(key = "avail_hdr") {
                                Text("Available workspace accounts", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                            }
                            items(available, key = { "av_${it.id}" }) { acc ->
                                val displayName = acc.label ?: acc.address ?: humanizeActionWords(acc.toolkit.ifBlank { "mail" })
                                StitchCard(modifier = Modifier.fillMaxWidth().animateItem(), containerColor = s.surfaceContainerLow) {
                                    Row(
                                        modifier = Modifier.padding(12.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    ) {
                                        AppServiceLogo(
                                            serviceSlug = acc.toolkit.ifBlank { "mail" },
                                            fallbackLabel = displayName,
                                            servicesCatalog = state.connectedApps.services,
                                            size = 36.dp,
                                        )
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                text = displayName,
                                                style = MaterialTheme.typography.labelLarge,
                                                color = s.onSurface,
                                            )
                                            Text(humanizeActionWords(acc.toolkit.ifBlank { "account" }), style = MaterialTheme.typography.labelSmall, color = s.onSurfaceVariant)
                                        }
                                        StitchPrimaryButton(
                                            text = "Assign",
                                            onClick = { vm.assignAppAccount(effectiveAgentId, acc.id) },
                                        )
                                    }
                                }
                            }
                        }

                        if (state.connectedApps.appPermissions.isNotEmpty()) {
                            item(key = "perm_hdr") {
                                Text("Always-allowed actions", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                            }
                            items(state.connectedApps.appPermissions, key = { "perm_${it.id}" }) { perm ->
                                StitchCard(modifier = Modifier.fillMaxWidth().animateItem()) {
                                    Row(
                                        modifier = Modifier.padding(12.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    ) {
                                        AppServiceLogo(
                                            serviceSlug = perm.service,
                                            fallbackLabel = perm.service,
                                            servicesCatalog = state.connectedApps.services,
                                            size = 34.dp,
                                        )
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(appActionDisplayName(perm.tool, perm.service), style = MaterialTheme.typography.labelMedium, color = s.onSurface)
                                            Text("@${perm.agentName} • ${humanizeActionWords(perm.service)}", style = MaterialTheme.typography.labelSmall, color = s.onSurfaceVariant)
                                        }
                                        TextButton(onClick = { vm.revokeAppPermission(perm.id) }) {
                                            Text("Revoke", color = s.error)
                                        }
                                    }
                                }
                            }
                        }
                    }

                    ConnectionsTab.CATALOG -> {
                        item(key = "search_apps") {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.Bottom,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                StitchInputField(
                                    value = search,
                                    onValueChange = { search = it },
                                    label = "Search apps",
                                    placeholder = "Gmail, GitHub, Slack, Calendar…",
                                    modifier = Modifier.weight(1f),
                                )
                                StitchCircleIconButton(
                                    icon = Icons.Default.Search,
                                    contentDescription = "Search",
                                    primary = true,
                                    size = 46.dp,
                                    onClick = { vm.refreshConnections(effectiveAgentId, search) },
                                )
                            }
                        }

                        if (state.connectedApps.services.isNotEmpty()) {
                            items(state.connectedApps.services, key = { "svc_${it.slug}" }) { svc ->
                                val isActive = svc.status.equals("ACTIVE", ignoreCase = true) ||
                                    (state.connectedApps.accounts + state.connectedApps.mail.accounts).any {
                                        it.toolkit.equals(svc.slug, ignoreCase = true) && !it.disabled && it.status.equals("ACTIVE", ignoreCase = true)
                                    }
                                val existingAvailable = (state.connectedApps.availableAccounts + state.connectedApps.mail.available).firstOrNull {
                                    it.toolkit.equals(svc.slug, ignoreCase = true) && !it.disabled && it.status.equals("ACTIVE", ignoreCase = true)
                                }
                                StitchCard(modifier = Modifier.fillMaxWidth().animateItem()) {
                                    Row(
                                        modifier = Modifier.padding(12.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    ) {
                                        ServiceLogoBox(logoUrl = svc.logo, fallbackLabel = svc.name.ifBlank { svc.slug })
                                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                            Text(
                                                text = svc.name.ifBlank { svc.slug },
                                                style = MaterialTheme.typography.labelLarge,
                                                color = s.onSurface,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis,
                                            )
                                            val descText = when {
                                                isActive -> "Connected for ${selectedAgent?.name ?: "teammate"}"
                                                existingAvailable != null -> "Connected in Pikpam • tap Assign"
                                                !svc.supportsDirectOAuth && svc.apiKeyAuthConfig != null -> "API key / token connection"
                                                !svc.description.isNullOrBlank() -> svc.description
                                                else -> "OAuth connection"
                                            }
                                            Text(
                                                text = descText,
                                                style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp),
                                                color = if (isActive) s.success else s.onSurfaceVariant,
                                                maxLines = 2,
                                                overflow = TextOverflow.Ellipsis,
                                            )
                                        }
                                        when {
                                            isActive -> StitchBadge(text = "Connected", tone = BadgeTone.SUCCESS)
                                            existingAvailable != null && effectiveAgentId.isNotBlank() -> {
                                                StitchPrimaryButton(
                                                    text = "Assign",
                                                    onClick = { vm.assignAppAccount(effectiveAgentId, existingAvailable.id) },
                                                )
                                            }
                                            else -> {
                                                StitchPrimaryButton(
                                                    text = "Connect",
                                                    enabled = effectiveAgentId.isNotBlank(),
                                                    onClick = {
                                                        when {
                                                            svc.slug.equals("mail", ignoreCase = true) -> showAddMailDialog = true
                                                            !svc.supportsDirectOAuth && svc.apiKeyAuthConfig != null -> apiKeyConnectService = svc
                                                            else -> vm.connectAppService(effectiveAgentId, svc.slug)
                                                        }
                                                    },
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        if (!state.connectedApps.configured) {
                            item(key = "composio_setup") {
                                StitchCard(modifier = Modifier.fillMaxWidth(), containerColor = s.surfaceContainerLow) {
                                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                        Text("Connect Mailbox or Enable OAuth App Catalog", style = MaterialTheme.typography.titleSmall, color = s.onSurface)
                                        Text(
                                            "Connect a mailbox directly now, or add a Composio API key to browse and connect 100+ OAuth apps (Gmail, Calendar, GitHub, Slack, Notion).",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = s.onSurfaceVariant,
                                        )
                                        StitchSecondaryButton(
                                            text = "Connect Email / Mailbox",
                                            icon = Icons.Default.Email,
                                            outlined = true,
                                            enabled = effectiveAgentId.isNotBlank(),
                                            onClick = { showAddMailDialog = true },
                                            modifier = Modifier.fillMaxWidth(),
                                        )
                                        StitchInputField(
                                            value = composioKey,
                                            onValueChange = { composioKey = it },
                                            label = "Composio API Key",
                                            placeholder = "ak_...",
                                            mono = true,
                                            visualTransformation = PasswordVisualTransformation(),
                                        )
                                        StitchPrimaryButton(
                                            text = "Save key & load catalog",
                                            enabled = composioKey.isNotBlank(),
                                            onClick = {
                                                vm.configureComposio(composioKey)
                                                composioKey = ""
                                            },
                                            modifier = Modifier.fillMaxWidth(),
                                        )
                                    }
                                }
                            }
                        } else if (state.connectedApps.services.isEmpty()) {
                            item(key = "no_catalog") {
                                StitchBanner("No matching apps found. Try another keyword or tap Refresh.")
                            }
                        }
                    }

                    ConnectionsTab.CUSTOM_MAIL -> {
                        item(key = "quick_adds") {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                StitchPrimaryButton(
                                    text = "+ Custom API",
                                    icon = Icons.Default.Key,
                                    onClick = { showAddCustomDialog = true },
                                    modifier = Modifier.weight(1f),
                                )
                                StitchSecondaryButton(
                                    text = "+ Mailbox",
                                    icon = Icons.Default.Email,
                                    outlined = true,
                                    enabled = effectiveAgentId.isNotBlank(),
                                    onClick = { showAddMailDialog = true },
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }

                        item(key = "custom_hdr") {
                            Text("Custom API Connections (${state.customConnections.size})", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                        }

                        if (state.customConnections.isEmpty()) {
                            item(key = "no_custom") {
                                StitchCard(modifier = Modifier.fillMaxWidth()) {
                                    Text(
                                        text = "No custom API connections saved yet. Add Pikpam, Stripe, GitHub, or any REST API with Bearer auth.",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = s.onSurfaceVariant,
                                        modifier = Modifier.padding(14.dp),
                                    )
                                }
                            }
                        } else {
                            items(state.customConnections, key = { "cc_${it.id}" }) { conn ->
                                StitchCard(modifier = Modifier.fillMaxWidth().animateItem()) {
                                    Row(
                                        modifier = Modifier.padding(12.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    ) {
                                        AppServiceLogo(
                                            serviceSlug = conn.provider,
                                            baseUrl = conn.baseUrl,
                                            fallbackLabel = conn.label.ifBlank { conn.provider },
                                            servicesCatalog = state.connectedApps.services,
                                            size = 38.dp,
                                        )
                                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                            Text(conn.label.ifBlank { conn.provider }, style = MaterialTheme.typography.labelLarge, color = s.onSurface)
                                            Text(conn.baseUrl, style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp), color = s.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        }
                                        TextButton(onClick = { editingCustomConnection = conn }) {
                                            Text("Edit", color = s.primary)
                                        }
                                        TextButton(onClick = { vm.deleteCustomConnection(conn.id) }) {
                                            Text("Delete", color = s.error)
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

    if (showAddCustomDialog || editingCustomConnection != null) {
        val editing = editingCustomConnection
        CustomConnectionEditorDialog(
            initial = editing,
            servicesCatalog = state.connectedApps.services,
            onDismiss = {
                showAddCustomDialog = false
                editingCustomConnection = null
            },
            onSave = { id, label, provider, baseUrl, token, validationPath, docsUrl, caps, authType, authHeader, authPrefix, ops, structuredAuth ->
                vm.saveCustomConnection(
                    id = id,
                    label = label,
                    provider = provider,
                    baseUrl = baseUrl,
                    token = token,
                    validationPath = validationPath,
                    documentationUrl = docsUrl,
                    capabilities = caps,
                    authType = authType,
                    authHeader = authHeader,
                    authPrefix = authPrefix,
                    existingOperations = ops,
                    structuredAuthJson = structuredAuth,
                )
                showAddCustomDialog = false
                editingCustomConnection = null
            },
        )
    }

    if (showAddMailDialog && effectiveAgentId.isNotBlank()) {
        var address by remember { mutableStateOf("") }
        var password by remember { mutableStateOf("") }
        var imapHost by remember { mutableStateOf("imap.gmail.com") }
        var imapPort by remember { mutableStateOf("993") }
        var smtpHost by remember { mutableStateOf("smtp.gmail.com") }
        var smtpPort by remember { mutableStateOf("465") }
        var detectNote by remember { mutableStateOf<String?>(null) }

        AlertDialog(
            onDismissRequest = { showAddMailDialog = false },
            containerColor = s.surfaceContainerLowest,
            title = { Text("Connect Mailbox", color = s.onSurface) },
            text = {
                Column(
                    modifier = Modifier.verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
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
                    StitchInputField(
                        value = password,
                        onValueChange = { password = it },
                        label = "App Password",
                        visualTransformation = PasswordVisualTransformation(),
                    )
                    StitchInputField(value = imapHost, onValueChange = { imapHost = it }, label = "IMAP Host", mono = true)
                    StitchInputField(value = smtpHost, onValueChange = { smtpHost = it }, label = "SMTP Host", mono = true)
                }
            },
            confirmButton = {
                TextButton(
                    enabled = address.contains("@") && password.isNotBlank() && imapHost.isNotBlank() && smtpHost.isNotBlank(),
                    onClick = {
                        vm.connectMailbox(
                            agentId = effectiveAgentId,
                            address = address,
                            password = password,
                            imapHost = imapHost,
                            imapPort = imapPort.toIntOrNull() ?: 993,
                            smtpHost = smtpHost,
                            smtpPort = smtpPort.toIntOrNull() ?: 465,
                        )
                        showAddMailDialog = false
                    },
                ) { Text("Connect", color = s.primary) }
            },
            dismissButton = { TextButton(onClick = { showAddMailDialog = false }) { Text("Cancel", color = s.onSurfaceVariant) } },
        )
    }

    // Dynamic per-app API Key / Bearer / Basic credential form (for non-OAuth apps in catalog)
    apiKeyConnectService?.let { svc ->
        val auth = svc.apiKeyAuthConfig
        val fields = remember(svc.slug) {
            auth?.fields?.takeIf { it.isNotEmpty() }
                ?: listOf(
                    dev.agentgitu.mobile.data.model.ServiceAuthField(
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
            onDismissRequest = { apiKeyConnectService = null },
            containerColor = s.surfaceContainerLowest,
            title = { Text("Connect ${svc.name.ifBlank { svc.slug }}", color = s.onSurface) },
            text = {
                Column(
                    modifier = Modifier.verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = "Credentials are sent securely over your session and are not saved in chat.",
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
                    enabled = allReqFilled && effectiveAgentId.isNotBlank(),
                    onClick = {
                        vm.connectAppService(
                            agentId = effectiveAgentId,
                            service = svc.slug,
                            fields = values.toMap(),
                            authConfigId = auth?.id?.takeIf { it.isNotBlank() },
                            authScheme = auth?.scheme?.takeIf { it.isNotBlank() },
                            alias = alias.trim().takeIf { it.isNotBlank() },
                        )
                        apiKeyConnectService = null
                    },
                ) { Text("Connect app", color = s.primary) }
            },
            dismissButton = { TextButton(onClick = { apiKeyConnectService = null }) { Text("Cancel", color = s.onSurfaceVariant) } },
        )
    }
}

@Composable
private fun CustomConnectionEditorDialog(
    initial: CustomConnectionProfile?,
    servicesCatalog: List<dev.agentgitu.mobile.data.model.ConnectedServiceItem>,
    onDismiss: () -> Unit,
    onSave: (
        id: String?,
        label: String,
        provider: String,
        baseUrl: String,
        token: String,
        validationPath: String,
        documentationUrl: String?,
        capabilities: List<String>,
        authType: String,
        authHeader: String?,
        authPrefix: String?,
        existingOperations: List<dev.agentgitu.mobile.data.model.CustomConnectionOperation>,
        structuredAuthJson: kotlinx.serialization.json.JsonElement?,
    ) -> Unit,
) {
    val s = LocalStitchPalette.current
    val isEdit = initial != null && initial.id.isNotBlank()
    val initialPreset = remember(initial) {
        CUSTOM_CONNECTION_PRESETS.firstOrNull { it.id.equals(initial?.provider, ignoreCase = true) }
            ?: CUSTOM_CONNECTION_PRESETS.first()
    }
    val isStructuredAuth = remember(initial) {
        initial?.auth?.type?.lowercase() in setOf("basic", "headers", "oauth2")
    }

    var selectedPreset by remember(initial) { mutableStateOf(initialPreset) }
    var presetMenuOpen by remember { mutableStateOf(false) }
    var label by remember(initial) { mutableStateOf(initial?.label.orEmpty()) }
    var baseUrl by remember(initial) { mutableStateOf(initial?.baseUrl.orEmpty()) }
    var token by remember(initial) { mutableStateOf("") }
    var showToken by remember(initial) { mutableStateOf(false) }
    var showAdvanced by remember(initial) {
        mutableStateOf(
            isEdit ||
                initial?.auth?.type?.lowercase() == "header" ||
                isStructuredAuth,
        )
    }
    var documentationUrl by remember(initial) { mutableStateOf(initial?.documentationUrl.orEmpty()) }
    var validationPath by remember(initial) { mutableStateOf(initial?.validationPath?.ifBlank { "" } ?: "") }
    var capabilitiesText by remember(initial) {
        mutableStateOf(
            initial?.capabilities?.takeIf { it.isNotEmpty() }?.joinToString(", ") ?: "connection.discover",
        )
    }
    var authType by remember(initial) {
        mutableStateOf(
            when (initial?.auth?.type?.lowercase()) {
                "bearer" -> "bearer"
                "header" -> "header"
                else -> "auto"
            },
        )
    }
    var authMenuOpen by remember { mutableStateOf(false) }
    var authHeader by remember(initial) { mutableStateOf(initial?.auth?.header.orEmpty()) }
    var authPrefix by remember(initial) { mutableStateOf(initial?.auth?.prefix.orEmpty()) }

    val validUrl = remember(baseUrl) {
        val u = baseUrl.trim()
        u.startsWith("https://", ignoreCase = true) ||
            u.startsWith("http://localhost", ignoreCase = true) ||
            u.startsWith("http://127.0.0.1", ignoreCase = true)
    }
    val headerOk = authType != "header" || authHeader.isNotBlank()
    val canSubmit = label.isNotBlank() && validUrl && (isEdit || token.isNotBlank()) && headerOk

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = s.surfaceContainerLowest,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                AppServiceLogo(
                    serviceSlug = if (selectedPreset.id == "custom") initial?.provider else selectedPreset.id,
                    baseUrl = baseUrl,
                    fallbackLabel = label.ifBlank { selectedPreset.name },
                    servicesCatalog = servicesCatalog,
                    size = 34.dp,
                )
                Column {
                    Text(
                        text = if (isEdit) "Edit custom connection" else "Add a custom connection",
                        style = MaterialTheme.typography.titleMedium,
                        color = s.onSurface,
                    )
                    Text(
                        text = "Gives Gitu secure access to the service you choose.",
                        style = MaterialTheme.typography.labelSmall,
                        color = s.onSurfaceVariant,
                    )
                }
            }
        },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                // Service preset dropdown (exact match to Web ui-custom-connection.ts)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Service", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                    Box {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(s.surfaceContainerLow)
                                .border(1.dp, s.outlineVariant, RoundedCornerShape(12.dp))
                                .clickable(enabled = !isEdit) { presetMenuOpen = true }
                                .padding(horizontal = 12.dp, vertical = 11.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                AppServiceLogo(
                                    serviceSlug = if (selectedPreset.id == "custom") null else selectedPreset.id,
                                    baseUrl = selectedPreset.url,
                                    fallbackLabel = selectedPreset.name,
                                    servicesCatalog = servicesCatalog,
                                    size = 24.dp,
                                )
                                Text(
                                    text = selectedPreset.name,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = if (isEdit) s.onSurfaceVariant else s.onSurface,
                                )
                            }
                            if (!isEdit) {
                                Icon(Icons.Default.KeyboardArrowDown, contentDescription = "Select service", tint = s.onSurfaceVariant)
                            }
                        }
                        DropdownMenu(
                            expanded = presetMenuOpen,
                            onDismissRequest = { presetMenuOpen = false },
                        ) {
                            CUSTOM_CONNECTION_PRESETS.forEach { preset ->
                                DropdownMenuItem(
                                    text = {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                            AppServiceLogo(
                                                serviceSlug = if (preset.id == "custom") null else preset.id,
                                                baseUrl = preset.url,
                                                fallbackLabel = preset.name,
                                                servicesCatalog = servicesCatalog,
                                                size = 22.dp,
                                            )
                                            Text(preset.name)
                                        }
                                    },
                                    onClick = {
                                        presetMenuOpen = false
                                        val prevName = selectedPreset.name
                                        selectedPreset = preset
                                        baseUrl = preset.url
                                        documentationUrl = preset.docs
                                        validationPath = preset.path
                                        capabilitiesText = preset.capability
                                        authType = "auto"
                                        if (label.isBlank() || CUSTOM_CONNECTION_PRESETS.any { it.name == label } || label == prevName) {
                                            label = if (preset.id == "custom") "" else preset.name
                                        }
                                    },
                                )
                            }
                        }
                    }
                    Text(
                        text = if (selectedPreset.isSearch) {
                            "Research uses this API without opening the browser. The test runs one search."
                        } else {
                            "Choose a service, or connect your own HTTP API."
                        },
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                        color = s.onSurfaceVariant,
                    )
                }

                StitchInputField(
                    value = label,
                    onValueChange = { label = it },
                    label = "Connection name",
                    placeholder = "Production API",
                )
                StitchInputField(
                    value = baseUrl,
                    onValueChange = { if (!selectedPreset.isSearch) baseUrl = it },
                    label = "API address",
                    placeholder = "https://api.example.com",
                    mono = true,
                )
                StitchInputField(
                    value = token,
                    onValueChange = { token = it },
                    label = if (isEdit) "API key or access token (leave blank to keep)" else "API key or access token",
                    placeholder = "Saved securely — never enters chat",
                    mono = true,
                    visualTransformation = if (showToken) VisualTransformation.None else PasswordVisualTransformation(),
                    trailingIcon = {
                        IconButton(onClick = { showToken = !showToken }) {
                            Icon(
                                imageVector = if (showToken) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                contentDescription = if (showToken) "Hide API key" else "Show API key",
                                tint = s.onSurfaceVariant,
                            )
                        }
                    },
                )

                // Collapsible Advanced connection settings (exact Web parity)
                HorizontalDivider(color = s.outlineVariant)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .clickable { showAdvanced = !showAdvanced }
                        .padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(
                        imageVector = if (showAdvanced) Icons.Default.ExpandLess else Icons.Default.ChevronRight,
                        contentDescription = null,
                        tint = s.onSurfaceVariant,
                        modifier = Modifier.size(18.dp),
                    )
                    Text("Advanced connection settings", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                }

                if (showAdvanced) {
                    StitchInputField(
                        value = documentationUrl,
                        onValueChange = { documentationUrl = it },
                        label = "Documentation URL (optional)",
                        placeholder = "https://docs.example.com",
                        mono = true,
                    )
                    StitchInputField(
                        value = validationPath,
                        onValueChange = { validationPath = it },
                        label = "Connection test path",
                        placeholder = "/api/me",
                        mono = true,
                    )
                    StitchInputField(
                        value = capabilitiesText,
                        onValueChange = { capabilitiesText = it },
                        label = "Capabilities (comma-separated)",
                        placeholder = "connection.discover",
                        mono = true,
                    )

                    if (isStructuredAuth && initial?.auth != null) {
                        val modeLabel = when (initial.auth.type.lowercase()) {
                            "basic" -> "Username and password"
                            "oauth2" -> if (initial.auth.grantType == "password") "OAuth API credentials" else "OAuth client credentials"
                            else -> "Multiple authentication headers"
                        }
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .background(s.surfaceContainerLow)
                                .border(1.dp, s.primary.copy(alpha = 0.45f), RoundedCornerShape(10.dp))
                                .padding(10.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Text(modeLabel, style = MaterialTheme.typography.labelMedium, color = s.onSurface)
                            val fieldLabels = initial.auth.fields.map { it.label }.filter { it.isNotBlank() }.joinToString(", ")
                            if (fieldLabels.isNotBlank()) {
                                Text(fieldLabels, style = MaterialTheme.typography.bodySmall, color = s.onSurfaceVariant)
                            }
                            Text(
                                text = "Update these credentials through a secure connection card from your teammate.",
                                style = MaterialTheme.typography.labelSmall,
                                color = s.onSurfaceVariant,
                            )
                        }
                    } else {
                        // Authentication dropdown matching connectionAuthFieldsHtml
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("Authentication", style = MaterialTheme.typography.labelMedium, color = s.onSurfaceVariant)
                            Box {
                                val authLabel = CUSTOM_CONNECTION_AUTH_OPTIONS.firstOrNull { it.first == authType }?.second ?: "Service default"
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(s.surfaceContainerLow)
                                        .border(1.dp, s.outlineVariant, RoundedCornerShape(12.dp))
                                        .clickable { authMenuOpen = true }
                                        .padding(horizontal = 12.dp, vertical = 11.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(authLabel, style = MaterialTheme.typography.bodyMedium, color = s.onSurface)
                                    Icon(Icons.Default.KeyboardArrowDown, contentDescription = "Select authentication", tint = s.onSurfaceVariant)
                                }
                                DropdownMenu(expanded = authMenuOpen, onDismissRequest = { authMenuOpen = false }) {
                                    CUSTOM_CONNECTION_AUTH_OPTIONS.forEach { (value, optionLabel) ->
                                        DropdownMenuItem(
                                            text = { Text(optionLabel) },
                                            onClick = {
                                                authType = value
                                                authMenuOpen = false
                                            },
                                        )
                                    }
                                }
                            }
                            Text(
                                text = "Custom APIs use Bearer by default. Choose a header when API docs require one.",
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                                color = s.onSurfaceVariant,
                            )
                        }

                        if (authType == "header") {
                            StitchInputField(
                                value = authHeader,
                                onValueChange = { authHeader = it },
                                label = "Authentication header",
                                placeholder = "X-API-Key",
                                mono = true,
                            )
                            StitchInputField(
                                value = authPrefix,
                                onValueChange = { authPrefix = it },
                                label = "Authentication prefix (optional)",
                                placeholder = "Leave blank for raw API key",
                                mono = true,
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = canSubmit,
                onClick = {
                    val caps = capabilitiesText.split(",").map { it.trim() }.filter { it.isNotBlank() }
                        .ifEmpty { listOf(selectedPreset.capability) }
                    val derivedProvider = when {
                        isEdit && !initial?.provider.isNullOrBlank() -> initial!!.provider
                        selectedPreset.id != "custom" -> selectedPreset.id
                        else -> {
                            val host = runCatching { URI(baseUrl.trim()).host.orEmpty() }.getOrDefault("custom")
                            ("api-" + host.lowercase().replace(Regex("[^a-z0-9-]+"), "-")).take(63)
                        }
                    }
                    val structuredJson = if (isStructuredAuth && initial?.auth != null) {
                        Json.encodeToJsonElement(initial.auth)
                    } else null
                    onSave(
                        initial?.id?.takeIf { it.isNotBlank() },
                        label.trim(),
                        derivedProvider,
                        baseUrl.trim(),
                        token,
                        validationPath.trim().ifBlank { "/" },
                        documentationUrl.trim().takeIf { it.isNotBlank() },
                        caps,
                        authType,
                        authHeader.trim().takeIf { it.isNotBlank() },
                        authPrefix.trim().takeIf { it.isNotBlank() },
                        initial?.operations.orEmpty(),
                        structuredJson,
                    )
                },
            ) { Text(if (isEdit) "Save changes & test" else "Save & test", color = s.primary) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", color = s.onSurfaceVariant) } },
    )
}

@Composable
private fun ServiceLogoBox(logoUrl: String?, fallbackLabel: String, serviceSlug: String? = null) {
    AppServiceLogo(
        logoUrl = logoUrl,
        serviceSlug = serviceSlug ?: fallbackLabel,
        fallbackLabel = fallbackLabel,
        size = 36.dp,
    )
}
