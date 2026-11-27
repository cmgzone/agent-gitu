package dev.agentgitu.mobile.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.agentgitu.mobile.data.network.ConnectionMode
import dev.agentgitu.mobile.data.network.PikpamCloudInstance
import dev.agentgitu.mobile.ui.components.*
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette
import dev.agentgitu.mobile.ui.viewmodel.AppUiState
import kotlinx.coroutines.delay

private enum class OnboardingMode {
    CLOUD,
    PAIR_PC,
}

private enum class DirectServerMode {
    LOCAL,
    REMOTE,
}

private data class WelcomeSlide(
    val badge: String,
    val title: String,
    val subtitle: String,
    val agents: List<Triple<String, String, String>>, // (name, shape, hex)
)

private data class StarterGoalOption(
    val id: String,
    val label: String,
    val agentName: String,
    val agentShape: String,
    val agentHex: String,
    val preview: String,
    val ctaLabel: String,
)

private val WELCOME_SLIDES = listOf(
    WelcomeSlide(
        badge = "AI Coworkers",
        title = "Your AI team, always on",
        subtitle = "Chat, voice-call, and delegate real work to specialized teammates from anywhere.",
        agents = listOf(
            Triple("Nova", "dot-orb", "#ff6b57"),
            Triple("Kai", "dot-block", "#4c7df0"),
            Triple("Hexa", "dot-nova", "#9c6df2"),
        ),
    ),
    WelcomeSlide(
        badge = "Swipe & Live Computer",
        title = "Approve work with a swipe",
        subtitle = "Slide cards right to approve or left to decline, and jump into live desktop handoffs right inside chat.",
        agents = listOf(
            Triple("Kai", "dot-block", "#4c7df0"),
            Triple("Nova", "dot-orb", "#ff6b57"),
        ),
    ),
    WelcomeSlide(
        badge = "Calendar & Client Inbox",
        title = "Routines that run on time",
        subtitle = "Plan daily digests on your schedule calendar and collaborate with clients in safe shared rooms.",
        agents = listOf(
            Triple("Hexa", "dot-nova", "#9c6df2"),
            Triple("Nova", "dot-orb", "#ff6b57"),
            Triple("Kai", "dot-block", "#4c7df0"),
        ),
    ),
)

