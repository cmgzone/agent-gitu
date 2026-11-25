package dev.agentgitu.mobile.ui.components

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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.agentgitu.mobile.ui.theme.LocalStitchPalette
import kotlinx.serialization.json.*

/**
 * Native Jetpack Compose A2UI v0.9 / v1.0 Protocol Processor & Basic Catalog Renderer
 * (following `a2ui-project/a2ui` specification and Agent Gitu's `output a2ui` contract in
 * `src/agent/output-style.ts` & `src/server/ui-outputs.ts`).
 *
 * Zero arbitrary code execution: parses declarative `createSurface`, `updateComponents`,
 * `updateDataModel`, and `deleteSurface` messages, maintains a reactive Compose data model
 * with JSON Pointer two-way binding (`{"path":"/field"}` / `{"@path":"/field"}`), and renders
 * the Basic Catalog using native Stitch Design System Compose components.
 */
data class A2uiParsedPayload(
    val title: String?,
    val surfaceId: String,
    val catalogId: String,
    val rootId: String,
    val components: Map<String, JsonObject>,
    val initialDataModel: Map<String, JsonElement>,
)

object A2uiProtocol {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    private val ENVELOPE_KEYS = setOf("createSurface", "updateComponents", "updateDataModel", "deleteSurface")
    private val VALID_VERSIONS = setOf("1.0", "v0.9", "v0.9.1", "0.9", "0.9.1")

    /**
     * Parses A2UI v0.9 / v1.0 payload from JSON wrapper (`{"title":"...","messages":[...]}`),
     * JSON array of messages, single envelope object, or JSONL stream.
     */
    fun parse(raw: String): A2uiParsedPayload? {
        val text = raw.trim()
        if (text.isEmpty() || text.length > 131_072) return null

        var wrapperTitle: String? = null
        val messages: List<JsonObject> = runCatching {
            when (val el = json.parseToJsonElement(text)) {
                is JsonArray -> el.mapNotNull { it as? JsonObject }
                is JsonObject -> {
                    val inner = el["messages"] as? JsonArray
                    if (inner != null) {
                        wrapperTitle = el["title"]?.jsonPrimitive?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }
                        inner.mapNotNull { it as? JsonObject }
                    } else {
                        listOf(el)
                    }
                }
                else -> emptyList()
            }
        }.getOrElse {
            // Try JSONL (one envelope per non-empty line)
            text.lineSequence()
                .map { it.trim() }
                .filter { it.isNotEmpty() }
                .mapNotNull { line -> runCatching { json.parseToJsonElement(line) as? JsonObject }.getOrNull() }
                .toList()
        }

        if (messages.isEmpty() || messages.size > 50) return null

        var surfaceId: String? = null
        var catalogId = "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json"
        var surfaceTitle: String? = null
        var deleted = false
        val components = LinkedHashMap<String, JsonObject>()
        val dataModel = LinkedHashMap<String, JsonElement>()

        for (msg in messages) {
            val ver = msg["version"]?.jsonPrimitive?.contentOrNull
            if (ver != null && ver !in VALID_VERSIONS) return null
            val envKeys = msg.keys.filter { it != "version" }
            if (envKeys.size != 1 || envKeys[0] !in ENVELOPE_KEYS) return null
            val key = envKeys[0]
            val env = msg[key] as? JsonObject ?: return null
            val sid = env["surfaceId"]?.jsonPrimitive?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() } ?: return null

