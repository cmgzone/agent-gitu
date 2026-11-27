package dev.agentgitu.mobile.ui.components

import androidx.compose.foundation.Canvas
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
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette
import kotlinx.serialization.json.*

private val richJson = Json {
    ignoreUnknownKeys = true
    isLenient = true
    prettyPrint = true
}

private val CHART_COLORS = listOf(
    Color(0xFF6A8CFF),
    Color(0xFF3FB984),
    Color(0xFFE0A34A),
    Color(0xFFC9607F),
    Color(0xFF8B6AE0),
    Color(0xFF4AA3C7),
)

/**
 * Full Web-UI-parity Markdown & Rich Output (`output a2ui`, `output ui`, `output brief`,
 * `output tasks`, `output email`, `output chart`, `output table`, `output links/docs`, `output json`)
 * renderer for Agent Gitu mobile chat bubbles.
 */
@Composable
fun RichChatMessageContent(
    rawText: String,
    baseColor: Color,
    mentionNames: List<String> = emptyList(),
    onSendAction: ((String) -> Unit)? = null,
    onOpenRun: ((String) -> Unit)? = null,
    fillWidth: Boolean = true,
    modifier: Modifier = Modifier,
) {
    val s = LocalStitchPalette.current
    val uriHandler = LocalUriHandler.current
    val blocks = remember(rawText) { ChatMessageFilter.parseBlocks(rawText) }

    val openUrl: (String) -> Unit = { url ->
        if (url.startsWith("http://") || url.startsWith("https://")) {
            runCatching { uriHandler.openUri(url) }
        }
    }

    if (blocks.isEmpty()) {
        val fallback = ChatMessageFilter.filterVisibleReply(rawText)
        if (fallback.isNotBlank()) {
            Text(text = fallback, style = MaterialTheme.typography.bodySmall, color = baseColor, modifier = modifier)
        }
        return
    }

    val needsFullWidth = fillWidth || blocks.any { block ->
        block !is ChatBlock.ParagraphBlock && block !is ChatBlock.HeadingBlock
    }

    Column(
        modifier = if (needsFullWidth) modifier.fillMaxWidth() else modifier.wrapContentWidth(),
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        blocks.forEach { block ->
            when (block) {
                is ChatBlock.HeadingBlock -> {
                    val sizeSp = when (block.level) {
                        1 -> 15.sp
                        2 -> 14.sp
                        3 -> 13.5.sp
                        else -> 13.sp
                    }
                    MarkdownTextContent(
                        text = block.text,
                        baseColor = baseColor,
                        mentionNames = mentionNames,
                        fontSizeSp = sizeSp.value,
                        lineHeightSp = (sizeSp.value + 5f),
                        defaultWeight = FontWeight.SemiBold,
                        onOpenUrl = openUrl,
                        onOpenRun = onOpenRun,
                    )
                }

                is ChatBlock.ParagraphBlock -> {
                    MarkdownTextContent(
                        text = block.text,
                        baseColor = baseColor,
                        mentionNames = mentionNames,
                        onOpenUrl = openUrl,
                        onOpenRun = onOpenRun,
                    )
                }

                is ChatBlock.ListBlock -> {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        block.items.forEach { (marker, itemText) ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                verticalAlignment = Alignment.Top,
                            ) {
                                Text(
                                    text = marker,
                                    style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                                    color = baseColor.copy(alpha = 0.72f),
                                )
                                MarkdownTextContent(
                                    text = itemText,
                                    baseColor = baseColor,
                                    mentionNames = mentionNames,
                                    onOpenUrl = openUrl,
                                    onOpenRun = onOpenRun,
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }
                    }
                }

                is ChatBlock.QuoteBlock -> {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(s.surfaceContainerLow.copy(alpha = 0.75f))
                            .padding(horizontal = 9.dp, vertical = 7.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .width(2.5.dp)
                                .heightIn(min = 18.dp)
                                .clip(CircleShape)
                                .background(s.primary.copy(alpha = 0.65f)),
                        )
                        MarkdownTextContent(
                            text = block.text,
                            baseColor = baseColor.copy(alpha = 0.88f),
                            mentionNames = mentionNames,
                            onOpenUrl = openUrl,
                            onOpenRun = onOpenRun,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }

                is ChatBlock.ImageBlock -> {
                    InlineMediaImageCard(url = block.url, caption = block.alt)
                }

                is ChatBlock.CodeBlock -> {
                    MarkdownCodeBlockCard(language = block.language, code = block.code)
                }

                is ChatBlock.TableBlock -> {
                    MarkdownTableCard(headers = block.headers, rows = block.rows)
                }

                is ChatBlock.OutputBlock -> {
                    RichOutputBlockCard(
                        kind = block.kind,
                        payload = block.payload,
                        onSendAction = onSendAction ?: {},
                        onOpenUrl = openUrl,
                    )
                }
            }
        }
    }
}

@Composable
fun MarkdownTextContent(
    text: String,
    baseColor: Color,
    mentionNames: List<String> = emptyList(),
    fontSizeSp: Float = 13f,
    lineHeightSp: Float = 18f,
    defaultWeight: FontWeight = FontWeight.Normal,
    onOpenUrl: (String) -> Unit = {},
    onOpenRun: ((String) -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val s = LocalStitchPalette.current
    val runLinkMatch = remember(text) {
        Regex("\\[View task]\\(#run=([a-zA-Z0-9_-]+)\\)").find(text)
    }
    val displayText = remember(text, runLinkMatch) {
        if (runLinkMatch != null) text.replace(runLinkMatch.value, "").trim() else text
    }

    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (displayText.isNotBlank()) {
            val annotated = remember(displayText, baseColor, s.isDark, mentionNames) {
                buildMarkdownAnnotatedString(
                    text = displayText,
                    baseColor = baseColor,
                    codeBg = s.surfaceContainer,
                    linkColor = if (s.isDark) Color(0xFF93C5FD) else Color(0xFF2563EB),
                    mentionBg = s.primary.copy(alpha = 0.14f),
                    mentionNames = mentionNames,
                    onOpenUrl = onOpenUrl,
                )
            }
            Text(
                text = annotated,
                style = MaterialTheme.typography.bodySmall.copy(
                    fontSize = fontSizeSp.sp,
                    lineHeight = lineHeightSp.sp,
                    fontWeight = defaultWeight,
                    color = baseColor,
                ),
            )
        }
        if (runLinkMatch != null && onOpenRun != null) {
            val runId = runLinkMatch.groupValues[1]
            Row(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(s.surfaceContainerLow)
                    .border(1.dp, s.outlineVariant, CircleShape)
                    .clickable { onOpenRun(runId) }
                    .padding(horizontal = 10.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Icon(Icons.Default.Code, contentDescription = null, tint = s.primary, modifier = Modifier.size(13.dp))
                Text("View coding task", style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp), color = s.onSurface)
            }
        }
    }
}

private val INLINE_TOKEN_REGEX = Regex(
    "`([^`\\n]+)`" +
        "|\\[([^\\]\\n]+)]\\((https?://[^\\s)]+)\\)" +
        "|\\*\\*\\*([^*\\n]+)\\*\\*\\*" +
        "|___([^_\\n]+)___" +
        "|\\*\\*([^*\\n]+)\\*\\*" +
        "|(?<![*\\w])\\*(\\S(?:[^*\\n]*[^*\\s])?)\\*(?!\\*)" +
        "|(?<![_\\w])_(\\S(?:[^_\\n]*[^_\\s])?)_(?![\\w_])" +
        "|(https?://[^\\s<>\"`]+)",
)

private fun buildMarkdownAnnotatedString(
    text: String,
    baseColor: Color,
    codeBg: Color,
    linkColor: Color,
    mentionBg: Color,
    mentionNames: List<String>,
    onOpenUrl: (String) -> Unit,
): AnnotatedString = buildAnnotatedString {
    val mentionRegex = mentionNames
        .mapNotNull { it.replace(Regex("[^A-Za-z0-9_.\\-]"), "").takeIf(String::isNotBlank) }
        .takeIf { it.isNotEmpty() }
        ?.let { names -> Regex("@(${names.joinToString("|") { Regex.escape(it) }})", RegexOption.IGNORE_CASE) }

    fun appendPlainWithMentions(segment: String) {
        if (mentionRegex == null) {
            append(segment)
            return
        }
        var cursor = 0
        for (m in mentionRegex.findAll(segment)) {
            if (m.range.first > cursor) append(segment.substring(cursor, m.range.first))
            withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, background = mentionBg)) {
                append(m.value)
            }
            cursor = m.range.last + 1
        }
        if (cursor < segment.length) append(segment.substring(cursor))
    }

    var idx = 0
    for (match in INLINE_TOKEN_REGEX.findAll(text)) {
        if (match.range.first > idx) {
            appendPlainWithMentions(text.substring(idx, match.range.first))
        }
        val g = match.groupValues
        when {
            g[1].isNotEmpty() -> {
                withStyle(
                    SpanStyle(
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.5.sp,
                        background = codeBg,
                        color = baseColor,
                    ),
                ) {
                    append(" ${g[1]} ")
                }
            }
            g[2].isNotEmpty() && g[3].isNotEmpty() -> {
                val url = g[3]
                withLink(
                    LinkAnnotation.Clickable(
                        tag = "url",
                        styles = TextLinkStyles(SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline)),
                        linkInteractionListener = { onOpenUrl(url) },
                    ),
                ) {
                    append(g[2])
                }
            }
            g[4].isNotEmpty() -> {
                withStyle(SpanStyle(fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic)) { append(g[4]) }
            }
            g[5].isNotEmpty() -> {
                withStyle(SpanStyle(fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic)) { append(g[5]) }
            }
            g[6].isNotEmpty() -> {
                withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(g[6]) }
            }
            g[7].isNotEmpty() -> {
                withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(g[7]) }
            }
            g[8].isNotEmpty() -> {
                withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(g[8]) }
            }
            g[9].isNotEmpty() -> {
                val rawUrl = g[9]
                val cleanUrl = rawUrl.trimEnd('.', ',', ';', '!', '?', ')', ']', '}')
                val tail = rawUrl.removePrefix(cleanUrl)
                withLink(
                    LinkAnnotation.Clickable(
                        tag = "url",
                        styles = TextLinkStyles(SpanStyle(color = linkColor, textDecoration = TextDecoration.Underline)),
                        linkInteractionListener = { onOpenUrl(cleanUrl) },
                    ),
                ) {
                    append(cleanUrl)
                }
                if (tail.isNotEmpty()) append(tail)
            }
            else -> append(match.value)
        }
        idx = match.range.last + 1
    }
    if (idx < text.length) {
        appendPlainWithMentions(text.substring(idx))
    }
}

