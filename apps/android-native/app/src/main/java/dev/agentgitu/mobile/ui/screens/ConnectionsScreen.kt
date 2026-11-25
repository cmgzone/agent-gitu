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
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.ImageLoader
import coil.compose.SubcomposeAsyncImage
import coil.request.ImageRequest
import dev.agentgitu.mobile.ui.components.*
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette
import dev.agentgitu.mobile.ui.viewmodel.AppUiState
import dev.agentgitu.mobile.ui.viewmodel.GituAppViewModel

private enum class ConnectionsTab {
    CONNECTED,
    CATALOG,
    CUSTOM_MAIL,
}

/**
 * Native Connections Page:
 * Manage per-teammate Connected Apps (OAuth & Composio catalog), Always-Allowed App Permissions,
 * Mailboxes (IMAP/SMTP), and Custom API Connections (`/api/connections`).
 */
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
                            StitchCard(modifier = Modifier.fillMaxWidth()) {
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
                            StitchCard(modifier = Modifier.fillMaxWidth()) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(36.dp)
                                            .clip(CircleShape)
                                            .background(s.surfaceContainerLow),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Icon(Icons.Default.Extension, contentDescription = null, tint = s.primary, modifier = Modifier.size(18.dp))
                                    }
                                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                        Text(
                                            text = acc.label ?: acc.address ?: acc.toolkit.replaceFirstChar { it.uppercase() },
                                            style = MaterialTheme.typography.labelLarge,
                                            color = s.onSurface,
                                        )
                                        Text(
                                            text = "${acc.toolkit.ifBlank { "account" }} • ${acc.status.ifBlank { "ACTIVE" }}",
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
                            StitchCard(modifier = Modifier.fillMaxWidth(), containerColor = s.surfaceContainerLow) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = acc.label ?: acc.address ?: acc.toolkit.replaceFirstChar { it.uppercase() },
                                            style = MaterialTheme.typography.labelLarge,
                                            color = s.onSurface,
                                        )
                                        Text(acc.toolkit, style = MaterialTheme.typography.labelSmall, color = s.onSurfaceVariant)
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
                            StitchCard(modifier = Modifier.fillMaxWidth()) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(perm.tool, style = MaterialTheme.typography.labelMedium, color = s.onSurface)
                                        Text("@${perm.agentName} • ${perm.service}", style = MaterialTheme.typography.labelSmall, color = s.onSurfaceVariant)
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
                            StitchCard(modifier = Modifier.fillMaxWidth()) {
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
                            StitchCard(modifier = Modifier.fillMaxWidth()) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(36.dp)
                                            .clip(CircleShape)
                                            .background(s.surfaceContainerLow),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Icon(Icons.Default.Api, contentDescription = null, tint = s.primary, modifier = Modifier.size(18.dp))
                                    }
                                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                        Text(conn.label.ifBlank { conn.provider }, style = MaterialTheme.typography.labelLarge, color = s.onSurface)
                                        Text(conn.baseUrl, style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp), color = s.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
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

    if (showAddCustomDialog) {
        var label by remember { mutableStateOf("") }
        var provider by remember { mutableStateOf("custom") }
        var baseUrl by remember { mutableStateOf("https://") }
        var token by remember { mutableStateOf("") }
        var validationPath by remember { mutableStateOf("/") }

        AlertDialog(
            onDismissRequest = { showAddCustomDialog = false },
            containerColor = s.surfaceContainerLowest,
            title = { Text("Add Custom Connection", color = s.onSurface) },
            text = {
                Column(
                    modifier = Modifier.verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    StitchInputField(value = label, onValueChange = { label = it }, label = "Label", placeholder = "My API")
                    StitchInputField(value = provider, onValueChange = { provider = it }, label = "Provider slug", placeholder = "github / stripe / custom", mono = true)
                    StitchInputField(value = baseUrl, onValueChange = { baseUrl = it }, label = "Base URL", placeholder = "https://api.example.com", mono = true)
                    StitchInputField(value = validationPath, onValueChange = { validationPath = it }, label = "Health check path", placeholder = "/health", mono = true)
                    StitchInputField(
                        value = token,
                        onValueChange = { token = it },
                        label = "Bearer Token / API Key",
                        placeholder = "sk_...",
                        mono = true,
                        visualTransformation = PasswordVisualTransformation(),
                    )
                }
            },
            confirmButton = {
                TextButton(
                    enabled = label.isNotBlank() && baseUrl.startsWith("https://") && token.isNotBlank(),
                    onClick = {
                        vm.saveCustomConnection(label, provider, baseUrl, token, validationPath)
                        showAddCustomDialog = false
                    },
                ) { Text("Save & Test", color = s.primary) }
            },
            dismissButton = { TextButton(onClick = { showAddCustomDialog = false }) { Text("Cancel", color = s.onSurfaceVariant) } },
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
private fun ServiceLogoBox(logoUrl: String?, fallbackLabel: String) {
    val s = LocalStitchPalette.current
    val media = LocalGituMediaContext.current
    val context = LocalContext.current
    val loader = media.imageLoader ?: remember(context) { ImageLoader(context) }

    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(s.surfaceContainerLow)
            .border(1.dp, s.outlineVariant, RoundedCornerShape(10.dp)),
        contentAlignment = Alignment.Center,
    ) {
        if (!logoUrl.isNullOrBlank() && logoUrl.startsWith("https://")) {
            SubcomposeAsyncImage(
                model = ImageRequest.Builder(context).data(logoUrl).crossfade(true).build(),
                imageLoader = loader,
                contentDescription = fallbackLabel,
                contentScale = ContentScale.Fit,
                modifier = Modifier.size(22.dp),
                error = {
                    Text(fallbackLabel.take(1).uppercase(), style = MaterialTheme.typography.labelLarge, color = s.onSurface)
                },
            )
        } else {
            Text(fallbackLabel.take(1).uppercase(), style = MaterialTheme.typography.labelLarge, color = s.onSurface)
        }
    }
}
