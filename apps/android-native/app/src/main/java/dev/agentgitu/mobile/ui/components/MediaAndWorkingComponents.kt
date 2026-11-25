package dev.agentgitu.mobile.ui.components

import android.net.Uri
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.MediaController
import android.widget.VideoView
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.ImageLoader
import coil.compose.SubcomposeAsyncImage
import coil.request.ImageRequest
import dev.agentgitu.mobile.data.model.TeamProgress
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette

data class GituMediaContext(
    val baseUrl: String = "",
    val authHeaders: Map<String, String> = emptyMap(),
    val imageLoader: ImageLoader? = null,
)

val LocalGituMediaContext = staticCompositionLocalOf { GituMediaContext() }

fun resolveMediaUrl(rawUrl: String, baseUrl: String): String {
    val trimmed = rawUrl.trim()
    if (trimmed.isEmpty()) return ""
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:")) {
        return trimmed
    }
    if (trimmed.startsWith("/") && baseUrl.isNotBlank()) {
        return "${baseUrl.trimEnd('/')}$trimmed"
    }
    return trimmed
}

/**
 * Native inline picture renderer backed by authenticated Coil [ImageLoader],
 * with loading shimmer and tap-to-open full-screen zoomable lightbox.
 */
@Composable
fun InlineMediaImageCard(
    url: String,
    caption: String = "",
    modifier: Modifier = Modifier,
) {
    val s = LocalStitchPalette.current
    val media = LocalGituMediaContext.current
    val context = LocalContext.current
    val resolved = remember(url, media.baseUrl) { resolveMediaUrl(url, media.baseUrl) }
    if (resolved.isBlank()) return

    var fullScreen by remember { mutableStateOf(false) }
    val loader = media.imageLoader ?: remember(context) { ImageLoader(context) }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(s.surfaceContainerLow)
            .border(1.dp, s.outlineVariant, RoundedCornerShape(14.dp))
            .clickable { fullScreen = true },
    ) {
        SubcomposeAsyncImage(
            model = ImageRequest.Builder(context)
                .data(resolved)
                .crossfade(true)
                .build(),
            imageLoader = loader,
            contentDescription = caption.ifBlank { "Image" },
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 120.dp, max = 260.dp)
                .background(s.surfaceContainer),
            loading = {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(160.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp, color = s.primary)
                }
            },
            error = {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(Icons.Default.BrokenImage, contentDescription = null, tint = s.onSurfaceVariant, modifier = Modifier.size(18.dp))
                    Text(
                        text = caption.ifBlank { "Image unavailable" },
                        style = MaterialTheme.typography.bodySmall,
                        color = s.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            },
        )
        if (caption.isNotBlank()) {
            Text(
                text = caption,
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                color = s.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            )
        }
    }

    if (fullScreen) {
        Dialog(
            onDismissRequest = { fullScreen = false },
            properties = DialogProperties(usePlatformDefaultWidth = false),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.94f))
                    .clickable { fullScreen = false },
                contentAlignment = Alignment.Center,
            ) {
                SubcomposeAsyncImage(
                    model = ImageRequest.Builder(context).data(resolved).crossfade(true).build(),
                    imageLoader = loader,
                    contentDescription = caption.ifBlank { "Full image" },
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxWidth()
                        .fillMaxHeight(0.86f)
                        .padding(12.dp),
                )
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .statusBarsPadding()
                        .padding(16.dp),
                ) {
                    StitchCircleIconButton(
                        icon = Icons.Default.Close,
                        contentDescription = "Close",
                        outlined = true,
                        onClick = { fullScreen = false },
                    )
                }
            }
        }
    }
}

/**
 * Native inline video player supporting:
 * 1) Direct MP4 / WebM / MOV & authenticated Agent Gitu video artifacts via Android [VideoView] + [MediaController]
 * 2) YouTube / Vimeo embeds via sandboxed inline [WebView]
 */