@Composable
private fun MarkdownCodeBlockCard(language: String, code: String) {
    val s = LocalStitchPalette.current
    val clipboard = LocalClipboardManager.current
    var copied by remember(code) { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(s.surfaceDim)
            .border(1.dp, s.outlineVariant, RoundedCornerShape(12.dp)),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(s.surfaceContainerLow)
                .padding(horizontal = 10.dp, vertical = 5.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = language.ifBlank { "code" }.lowercase(),
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                color = s.onSurfaceVariant,
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier
                    .clip(CircleShape)
                    .clickable {
                        clipboard.setText(AnnotatedString(code))
                        copied = true
                    }
                    .padding(horizontal = 6.dp, vertical = 2.dp),
            ) {
                Icon(
                    if (copied) Icons.Default.Check else Icons.Default.ContentCopy,
                    contentDescription = "Copy code",
                    tint = if (copied) s.success else s.onSurfaceVariant,
                    modifier = Modifier.size(12.dp),
                )
                Text(
                    text = if (copied) "Copied" else "Copy",
                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                    color = if (copied) s.success else s.onSurfaceVariant,
                )
            }
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(1.dp),
        ) {
            val lines = remember(code) { code.trimEnd().split('\n') }
            lines.forEach { line ->
                val isAdd = line.startsWith("+ ")
                val isRemove = line.startsWith("- ") || line.startsWith("− ")
                val lineColor = when {
                    isAdd -> if (s.isDark) Color(0xFF4ADE80) else Color(0xFF15803D)
                    isRemove -> if (s.isDark) Color(0xFFF87171) else Color(0xFFDC2626)
                    else -> s.onSurface
                }
                Text(
                    text = line,
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.5.sp,
                        lineHeight = 16.sp,
                    ),
                    color = lineColor,
                )
            }
        }
    }
}