            when (key) {
                "createSurface" -> {
                    surfaceId = sid
                    deleted = false
                    env["catalogId"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }?.let { catalogId = it }
                    val theme = env["theme"] as? JsonObject
                    if (surfaceTitle == null && theme != null) {
                        surfaceTitle = theme["agentDisplayName"]?.jsonPrimitive?.contentOrNull?.trim()
                            ?: theme["title"]?.jsonPrimitive?.contentOrNull?.trim()
                    }
                    // Optional inline components inside createSurface
                    (env["components"] as? JsonArray)?.forEach { item ->
                        val obj = item as? JsonObject ?: return@forEach
                        val id = obj["id"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() } ?: return@forEach
                        components[id] = obj
                    }
                }
                "updateComponents" -> {
                    if (surfaceId == null) surfaceId = sid
                    if (sid == surfaceId) {
                        (env["components"] as? JsonArray)?.forEach { item ->
                            val obj = item as? JsonObject ?: return@forEach
                            val id = obj["id"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() } ?: return@forEach
                            components[id] = obj
                        }
                    }
                }
                "updateDataModel" -> {
                    if (surfaceId == null) surfaceId = sid
                    if (sid == surfaceId) {
                        val path = env["path"]?.jsonPrimitive?.contentOrNull?.trim() ?: "/"
                        val value = env["value"]
                        if (value != null) {
                            applyDataUpdate(dataModel, path, value)
                        }
                        // Legacy v0.9 `contents` array [{key, valueString/valueNumber/valueBoolean}]
                        (env["contents"] as? JsonArray)?.forEach { entry ->
                            val eo = entry as? JsonObject ?: return@forEach
                            val k = eo["key"]?.jsonPrimitive?.contentOrNull ?: return@forEach
                            val v = extractTypedValue(eo) ?: return@forEach
                            dataModel[normalizePointer(if (path == "/") "/$k" else "$path/$k")] = v
                        }
                    }
                }
                "deleteSurface" -> {
                    if (sid == surfaceId) deleted = true
                }
            }
        }

        val sid = surfaceId ?: return null
        if (deleted || components.isEmpty()) return null
        val rootId = if (components.containsKey("root")) "root" else components.keys.first()
        return A2uiParsedPayload(
            title = wrapperTitle ?: surfaceTitle,
            surfaceId = sid,
            catalogId = catalogId,
            rootId = rootId,
            components = components,
            initialDataModel = dataModel,
        )
    }

    fun normalizePointer(raw: String): String {
        val trimmed = raw.trim()
        if (trimmed.isEmpty() || trimmed == "/") return "/"
        return if (trimmed.startsWith("/")) trimmed else "/$trimmed"
    }

    private fun applyDataUpdate(target: MutableMap<String, JsonElement>, rawPath: String, value: JsonElement) {
        val path = normalizePointer(rawPath)
        if (path == "/" && value is JsonObject) {
            flattenObject("", value, target)
        } else if (value is JsonObject) {
            target[path] = value
            flattenObject(path, value, target)
        } else {
            target[path] = value
        }
    }

    private fun flattenObject(prefix: String, obj: JsonObject, target: MutableMap<String, JsonElement>) {
        for ((k, v) in obj) {
            val childPath = "$prefix/$k"
            target[childPath] = v
            if (v is JsonObject) {
                flattenObject(childPath, v, target)
            }
        }
    }

    private fun extractTypedValue(obj: JsonObject): JsonElement? =
        obj["valueString"] ?: obj["valueNumber"] ?: obj["valueBoolean"] ?: obj["valueArray"] ?: obj["valueMap"]

    /** Extracts a bound data model pointer from `{"path":"/foo"}` or `{"@path":"/foo"}`. */
    fun boundPath(element: JsonElement?): String? {
        val obj = element as? JsonObject ?: return null
        val raw = obj["path"]?.jsonPrimitive?.contentOrNull
            ?: obj["@path"]?.jsonPrimitive?.contentOrNull
            ?: return null
        return normalizePointer(raw)
    }

    /** Resolves a literal or bound JSON value against the live data model. */
    fun resolveValue(element: JsonElement?, dataModel: Map<String, JsonElement>): JsonElement? {
        if (element == null) return null
        val path = boundPath(element)
        if (path != null) return dataModel[path]
        if (element is JsonObject) {
            extractTypedValue(element)?.let { return it }
            element["literalString"]?.let { return it }
            element["literalNumber"]?.let { return it }
            element["literalBoolean"]?.let { return it }
            element["literalArray"]?.let { return it }
        }
        return element
    }

    fun resolveString(element: JsonElement?, dataModel: Map<String, JsonElement>): String {
        val v = resolveValue(element, dataModel) ?: return ""
        return when (v) {
            is JsonPrimitive -> v.contentOrNull.orEmpty()
            is JsonArray -> v.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.joinToString(", ")
            else -> v.toString()
        }
    }

    fun resolveStringList(element: JsonElement?, dataModel: Map<String, JsonElement>): List<String> {
        val v = resolveValue(element, dataModel) ?: return emptyList()
        return when (v) {
            is JsonArray -> v.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
            is JsonPrimitive -> v.contentOrNull?.takeIf { it.isNotBlank() }?.let { listOf(it) } ?: emptyList()
            else -> emptyList()
        }
    }

    fun resolveBoolean(element: JsonElement?, dataModel: Map<String, JsonElement>): Boolean {
        val v = resolveValue(element, dataModel) as? JsonPrimitive ?: return false
        return v.booleanOrNull ?: v.contentOrNull.equals("true", ignoreCase = true)
    }

    fun resolveDouble(element: JsonElement?, dataModel: Map<String, JsonElement>, default: Double = 0.0): Double {
        val v = resolveValue(element, dataModel) as? JsonPrimitive ?: return default
        return v.doubleOrNull ?: v.contentOrNull?.toDoubleOrNull() ?: default
    }

    /** Resolves an action event context map into a clean, readable user message for chat. */
    fun formatActionMessage(
        surfaceTitle: String?,
        eventName: String,
        contextObj: JsonObject?,
        dataModel: Map<String, JsonElement>,
    ): String {
        val pairs = mutableListOf<String>()
        if (contextObj != null) {
            for ((k, rawVal) in contextObj) {
                val resolved = resolveValue(rawVal, dataModel)
                val formatted = when (resolved) {
                    null, JsonNull -> ""
                    is JsonPrimitive -> resolved.contentOrNull.orEmpty()
                    is JsonArray -> resolved.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.joinToString(", ")
                    else -> resolved.toString()
                }
                if (formatted.isNotBlank()) {
                    pairs.add("$k: $formatted")
                }
            }
        }
        val header = surfaceTitle?.takeIf { it.isNotBlank() }?.let { "[$it] $eventName" } ?: eventName
        return if (pairs.isEmpty()) header else "$header — ${pairs.joinToString("; ")}"
    }
}