@Composable
fun InlineMediaVideoCard(
    url: String,
    title: String = "",
    posterUrl: String? = null,
    modifier: Modifier = Modifier,
) {
    val s = LocalStitchPalette.current
    val media = LocalGituMediaContext.current
    val resolved = remember(url, media.baseUrl) { resolveMediaUrl(url, media.baseUrl) }
    if (resolved.isBlank()) return

    val embedUrl = remember(resolved) { extractVideoEmbedUrl(resolved) }
    var playing by remember(resolved) { mutableStateOf(false) }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(s.surfaceContainerLow)
            .border(1.dp, s.outlineVariant, RoundedCornerShape(14.dp)),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .background(Color.Black),
            contentAlignment = Alignment.Center,
        ) {
            if (!playing) {
                if (!posterUrl.isNullOrBlank()) {
                    val context = LocalContext.current
                    val loader = media.imageLoader ?: remember(context) { ImageLoader(context) }
                    SubcomposeAsyncImage(
                        model = ImageRequest.Builder(context)
                            .data(resolveMediaUrl(posterUrl, media.baseUrl))
                            .crossfade(true)
                            .build(),
                        imageLoader = loader,
                        contentDescription = title,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.38f))
                        .clickable { playing = true },
                    contentAlignment = Alignment.Center,
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .clip(CircleShape)
                                .background(Color.White.copy(alpha = 0.92f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(Icons.Default.PlayArrow, contentDescription = "Play video", tint = Color(0xFF18181B), modifier = Modifier.size(28.dp))
                        }
                        Text(
                            text = if (embedUrl != null) "Tap to play video" else "Tap to stream video",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color.White,
                        )
                    }
                }
            } else if (embedUrl != null) {
                AndroidView(
                    factory = { ctx ->
                        WebView(ctx).apply {
                            settings.javaScriptEnabled = true
                            settings.domStorageEnabled = true
                            settings.mediaPlaybackRequiresUserGesture = false
                            settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                            loadUrl("$embedUrl?autoplay=1&playsinline=1")
                        }
                    },
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                val headers = media.authHeaders
                AndroidView(
                    factory = { ctx ->
                        VideoView(ctx).apply {
                            val mc = MediaController(ctx)
                            mc.setAnchorView(this)
                            setMediaController(mc)
                            setVideoURI(Uri.parse(resolved), headers)
                            setOnPreparedListener { mp ->
                                mp.isLooping = false
                                start()
                            }
                        }
                    },
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }

        if (title.isNotBlank()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(Icons.Default.Videocam, contentDescription = null, tint = s.primary, modifier = Modifier.size(14.dp))
                Text(
                    text = title,
                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                    color = s.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

private fun extractVideoEmbedUrl(url: String): String? {
    val parsed = runCatching { Uri.parse(url) }.getOrNull() ?: return null
    val host = parsed.host?.lowercase()?.removePrefix("www.") ?: return null
    return when (host) {
        "youtu.be" -> {
            val id = parsed.path?.trim('/')?.takeIf { it.matches(Regex("[A-Za-z0-9_-]{6,20}")) } ?: return null
            "https://www.youtube-nocookie.com/embed/$id"
        }
        "youtube.com", "m.youtube.com" -> {
            val id = when {
                parsed.path == "/watch" -> parsed.getQueryParameter("v")
                parsed.path?.startsWith("/shorts/") == true -> parsed.path?.removePrefix("/shorts/")?.substringBefore('/')
                parsed.path?.startsWith("/embed/") == true -> parsed.path?.removePrefix("/embed/")?.substringBefore('/')
                else -> null
            }?.takeIf { it.matches(Regex("[A-Za-z0-9_-]{6,20}")) } ?: return null
            "https://www.youtube-nocookie.com/embed/$id"
        }
        "vimeo.com" -> {
            val id = parsed.path?.trim('/')?.substringBefore('/')?.takeIf { it.matches(Regex("\\d{6,12}")) } ?: return null
            "https://player.vimeo.com/video/$id"
        }
        else -> null
    }
}

/**
 * Beautiful animated working indicator showing:
 * - Animated breathing official AI plush character
 * - Live active App / Website / Tool scanner badge with real favicon or app icon
 * - Animated wave dots & current phase / detail
 */
@Composable
fun RichWorkingIndicator(
    agentName: String,
    accentHex: String?,
    shapeName: String?,
    progress: TeamProgress?,
    fallbackText: String = "Working…",
    onClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val s = LocalStitchPalette.current
    val media = LocalGituMediaContext.current
    val context = LocalContext.current

    val inf = rememberInfiniteTransition(label = "workingAnim")
    val spinDeg by inf.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(1500, easing = LinearEasing)),
        label = "scanArc",
    )
    val dotPhase by inf.animateFloat(
        initialValue = 0f,
        targetValue = 3f,
        animationSpec = infiniteRepeatable(tween(1050, easing = LinearEasing)),
        label = "dots",
    )

    val appInfo = remember(progress) { resolveActiveAppBadge(progress) }
    val statusText = remember(progress, fallbackText) {
        val detail = progress?.detail?.trim().orEmpty()
        val text = progress?.text?.trim().orEmpty()
        when {
            detail.isNotBlank() -> detail
            text.isNotBlank() -> text
            else -> fallbackText
        }
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        StitchCharacterAvatar(
            label = agentName.ifBlank { "AI" },
            accentHex = accentHex,
            shapeName = shapeName,
            size = 28.dp,
            working = true,
        )

        Surface(
            shape = RoundedCornerShape(16.dp),
            color = s.surfaceContainerLowest.copy(alpha = 0.96f),
            border = BorderStroke(1.dp, s.outlineVariant),
            shadowElevation = 2.dp,
            modifier = Modifier.weight(1f, fill = false),
        ) {
            Column(
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                ) {
                    // Rotating orbital scanner icon with active App / Website Favicon
                    Box(
                        modifier = Modifier.size(22.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Canvas(modifier = Modifier.fillMaxSize()) {
                            drawArc(
                                brush = Brush.sweepGradient(
                                    listOf(
                                        appInfo.tint.copy(alpha = 0.1f),
                                        appInfo.tint,
                                        appInfo.tint.copy(alpha = 0.1f),
                                    ),
                                ),
                                startAngle = spinDeg,
                                sweepAngle = 200f,
                                useCenter = false,
                                style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round),
                            )
                        }
                        if (appInfo.faviconUrl != null) {
                            val loader = media.imageLoader ?: remember(context) { ImageLoader(context) }
                            SubcomposeAsyncImage(
                                model = ImageRequest.Builder(context).data(appInfo.faviconUrl).crossfade(true).build(),
                                imageLoader = loader,
                                contentDescription = appInfo.label,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .size(14.dp)
                                    .clip(RoundedCornerShape(3.dp)),
                                error = {
                                    Icon(appInfo.icon, contentDescription = null, tint = appInfo.tint, modifier = Modifier.size(13.dp))
                                },
                            )
                        } else {
                            Icon(appInfo.icon, contentDescription = null, tint = appInfo.tint, modifier = Modifier.size(13.dp))
                        }
                    }

                    Text(
                        text = appInfo.label,
                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold, fontSize = 11.sp),
                        color = s.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )

                    // Animated 3-dot wave
                    Row(horizontalArrangement = Arrangement.spacedBy(2.5.dp), verticalAlignment = Alignment.CenterVertically) {
                        for (idx in 0..2) {
                            val dist = kotlin.math.abs(dotPhase - idx)
                            val alpha = (1f - dist.coerceAtMost(1f)) * 0.75f + 0.25f
                            Box(
                                modifier = Modifier
                                    .size(4.dp)
                                    .clip(CircleShape)
                                    .background(appInfo.tint.copy(alpha = alpha)),
                            )
                        }
                    }
                }

                if (statusText.isNotBlank() && !statusText.equals(appInfo.label, ignoreCase = true)) {
                    Text(
                        text = statusText,
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp, lineHeight = 15.sp),
                        color = s.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

private data class ActiveAppBadge(
    val label: String,
    val icon: ImageVector,
    val tint: Color,
    val faviconUrl: String? = null,
)

private fun resolveActiveAppBadge(progress: TeamProgress?): ActiveAppBadge {
    val tool = progress?.tool?.trim()?.lowercase().orEmpty()
    val appService = progress?.appService?.trim()?.lowercase().orEmpty()
    val mcpServer = progress?.mcpServer?.trim()?.lowercase().orEmpty()
    val webUrl = progress?.webUrl?.trim().orEmpty()
    val phase = progress?.phase?.trim()?.lowercase().orEmpty()

    val host = runCatching {
        if (webUrl.startsWith("http://") || webUrl.startsWith("https://")) {
            Uri.parse(webUrl).host?.removePrefix("www.")
        } else null
    }.getOrNull()

    val favicon = when {
        !host.isNullOrBlank() -> "https://www.google.com/s2/favicons?sz=64&domain=$host"
        appService.isNotBlank() -> domainForAppService(appService)?.let { "https://www.google.com/s2/favicons?sz=64&domain=$it" }
        mcpServer.isNotBlank() -> domainForAppService(mcpServer)?.let { "https://www.google.com/s2/favicons?sz=64&domain=$it" }
        else -> null
    }

    if (appService.isNotBlank()) {
        val pretty = appService.replace('_', ' ').replace('-', ' ').replaceFirstChar { it.uppercase() }
        return ActiveAppBadge(
            label = "Using $pretty",
            icon = iconForService(appService),
            tint = Color(0xFF3FB984),
            faviconUrl = favicon,
        )
    }

    if (mcpServer.isNotBlank()) {
        val pretty = mcpServer.replace('_', ' ').replace('-', ' ').replaceFirstChar { it.uppercase() }
        return ActiveAppBadge(
            label = "Using $pretty",
            icon = iconForService(mcpServer),
            tint = Color(0xFF9C6DF2),
            faviconUrl = favicon,
        )
    }

    if (!host.isNullOrBlank()) {
        val verb = when (tool) {
            "web_search", "search_web" -> "Searching"
            "web_fetch" -> "Reading"
            else -> "Browsing"
        }
        return ActiveAppBadge(
            label = "$verb $host",
            icon = Icons.Default.Public,
            tint = Color(0xFF4C7DF0),
            faviconUrl = favicon,
        )
    }

    return when (tool) {
        "web_search", "search_web" -> ActiveAppBadge("Searching the web", Icons.Default.TravelExplore, Color(0xFF4C7DF0))
        "web_fetch" -> ActiveAppBadge("Reading webpage", Icons.Default.Public, Color(0xFF4C7DF0))
        "browse" -> ActiveAppBadge("Using Browser", Icons.Default.Language, Color(0xFF4C7DF0))
        "run_command", "ssh_exec" -> ActiveAppBadge("Running Terminal", Icons.Default.Terminal, Color(0xFFEAB308))
        "read_file", "list_files", "search_files" -> ActiveAppBadge("Reading Workspace", Icons.Default.FolderOpen, Color(0xFF29B7AD))
        "write_file", "apply_edit" -> ActiveAppBadge("Editing Code", Icons.Default.Edit, Color(0xFF3FD68F))
        "create_document", "share_file" -> ActiveAppBadge("Creating Document", Icons.Default.Description, Color(0xFFEC4899))
        "gitu_task" -> ActiveAppBadge("Coding Agent", Icons.Default.Code, Color(0xFF3FD68F))
        else -> when (phase) {
            "reasoning" -> ActiveAppBadge("Reasoning", Icons.Default.Psychology, Color(0xFF9C6DF2))
            "responding" -> ActiveAppBadge("Writing reply", Icons.Default.AutoAwesome, Color(0xFF6A8CFF))
            else -> ActiveAppBadge("Thinking", Icons.Default.AutoAwesome, Color(0xFF6A8CFF))
        }
    }
}

private fun domainForAppService(slug: String): String? = when {
    slug.contains("gmail") -> "mail.google.com"
    slug.contains("googlecalendar") || slug.contains("gcal") || slug == "calendar" -> "calendar.google.com"
    slug.contains("googledrive") || slug.contains("gdrive") -> "drive.google.com"
    slug.contains("googledocs") -> "docs.google.com"
    slug.contains("googlesheets") -> "sheets.google.com"
    slug.contains("github") -> "github.com"
    slug.contains("slack") -> "slack.com"
    slug.contains("notion") -> "notion.so"
    slug.contains("linear") -> "linear.app"
    slug.contains("discord") -> "discord.com"
    slug.contains("stripe") -> "stripe.com"
    slug.contains("figma") -> "figma.com"
    slug.contains("trello") -> "trello.com"
    slug.contains("jira") -> "atlassian.com"
    slug.contains("pikpam") -> "pikpam.com"
    slug.contains("twitter") || slug == "x" -> "x.com"
    slug.contains("linkedin") -> "linkedin.com"
    slug.contains("spotify") -> "spotify.com"
    slug.contains("whatsapp") -> "whatsapp.com"
    slug.contains("telegram") -> "telegram.org"
    slug.contains("instagram") -> "instagram.com"
    else -> null
}

private fun iconForService(slug: String): ImageVector = when {
    slug.contains("mail") || slug.contains("gmail") -> Icons.Default.Email
    slug.contains("cal") -> Icons.Default.CalendarToday
    slug.contains("github") || slug.contains("code") -> Icons.Default.Code
    slug.contains("slack") || slug.contains("discord") || slug.contains("chat") -> Icons.Default.Forum
    slug.contains("drive") || slug.contains("doc") -> Icons.Default.Folder
    else -> Icons.Default.Extension
}
