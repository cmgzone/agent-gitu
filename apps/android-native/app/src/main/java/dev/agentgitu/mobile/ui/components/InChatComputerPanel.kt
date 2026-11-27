package dev.agentgitu.mobile.ui.components

import android.annotation.SuppressLint
import android.view.MotionEvent
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import dev.agentgitu.mobile.data.model.AgentComputerStatus
import dev.agentgitu.mobile.data.model.Teammate
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette

/**
 * Authenticated interactive WebView for live Agent Gitu computer streams (noVNC desktop,
 * Server Browser, artifact previews). Syncs session cookies onto this WebView AND passes
 * auth headers on load, and prevents parent vertical scrolling from stealing touch drags
 * while interacting with the live screen.
 */
@SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility")
@Composable
fun AuthenticatedInteractiveWebView(
    url: String,
    authHeaders: Map<String, String>,
    onSyncCookies: (WebView) -> Unit,
    reloadNonce: Int = 0,
    interactiveTouch: Boolean = true,
    modifier: Modifier = Modifier,
) {
    val s = LocalStitchPalette.current
    var loading by remember(url, reloadNonce) { mutableStateOf(true) }
    var loadError by remember(url, reloadNonce) { mutableStateOf<String?>(null) }
    var webViewRef by remember { mutableStateOf<WebView?>(null) }
    var lastLoadedKey by remember { mutableStateOf("") }

    DisposableEffect(Unit) {
        onDispose {
            runCatching {
                webViewRef?.stopLoading()
                webViewRef?.loadUrl("about:blank")
                webViewRef?.destroy()
            }
            webViewRef = null
        }
    }

    Box(
        modifier = modifier
            .background(Color(0xFF151821)),
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                WebView(ctx).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
                    isFocusable = true
                    isFocusableInTouchMode = true
                    setBackgroundColor(android.graphics.Color.parseColor("#151821"))
                    runCatching {
                        CookieManager.getInstance().setAcceptCookie(true)
                        CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                    }
                    settings.apply {
                        javaScriptEnabled = true
                        domStorageEnabled = true
                        databaseEnabled = true
                        mediaPlaybackRequiresUserGesture = false
                        allowFileAccess = false
                        allowContentAccess = false
                        useWideViewPort = true
                        loadWithOverviewMode = true
                        builtInZoomControls = false
                        displayZoomControls = false
                        mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                    }
                    if (interactiveTouch) {
                        setOnTouchListener { v, event ->
                            when (event.actionMasked) {
                                MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> {
                                    v.parent?.requestDisallowInterceptTouchEvent(true)
                                }
                                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                                    v.parent?.requestDisallowInterceptTouchEvent(false)
                                }
                            }
                            false
                        }
                    }
                    webChromeClient = WebChromeClient()
                    webViewClient = object : WebViewClient() {
                        override fun onPageStarted(view: WebView?, startedUrl: String?, favicon: android.graphics.Bitmap?) {
                            loading = true
                            loadError = null
                        }

                        override fun onPageFinished(view: WebView?, finishedUrl: String?) {
                            loading = false
                        }

                        override fun onReceivedError(
                            view: WebView?,
                            request: WebResourceRequest?,
                            error: WebResourceError?,
                        ) {
                            if (request?.isForMainFrame == true) {
                                loading = false
                                loadError = error?.description?.toString() ?: "Could not load computer stream."
                            }
                        }
                    }
                    onSyncCookies(this)
                    val initialKey = "$url|$reloadNonce"
                    lastLoadedKey = initialKey
                    if (authHeaders.isNotEmpty()) {
                        loadUrl(url, authHeaders)
                    } else {
                        loadUrl(url)
                    }
                    webViewRef = this
                }
            },
            update = { view ->
                val targetKey = "$url|$reloadNonce"
                if (lastLoadedKey != targetKey) {
                    lastLoadedKey = targetKey
                    loading = true
                    loadError = null
                    onSyncCookies(view)
                    if (authHeaders.isNotEmpty()) {
                        view.loadUrl(url, authHeaders)
                    } else {
                        view.loadUrl(url)
                    }
                }
            },
        )

        if (loading) {
            LinearProgressIndicator(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .fillMaxWidth()
                    .height(2.5.dp),
                color = s.primary,
                trackColor = Color.Transparent,
            )
        }

        if (loadError != null) {
            Column(
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Default.CloudOff, contentDescription = null, tint = Color(0xFFCBD5E1), modifier = Modifier.size(28.dp))
                Text(
                    text = loadError ?: "Stream disconnected",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFFE2E8F0),
                )
                StitchSecondaryButton(
                    text = "Reconnect",
                    icon = Icons.Default.Refresh,
                    onClick = {
                        loadError = null
                        loading = true
                        webViewRef?.let { wv ->
                            onSyncCookies(wv)
                            if (authHeaders.isNotEmpty()) wv.loadUrl(url, authHeaders) else wv.loadUrl(url)
                        }
                    },
                )
            }
        }
    }
}