@Composable
private fun MarkdownTableCard(headers: List<String>, rows: List<List<String>>) {
    val s = LocalStitchPalette.current
    val colCount = maxOf(headers.size, rows.maxOfOrNull { it.size } ?: 0)
    if (colCount == 0) return

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(s.surfaceContainerLow)
            .border(1.dp, s.outlineVariant, RoundedCornerShape(12.dp))
            .horizontalScroll(rememberScrollState()),
    ) {
        Column(modifier = Modifier.width(IntrinsicSize.Max)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(s.surfaceContainer)
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                for (c in 0 until colCount) {
                    Text(
                        text = headers.getOrElse(c) { "" },
                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold, fontSize = 11.5.sp),
                        color = s.onSurface,
                        modifier = Modifier.widthIn(min = 76.dp, max = 180.dp),
                    )
                }
            }
            rows.forEachIndexed { rIdx, row ->
                if (rIdx > 0) HorizontalDivider(color = s.outlineVariant.copy(alpha = 0.6f))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    for (c in 0 until colCount) {
                        Text(
                            text = row.getOrElse(c) { "" },
                            style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp, lineHeight = 16.sp),
                            color = s.onSurface,
                            modifier = Modifier.widthIn(min = 76.dp, max = 180.dp),
                        )
                    }
                }
            }
        }
    }
}