@Composable
fun A2uiSurfaceCard(
    payload: A2uiParsedPayload,
    onActionMessage: (String) -> Unit,
    onOpenUrl: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val s = LocalStitchPalette.current
    val dataModel = remember(payload.surfaceId, payload.initialDataModel) {
        mutableStateMapOf<String, JsonElement>().apply { putAll(payload.initialDataModel) }
    }
    var submittedLabel by remember(payload.surfaceId) { mutableStateOf<String?>(null) }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(s.surfaceContainerLow)
            .border(1.dp, s.outlineVariant, RoundedCornerShape(14.dp))
            .padding(11.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // Subtle A2UI header strip
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.weight(1f),
            ) {
                Icon(
                    Icons.Default.Widgets,
                    contentDescription = null,
                    tint = s.primary,
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    text = payload.title?.ifBlank { "Interactive" } ?: "Interactive",
                    style = MaterialTheme.typography.labelMedium,
                    color = s.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                text = if (submittedLabel != null) "Sent" else "A2UI",
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                color = if (submittedLabel != null) s.success else s.onSurfaceVariant,
            )
        }

        HorizontalDivider(color = s.outlineVariant.copy(alpha = 0.7f))

        A2uiNodeView(
            nodeId = payload.rootId,
            payload = payload,
            dataModel = dataModel,
            depth = 0,
            onEvent = { name, ctx ->
                val msg = A2uiProtocol.formatActionMessage(payload.title, name, ctx, dataModel)
                submittedLabel = name
                onActionMessage(msg)
            },
            onOpenUrl = onOpenUrl,
        )
    }
}