/**
 * Full Web-parity In-Chat Interactive Computer & Handoff Panel (`ui-cowork-computer.ts` + `cwOpenDesktop`):
 * - Embedded directly inside Cowork chat (or Desktop tab)
 * - Supports BOTH Private Linux Desktop (noVNC) and Host Server Browser modes
 * - Real-time Handoff banner ("Your turn · <reason>") + 1-tap Take control / Return to agent
 * - Quick app launchers (Browser, Agent browser, Files, Terminal)
 * - Start / Wake / Sleep / Stop / Switch to private desktop / Fullscreen expand
 */
@Composable
fun InChatComputerPanel(
    teammate: Teammate,
    computer: AgentComputerStatus?,
    busy: Boolean,
    handoffActive: Boolean,
    handoffReason: String,
    computerViewUrl: String,
    serverBrowserViewUrl: String,
    authHeaders: Map<String, String>,
    onSyncCookies: (WebView) -> Unit,
    onAction: (action: String) -> Unit,
    onLaunchApp: (app: String) -> Unit,
    onServerBrowserControl: (action: String) -> Unit,
    onExpandFullscreen: () -> Unit,
    onClose: (() -> Unit)? = null,
    screenHeight: Dp = 320.dp,
    modifier: Modifier = Modifier,
) {
    val s = LocalStitchPalette.current
    val isHost = computer?.useHostComputer ?: teammate.useHostComputer
    val stateLabel = computer?.state ?: if (isHost) "browser" else "stopped"
    val isRunning = !isHost && stateLabel == "running"
    val isStarting = !isHost && stateLabel == "starting"
    val isSleeping = !isHost && stateLabel == "sleeping"
    val isUserControl = !isHost && computer?.control == "user"
    val effectiveHandoff = handoffActive || isUserControl || !computer?.handoff?.reason.isNullOrBlank()
    val effectiveReason = handoffReason.ifBlank {
        computer?.handoff?.reason.orEmpty()
    }.ifBlank {
        if (isUserControl) "You have control. Return to ${teammate.name} when you are finished."
        else "The agent is waiting for you on the computer."
    }

    var reloadNonce by remember(teammate.id, isHost, isRunning) { mutableIntStateOf(0) }
    var serverBrowserUserControl by remember(teammate.id) { mutableStateOf(false) }

    val agentAccent = remember(teammate) {
        parseHexColor(
            resolveCharacterColorHex(teammate.avatar.shape, teammate.avatar.color, teammate.name),
            fallback = s.primary,
        )
    }

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(22.dp),
        color = s.surfaceContainerLowest,
        border = BorderStroke(
            width = if (effectiveHandoff) 1.5.dp else 1.dp,
            color = if (effectiveHandoff) agentAccent else s.outlineVariant,
        ),
        shadowElevation = 4.dp,
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            // Top bar: Agent computer title, live status dot, Reload, Fullscreen, Close
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(agentAccent.copy(alpha = 0.14f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = if (isHost) Icons.Default.Language else Icons.Default.DesktopWindows,
                        contentDescription = null,
                        tint = agentAccent,
                        modifier = Modifier.size(17.dp),
                    )
                }

                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            text = if (isHost) "${teammate.name} · Browser" else "${teammate.name} · Computer",
                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                            color = s.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Box(
                            modifier = Modifier
                                .size(7.dp)
                                .clip(CircleShape)
                                .background(
                                    when {
                                        isRunning || isHost -> s.success
                                        isStarting -> s.warning
                                        isSleeping -> s.tertiary
                                        else -> s.outline
                                    },
                                ),
                        )
                    }
                    Text(
                        text = when {
                            isHost -> "Interactive workspace browser"
                            isRunning && isUserControl -> "Live · You have control"
                            isRunning -> "Live · Shared desktop"
                            isStarting -> "Starting private desktop…"
                            isSleeping -> "Sleeping · Apps preserved"
                            stateLabel == "unavailable" -> computer?.error?.take(60) ?: "Desktop unavailable"
                            else -> "Stopped · Tap Start desktop"
                        },
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                        color = if (effectiveHandoff) agentAccent else s.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }

                if (isRunning || isHost) {
                    StitchCircleIconButton(
                        icon = Icons.Default.Refresh,
                        contentDescription = "Reload screen",
                        outlined = true,
                        size = 32.dp,
                        onClick = { reloadNonce++ },
                    )
                    StitchCircleIconButton(
                        icon = Icons.Default.OpenInFull,
                        contentDescription = "Expand fullscreen",
                        outlined = true,
                        size = 32.dp,
                        onClick = onExpandFullscreen,
                    )
                }
                if (onClose != null) {
                    StitchCircleIconButton(
                        icon = Icons.Default.Close,
                        contentDescription = "Hide computer",
                        outlined = true,
                        size = 32.dp,
                        onClick = onClose,
                    )
                }
            }

            // Handoff Banner ("Your turn")
            AnimatedVisibility(
                visible = effectiveHandoff && !isHost,
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically(),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(agentAccent.copy(alpha = 0.12f))
                        .padding(horizontal = 12.dp, vertical = 9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        imageVector = Icons.Default.PanTool,
                        contentDescription = null,
                        tint = agentAccent,
                        modifier = Modifier.size(16.dp),
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Your turn",
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                            color = s.onSurface,
                        )
                        Text(
                            text = effectiveReason,
                            style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp),
                            color = s.onSurfaceVariant,
                        )
                    }
                }
            }

            HorizontalDivider(color = s.outlineVariant)

            // Live Interactive Viewport OR Lifecycle Placeholder
            when {
                isHost -> {
                    AuthenticatedInteractiveWebView(
                        url = serverBrowserViewUrl,
                        authHeaders = authHeaders,
                        onSyncCookies = onSyncCookies,
                        reloadNonce = reloadNonce,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(screenHeight),
                    )
                }
                isRunning -> {
                    AuthenticatedInteractiveWebView(
                        url = computerViewUrl,
                        authHeaders = authHeaders,
                        onSyncCookies = onSyncCookies,
                        reloadNonce = reloadNonce,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(screenHeight),
                    )
                }
                else -> {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(s.surfaceContainerLow)
                            .padding(horizontal = 18.dp, vertical = 22.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        if (isStarting || busy) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(28.dp),
                                strokeWidth = 2.5.dp,
                                color = agentAccent,
                            )
                        } else {
                            Icon(
                                imageVector = if (isSleeping) Icons.Default.Bedtime else Icons.Default.DesktopWindows,
                                contentDescription = null,
                                tint = s.onSurfaceVariant,
                                modifier = Modifier.size(30.dp),
                            )
                        }
                        Text(
                            text = when {
                                isStarting -> "Starting ${teammate.name}'s private desktop…"
                                isSleeping -> "Desktop is sleeping. Open apps and windows are preserved."
                                stateLabel == "unavailable" -> computer?.error?.ifBlank { "Private desktop is currently unavailable." } ?: "Private desktop is currently unavailable."
                                else -> "Start ${teammate.name}'s private desktop to view and control it directly in chat."
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = s.onSurfaceVariant,
                        )
                        StitchPrimaryButton(
                            text = when {
                                isSleeping -> "Wake desktop"
                                stateLabel == "unavailable" -> "Retry startup"
                                isStarting -> "Starting…"
                                else -> "Start desktop"
                            },
                            icon = Icons.Default.PlayArrow,
                            busy = isStarting || busy,
                            enabled = !isStarting && !busy,
                            onClick = { onAction("start") },
                        )
                    }
                }
            }

            HorizontalDivider(color = s.outlineVariant)

            // Bottom Control & Handoff Toolbar (matching Web cw-desktop-toolbar)
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(s.surfaceContainerLow.copy(alpha = 0.65f))
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (isHost) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        ComputerActionChip(
                            label = if (serverBrowserUserControl) "Return to agent" else "Take control",
                            icon = if (serverBrowserUserControl) Icons.Default.SmartToy else Icons.Default.PanTool,
                            highlighted = true,
                            accent = agentAccent,
                            enabled = !busy,
                            onClick = {
                                val next = !serverBrowserUserControl
                                serverBrowserUserControl = next
                                onServerBrowserControl(if (next) "take-control" else "return-control")
                            },
                        )
                        ComputerActionChip(
                            label = "Use private desktop",
                            icon = Icons.Default.DesktopWindows,
                            enabled = !busy,
                            onClick = { onAction("use-private") },
                        )
                        ComputerActionChip(
                            label = "Fullscreen",
                            icon = Icons.Default.OpenInFull,
                            onClick = onExpandFullscreen,
                        )
                    }
                } else {
                    // Row 1: Primary handoff & lifecycle actions
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (isRunning) {
                            ComputerActionChip(
                                label = if (isUserControl) "Return to agent" else "Take control",
                                icon = if (isUserControl) Icons.Default.SmartToy else Icons.Default.PanTool,
                                highlighted = true,
                                accent = agentAccent,
                                enabled = !busy,
                                onClick = { onAction(if (isUserControl) "return-control" else "take-control") },
                            )
                            ComputerActionChip(
                                label = "Browser",
                                icon = Icons.Default.Language,
                                enabled = !busy,
                                onClick = { onLaunchApp("browser") },
                            )
                            ComputerActionChip(
                                label = "Agent browser",
                                icon = Icons.Default.TravelExplore,
                                enabled = !busy,
                                onClick = { onLaunchApp("agent_browser") },
                            )
                            ComputerActionChip(
                                label = "Files",
                                icon = Icons.Default.Folder,
                                enabled = !busy,
                                onClick = { onLaunchApp("files") },
                            )
                            ComputerActionChip(
                                label = "Terminal",
                                icon = Icons.Default.Terminal,
                                enabled = !busy,
                                onClick = { onLaunchApp("terminal") },
                            )
                            ComputerActionChip(
                                label = "Sleep",
                                icon = Icons.Default.Bedtime,
                                enabled = !busy,
                                onClick = { onAction("sleep") },
                            )
                        } else if (!isStarting) {
                            ComputerActionChip(
                                label = if (isSleeping) "Wake desktop" else "Start desktop",
                                icon = Icons.Default.PlayArrow,
                                highlighted = true,
                                accent = agentAccent,
                                enabled = !busy,
                                onClick = { onAction("start") },
                            )
                        }
                        if (isRunning || isStarting || isSleeping) {
                            ComputerActionChip(
                                label = "Stop",
                                icon = Icons.Default.Stop,
                                danger = true,
                                enabled = !busy,
                                onClick = { onAction("stop") },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ComputerActionChip(
    label: String,
    icon: ImageVector,
    highlighted: Boolean = false,
    danger: Boolean = false,
    accent: Color? = null,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val s = LocalStitchPalette.current
    val resolvedAccent = accent ?: s.primary
    val bg = when {
        !enabled -> s.surfaceContainer
        highlighted -> resolvedAccent
        danger -> s.errorContainer
        else -> s.surfaceContainerLowest
    }
    val fg = when {
        !enabled -> s.outline
        highlighted -> contrastInkFor(resolvedAccent)
        danger -> s.onErrorContainer
        else -> s.onSurface
    }
    val borderColor = when {
        highlighted -> resolvedAccent
        danger -> s.error.copy(alpha = 0.35f)
        else -> s.outlineVariant
    }
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(bg)
            .border(1.dp, borderColor, CircleShape)
            .stitchPressBounce(enabled = enabled, pressedScale = 0.94f, onClick = onClick)
            .padding(horizontal = 11.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Icon(icon, contentDescription = null, tint = fg, modifier = Modifier.size(14.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = if (highlighted) FontWeight.SemiBold else FontWeight.Medium,
                fontSize = 11.5.sp,
            ),
            color = fg,
            maxLines = 1,
        )
    }
}
