package dev.agentgitu.mobile.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.agentgitu.mobile.data.network.ConnectionMode
import dev.agentgitu.mobile.data.network.PikpamCloudInstance
import dev.agentgitu.mobile.ui.components.*
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette
import dev.agentgitu.mobile.ui.viewmodel.AppUiState

private enum class PairingTab {
    PIKPAM,
    LOCAL,
    REMOTE,
}

@Composable
fun ConnectScreen(
    state: AppUiState,
    onPikpamSignIn: (email: String, password: String) -> Unit,
    onPikpamSignOut: () -> Unit,
    onRefreshPikpamAgents: () -> Unit,
    onConnectPikpamAgent: (PikpamCloudInstance) -> Unit,
    onClaimFreeCloud: (name: String) -> Unit,
    onConnectDirect: (url: String, mode: ConnectionMode, accessKey: String, email: String, password: String, usePikpamAuth: Boolean) -> Unit,
    onPing: (url: String) -> Unit,
    onPasteConnectLink: (String) -> Unit,
) {
    val s = LocalStitchPalette.current
    var activeTab by remember { mutableStateOf(PairingTab.PIKPAM) }
    var serverUrl by remember(state.serverUrl) { mutableStateOf(state.serverUrl) }
    var accessKey by remember { mutableStateOf("") }
    var email by remember(state.savedEmail) { mutableStateOf(state.savedEmail) }
    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var usePikpamOnServer by remember { mutableStateOf(true) }
    var showQrDialog by remember { mutableStateOf(false) }
    var freeAgentName by remember { mutableStateOf("") }

    LaunchedEffect(state.serverUrl, state.bannerMessage) {
        if (state.bannerMessage?.contains("QR link") == true) {
            activeTab = if (state.connectionMode == ConnectionMode.LOCAL) PairingTab.LOCAL else PairingTab.REMOTE
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(s.surface)
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Spacer(Modifier.height(8.dp))

            // Stitch Brand Header (server_pairing_auth/code.html)
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = "AGENT GITU MOBILE",
                    style = MaterialTheme.typography.labelSmall,
                    color = s.primary,
                )
                Text(
                    text = if (state.pikpamSignedIn) "Choose your Agent" else "Connect to your server",
                    style = MaterialTheme.typography.displaySmall,
                    color = s.onSurface,
                )
                Text(
                    text = if (state.pikpamSignedIn) {
                        "Select any discovered Agent URL connected to your Pikpam account to launch directly."
                    } else {
                        "Sign in with Pikpam to discover your Agent URLs, pair via desktop QR, or connect to a LAN/HTTPS host."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = s.onSurfaceVariant,
                )
            }

            // Quick QR Pair CTA (exact Stitch rounded-lg primary bar)
            if (!state.pikpamSignedIn) {
                StitchPrimaryButton(
                    text = "Scan desktop QR code",
                    icon = Icons.Default.QrCodeScanner,
                    roundedLg = true,
                    onClick = { showQrDialog = true },
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            if (!state.errorMessage.isNullOrBlank()) {
                StitchBanner(text = state.errorMessage, isError = true)
            }
            if (!state.bannerMessage.isNullOrBlank()) {
                StitchBanner(text = state.bannerMessage, isError = false)
            }

            // Server & Auth Card (rounded-lg bg-dark-surface-container-lowest border)
            StitchCard(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    StitchSegmentedPills(
                        items = listOf(
                            PairingTab.PIKPAM to "Pikpam",
                            PairingTab.LOCAL to "Local LAN",
                            PairingTab.REMOTE to "Remote HTTPS",
                        ),
                        selected = activeTab,
                        onSelect = { next ->
                            activeTab = next
                            if (next == PairingTab.LOCAL && serverUrl.startsWith("https://")) {
                                serverUrl = "http://10.0.2.2:8321"
                            } else if (next == PairingTab.REMOTE && serverUrl.startsWith("http://10.0.2.2")) {
                                serverUrl = "https://"
                            }
                        },
                    )

                    if (activeTab == PairingTab.PIKPAM) {
                        if (!state.pikpamSignedIn) {
                            StitchInputField(
                                value = email,
                                onValueChange = { email = it },
                                label = "Pikpam Email",
                                placeholder = "owner@pikpam.com",
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                            )
                            StitchInputField(
                                value = password,
                                onValueChange = { password = it },
                                label = "Pikpam Password",
                                placeholder = "••••••••••••",
                                visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                                trailingIcon = {
                                    IconButton(onClick = { showPassword = !showPassword }) {
                                        Icon(
                                            imageVector = if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                            contentDescription = "Toggle password",
                                            tint = s.onSurfaceVariant,
                                        )
                                    }
                                },
                            )
                            StitchPrimaryButton(
                                text = if (state.pikpamBusy) "Discovering agents…" else "Sign in with Pikpam",
                                onClick = { onPikpamSignIn(email, password) },
                                enabled = email.isNotBlank() && password.isNotBlank(),
                                busy = state.pikpamBusy,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        } else {
                            // Signed-in Pikpam Identity + Discovered Agent URLs
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                StitchAvatar(
                                    label = state.pikpamUserName.ifBlank { state.pikpamEmail },
                                    size = 40.dp,
                                    statusDotColor = s.success,
                                )
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = state.pikpamUserName.ifBlank { "Pikpam Account" },
                                        style = MaterialTheme.typography.titleSmall,
                                        color = s.onSurface,
                                    )
                                    Text(
                                        text = state.pikpamEmail,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = s.onSurfaceVariant,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    if (state.pikpamCreditsLabel.isNotBlank()) {
                                        Text(
                                            text = state.pikpamCreditsLabel,
                                            style = MaterialTheme.typography.labelSmall,
                                            color = s.successContainer,
                                        )
                                    }
                                }
                                StitchCircleIconButton(
                                    icon = Icons.Default.Refresh,
                                    contentDescription = "Refresh",
                                    onClick = onRefreshPikpamAgents,
                                    size = 36.dp,
                                )
                                StitchCircleIconButton(
                                    icon = Icons.AutoMirrored.Filled.Logout,
                                    contentDescription = "Sign out",
                                    onClick = onPikpamSignOut,
                                    size = 36.dp,
                                )
                            }

                            HorizontalDivider(color = s.outlineVariant)

                            Text(
                                text = "Connected Agent URLs (${state.pikpamInstances.size})",
                                style = MaterialTheme.typography.labelMedium,
                                color = s.onSurfaceVariant,
                            )

                            if (state.pikpamInstances.isEmpty()) {
                                Text(
                                    text = "No Cloud Agents found on this account yet. Claim a free Cloud Agent below or switch to Local LAN / Remote HTTPS.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = s.onSurfaceVariant,
                                )
                            } else {
                                state.pikpamInstances.forEach { inst ->
                                    val isConnecting = state.connectingInstanceId == inst.id
                                    val displayUrl = inst.agentUrl
                                        ?: inst.customDomain?.let { "https://$it" }
                                        ?: inst.domain?.let { "https://$it" }
                                        ?: "Provisioning…"

                                    Column(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clip(RoundedCornerShape(14.dp))
                                            .background(s.surfaceContainerLow)
                                            .border(1.dp, s.outlineVariant, RoundedCornerShape(14.dp))
                                            .clickable(enabled = inst.isActive && !state.connecting) {
                                                onConnectPikpamAgent(inst)
                                            }
                                            .padding(12.dp),
                                        verticalArrangement = Arrangement.spacedBy(10.dp),
                                    ) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                        ) {
                                            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                                Text(
                                                    text = inst.name.ifBlank { "Cloud Agent" },
                                                    style = MaterialTheme.typography.titleMedium,
                                                    color = s.onSurface,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis,
                                                )
                                                Text(
                                                    text = displayUrl,
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = s.onSurfaceVariant,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis,
                                                )
                                            }
                                            StitchBadge(
                                                text = if (inst.isActive) "Online" else inst.status,
                                                tone = if (inst.isActive) BadgeTone.SUCCESS else BadgeTone.WARNING,
                                            )
                                        }
                                        StitchPrimaryButton(
                                            text = when {
                                                isConnecting -> "Signing into Agent…"
                                                inst.isActive -> "Sign in to Cowork"
                                                else -> "Waiting (${inst.status})"
                                            },
                                            onClick = { onConnectPikpamAgent(inst) },
                                            enabled = inst.isActive && !state.connecting,
                                            busy = isConnecting,
                                            modifier = Modifier.fillMaxWidth(),
                                        )
                                    }
                                }
                            }

                            if (state.pikpamFreeClaimEligible) {
                                HorizontalDivider(color = s.outlineVariant)
                                StitchInputField(
                                    value = freeAgentName,
                                    onValueChange = { freeAgentName = it },
                                    label = "Claim Free Cloud Agent",
                                    placeholder = "Agent name (optional)",
                                )
                                StitchSecondaryButton(
                                    text = "Claim free instance",
                                    onClick = { onClaimFreeCloud(freeAgentName) },
                                    enabled = !state.pikpamBusy,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        }
                    } else {
                        // Local LAN or Remote HTTPS form matching server_pairing_auth/code.html
                        val mode = if (activeTab == PairingTab.LOCAL) ConnectionMode.LOCAL else ConnectionMode.REMOTE
                        StitchInputField(
                            value = serverUrl,
                            onValueChange = { serverUrl = it },
                            label = "Server address",
                            placeholder = if (mode == ConnectionMode.LOCAL) "http://192.168.1.42:8321" else "https://gitu.example.com",
                            mono = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                            headerTrailing = {
                                if (state.serverHealthOk == true) {
                                    StitchBadge(text = "/healthz OK", tone = BadgeTone.SUCCESS, mono = true)
                                } else {
                                    Text(
                                        text = "Test /healthz",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = s.onSurfaceVariant,
                                        modifier = Modifier.clickable { onPing(serverUrl) },
                                    )
                                }
                            },
                        )

                        if (usePikpamOnServer && state.pikpamSignedIn) {
                            StitchBanner(text = "Using Pikpam account (${state.pikpamEmail})")
                        } else {
                            StitchInputField(
                                value = email,
                                onValueChange = { email = it },
                                label = "Email",
                                placeholder = "owner@agentgitu.local",
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                            )
                            StitchInputField(
                                value = password,
                                onValueChange = { password = it },
                                label = if (usePikpamOnServer) "Pikpam password" else "Passphrase or access key",
                                placeholder = "•••••••••••••••",
                                visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                                trailingIcon = {
                                    IconButton(onClick = { showPassword = !showPassword }) {
                                        Icon(
                                            imageVector = if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                            contentDescription = "Toggle password",
                                            tint = s.onSurfaceVariant,
                                        )
                                    }
                                },
                            )
                        }

                        if (!usePikpamOnServer) {
                            StitchInputField(
                                value = accessKey,
                                onValueChange = { accessKey = it },
                                label = "Access key (optional)",
                                placeholder = "AGENT_GITU_ACCESS_KEY",
                                visualTransformation = PasswordVisualTransformation(),
                            )
                        }

                        StitchPrimaryButton(
                            text = if (state.connecting) "Signing in…" else "Sign in to Cowork",
                            onClick = {
                                onConnectDirect(serverUrl, mode, accessKey, email, password, usePikpamOnServer)
                            },
                            enabled = serverUrl.isNotBlank(),
                            busy = state.connecting,
                            modifier = Modifier.fillMaxWidth(),
                        )

                        // Stitch 3-column quick mode buttons (PikRouter / Local Pass / Ping)
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            QuickOptionChip(
                                label = "PikRouter",
                                selected = usePikpamOnServer,
                                onClick = { usePikpamOnServer = true },
                                modifier = Modifier.weight(1f),
                            )
                            QuickOptionChip(
                                label = "Local Key",
                                selected = !usePikpamOnServer,
                                onClick = { usePikpamOnServer = false },
                                modifier = Modifier.weight(1f),
                            )
                            QuickOptionChip(
                                label = "Ping",
                                selected = false,
                                onClick = { onPing(serverUrl) },
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
            }
        }
    }

    if (showQrDialog) {
        var rawLink by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showQrDialog = false },
            containerColor = s.surfaceContainerLowest,
            title = { Text("Pair via QR Link", color = s.onSurface) },
            text = {
                StitchInputField(
                    value = rawLink,
                    onValueChange = { rawLink = it },
                    label = "Pairing URL",
                    placeholder = "agentgitu://connect?server=...",
                    mono = true,
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        onPasteConnectLink(rawLink)
                        showQrDialog = false
                    },
                ) { Text("Apply", color = s.primary) }
            },
            dismissButton = {
                TextButton(onClick = { showQrDialog = false }) { Text("Cancel", color = s.onSurfaceVariant) }
            },
        )
    }
}

@Composable
private fun QuickOptionChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val s = LocalStitchPalette.current
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(if (selected) s.surfaceContainer else s.surfaceContainerLow)
            .border(1.dp, if (selected) s.primary else s.outlineVariant, RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 9.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = s.onSurface)
    }
}
