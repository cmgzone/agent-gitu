package dev.agentgitu.mobile.ui.screens

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import dev.agentgitu.mobile.ui.components.StitchCircleIconButton
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette
import dev.agentgitu.mobile.ui.viewmodel.LiveSurfaceRequest

/**
 * Authenticated embedded WebView for Live Desktop (noVNC), LiveKit Voice Calls,
 * Server Browser, and Safe Artifact Previews.
 */
@Composable
fun LiveSurfaceScreen(
    request: LiveSurfaceRequest,
    onClose: () -> Unit,
) {
    val s = LocalStitchPalette.current
    val context = LocalContext.current
    var webViewRef by remember { mutableStateOf<WebView?>(null) }
    var pendingWebPermission by remember { mutableStateOf<PermissionRequest?>(null) }

    val micPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        val pending = pendingWebPermission
        pendingWebPermission = null
        if (pending != null) {
            if (granted) pending.grant(pending.resources) else pending.deny()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(s.surface)
            .statusBarsPadding()
            .navigationBarsPadding(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            StitchCircleIconButton(icon = Icons.Default.Close, contentDescription = "Close", onClick = onClose)
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    request.title,
                    style = MaterialTheme.typography.titleMedium,
                    color = s.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (request.subtitle.isNotBlank()) {
                    Text(
                        request.subtitle,
                        style = MaterialTheme.typography.labelSmall,
                        color = s.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            StitchCircleIconButton(icon = Icons.Default.Refresh, contentDescription = "Reload", onClick = { webViewRef?.reload() })
        }
        HorizontalDivider(color = s.outlineVariant)

        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                @SuppressLint("SetJavaScriptEnabled")
                val wv = WebView(ctx).apply {
                    CookieManager.getInstance().setAcceptCookie(true)
                    CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.mediaPlaybackRequiresUserGesture = false
                    settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                    settings.useWideViewPort = true
                    settings.loadWithOverviewMode = true
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(view: WebView?, req: WebResourceRequest?): Boolean = false
                    }
                    webChromeClient = object : WebChromeClient() {
                        override fun onPermissionRequest(permissionRequest: PermissionRequest?) {
                            if (permissionRequest == null) return
                            val wantsAudio = permissionRequest.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                            if (wantsAudio && ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                                pendingWebPermission = permissionRequest
                                micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                            } else {
                                permissionRequest.grant(permissionRequest.resources)
                            }
                        }
                    }
                    loadUrl(request.url)
                }
                webViewRef = wv
                wv
            },
            update = { wv ->
                if (wv.url != request.url) {
                    wv.loadUrl(request.url)
                }
            },
        )
    }
}