/**
 * Renders structured ` ```output <kind>``` ` cards natively (`a2ui`, `ui`/`result`, `brief`,
 * `tasks`, `email`/`inbox`, `chart`, `table`, `links`, `docs`/`files`, `json`).
 */
@Composable
private fun RichOutputBlockCard(
    kind: String,
    payload: String,
    onSendAction: (String) -> Unit,
    onOpenUrl: (String) -> Unit,
) {
    val s = LocalStitchPalette.current

    if (kind == "a2ui") {
        val parsed = remember(payload) { A2uiProtocol.parse(payload) }
        if (parsed != null) {
            A2uiSurfaceCard(
                payload = parsed,
                onActionMessage = onSendAction,
                onOpenUrl = onOpenUrl,
            )
            return
        }
    }

    if (kind == "table" || kind == "sortable") {
        val parsedTables = remember(payload) {
            ChatMessageFilter.parseBlocks(payload).filterIsInstance<ChatBlock.TableBlock>()
        }
        if (parsedTables.isNotEmpty()) {
            parsedTables.forEach { MarkdownTableCard(it.headers, it.rows) }
            return
        }
    }

    val jsonEl = remember(payload) { runCatching { richJson.parseToJsonElement(payload.trim()) }.getOrNull() }
    val obj = jsonEl as? JsonObject

    when (kind) {
        "ui", "result" -> if (obj != null) {
            RichAdaptiveUiCard(obj = obj, onSendAction = onSendAction, onOpenUrl = onOpenUrl)
            return
        }
        "brief" -> if (obj != null) {
            RichBriefCard(obj = obj, onSendAction = onSendAction, onOpenUrl = onOpenUrl)
            return
        }
        "tasks" -> if (obj != null) {
            RichTasksCard(obj = obj)
            return
        }
        "email", "inbox" -> if (obj != null) {
            RichEmailCard(obj = obj, onOpenUrl = onOpenUrl)
            return
        }
        "chart" -> if (obj != null) {
            RichChartCard(obj = obj)
            return
        }
        "links", "link", "docs", "files", "file" -> {
            val items = (obj?.get("items") as? JsonArray) ?: (jsonEl as? JsonArray)
            if (items != null) {
                RichLinksOrFilesCard(
                    title = obj?.get("title")?.jsonPrimitive?.contentOrNull
                        ?: if (kind.startsWith("link")) "Sources" else "Files",
                    items = items,
                    onOpenUrl = onOpenUrl,
                )
                return
            }
        }
        "image", "map-image", "map_image" -> {
            val imgUrl = obj?.get("url")?.jsonPrimitive?.contentOrNull
                ?: obj?.get("src")?.jsonPrimitive?.contentOrNull
                ?: payload.trim().takeIf { it.startsWith("http") || it.startsWith("/") }
            if (!imgUrl.isNullOrBlank()) {
                val cap = obj?.get("caption")?.jsonPrimitive?.contentOrNull
                    ?: obj?.get("alt")?.jsonPrimitive?.contentOrNull
                    ?: obj?.get("title")?.jsonPrimitive?.contentOrNull.orEmpty()
                InlineMediaImageCard(url = imgUrl, caption = cap)
                return
            }
        }
        "gallery", "images" -> {
            val items = (obj?.get("items") as? JsonArray) ?: (jsonEl as? JsonArray)
            if (items != null && items.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items.mapNotNull { it as? JsonObject }.forEach { img ->
                        val u = img["url"]?.jsonPrimitive?.contentOrNull ?: img["src"]?.jsonPrimitive?.contentOrNull
                        if (!u.isNullOrBlank()) {
                            InlineMediaImageCard(
                                url = u,
                                caption = img["caption"]?.jsonPrimitive?.contentOrNull ?: img["alt"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                            )
                        }
                    }
                }
                return
            }
        }
        "video" -> {
            val vidUrl = obj?.get("url")?.jsonPrimitive?.contentOrNull
                ?: payload.trim().takeIf { it.startsWith("http") || it.startsWith("/") }
            if (!vidUrl.isNullOrBlank()) {
                InlineMediaVideoCard(
                    url = vidUrl,
                    title = obj?.get("title")?.jsonPrimitive?.contentOrNull.orEmpty(),
                    posterUrl = obj?.get("poster")?.jsonPrimitive?.contentOrNull,
                )
                return
            }
        }
        "json" -> if (jsonEl != null) {
            MarkdownCodeBlockCard(language = "json", code = richJson.encodeToString(JsonElement.serializer(), jsonEl))
            return
        }
    }

    // Safe fallback: render formatted code block so no structured payload is ever lost
    MarkdownCodeBlockCard(language = kind.ifBlank { "output" }, code = payload)
}