@Composable
private fun A2uiNodeView(
    nodeId: String,
    payload: A2uiParsedPayload,
    dataModel: MutableMap<String, JsonElement>,
    depth: Int,
    onEvent: (String, JsonObject?) -> Unit,
    onOpenUrl: (String) -> Unit,
) {
    if (depth > 16) return
    val node = payload.components[nodeId] ?: return
    val s = LocalStitchPalette.current

    // Support both v1.0 flat `{"id":"...","component":"Text","text":"..."}` AND v0.9 nested `{"component":{"Text":{...}}}`
    val (componentType, props) = remember(node) { extractComponentTypeAndProps(node) }

    when (componentType) {
        "Column" -> {
            val childIds = extractChildIds(props)
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                childIds.forEach { cid ->
                    A2uiNodeView(cid, payload, dataModel, depth + 1, onEvent, onOpenUrl)
                }
            }
        }

        "Row" -> {
            val childIds = extractChildIds(props)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                childIds.forEach { cid ->
                    A2uiNodeView(cid, payload, dataModel, depth + 1, onEvent, onOpenUrl)
                }
            }
        }

        "Card" -> {
            val childId = props["child"]?.jsonPrimitive?.contentOrNull
            val childIds = if (childId != null) listOf(childId) else extractChildIds(props)
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(s.surfaceContainerLowest)
                    .border(1.dp, s.outlineVariant, RoundedCornerShape(12.dp))
                    .padding(10.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                childIds.forEach { cid ->
                    A2uiNodeView(cid, payload, dataModel, depth + 1, onEvent, onOpenUrl)
                }
            }
        }

        "List" -> {
            val childIds = extractChildIds(props)
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                childIds.forEach { cid ->
                    A2uiNodeView(cid, payload, dataModel, depth + 1, onEvent, onOpenUrl)
                }
            }
        }

        "Tabs" -> {
            val tabItems = (props["tabItems"] as? JsonArray ?: props["tabs"] as? JsonArray).orEmpty()
                .mapNotNull { it as? JsonObject }
            if (tabItems.isNotEmpty()) {
                var activeIdx by remember(nodeId) { mutableIntStateOf(0) }
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        tabItems.forEachIndexed { idx, tab ->
                            val label = A2uiProtocol.resolveString(tab["title"] ?: tab["label"], dataModel)
                                .ifBlank { "Tab ${idx + 1}" }
                            val active = idx == activeIdx
                            Box(
                                modifier = Modifier
                                    .clip(CircleShape)
                                    .background(if (active) s.primary else s.surfaceContainerLowest)
                                    .border(1.dp, if (active) s.primary else s.outlineVariant, CircleShape)
                                    .clickable { activeIdx = idx }
                                    .padding(horizontal = 10.dp, vertical = 4.dp),
                            ) {
                                Text(
                                    text = label,
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                                    color = if (active) s.onPrimary else s.onSurfaceVariant,
                                )
                            }
                        }
                    }
                    val childId = tabItems.getOrNull(activeIdx)?.get("child")?.jsonPrimitive?.contentOrNull
                    if (childId != null) {
                        A2uiNodeView(childId, payload, dataModel, depth + 1, onEvent, onOpenUrl)
                    }
                }
            }
        }

        "Modal" -> {
            val entryId = props["entryPointChild"]?.jsonPrimitive?.contentOrNull ?: props["trigger"]?.jsonPrimitive?.contentOrNull
            val contentId = props["contentChild"]?.jsonPrimitive?.contentOrNull ?: props["content"]?.jsonPrimitive?.contentOrNull
            var open by remember(nodeId) { mutableStateOf(false) }
            Box(modifier = Modifier.clickable { open = true }) {
                if (entryId != null) {
                    A2uiNodeView(entryId, payload, dataModel, depth + 1, onEvent, onOpenUrl)
                } else {
                    StitchSecondaryButton(text = "Open details", onClick = { open = true }, outlined = true)
                }
            }
            if (open && contentId != null) {
                AlertDialog(
                    onDismissRequest = { open = false },
                    containerColor = s.surfaceContainerLowest,
                    text = { A2uiNodeView(contentId, payload, dataModel, depth + 1, onEvent, onOpenUrl) },
                    confirmButton = {
                        TextButton(onClick = { open = false }) {
                            Text("Close", color = s.primary)
                        }
                    },
                )
            }
        }

        "Divider" -> {
            HorizontalDivider(color = s.outlineVariant)
        }

        "Text" -> {
            val rawText = A2uiProtocol.resolveString(props["text"], dataModel)
            val variant = props["variant"]?.jsonPrimitive?.contentOrNull?.lowercase()
                ?: props["usageHint"]?.jsonPrimitive?.contentOrNull?.lowercase()
            if (rawText.isNotBlank()) {
                when (variant) {
                    "h1", "h2", "h3" -> Text(
                        text = rawText.trimStart('#', ' '),
                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                        color = s.onSurface,
                    )
                    "caption" -> Text(
                        text = rawText,
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                        color = s.onSurfaceVariant,
                    )
                    else -> MarkdownTextContent(
                        text = rawText,
                        baseColor = s.onSurface,
                        onOpenUrl = onOpenUrl,
                    )
                }
            }
        }

        "Icon" -> {
            val iconName = A2uiProtocol.resolveString(props["name"] ?: props["icon"], dataModel).lowercase()
            Icon(
                imageVector = a2uiIconFor(iconName),
                contentDescription = iconName,
                tint = s.onSurface,
                modifier = Modifier.size(18.dp),
            )
        }

        "Button" -> {
            val variant = props["variant"]?.jsonPrimitive?.contentOrNull?.lowercase() ?: "secondary"
            val childId = props["child"]?.jsonPrimitive?.contentOrNull
            val directLabel = A2uiProtocol.resolveString(props["label"] ?: props["text"], dataModel)
            val childText = childId?.let { cid ->
                payload.components[cid]?.let { cNode ->
                    val (_, cProps) = extractComponentTypeAndProps(cNode)
                    A2uiProtocol.resolveString(cProps["text"] ?: cProps["label"], dataModel)
                }
            }
            val label = childText?.takeIf { it.isNotBlank() } ?: directLabel.ifBlank { "Continue" }

            val handleClick: () -> Unit = {
                val actionObj = props["action"] as? JsonObject
                val eventObj = actionObj?.get("event") as? JsonObject
                val funcObj = actionObj?.get("functionCall") as? JsonObject
                when {
                    eventObj != null -> {
                        val name = eventObj["name"]?.jsonPrimitive?.contentOrNull?.ifBlank { label } ?: label
                        val ctx = eventObj["context"] as? JsonObject
                        onEvent(name, ctx)
                    }
                    actionObj?.get("name") != null -> {
                        val name = actionObj["name"]?.jsonPrimitive?.contentOrNull ?: label
                        val ctx = actionObj["context"] as? JsonObject
                        onEvent(name, ctx)
                    }
                    funcObj?.get("call")?.jsonPrimitive?.contentOrNull == "openUrl" -> {
                        val args = funcObj["args"] as? JsonObject
                        val url = A2uiProtocol.resolveString(args?.get("url"), dataModel)
                        if (url.startsWith("http://") || url.startsWith("https://")) onOpenUrl(url)
                    }
                    else -> onEvent(label, null)
                }
            }

            if (variant == "primary") {
                Button(
                    onClick = handleClick,
                    shape = CircleShape,
                    colors = ButtonDefaults.buttonColors(containerColor = s.primary, contentColor = s.onPrimary),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 7.dp),
                    modifier = Modifier.heightIn(min = 34.dp),
                ) {
                    Text(label, style = MaterialTheme.typography.labelMedium)
                }
            } else {
                OutlinedButton(
                    onClick = handleClick,
                    shape = CircleShape,
                    border = if (variant == "borderless") null else BorderStroke(1.dp, s.outlineVariant),
                    colors = ButtonDefaults.outlinedButtonColors(
                        containerColor = if (variant == "borderless") Color.Transparent else s.surfaceContainerLowest,
                        contentColor = s.onSurface,
                    ),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 7.dp),
                    modifier = Modifier.heightIn(min = 34.dp),
                ) {
                    Text(label, style = MaterialTheme.typography.labelMedium)
                }
            }
        }

        "TextField" -> {
            val label = A2uiProtocol.resolveString(props["label"], dataModel)
            val placeholder = A2uiProtocol.resolveString(props["placeholder"], dataModel)
            val bound = A2uiProtocol.boundPath(props["value"] ?: props["text"])
            val initial = A2uiProtocol.resolveString(props["value"] ?: props["text"], dataModel)
            var localText by remember(nodeId) { mutableStateOf(initial) }
            val currentVal = if (bound != null) A2uiProtocol.resolveString(props["value"] ?: props["text"], dataModel) else localText
            val isLong = props["variant"]?.jsonPrimitive?.contentOrNull?.equals("longText", ignoreCase = true) == true

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (label.isNotBlank()) {
                    Text(label, style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp), color = s.onSurfaceVariant)
                }
                OutlinedTextField(
                    value = currentVal,
                    onValueChange = { next ->
                        if (bound != null) dataModel[bound] = JsonPrimitive(next)
                        else localText = next
                    },
                    placeholder = if (placeholder.isNotBlank()) {
                        { Text(placeholder, style = MaterialTheme.typography.bodySmall, color = s.outline) }
                    } else null,
                    textStyle = MaterialTheme.typography.bodySmall.copy(color = s.onSurface),
                    singleLine = !isLong,
                    minLines = if (isLong) 2 else 1,
                    shape = RoundedCornerShape(10.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = s.surfaceContainerLowest,
                        unfocusedContainerColor = s.surfaceContainerLowest,
                        focusedBorderColor = s.primary,
                        unfocusedBorderColor = s.outlineVariant,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        "CheckBox" -> {
            val label = A2uiProtocol.resolveString(props["label"], dataModel)
            val bound = A2uiProtocol.boundPath(props["value"])
            var localChecked by remember(nodeId) { mutableStateOf(A2uiProtocol.resolveBoolean(props["value"], dataModel)) }
            val checked = if (bound != null) A2uiProtocol.resolveBoolean(props["value"], dataModel) else localChecked

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .clickable {
                        val next = !checked
                        if (bound != null) dataModel[bound] = JsonPrimitive(next) else localChecked = next
                    }
                    .padding(vertical = 2.dp),
            ) {
                Checkbox(
                    checked = checked,
                    onCheckedChange = { next ->
                        if (bound != null) dataModel[bound] = JsonPrimitive(next) else localChecked = next
                    },
                    modifier = Modifier.size(20.dp),
                )
                Text(label.ifBlank { "Option" }, style = MaterialTheme.typography.bodySmall, color = s.onSurface)
            }
        }

        "ChoicePicker" -> {
            val label = A2uiProtocol.resolveString(props["label"], dataModel)
            val variant = props["variant"]?.jsonPrimitive?.contentOrNull?.lowercase() ?: "mutuallyexclusive"
            val multi = variant.contains("multi")
            val bound = A2uiProtocol.boundPath(props["value"])
            val options = (props["options"] as? JsonArray).orEmpty().mapNotNull { el ->
                val obj = el as? JsonObject ?: return@mapNotNull null
                val optLabel = A2uiProtocol.resolveString(obj["label"], dataModel)
                val optVal = obj["value"]?.jsonPrimitive?.contentOrNull ?: optLabel
                if (optLabel.isBlank() && optVal.isBlank()) null else (optLabel.ifBlank { optVal } to optVal)
            }
            var localSelection by remember(nodeId) {
                mutableStateOf(A2uiProtocol.resolveStringList(props["value"], dataModel))
            }
            val selectedValues = if (bound != null) A2uiProtocol.resolveStringList(props["value"], dataModel) else localSelection

            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                if (label.isNotBlank()) {
                    Text(label, style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp), color = s.onSurfaceVariant)
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    options.forEach { (optLabel, optVal) ->
                        val active = optVal in selectedValues
                        Box(
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(if (active) s.primary else s.surfaceContainerLowest)
                                .border(1.dp, if (active) s.primary else s.outlineVariant, CircleShape)
                                .clickable {
                                    val next = if (multi) {
                                        if (active) selectedValues - optVal else selectedValues + optVal
                                    } else {
                                        listOf(optVal)
                                    }
                                    if (bound != null) {
                                        dataModel[bound] = JsonArray(next.map { JsonPrimitive(it) })
                                    } else {
                                        localSelection = next
                                    }
                                }
                                .padding(horizontal = 10.dp, vertical = 5.dp),
                        ) {
                            Text(
                                text = optLabel,
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.5.sp),
                                color = if (active) s.onPrimary else s.onSurface,
                            )
                        }
                    }
                }
            }
        }

        "Slider" -> {
            val label = A2uiProtocol.resolveString(props["label"], dataModel)
            val min = props["min"]?.jsonPrimitive?.doubleOrNull?.toFloat() ?: 0f
            val max = props["max"]?.jsonPrimitive?.doubleOrNull?.toFloat()?.coerceAtLeast(min + 1f) ?: 100f
            val bound = A2uiProtocol.boundPath(props["value"])
            var localVal by remember(nodeId) {
                mutableFloatStateOf(A2uiProtocol.resolveDouble(props["value"], dataModel, min.toDouble()).toFloat())
            }
            val cur = (if (bound != null) A2uiProtocol.resolveDouble(props["value"], dataModel, min.toDouble()).toFloat() else localVal)
                .coerceIn(min, max)

            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(label.ifBlank { "Value" }, style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp), color = s.onSurfaceVariant)
                    Text(
                        text = if (cur == cur.toInt().toFloat()) cur.toInt().toString() else "%.1f".format(cur),
                        style = MaterialTheme.typography.labelSmall,
                        color = s.onSurface,
                    )
                }
                Slider(
                    value = cur,
                    onValueChange = { next ->
                        if (bound != null) dataModel[bound] = JsonPrimitive(next.toDouble()) else localVal = next
                    },
                    valueRange = min..max,
                )
            }
        }

        "DateTimeInput" -> {
            val label = A2uiProtocol.resolveString(props["label"], dataModel).ifBlank { "Date / Time" }
            val bound = A2uiProtocol.boundPath(props["value"])
            var localVal by remember(nodeId) { mutableStateOf(A2uiProtocol.resolveString(props["value"], dataModel)) }
            val cur = if (bound != null) A2uiProtocol.resolveString(props["value"], dataModel) else localVal
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(label, style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp), color = s.onSurfaceVariant)
                OutlinedTextField(
                    value = cur,
                    onValueChange = { next ->
                        if (bound != null) dataModel[bound] = JsonPrimitive(next) else localVal = next
                    },
                    placeholder = { Text("YYYY-MM-DD HH:mm", style = MaterialTheme.typography.bodySmall, color = s.outline) },
                    leadingIcon = { Icon(Icons.Default.CalendarToday, contentDescription = null, modifier = Modifier.size(16.dp)) },
                    textStyle = MaterialTheme.typography.bodySmall.copy(color = s.onSurface),
                    singleLine = true,
                    shape = RoundedCornerShape(10.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = s.surfaceContainerLowest,
                        unfocusedContainerColor = s.surfaceContainerLowest,
                        focusedBorderColor = s.primary,
                        unfocusedBorderColor = s.outlineVariant,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        "Image" -> {
            val url = A2uiProtocol.resolveString(props["url"] ?: props["src"], dataModel)
            val alt = A2uiProtocol.resolveString(props["alt"] ?: props["title"] ?: props["description"], dataModel)
            if (url.isNotBlank()) {
                InlineMediaImageCard(url = url, caption = alt)
            }
        }

        "Video" -> {
            val url = A2uiProtocol.resolveString(props["url"] ?: props["src"], dataModel)
            val title = A2uiProtocol.resolveString(props["title"] ?: props["description"], dataModel)
            val poster = A2uiProtocol.resolveString(props["poster"], dataModel).takeIf { it.isNotBlank() }
            if (url.isNotBlank()) {
                InlineMediaVideoCard(url = url, title = title, posterUrl = poster)
            }
        }

        "AudioPlayer" -> {
            val url = A2uiProtocol.resolveString(props["url"] ?: props["src"], dataModel)
            val alt = A2uiProtocol.resolveString(props["alt"] ?: props["title"] ?: props["description"], dataModel)
            if (url.isNotBlank()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(s.surfaceContainerLowest)
                        .border(1.dp, s.outlineVariant, RoundedCornerShape(10.dp))
                        .clickable { if (url.startsWith("http")) onOpenUrl(url) }
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(Icons.Default.GraphicEq, contentDescription = null, tint = s.primary, modifier = Modifier.size(18.dp))
                    Text(
                        text = alt.ifBlank { url },
                        style = MaterialTheme.typography.bodySmall,
                        color = s.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    Icon(Icons.Default.PlayArrow, contentDescription = null, tint = s.onSurfaceVariant, modifier = Modifier.size(16.dp))
                }
            }
        }
    }
}

