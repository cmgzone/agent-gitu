package dev.agentgitu.mobile.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.content.Intent
import android.net.Uri
import androidx.compose.ui.platform.LocalContext
import dev.agentgitu.mobile.ui.components.*
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette
import dev.agentgitu.mobile.voice.VoiceCallUiState

/**
 * Native LiveKit Voice Call experience:
 * - Full-screen floating dark Stitch call stage with animated plush character,
 *   audio-reactive pulsing rings, live phase indicator, live transcript/caption,
 *   and native Mute, Speaker, Minimize, and End Call controls.
 * - Floating compact mini-bar when minimized so the user can watch Cowork / Coding
 *   chats update in real time while continuing to talk.
 * - Native Connect LiveKit Cloud setup dialog when the server isn't configured yet.
 */
@Composable
fun VoiceCallHostOverlay(
    voiceState: VoiceCallUiState,
    onToggleMute: () -> Unit,
    onToggleSpeaker: () -> Unit,
    onToggleMinimized: (Boolean) -> Unit,
    onEndCall: () -> Unit,
    onRetryCall: () -> Unit,
    onOpenByokSetup: () -> Unit = {},
    onSaveConfig: (url: String, apiKey: String, apiSecret: String) -> Unit,
    onDismissSetup: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // 1. LiveKit Cloud Setup Dialog (when server returns configured=false)
    if (voiceState.needsSetup) {
        LiveKitSetupDialog(
            initialUrl = voiceState.configUrl,
            saving = voiceState.savingConfig,
            errorText = voiceState.setupError,
            onSave = onSaveConfig,
            onDismiss = onDismissSetup,
        )
    }

    // 2. Minimized floating pill bar at top of screen
    AnimatedVisibility(
        visible = voiceState.active && voiceState.minimized,
        enter = slideInVertically { -it } + fadeIn(),
        exit = slideOutVertically { -it } + fadeOut(),
        modifier = modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 12.dp, vertical = 6.dp),
    ) {
        VoiceCallMiniBar(
            voiceState = voiceState,
            onExpand = { onToggleMinimized(false) },
            onToggleMute = onToggleMute,
            onEndCall = onEndCall,
        )
    }

    // 3. Full-screen native LiveKit Call Stage
    AnimatedVisibility(
        visible = voiceState.active && !voiceState.minimized,
        enter = fadeIn(tween(220)) + slideInVertically { it / 6 },
        exit = fadeOut(tween(180)) + slideOutVertically { it / 6 },
        modifier = Modifier.fillMaxSize(),
    ) {
        VoiceCallFullStage(
            voiceState = voiceState,
            onToggleMute = onToggleMute,
            onToggleSpeaker = onToggleSpeaker,
            onMinimize = { onToggleMinimized(true) },
            onEndCall = onEndCall,
            onRetry = onRetryCall,
            onOpenByokSetup = onOpenByokSetup,
        )
    }
}

@Composable
private fun VoiceCallMiniBar(
    voiceState: VoiceCallUiState,
    onExpand: () -> Unit,
    onToggleMute: () -> Unit,
    onEndCall: () -> Unit,
) {
    val s = LocalStitchPalette.current
    val statusColor = phaseAccentColor(voiceState.phase, s.primary, s.success, s.tertiary, s.error)

    Surface(
        shape = CircleShape,
        color = s.surfaceContainerHigh.copy(alpha = 0.96f),
        border = BorderStroke(1.dp, statusColor.copy(alpha = 0.55f)),
        shadowElevation = 10.dp,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onExpand),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            StitchCharacterAvatar(
                label = voiceState.title,
                accentHex = voiceState.avatarColor,
                shapeName = voiceState.avatarShape,
                size = 34.dp,
                working = voiceState.phase in setOf("thinking", "speaking", "connecting", "preparing"),
                statusDotColor = statusColor,
            )
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = voiceState.title,
                        style = MaterialTheme.typography.labelLarge,
                        color = s.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = "• ${formatCallTimer(voiceState.elapsedSeconds)}",
                        style = MaterialTheme.typography.labelSmall,
                        color = statusColor,
                    )
                }
                Text(
                    text = voiceState.caption.ifBlank { phaseLabel(voiceState) },
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp),
                    color = s.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            StitchCircleIconButton(
                icon = if (voiceState.muted) Icons.Default.MicOff else Icons.Default.Mic,
                contentDescription = if (voiceState.muted) "Unmute" else "Mute",
                outlined = !voiceState.muted,
                danger = voiceState.muted,
                size = 34.dp,
                onClick = onToggleMute,
            )
            StitchCircleIconButton(
                icon = Icons.Default.CallEnd,
                contentDescription = "End call",
                danger = true,
                size = 34.dp,
                onClick = onEndCall,
            )
        }
    }
}