@Composable
private fun RichCardShell(
    title: String,
    badge: String,
    content: @Composable ColumnScope.() -> Unit,
) {
    val s = LocalStitchPalette.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(s.surfaceContainerLow)
            .border(1.dp, s.outlineVariant, RoundedCornerShape(14.dp))
            .padding(11.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelLarge.copy(fontSize = 13.sp),
                color = s.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = badge,
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                color = s.onSurfaceVariant,
            )
        }
        HorizontalDivider(color = s.outlineVariant.copy(alpha = 0.7f))
        content()
    }
}

@Composable
private fun RichAdaptiveUiCard(
    obj: JsonObject,
    onSendAction: (String) -> Unit,
    onOpenUrl: (String) -> Unit,
) {
    val s = LocalStitchPalette.current
    val title = obj["title"]?.jsonPrimitive?.contentOrNull?.ifBlank { "At a glance" } ?: "At a glance"
    val blocks = (obj["blocks"] as? JsonArray).orEmpty().mapNotNull { it as? JsonObject }
    val actions = (obj["actions"] as? JsonArray).orEmpty().mapNotNull { it as? JsonObject }

    RichCardShell(title = title, badge = "Visual") {
        blocks.forEach { b ->
            val type = b["type"]?.jsonPrimitive?.contentOrNull?.lowercase().orEmpty()
            when (type) {
                "text" -> {
                    val t = b["text"]?.jsonPrimitive?.contentOrNull.orEmpty()
                    if (t.isNotBlank()) MarkdownTextContent(t, baseColor = s.onSurface, onOpenUrl = onOpenUrl)
                }
                "metrics" -> {
                    val items = (b["items"] as? JsonArray).orEmpty().mapNotNull { it as? JsonObject }
                    items.chunked(2).forEach { pair ->
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            pair.forEach { m ->
                                Column(
                                    modifier = Modifier
                                        .weight(1f)
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(s.surfaceContainerLowest)
                                        .border(1.dp, s.outlineVariant, RoundedCornerShape(10.dp))
                                        .padding(8.dp),
                                    verticalArrangement = Arrangement.spacedBy(2.dp),
                                ) {
                                    Text(
                                        text = m["label"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                                        color = s.onSurfaceVariant,
                                    )
                                    Text(
                                        text = m["value"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                                        style = MaterialTheme.typography.titleSmall,
                                        color = s.onSurface,
                                    )
                                    m["detail"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }?.let { d ->
                                        Text(d, style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp), color = s.onSurfaceVariant)
                                    }
                                }
                            }
                            if (pair.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
                "callout" -> {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .background(s.surfaceContainerLowest)
                            .border(1.dp, s.outlineVariant, RoundedCornerShape(10.dp))
                            .padding(9.dp),
                        verticalArrangement = Arrangement.spacedBy(3.dp),
                    ) {
                        b["title"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }?.let { ct ->
                            Text(ct, style = MaterialTheme.typography.labelMedium, color = s.onSurface)
                        }
                        b["text"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }?.let { ct ->
                            Text(ct, style = MaterialTheme.typography.bodySmall, color = s.onSurfaceVariant)
                        }
                    }
                }
                "progress" -> {
                    val label = b["label"]?.jsonPrimitive?.contentOrNull ?: "Progress"
                    val value = b["value"]?.jsonPrimitive?.doubleOrNull ?: 0.0
                    val max = (b["max"]?.jsonPrimitive?.doubleOrNull ?: 100.0).coerceAtLeast(1.0)
                    val ratio = (value / max).toFloat().coerceIn(0f, 1f)
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(label, style = MaterialTheme.typography.labelSmall, color = s.onSurfaceVariant)
                            Text("${(ratio * 100).toInt()}%", style = MaterialTheme.typography.labelSmall, color = s.onSurface)
                        }
                        LinearProgressIndicator(
                            progress = { ratio },
                            modifier = Modifier.fillMaxWidth().height(5.dp).clip(CircleShape),
                            color = s.primary,
                            trackColor = s.surfaceContainer,
                        )
                    }
                }
                "list", "timeline" -> {
                    val items = (b["items"] as? JsonArray).orEmpty().mapNotNull { it as? JsonObject }
                    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        items.forEach { item ->
                            val main = item["text"]?.jsonPrimitive?.contentOrNull.orEmpty()
                            val sub = item["detail"]?.jsonPrimitive?.contentOrNull
                                ?: item["time"]?.jsonPrimitive?.contentOrNull
                            val lbl = item["label"]?.jsonPrimitive?.contentOrNull
                            val url = item["url"]?.jsonPrimitive?.contentOrNull
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .then(if (url != null) Modifier.clickable { onOpenUrl(url) } else Modifier),
                                verticalArrangement = Arrangement.spacedBy(1.dp),
                            ) {
                                Text(
                                    text = if (!lbl.isNullOrBlank()) "• $lbl: $main" else "• $main",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = s.onSurface,
                                )
                                if (!sub.isNullOrBlank()) {
                                    Text(sub, style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp), color = s.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
                "table" -> {
                    val cols = (b["columns"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
                    val rows = (b["rows"] as? JsonArray).orEmpty().mapNotNull { r ->
                        (r as? JsonArray)?.map { (it as? JsonPrimitive)?.contentOrNull.orEmpty() }
                    }
                    if (cols.isNotEmpty() || rows.isNotEmpty()) MarkdownTableCard(cols, rows)
                }
                "quote" -> {
                    val q = b["text"]?.jsonPrimitive?.contentOrNull.orEmpty()
                    val author = b["author"]?.jsonPrimitive?.contentOrNull
                    if (q.isNotBlank()) {
                        Text("“$q”" + if (!author.isNullOrBlank()) " — $author" else "", style = MaterialTheme.typography.bodySmall.copy(fontStyle = FontStyle.Italic), color = s.onSurfaceVariant)
                    }
                }
            }
        }

        if (actions.isNotEmpty()) {
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                actions.forEach { act ->
                    val label = act["label"]?.jsonPrimitive?.contentOrNull ?: return@forEach
                    val url = act["url"]?.jsonPrimitive?.contentOrNull
                    val prompt = act["prompt"]?.jsonPrimitive?.contentOrNull
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(s.primary)
                            .clickable {
                                when {
                                    !url.isNullOrBlank() -> onOpenUrl(url)
                                    !prompt.isNullOrBlank() -> onSendAction(prompt)
                                    else -> onSendAction(label)
                                }
                            }
                            .padding(horizontal = 10.dp, vertical = 5.dp),
                    ) {
                        Text(label, style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp), color = s.onPrimary)
                    }
                }
            }
        }
    }
}

@Composable
private fun RichBriefCard(
    obj: JsonObject,
    onSendAction: (String) -> Unit,
    onOpenUrl: (String) -> Unit,
) {
    val s = LocalStitchPalette.current
    val title = obj["title"]?.jsonPrimitive?.contentOrNull?.ifBlank { "Briefing" } ?: "Briefing"
    val summary = obj["summary"]?.jsonPrimitive?.contentOrNull.orEmpty()
    val highlights = (obj["highlights"] as? JsonArray).orEmpty().mapNotNull { it as? JsonObject }
    val nextStep = obj["nextStep"]?.jsonPrimitive?.contentOrNull

    RichCardShell(title = title, badge = "Brief") {
        if (summary.isNotBlank()) {
            MarkdownTextContent(summary, baseColor = s.onSurface, onOpenUrl = onOpenUrl)
        }
        highlights.forEach { h ->
            val lbl = h["label"]?.jsonPrimitive?.contentOrNull.orEmpty()
            val txt = h["text"]?.jsonPrimitive?.contentOrNull.orEmpty()
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(9.dp))
                    .background(s.surfaceContainerLowest)
                    .padding(8.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                if (lbl.isNotBlank()) Text(lbl, style = MaterialTheme.typography.labelMedium, color = s.onSurface)
                if (txt.isNotBlank()) Text(txt, style = MaterialTheme.typography.bodySmall, color = s.onSurfaceVariant)
            }
        }
        if (!nextStep.isNullOrBlank()) {
            Text(
                text = "Next step: $nextStep",
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                color = s.primary,
                modifier = Modifier.clickable { onSendAction(nextStep) },
            )
        }
    }
}

@Composable
private fun RichTasksCard(obj: JsonObject) {
    val s = LocalStitchPalette.current
    val title = obj["title"]?.jsonPrimitive?.contentOrNull?.ifBlank { "Checklist" } ?: "Checklist"
    val items = (obj["items"] as? JsonArray).orEmpty().mapNotNull { it as? JsonObject }

    RichCardShell(title = title, badge = "${items.size} tasks") {
        items.forEach { item ->
            val text = item["text"]?.jsonPrimitive?.contentOrNull.orEmpty()
            val status = item["status"]?.jsonPrimitive?.contentOrNull?.lowercase() ?: "pending"
            val detail = item["detail"]?.jsonPrimitive?.contentOrNull
            val due = item["due"]?.jsonPrimitive?.contentOrNull
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(7.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Icon(
                    imageVector = when (status) {
                        "done", "completed" -> Icons.Default.CheckCircle
                        "in_progress" -> Icons.Default.Schedule
                        else -> Icons.Default.RadioButtonUnchecked
                    },
                    contentDescription = status,
                    tint = when (status) {
                        "done", "completed" -> s.success
                        "in_progress" -> s.warning
                        else -> s.onSurfaceVariant
                    },
                    modifier = Modifier.size(16.dp).padding(top = 1.dp),
                )
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Text(text, style = MaterialTheme.typography.bodySmall, color = s.onSurface)
                    val meta = listOfNotNull(detail?.takeIf { it.isNotBlank() }, due?.takeIf { it.isNotBlank() }?.let { "Due: $it" })
                        .joinToString(" • ")
                    if (meta.isNotBlank()) {
                        Text(meta, style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp), color = s.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
private fun RichEmailCard(obj: JsonObject, onOpenUrl: (String) -> Unit) {
    val s = LocalStitchPalette.current
    val title = obj["title"]?.jsonPrimitive?.contentOrNull?.ifBlank { "Inbox briefing" } ?: "Inbox briefing"
    val summary = obj["summary"]?.jsonPrimitive?.contentOrNull
    val messages = (obj["messages"] as? JsonArray).orEmpty().mapNotNull { it as? JsonObject }

    RichCardShell(title = title, badge = "${messages.size} emails") {
        if (!summary.isNullOrBlank()) {
            Text(summary, style = MaterialTheme.typography.bodySmall, color = s.onSurfaceVariant)
        }
        messages.forEach { m ->
            val sender = m["sender"]?.jsonPrimitive?.contentOrNull ?: m["from"]?.jsonPrimitive?.contentOrNull ?: "Unknown"
            val subject = m["subject"]?.jsonPrimitive?.contentOrNull ?: "(no subject)"
            val mSum = m["summary"]?.jsonPrimitive?.contentOrNull.orEmpty()
            val unread = m["unread"]?.jsonPrimitive?.booleanOrNull == true
            val url = m["url"]?.jsonPrimitive?.contentOrNull
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(s.surfaceContainerLowest)
                    .border(1.dp, s.outlineVariant, RoundedCornerShape(10.dp))
                    .then(if (!url.isNullOrBlank()) Modifier.clickable { onOpenUrl(url) } else Modifier)
                    .padding(9.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    if (unread) Box(modifier = Modifier.size(6.dp).clip(CircleShape).background(s.primary))
                    Text(sender, style = MaterialTheme.typography.labelMedium, color = s.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Text(subject, style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium), color = s.onSurface)
                if (mSum.isNotBlank()) {
                    Text(mSum, style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp), color = s.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun RichChartCard(obj: JsonObject) {
    val s = LocalStitchPalette.current
    val title = obj["title"]?.jsonPrimitive?.contentOrNull?.ifBlank { "Chart" } ?: "Chart"
    val labels = (obj["labels"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
    val series = (obj["series"] as? JsonArray).orEmpty().mapNotNull { it as? JsonObject }
    val firstValues = (series.firstOrNull()?.get("data") as? JsonArray).orEmpty()
        .mapNotNull { (it as? JsonPrimitive)?.doubleOrNull }
    val maxVal = (firstValues.maxOrNull() ?: 1.0).coerceAtLeast(1.0)

    RichCardShell(title = title, badge = obj["type"]?.jsonPrimitive?.contentOrNull ?: "bar") {
        if (firstValues.isNotEmpty()) {
            Canvas(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(110.dp)
                    .padding(vertical = 4.dp),
            ) {
                val count = firstValues.size
                val slotW = size.width / count.coerceAtLeast(1)
                val barW = (slotW * 0.56f).coerceAtLeast(8f)
                firstValues.forEachIndexed { idx, v ->
                    val h = ((v / maxVal).toFloat().coerceIn(0f, 1f)) * (size.height - 8f)
                    val left = idx * slotW + (slotW - barW) / 2f
                    drawRoundRect(
                        color = CHART_COLORS[idx % CHART_COLORS.size],
                        topLeft = Offset(left, size.height - h),
                        size = Size(barW, h.coerceAtLeast(4f)),
                        cornerRadius = CornerRadius(6f, 6f),
                    )
                }
            }
            if (labels.isNotEmpty()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceAround,
                ) {
                    labels.take(firstValues.size).forEach { lbl ->
                        Text(
                            text = lbl.take(8),
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                            color = s.onSurfaceVariant,
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RichLinksOrFilesCard(
    title: String,
    items: JsonArray,
    onOpenUrl: (String) -> Unit,
) {
    val s = LocalStitchPalette.current
    val rows = items.mapNotNull { it as? JsonObject }
    RichCardShell(title = title, badge = "${rows.size}") {
        rows.forEach { item ->
            val label = item["title"]?.jsonPrimitive?.contentOrNull
                ?: item["name"]?.jsonPrimitive?.contentOrNull
                ?: item["url"]?.jsonPrimitive?.contentOrNull
                ?: "Item"
            val desc = item["description"]?.jsonPrimitive?.contentOrNull
                ?: item["mime"]?.jsonPrimitive?.contentOrNull
            val url = item["url"]?.jsonPrimitive?.contentOrNull
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(s.surfaceContainerLowest)
                    .border(1.dp, s.outlineVariant, RoundedCornerShape(10.dp))
                    .then(if (!url.isNullOrBlank()) Modifier.clickable { onOpenUrl(url) } else Modifier)
                    .padding(horizontal = 9.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Default.OpenInNew, contentDescription = null, tint = s.primary, modifier = Modifier.size(15.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(label, style = MaterialTheme.typography.labelMedium, color = s.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (!desc.isNullOrBlank()) {
                        Text(desc, style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp), color = s.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}