private fun extractComponentTypeAndProps(node: JsonObject): Pair<String, JsonObject> {
    val compEl = node["component"]
    if (compEl is JsonPrimitive && compEl.isString) {
        val props = (node["properties"] as? JsonObject) ?: node
        return compEl.content to props
    }
    if (compEl is JsonObject && compEl.entries.isNotEmpty()) {
        val (typeName, inner) = compEl.entries.first()
        return typeName to ((inner as? JsonObject) ?: node)
    }
    val typeName = node["type"]?.jsonPrimitive?.contentOrNull.orEmpty()
    val props = (node["properties"] as? JsonObject) ?: (node["props"] as? JsonObject) ?: node
    return typeName to props
}

private fun extractChildIds(props: JsonObject): List<String> {
    val children = props["children"] ?: return emptyList()
    return when (children) {
        is JsonArray -> children.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
        is JsonObject -> (children["explicitList"] as? JsonArray)
            ?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
            .orEmpty()
        else -> emptyList()
    }
}

private fun a2uiIconFor(name: String): ImageVector = when {
    name.contains("check") || name.contains("done") -> Icons.Default.CheckCircle
    name.contains("warn") || name.contains("alert") -> Icons.Default.Warning
    name.contains("error") || name.contains("close") -> Icons.Default.Error
    name.contains("info") -> Icons.Default.Info
    name.contains("mail") || name.contains("email") -> Icons.Default.Email
    name.contains("calendar") || name.contains("date") -> Icons.Default.CalendarToday
    name.contains("search") -> Icons.Default.Search
    name.contains("send") -> Icons.Default.Send
    name.contains("star") -> Icons.Default.Star
    name.contains("code") -> Icons.Default.Code
    name.contains("link") -> Icons.Default.Link
    else -> Icons.Default.Bolt
}