@Composable
private fun VoiceCallFullStage(
    voiceState: VoiceCallUiState,
    onToggleMute: () -> Unit,
    onToggleSpeaker: () -> Unit,
    onMinimize: () -> Unit,
    onEndCall: () -> Unit,
    onRetry: () -> Unit,
    onOpenByokSetup: () -> Unit,
) {
    val s = LocalStitchPalette.current
    val statusColor = phaseAccentColor(voiceState.phase, s.primary, s.success, s.tertiary, s.error)
    val charSpec = remember(voiceState.avatarShape, voiceState.avatarColor, voiceState.title) {
        resolveOfficialCharacter(voiceState.avatarShape, voiceState.avatarColor, voiceState.title)
    }

    val infinite = rememberInfiniteTransition(label = "voicePulse")
    val pulseA by infinite.animateFloat(
        initialValue = 0.92f,
        targetValue = 1.24f,
        animationSpec = infiniteRepeatable(
            animation = tween(
                durationMillis = when (voiceState.phase) {
                    "speaking" -> 950
                    "thinking" -> 1250
                    else -> 2100
                },
                easing = FastOutSlowInEasing,
            ),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "pulseA",
    )
    val pulseB by infinite.animateFloat(
        initialValue = 1.0f,
        targetValue = 1.44f,
        animationSpec = infiniteRepeatable(
            animation = tween(1900, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "pulseB",
    )

    val audioBoost = (voiceState.audioLevel.coerceIn(0f, 1f) * 0.24f)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        s.surface,
                        s.surfaceContainerLow,
                        s.surface,
                    ),
                ),
            )
            .statusBarsPadding()
            .navigationBarsPadding(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 20.dp, vertical = 14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            // Top bar: Minimize to chat + LiveKit badge + Timer
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Surface(
                    shape = CircleShape,
                    color = s.surfaceContainerHigh,
                    border = BorderStroke(1.dp, s.outlineVariant),
                    modifier = Modifier.clickable(onClick = onMinimize),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(5.dp),
                    ) {
                        Icon(
                            Icons.Default.KeyboardArrowDown,
                            contentDescription = "Minimize",
                            tint = s.onSurface,
                            modifier = Modifier.size(18.dp),
                        )
                        Text(
                            text = "Chat",
                            style = MaterialTheme.typography.labelMedium,
                            color = s.onSurface,
                        )
                    }
                }

                Surface(
                    shape = CircleShape,
                    color = statusColor.copy(alpha = 0.14f),
                    border = BorderStroke(1.dp, statusColor.copy(alpha = 0.42f)),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(7.dp)
                                .clip(CircleShape)
                                .background(statusColor),
                        )
                        Text(
                            text = "${if (voiceState.mode.equals("pikpam", ignoreCase = true)) "PIKPAM VOICE" else "LIVEKIT"} • ${formatCallTimer(voiceState.elapsedSeconds)}",
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                            color = statusColor,
                        )
                    }
                }

                Spacer(Modifier.width(56.dp))
            }

            // Centerpiece: Pulsing rings + Official AI Plush Character + Live Status & Captions
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Box(
                    modifier = Modifier.size(220.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    // Outer breathing ring
                    Box(
                        modifier = Modifier
                            .size(168.dp)
                            .scale(pulseB + audioBoost)
                            .alpha(if (voiceState.phase == "error") 0.10f else 0.18f)
                            .clip(CircleShape)
                            .background(statusColor),
                    )
                    // Inner audio-reactive ring
                    Box(
                        modifier = Modifier
                            .size(138.dp)
                            .scale(pulseA + audioBoost)
                            .alpha(if (voiceState.phase == "error") 0.18f else 0.30f)
                            .clip(CircleShape)
                            .border(2.dp, statusColor, CircleShape)
                            .background(statusColor.copy(alpha = 0.12f)),
                    )
                    // Official Plush Character
                    StitchCharacterAvatar(
                        label = voiceState.title,
                        accentHex = voiceState.avatarColor,
                        shapeName = voiceState.avatarShape,
                        size = 108.dp,
                        floating = true,
                        working = voiceState.phase in setOf("thinking", "speaking", "connecting", "preparing"),
                        statusDotColor = statusColor,
                    )
                }

                Spacer(Modifier.height(10.dp))

                Text(
                    text = voiceState.title,
                    style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.SemiBold),
                    color = s.onSurface,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "${voiceState.subtitle} • ${charSpec.displayName}",
                    style = MaterialTheme.typography.labelMedium,
                    color = s.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )

                Spacer(Modifier.height(12.dp))

                // Phase pill
                Surface(
                    shape = CircleShape,
                    color = s.surfaceContainerHigh,
                    border = BorderStroke(1.dp, statusColor.copy(alpha = 0.45f)),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        if (voiceState.isConnecting || voiceState.phase == "thinking" || voiceState.phase == "reconnecting") {
                            CircularProgressIndicator(
                                modifier = Modifier.size(13.dp),
                                strokeWidth = 2.dp,
                                color = statusColor,
                            )
                        } else {
                            Icon(
                                imageVector = when (voiceState.phase) {
                                    "speaking" -> Icons.Default.GraphicEq
                                    "error" -> Icons.Default.ErrorOutline
                                    else -> Icons.Default.Hearing
                                },
                                contentDescription = null,
                                tint = statusColor,
                                modifier = Modifier.size(15.dp),
                            )
                        }
                        Text(
                            text = phaseLabel(voiceState),
                            style = MaterialTheme.typography.labelMedium,
                            color = s.onSurface,
                        )
                    }
                }

                Spacer(Modifier.height(18.dp))

                // Live transcript / caption card
                val captionText = voiceState.error?.takeIf { it.isNotBlank() }
                    ?: voiceState.caption.takeIf { it.isNotBlank() }
                    ?: when (voiceState.phase) {
                        "preparing" -> "Preparing your LiveKit voice worker in the cloud…"
                        "connecting" -> "Joining LiveKit room and enabling microphone…"
                        "listening" -> "Speak naturally — I can hear you and keep working in your workspace."
                        "thinking" -> "Processing your voice request…"
                        "speaking" -> "Speaking reply…"
                        else -> "Live voice channel ready."
                    }

                Surface(
                    shape = RoundedCornerShape(18.dp),
                    color = if (voiceState.error != null) s.errorContainer.copy(alpha = 0.35f) else s.surfaceContainerLow,
                    border = BorderStroke(
                        1.dp,
                        if (voiceState.error != null) s.error.copy(alpha = 0.5f) else s.outlineVariant,
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 64.dp, max = 160.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .verticalScroll(rememberScrollState())
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = captionText,
                            style = MaterialTheme.typography.bodyMedium.copy(fontSize = 13.5.sp, lineHeight = 19.sp),
                            color = if (voiceState.error != null) s.error else s.onSurface,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            }

            // Bottom native call controls
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                if (voiceState.phase == "error") {
                    val context = LocalContext.current
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                        if (voiceState.insufficientCredits) {
                            StitchPrimaryButton(
                                text = "Top Up Pikpam Credits",
                                icon = Icons.Default.AccountBalanceWallet,
                                onClick = {
                                    runCatching {
                                        context.startActivity(
                                            Intent(Intent.ACTION_VIEW, Uri.parse("https://pikpam.com/oauth/topup")),
                                        )
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                        if (voiceState.canOpenByokSetup) {
                            StitchSecondaryButton(
                                text = "Use Own LiveKit Keys (Optional)",
                                icon = Icons.Default.Key,
                                outlined = true,
                                onClick = onOpenByokSetup,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            StitchPrimaryButton(
                                text = "Retry Call",
                                icon = Icons.Default.Refresh,
                                onClick = onRetry,
                                modifier = Modifier.weight(1f),
                            )
                            StitchSecondaryButton(
                                text = "Close",
                                outlined = true,
                                onClick = onEndCall,
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                } else {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        VoiceActionCircle(
                            icon = if (voiceState.muted) Icons.Default.MicOff else Icons.Default.Mic,
                            label = if (voiceState.muted) "Unmute" else "Mute",
                            active = voiceState.muted,
                            activeBg = s.error.copy(alpha = 0.18f),
                            activeTint = s.error,
                            onClick = onToggleMute,
                        )

                        // Large Red End Call button
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(68.dp)
                                    .shadow(10.dp, CircleShape)
                                    .clip(CircleShape)
                                    .background(Color(0xFFDC2626))
                                    .clickable(onClick = onEndCall),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    imageVector = Icons.Default.CallEnd,
                                    contentDescription = "End call",
                                    tint = Color.White,
                                    modifier = Modifier.size(30.dp),
                                )
                            }
                            Text(
                                text = "End",
                                style = MaterialTheme.typography.labelSmall,
                                color = s.onSurfaceVariant,
                            )
                        }

                        VoiceActionCircle(
                            icon = if (voiceState.speakerOn) Icons.AutoMirrored.Filled.VolumeUp else Icons.Default.Hearing,
                            label = if (voiceState.speakerOn) "Speaker" else "Earpiece",
                            active = voiceState.speakerOn,
                            activeBg = s.primary.copy(alpha = 0.18f),
                            activeTint = s.primary,
                            onClick = onToggleSpeaker,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun VoiceActionCircle(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    active: Boolean,
    activeBg: Color,
    activeTint: Color,
    onClick: () -> Unit,
) {
    val s = LocalStitchPalette.current
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(CircleShape)
                .background(if (active) activeBg else s.surfaceContainerHigh)
                .border(
                    1.dp,
                    if (active) activeTint.copy(alpha = 0.55f) else s.outlineVariant,
                    CircleShape,
                )
                .clickable(onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = if (active) activeTint else s.onSurface,
                modifier = Modifier.size(24.dp),
            )
        }
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = s.onSurfaceVariant,
        )
    }
}

@Composable
private fun LiveKitSetupDialog(
    initialUrl: String,
    saving: Boolean,
    errorText: String?,
    onSave: (url: String, apiKey: String, apiSecret: String) -> Unit,
    onDismiss: () -> Unit,
) {
    val s = LocalStitchPalette.current
    var url by remember(initialUrl) { mutableStateOf(initialUrl) }
    var apiKey by remember { mutableStateOf("") }
    var apiSecret by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        containerColor = s.surfaceContainerLow,
        title = {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Default.GraphicEq, contentDescription = null, tint = s.primary, modifier = Modifier.size(20.dp))
                Text("Connect LiveKit Cloud", style = MaterialTheme.typography.titleMedium, color = s.onSurface)
            }
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    text = "Voice calling works automatically via Pikpam Managed LiveKit when signed in with Pikpam. You can also connect your own LiveKit Cloud project (BYOK) below.",
                    style = MaterialTheme.typography.bodySmall,
                    color = s.onSurfaceVariant,
                )
                StitchInputField(
                    value = url,
                    onValueChange = { url = it },
                    label = "LiveKit Project URL",
                    placeholder = "wss://your-project.livekit.cloud",
                    mono = true,
                )
                StitchInputField(
                    value = apiKey,
                    onValueChange = { apiKey = it },
                    label = "API Key",
                    placeholder = "API...",
                    mono = true,
                    visualTransformation = PasswordVisualTransformation(),
                )
                StitchInputField(
                    value = apiSecret,
                    onValueChange = { apiSecret = it },
                    label = "API Secret",
                    placeholder = "At least 20 characters",
                    mono = true,
                    visualTransformation = PasswordVisualTransformation(),
                )
                if (!errorText.isNullOrBlank()) {
                    Text(
                        text = errorText,
                        style = MaterialTheme.typography.bodySmall,
                        color = s.error,
                    )
                }
            }
        },
        confirmButton = {
            StitchPrimaryButton(
                text = if (saving) "Connecting…" else "Connect & Call",
                enabled = !saving && url.trim().startsWith("ws") && apiKey.isNotBlank() && apiSecret.trim().length >= 20,
                onClick = { onSave(url.trim(), apiKey.trim(), apiSecret.trim()) },
            )
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !saving) {
                Text("Cancel", color = s.onSurfaceVariant)
            }
        },
    )
}

private fun phaseAccentColor(
    phase: String,
    primary: Color,
    success: Color,
    tertiary: Color,
    error: Color,
): Color = when (phase) {
    "listening" -> success
    "speaking" -> primary
    "thinking", "preparing", "connecting", "reconnecting" -> tertiary
    "error" -> error
    else -> primary
}

private fun phaseLabel(state: VoiceCallUiState): String {
    if (state.statusText.isNotBlank()) return state.statusText
    return when (state.phase) {
        "preparing" -> "Preparing voice worker…"
        "connecting" -> "Connecting…"
        "listening" -> if (state.muted) "Muted" else "Listening"
        "thinking" -> "Thinking…"
        "speaking" -> "Speaking"
        "reconnecting" -> "Reconnecting…"
        "error" -> "Call error"
        else -> "Ready"
    }
}

private fun formatCallTimer(seconds: Int): String {
    val safe = seconds.coerceAtLeast(0)
    val m = safe / 60
    val s = safe % 60
    return "%02d:%02d".format(m, s)
}