private val STARTER_GOALS = listOf(
    StarterGoalOption(
        id = "digest",
        label = "Daily briefings",
        agentName = "Nova",
        agentShape = "dot-orb",
        agentHex = "#ff6b57",
        preview = "“I’ll organize your morning inbox digest and top 3 priorities every weekday.”",
        ctaLabel = "Continue with Pikpam",
    ),
    StarterGoalOption(
        id = "coding",
        label = "Autonomous coding",
        agentName = "Kai",
        agentShape = "dot-block",
        agentHex = "#4c7df0",
        preview = "“I’ll inspect repos, run checks, and pause for your 1-swipe approval.”",
        ctaLabel = "Launch Kai with Pikpam",
    ),
    StarterGoalOption(
        id = "calendar",
        label = "Calendar routines",
        agentName = "Hexa",
        agentShape = "dot-nova",
        agentHex = "#9c6df2",
        preview = "“Pick days on your Schedule Calendar and I’ll run automated reports on time.”",
        ctaLabel = "Start routines with Pikpam",
    ),
    StarterGoalOption(
        id = "inbox",
        label = "Client Inbox",
        agentName = "Nova",
        agentShape = "dot-orb",
        agentHex = "#ff6b57",
        preview = "“Invite clients with a 1-click link while I take private notes for you silently.”",
        ctaLabel = "Open workspace with Pikpam",
    ),
)

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
    val haptics = LocalHapticFeedback.current

    var runMode by remember { mutableStateOf(OnboardingMode.CLOUD) }
    var directMode by remember { mutableStateOf(DirectServerMode.LOCAL) }
    var slideIndex by remember { mutableIntStateOf(0) }
    var selectedGoalId by remember { mutableStateOf(STARTER_GOALS.first().id) }
    var autoAdvance by remember { mutableStateOf(true) }

    var serverUrl by remember(state.serverUrl) { mutableStateOf(state.serverUrl) }
    var accessKey by remember { mutableStateOf("") }
    var email by remember(state.savedEmail) { mutableStateOf(state.savedEmail) }
    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var usePikpamOnServer by remember { mutableStateOf(true) }
    var showQrDialog by remember { mutableStateOf(false) }
    var freeAgentName by remember { mutableStateOf("") }

    // Gentle auto-advance on the welcome story slides until the user interacts
    LaunchedEffect(state.pikpamSignedIn, autoAdvance) {
        if (state.pikpamSignedIn || !autoAdvance) return@LaunchedEffect
        while (true) {
            delay(4800L)
            slideIndex = (slideIndex + 1) % WELCOME_SLIDES.size
        }
    }

    LaunchedEffect(state.serverUrl, state.bannerMessage) {
        if (state.bannerMessage?.contains("QR link") == true) {
            runMode = OnboardingMode.PAIR_PC
            directMode = if (state.connectionMode == ConnectionMode.LOCAL) DirectServerMode.LOCAL else DirectServerMode.REMOTE
        }
    }

    val selectedGoal = remember(selectedGoalId) {
        STARTER_GOALS.firstOrNull { it.id == selectedGoalId } ?: STARTER_GOALS.first()
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
                .padding(horizontal = 16.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Top Brand Bar
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(s.primary),
                    )
                    Text(
                        text = "Agent Gitu",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = s.onSurface,
                    )
                }
                StitchBadge(
                    text = if (state.pikpamSignedIn) "Pikpam Connected" else "AI Workspace",
                    tone = if (state.pikpamSignedIn) BadgeTone.SUCCESS else BadgeTone.PRIMARY,
                )
            }

            // Story Carousel Hero (when first-time / signed out)
            if (!state.pikpamSignedIn) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(24.dp))
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(
                                    s.primary.copy(alpha = 0.14f),
                                    s.surfaceContainerLow,
                                ),
                            ),
                        )
                        .border(1.dp, s.outlineVariant, RoundedCornerShape(24.dp))
                        .clickable {
                            autoAdvance = false
                            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            slideIndex = (slideIndex + 1) % WELCOME_SLIDES.size
                        }
                        .padding(horizontal = 18.dp, vertical = 18.dp),
                ) {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        // Slide indicator pills
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            WELCOME_SLIDES.forEachIndexed { idx, _ ->
                                val active = idx == slideIndex
                                val dotColor by animateColorAsState(
                                    targetValue = if (active) s.primary else s.outlineVariant,
                                    label = "storyDot",
                                )
                                Box(
                                    modifier = Modifier
                                        .height(6.dp)
                                        .width(if (active) 26.dp else 8.dp)
                                        .clip(CircleShape)
                                        .background(dotColor)
                                        .clickable {
                                            autoAdvance = false
                                            slideIndex = idx
                                        },
                                )
                            }
                        }

                        AnimatedContent(
                            targetState = WELCOME_SLIDES[slideIndex],
                            transitionSpec = {
                                (fadeIn(tween(260)) + slideInHorizontally { it / 6 }) togetherWith
                                    (fadeOut(tween(200)) + slideOutHorizontally { -it / 6 })
                            },
                            label = "welcomeStorySlide",
                        ) { slide ->
                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    slide.agents.forEachIndexed { idx, (name, shape, hex) ->
                                        StitchCharacterAvatar(
                                            label = name,
                                            accentHex = hex,
                                            shapeName = shape,
                                            size = if (idx == 0) 58.dp else 46.dp,
                                            floating = true,
                                        )
                                    }
                                }
                                StitchBadge(text = slide.badge, tone = BadgeTone.PRIMARY)
                                Text(
                                    text = slide.title,
                                    style = MaterialTheme.typography.headlineSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = s.onSurface,
                                    textAlign = TextAlign.Center,
                                )
                                Text(
                                    text = slide.subtitle,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = s.onSurfaceVariant,
                                    textAlign = TextAlign.Center,
                                )
                            }
                        }
                    }
                }

                // Goal-First Teaser Chips
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "What should your team handle first?",
                        style = MaterialTheme.typography.labelMedium,
                        color = s.onSurfaceVariant,
                    )
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        STARTER_GOALS.forEach { option ->
                            val selected = option.id == selectedGoalId
                            FilterChip(
                                selected = selected,
                                onClick = {
                                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    selectedGoalId = option.id
                                },
                                leadingIcon = {
                                    Box(
                                        modifier = Modifier
                                            .size(8.dp)
                                            .clip(CircleShape)
                                            .background(parseHexColor(option.agentHex)),
                                    )
                                },
                                label = { Text(option.label, style = MaterialTheme.typography.labelMedium) },
                            )
                        }
                    }
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .background(s.surfaceContainerLow)
                            .border(1.dp, s.outlineVariant, RoundedCornerShape(16.dp))
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        StitchCharacterAvatar(
                            label = selectedGoal.agentName,
                            accentHex = selectedGoal.agentHex,
                            shapeName = selectedGoal.agentShape,
                            size = 34.dp,
                        )
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                text = "${selectedGoal.agentName} · Starter preview",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.SemiBold,
                                color = s.primary,
                            )
                            Text(
                                text = selectedGoal.preview,
                                style = MaterialTheme.typography.bodySmall,
                                color = s.onSurfaceVariant,
                            )
                        }
                    }
                }
            } else {
                // Signed-in Header
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = "Choose your Agent",
                        style = MaterialTheme.typography.headlineMedium,
                        color = s.onSurface,
                    )
                    Text(
                        text = "Pick an online Cloud Agent below, claim a free one, or pair your own computer.",
                        style = MaterialTheme.typography.bodySmall,
                        color = s.onSurfaceVariant,
                    )
                }
            }

            if (!state.errorMessage.isNullOrBlank()) {
                StitchBanner(text = state.errorMessage, isError = true)
            }
            if (!state.bannerMessage.isNullOrBlank()) {
                StitchBanner(text = state.bannerMessage, isError = false)
            }

            // Zero-Jargon 2-Tile Choice: Cloud Agent vs Pair My PC
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                RunModeChoiceCard(
                    icon = Icons.Default.CloudQueue,
                    title = "Cloud Agent",
                    subtitle = "Free tier · Instant",
                    selected = runMode == OnboardingMode.CLOUD,
                    onClick = {
                        haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        runMode = OnboardingMode.CLOUD
                    },
                    modifier = Modifier.weight(1f),
                )
                RunModeChoiceCard(
                    icon = Icons.Default.Devices,
                    title = "Pair My PC",
                    subtitle = "QR · Local · URL",
                    selected = runMode == OnboardingMode.PAIR_PC,
                    onClick = {
                        haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        runMode = OnboardingMode.PAIR_PC
                    },
                    modifier = Modifier.weight(1f),
                )
            }

            // Contextual Auth / Pairing Sheet Card
            StitchCard(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    if (runMode == OnboardingMode.CLOUD) {
                        if (!state.pikpamSignedIn) {
                            Text(
                                text = "Sign in or create your workspace with Pikpam",
                                style = MaterialTheme.typography.titleSmall,
                                color = s.onSurface,
                            )
                            StitchInputField(
                                value = email,
                                onValueChange = { email = it },
                                label = "Pikpam Email",
                                placeholder = "you@example.com",
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
                                text = if (state.pikpamBusy) "Signing in…" else selectedGoal.ctaLabel,
                                onClick = { onPikpamSignIn(email, password) },
                                enabled = email.isNotBlank() && password.isNotBlank(),
                                busy = state.pikpamBusy,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Text(
                                text = "Automatically discovers your Cloud Agents and lets you claim a free workspace if you're new.",
                                style = MaterialTheme.typography.labelSmall,
                                color = s.onSurfaceVariant,
                                textAlign = TextAlign.Center,
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
                                text = "Your Cloud Agents (${state.pikpamInstances.size})",
                                style = MaterialTheme.typography.labelMedium,
                                color = s.onSurfaceVariant,
                            )

                            if (state.pikpamInstances.isEmpty()) {
                                Text(
                                    text = "No Cloud Agents on this account yet. Claim your free Cloud Agent below or switch to Pair My PC.",
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
                                                isConnecting -> "Opening workspace…"
                                                inst.isActive -> "Open Cowork"
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
                                    placeholder = "Workspace name (optional)",
                                )
                                StitchSecondaryButton(
                                    text = "Claim free Cloud Agent",
                                    onClick = { onClaimFreeCloud(freeAgentName) },
                                    enabled = !state.pikpamBusy,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        }
                    } else {
                        // Pair My PC (Desktop QR + Local LAN / Remote HTTPS)
                        StitchPrimaryButton(
                            text = "Paste / apply desktop QR link",
                            icon = Icons.Default.QrCodeScanner,
                            roundedLg = true,
                            onClick = { showQrDialog = true },
                            modifier = Modifier.fillMaxWidth(),
                        )

                        HorizontalDivider(color = s.outlineVariant)

                        StitchSegmentedPills(
                            items = listOf(
                                DirectServerMode.LOCAL to "Local Wi-Fi",
                                DirectServerMode.REMOTE to "Remote HTTPS",
                            ),
                            selected = directMode,
                            onSelect = { next ->
                                directMode = next
                                if (next == DirectServerMode.LOCAL && serverUrl.startsWith("https://")) {
                                    serverUrl = "http://10.0.2.2:8321"
                                } else if (next == DirectServerMode.REMOTE && serverUrl.startsWith("http://10.0.2.2")) {
                                    serverUrl = "https://"
                                }
                            },
                        )

                        val mode = if (directMode == DirectServerMode.LOCAL) ConnectionMode.LOCAL else ConnectionMode.REMOTE
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

                        AnimatedVisibility(visible = !usePikpamOnServer) {
                            StitchInputField(
                                value = accessKey,
                                onValueChange = { accessKey = it },
                                label = "Access key (optional)",
                                placeholder = "AGENT_GITU_ACCESS_KEY",
                                visualTransformation = PasswordVisualTransformation(),
                            )
                        }

                        StitchPrimaryButton(
                            text = if (state.connecting) "Connecting…" else "Connect to workspace",
                            onClick = {
                                onConnectDirect(serverUrl, mode, accessKey, email, password, usePikpamOnServer)
                            },
                            enabled = serverUrl.isNotBlank(),
                            busy = state.connecting,
                            modifier = Modifier.fillMaxWidth(),
                        )

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            QuickOptionChip(
                                label = "Pikpam Auth",
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

            Spacer(Modifier.height(8.dp))
        }
    }

    if (showQrDialog) {
        var rawLink by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showQrDialog = false },
            containerColor = s.surfaceContainerLowest,
            title = { Text("Pair via Desktop QR Link", color = s.onSurface) },
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
private fun RunModeChoiceCard(
    icon: ImageVector,
    title: String,
    subtitle: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val s = LocalStitchPalette.current
    val bg by animateColorAsState(
        targetValue = if (selected) s.primary.copy(alpha = 0.12f) else s.surfaceContainerLowest,
        label = "modeChoiceBg",
    )
    val borderColor by animateColorAsState(
        targetValue = if (selected) s.primary else s.outlineVariant,
        label = "modeChoiceBorder",
    )
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(18.dp))
            .background(bg)
            .border(if (selected) 1.5.dp else 1.dp, borderColor, RoundedCornerShape(18.dp))
            .clickable(onClick = onClick)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = if (selected) s.primary else s.onSurfaceVariant,
            modifier = Modifier.size(20.dp),
        )
        Text(
            text = title,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = s.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = subtitle,
            style = MaterialTheme.typography.labelSmall,
            color = s.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
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
