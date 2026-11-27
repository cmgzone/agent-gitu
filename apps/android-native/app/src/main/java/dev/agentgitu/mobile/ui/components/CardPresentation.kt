package dev.agentgitu.mobile.ui.components

import dev.agentgitu.mobile.data.model.TeamAppAction
import dev.agentgitu.mobile.data.model.TeamRequest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull

/**
 * Exact Kotlin port of Web's `CHAT_QUESTION_JS` (`src/server/ui-chat-questions.ts`),
 * `cwAppApprovalPresentation` (`src/server/ui-cowork.ts`), and
 * `customConnectionPresets` (`src/server/ui-custom-connection.ts`).
 *
 * Guarantees zero raw JSON, shell commands, or tool dumps ever leak into Android cards.
 */

data class CardPresentation(
    val kind: String, // "question" | "approval" | "plan_review" | "computer"
    val label: String,
    val openStateLabel: String,
    val title: String,
    val detail: String,
    val technical: String,
    val isComputer: Boolean = false,
    val canRemember: Boolean = false,
)

data class ActionPresentation(
    val title: String,
    val detail: String,
    val preview: String,
)

data class AppApprovalField(
    val key: String,
    val label: String,
    val isJson: Boolean,
    val isImportant: Boolean,
    val initialText: String,
    val summaryText: String,
)

data class AppApprovalPresentation(
    val service: String,
    val serviceName: String,
    val tool: String,
    val actionTitle: String,
    val accountId: String,
    val valid: Boolean,
    val messageReview: Boolean,
    val nativeSend: Boolean,
    val fields: List<AppApprovalField>,
)

data class CustomConnectionPreset(
    val id: String,
    val name: String,
    val url: String,
    val docs: String,
    val path: String,
    val capability: String,
    val isSearch: Boolean = false,
)

val CUSTOM_CONNECTION_PRESETS: List<CustomConnectionPreset> = listOf(
    CustomConnectionPreset("custom", "Custom HTTP API", "", "", "", "connection.discover"),
    CustomConnectionPreset("github", "GitHub", "https://api.github.com", "https://docs.github.com/en/rest", "/user", "connection.discover"),
    CustomConnectionPreset("coolify", "Coolify", "", "https://coolify.io/docs/api-reference", "/api/v1/servers", "servers.read"),
    CustomConnectionPreset("vercel", "Vercel", "https://api.vercel.com", "https://vercel.com/docs/rest-api", "/v9/projects", "projects.read"),
    CustomConnectionPreset("brave", "Brave Search API", "https://api.search.brave.com", "https://api-dashboard.search.brave.com/app/documentation/web-search/get-started", "/res/v1/web/search", "web.search", isSearch = true),
    CustomConnectionPreset("tavily", "Tavily Search API", "https://api.tavily.com", "https://docs.tavily.com/documentation/api-reference/endpoint/search", "/", "web.search", isSearch = true),
)

val CUSTOM_CONNECTION_AUTH_OPTIONS: List<Pair<String, String>> = listOf(
    "auto" to "Service default",
    "bearer" to "Bearer token",
    "header" to "API key in a header",
)

private val lenientCardJson = Json {
    ignoreUnknownKeys = true
    isLenient = true
    prettyPrint = true
}

private val TECHNICAL_CMD_REGEX = Regex("^(?:\\$\\s*)?(?:npm|pnpm|yarn|npx|git|node|python|bash|powershell|curl)\\s", RegexOption.IGNORE_CASE)
private val TECHNICAL_CODE_REGEX = Regex("```|(?:^|\\n)\\s*(?:const |let |var |import |export |function |Traceback|at \\S+\\s*\\()")
private val SENSITIVE_KEY_REGEX = Regex("token|secret|password|passwd|api[_-]?key|auth|cookie|credential|private", RegexOption.IGNORE_CASE)

fun cardIsTechnicalPayload(text: String?): Boolean {
    val trimmed = text?.trim().orEmpty()
    if (trimmed.isEmpty()) return false
    if (TECHNICAL_CMD_REGEX.containsMatchIn(trimmed)) return true
    if (trimmed.any { it.code in 0..8 }) return true
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) return true
    if (TECHNICAL_CODE_REGEX.containsMatchIn(trimmed)) return true
    return false
}

fun cardPlainText(value: String?, fallback: String = "", limit: Int = 220): String {
    val raw = value?.trim().orEmpty()
    if (raw.isEmpty() || cardIsTechnicalPayload(raw)) return fallback
    val clean = raw
        .replace(Regex("`([^`]+)`"), "$1")
        .replace(Regex("^#+\\s*", RegexOption.MULTILINE), "")
        .replace(Regex("\\s+"), " ")
        .trim()
    return if (clean.length > limit) clean.take(limit - 1).trim() + "…" else clean
}

fun cardQuestionDetail(value: String?): Pair<String, String> {
    val raw = value?.trim().orEmpty()
    if (raw.isEmpty()) return "" to ""
    if (cardIsTechnicalPayload(raw)) {
        return "Open the details to see what the agent is asking about." to raw
    }
    val clean = raw
        .replace("\r\n", "\n")
        .replace(Regex("^#+\\s*", RegexOption.MULTILINE), "")
        .replace(Regex("\n{3,}"), "\n\n")
        .trim()
    if (clean.length > 1200) {
        return (clean.take(1199).trim() + "…") to raw
    }
    return clean to ""
}

fun humanizeActionWords(value: String): String {
    val text = value
        .replace(Regex("^mcp:", RegexOption.IGNORE_CASE), "")
        .replace(Regex("^capability:", RegexOption.IGNORE_CASE), "")
        .replace(Regex("([a-z0-9])([A-Z])"), "$1 $2")
        .replace(Regex("[:./_-]+"), " ")
        .replace(Regex("\\s+"), " ")
        .trim()
        .lowercase()
    return text.replaceFirstChar { it.uppercase() }
}

fun appActionDisplayName(tool: String, service: String): String {
    val prefix = "${service.uppercase()}_"
    val trimmed = if (tool.uppercase().startsWith(prefix)) tool.drop(prefix.length) else tool
    return humanizeActionWords(trimmed)
}

private fun cardStripGenericWhy(value: String?): String {
    val text = value?.trim().orEmpty()
    if (text.isEmpty()) return ""
    if (Regex("^(?:unrecognized command|unknown tool|unknown action)(?:\\s*\\([^)]*\\))?$", RegexOption.IGNORE_CASE).matches(text)) {
        return ""
    }
    return text
}

private fun cardTargetBasename(rawPath: String): String {
    val clean = rawPath.trim().trimEnd('/', '\\')
    if (clean.isEmpty() || clean.contains('\n') || clean.startsWith("{")) return ""
    val part = clean.split('/', '\\').lastOrNull().orEmpty()
    return if (part.length > 48) part.take(47) + "…" else part
}

private fun cardCommandSteps(command: String): List<String> {
    val raw = command.trim()
    if (raw.isEmpty()) return emptyList()
    val segments = raw.split(Regex("(?:&&|\\|\\||[;|\\r\\n]+)"))
    val steps = mutableListOf<String>()
    val wrappers = Regex("^(?:env|sudo|doas|npx|pnpx|bunx|cmd|powershell(?:\\.exe)?|pwsh(?:\\.exe)?)$", RegexOption.IGNORE_CASE)
    for (seg in segments) {
        val s = seg.trim()
        if (s.isEmpty()) continue
        val tokens = Regex("(?:[^\\s\"']+|\"[^\"]*\"|'[^']*')+").findAll(s).map { it.value }.toList()
        var i = 0
        while (i < tokens.size && Regex("^[A-Za-z_][A-Za-z0-9_]*=").containsMatchIn(tokens[i])) i++
        while (i < tokens.size && wrappers.matches(tokens[i])) {
            i++
            while (i < tokens.size && Regex("^[-/][A-Za-z0-9-]+$").matches(tokens[i])) i++
        }
        val bin = tokens.getOrNull(i).orEmpty()
            .trim('\'', '"')
            .split('/', '\\').lastOrNull().orEmpty()
            .replace(Regex("\\.(?:exe|cmd|bat|ps1|sh)$", RegexOption.IGNORE_CASE), "")
        if (bin.isEmpty()) continue
        if (bin.equals("cd", ignoreCase = true) && segments.size > 1) continue
        val next = tokens.getOrNull(i + 1).orEmpty().trim('\'', '"')
        val sub = if (next.isNotEmpty() && !next.startsWith("-") && Regex("^[A-Za-z][A-Za-z0-9:_-]{0,24}$").matches(next)) next else ""
        val label = if (sub.isNotEmpty()) "$bin $sub" else bin
        if (label !in steps) steps.add(label)
        if (steps.size >= 3) break
    }
    return steps
}

private fun cardDynamicParamHint(data: JsonObject?): String {
    if (data == null) return ""
    val preferred = listOf("label", "operation", "action", "title", "subject", "repo", "repository", "channel", "to", "target", "path", "file", "url", "query", "name")
    val keys = preferred + data.keys.filter { it !in preferred }
    val parts = mutableListOf<String>()
    for (k in keys) {
        if (parts.size >= 2) break
        if (SENSITIVE_KEY_REGEX.containsMatchIn(k)) continue
        val elem = data[k] as? JsonPrimitive ?: continue
        val s = elem.contentOrNull?.replace(Regex("\\s+"), " ")?.trim().orEmpty()
        if (s.isEmpty() || s.length > 90 || cardIsTechnicalPayload(s)) continue
        parts.add("${humanizeActionWords(k)}: $s")
    }
    return parts.joinToString(" · ")
}

fun cardActionPresentation(tool: String?, why: String?, summary: String?): ActionPresentation {
    val raw = summary?.trim().orEmpty()
    val data: JsonObject? = runCatching {
        val candidate = if (raw.startsWith("{")) raw else raw.indexOf('{').takeIf { it >= 0 }?.let { raw.substring(it) }
        candidate?.let { lenientCardJson.parseToJsonElement(it) as? JsonObject }
    }.getOrNull()

    val toolStr = tool?.trim().orEmpty()
    val command = (data?.get("command") as? JsonPrimitive)?.contentOrNull?.trim() ?: raw
    val targetPath = listOf("path", "file", "target")
        .firstNotNullOfOrNull { (data?.get(it) as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf { s -> s.isNotEmpty() } }
        ?: if (data == null && Regex("^(?:[A-Za-z]:[\\\\/]|/|~/|\\.\\.?[\\\\/])").containsMatchIn(raw)) raw else ""
    val combined = "$toolStr $command"
    val cleanWhy = cardPlainText(cardStripGenericWhy(why), "")

    val preview = when {
        Regex("run_command|shell|terminal", RegexOption.IGNORE_CASE).containsMatchIn(toolStr) && command.isNotEmpty() && !command.startsWith("{") ->
            if (command.length > 180) command.take(179) + "…" else command
        targetPath.isNotEmpty() -> if (targetPath.length > 180) targetPath.take(179) + "…" else targetPath
        toolStr.isNotEmpty() && !toolStr.equals("run_command", ignoreCase = true) -> {
            val hint = cardDynamicParamHint(data)
            if (hint.isNotEmpty()) "$toolStr · $hint" else toolStr
        }
        else -> ""
    }

    var title = "Allow the next action?"
    var detail = cleanWhy.ifBlank { "The agent needs your permission to continue." }

    when {
        Regex("\\b(?:rm|rmdir|del|Remove-Item)\\b|git\\s+(?:reset\\s+--hard|clean\\s+-\\w*f)|delete_file", RegexOption.IGNORE_CASE).containsMatchIn(combined) -> {
            title = "Allow files to be removed?"
            detail = if (cleanWhy.isNotEmpty()) "$cleanWhy — This action can delete files or discard changes."
            else "This action can delete files or discard changes. Check the details before deciding."
        }
        Regex("git\\s+push.*(?:--force|-f\\b)", RegexOption.IGNORE_CASE).containsMatchIn(combined) -> {
            title = "Allow shared history to be replaced?"
            detail = if (cleanWhy.isNotEmpty()) "$cleanWhy — This can overwrite changes in the shared repository."
            else "This can overwrite changes in the shared repository and affect other people."
        }
        Regex("\\b(?:publish|deploy)\\b|git\\s+push", RegexOption.IGNORE_CASE).containsMatchIn(combined) -> {
            title = "Publish these changes?"
            detail = if (cleanWhy.isNotEmpty()) "$cleanWhy — This will send changes to a shared or live service."
            else "This will send changes to a shared or live service. Review the destination in the details."
        }
        Regex("(?:curl|wget|Invoke-WebRequest).*(?:\\||;|&&).*\\b(?:sh|bash|powershell|iex)\\b", RegexOption.IGNORE_CASE).containsMatchIn(combined) -> {
            title = "Download and run software?"
            detail = if (cleanWhy.isNotEmpty()) "$cleanWhy — Downloads and runs instructions from another source."
            else "This downloads and runs instructions from another source. Review the source before allowing it."
        }
        Regex("\\b(?:npm|pnpm|yarn|pip|pip3|uv)\\s+(?:install|add|sync)\\b", RegexOption.IGNORE_CASE).containsMatchIn(combined) -> {
            title = "Install project software?"
            detail = if (cleanWhy.isNotEmpty()) "$cleanWhy — Downloads software and may run installation instructions."
            else "This downloads software needed by the project and may run installation instructions."
        }
        Regex("^(?:(?:npm|pnpm|yarn)\\s+(?:run\\s+)?test|(?:npx\\s+)?(?:pytest|vitest|jest))\\b[^;&|]*$", RegexOption.IGNORE_CASE).matches(command) -> {
            title = "Run the project checks?"
            detail = "Run checks to look for problems in the recent changes."
        }
        Regex("^(?:npm|pnpm|yarn)\\s+(?:run\\s+)?(?:build|typecheck|lint)\\b[^;&|]*$", RegexOption.IGNORE_CASE).matches(command) -> {
            title = "Check the project is ready?"
            detail = "Check that the project can be built or that its files have no reported errors."
        }
        Regex("write_file|apply_edit|apply_patch", RegexOption.IGNORE_CASE).containsMatchIn(toolStr) -> {
            val wt = cardTargetBasename(targetPath)
            val outside = Regex("outside the (?:locked )?project", RegexOption.IGNORE_CASE).containsMatchIn(cleanWhy)
            title = if (wt.isNotEmpty()) (if (outside) "Update $wt outside this project?" else "Update $wt?") else "Update the project files?"
            detail = cleanWhy.ifBlank { "This will change files in the project. The exact changes are available below." }
        }
        Regex("read_file|search_files|list_files", RegexOption.IGNORE_CASE).containsMatchIn(toolStr) -> {
            val rt = cardTargetBasename(targetPath)
            val outside = Regex("outside the (?:locked )?project", RegexOption.IGNORE_CASE).containsMatchIn(cleanWhy)
            title = if (rt.isNotEmpty()) (if (outside) "Inspect $rt outside this project?" else "Inspect $rt?") else "Inspect project files?"
            detail = cleanWhy.ifBlank { "Read project files to understand the task and check the work." }
        }
        Regex("run_command|shell|terminal", RegexOption.IGNORE_CASE).containsMatchIn(toolStr) -> {
            val steps = cardCommandSteps(command)
            when {
                steps.size > 1 -> {
                    title = "Run ${steps.take(2).joinToString(" & ")}${if (steps.size > 2) " …" else ""}?"
                    detail = cleanWhy.ifBlank { "Run a command chain in the project (${steps.joinToString(", ")}). Check the details for exactly what it will do." }
                }
                steps.size == 1 -> {
                    title = "Run ${steps[0]}?"
                    detail = cleanWhy.ifBlank { "Run a command in the project using ${steps[0]}. Check the details for the exact arguments." }
                }
                else -> {
                    title = "Run a project action?"
                    detail = cleanWhy.ifBlank { "Run a command in the project. Check the details for exactly what it will do." }
                }
            }
        }
        toolStr.isNotEmpty() -> {
            val parts = if (toolStr.contains(':')) {
                toolStr.replace(Regex("^(?:mcp|capability):", RegexOption.IGNORE_CASE), "")
                    .split(':').map { humanizeActionWords(it) }.filter { it.isNotBlank() }
            } else {
                listOf(humanizeActionWords(toolStr))
            }
            val pretty = if (parts.size > 1) "${parts[0]} · ${parts.drop(1).joinToString(" ")}" else parts.firstOrNull().orEmpty().ifBlank { "the next action" }
            title = "Allow $pretty?"
            val paramHint = cardDynamicParamHint(data)
            detail = cleanWhy.ifBlank { paramHint }.ifBlank { "The agent requested permission to run $pretty. Check the details before deciding." }
        }
    }

    return ActionPresentation(title = title, detail = detail, preview = preview)
}

fun cardRequestPresentation(request: TeamRequest): CardPresentation {
    val rawDetail = request.detail
    val rawTitle = request.title
    val isComputer = request.desktopHandoff ||
        request.permission == "host" ||
        Regex("control over (the )?computer|return (desktop |computer )?control|take (desktop |computer )?control|computer control|desktop handoff", RegexOption.IGNORE_CASE)
            .containsMatchIn("$rawTitle $rawDetail")

    val approvalMatch = Regex("^Approve\\s+([\\w.:-]+)", RegexOption.IGNORE_CASE).find(rawTitle)
    val isApproval = !isComputer && (request.delegatedGate == "approval" || approvalMatch != null)
    val isPlan = !isComputer && (request.delegatedGate == "plan_review" || Regex("^Review .*plan", RegexOption.IGNORE_CASE).containsMatchIn(rawTitle))
    val isProjectPicker = rawTitle.trim().equals("Which project folder should I use?", ignoreCase = true)

    return when {
        isApproval -> {
            val pres = cardActionPresentation(approvalMatch?.groupValues?.getOrNull(1), rawDetail.split(Regex("\\n\\s*\\n")).firstOrNull(), rawDetail)
            CardPresentation(
                kind = "approval",
                label = "Approval",
                openStateLabel = "Needs approval",
                title = pres.title,
                detail = pres.detail,
                technical = rawDetail,
                isComputer = false,
                canRemember = false,
            )
        }
        isPlan -> {
            CardPresentation(
                kind = "plan_review",
                label = "Plan review",
                openStateLabel = "Needs plan review",
                title = "Review the proposed work",
                detail = "The agent has prepared a plan and is waiting for your decision before making changes. You can approve it or ask for changes.",
                technical = rawDetail,
                isComputer = false,
                canRemember = false,
            )
        }
        else -> {
            val (cleanDetail, technical) = cardQuestionDetail(rawDetail)
            CardPresentation(
                kind = if (isComputer) "computer" else "question",
                label = if (isComputer) "Computer control" else "Question",
                openStateLabel = if (isComputer) "Needs computer action" else "Needs your answer",
                title = cardPlainText(rawTitle, "Your decision is needed", 160),
                detail = cleanDetail,
                technical = technical,
                isComputer = isComputer,
                canRemember = !isComputer && !isProjectPicker && request.kind == "question",
            )
        }
    }
}

private fun formatJsonValueReadable(elem: JsonElement): String = when (elem) {
    is JsonNull -> "Not set"
    is JsonPrimitive -> {
        val boolVal = elem.booleanOrNull
        if (boolVal != null && !elem.isString) if (boolVal) "Yes" else "No"
        else elem.contentOrNull.orEmpty().ifBlank { "(empty)" }
    }
    is JsonArray -> if (elem.isEmpty()) "None" else elem.joinToString(", ") { formatJsonValueReadable(it) }
    is JsonObject -> if (elem.isEmpty()) "None" else elem.entries.joinToString(" · ") { (k, v) ->
        "${humanizeActionWords(k)}: ${formatJsonValueReadable(v)}"
    }
}

fun parseAppApprovalAction(request: TeamRequest): AppApprovalPresentation? {
    if (request.kind != "recommendation") return null
    val headingMatch = Regex("^Review this ([\\w-]+) action:\\r?\\n").find(request.detail)
    val titleMatch = Regex("^Run ([\\w-]+)$").find(request.title)
    val direct = request.appAction
    if (direct == null && (headingMatch == null || titleMatch == null)) return null

    val service = direct?.service?.ifBlank { null } ?: headingMatch?.groupValues?.getOrNull(1) ?: return null
    val tool = direct?.tool?.ifBlank { null } ?: titleMatch?.groupValues?.getOrNull(1) ?: return null

    val payload: TeamAppAction? = direct ?: runCatching {
        val jsonLine = request.detail.drop(headingMatch!!.range.last + 1).lineSequence().firstOrNull().orEmpty()
        lenientCardJson.decodeFromString(TeamAppAction.serializer(), jsonLine)
    }.getOrNull()

    val valid = payload != null &&
        payload.service.equals(service, ignoreCase = true) &&
        payload.tool.equals(tool, ignoreCase = true) &&
        payload.accountId.isNotBlank()

    val friendlyServices = mapOf(
        "gmail" to "Gmail",
        "gdrive" to "Google Drive",
        "googledrive" to "Google Drive",
        "gcalendar" to "Google Calendar",
        "googlecalendar" to "Google Calendar",
        "googlesheets" to "Google Sheets",
        "mail" to "Mailbox",
    )
    val serviceName = friendlyServices[service.lowercase()] ?: humanizeActionWords(service)
    val actionTitle = appActionDisplayName(tool, service)
    val messageReview = if (service.equals("mail", ignoreCase = true)) {
        tool == "mail_send" || tool == "mail_save_draft"
    } else {
        Regex("^(gmail|outlook|outlookemail|outlook365|office365|microsoftoutlook)$", RegexOption.IGNORE_CASE).matches(service) &&
            Regex("(?:SEND|REPLY|FORWARD|CREATE.*DRAFT|UPDATE.*DRAFT|DRAFT.*CREATE|DRAFT.*UPDATE)", RegexOption.IGNORE_CASE).containsMatchIn(tool)
    }
    val nativeSend = service.equals("mail", ignoreCase = true) && tool == "mail_send"

    val args = (request.reviewedAction ?: payload)?.args ?: JsonObject(emptyMap())
    val keys = args.keys.toMutableList()
    if (service.equals("mail", ignoreCase = true) && messageReview) {
        listOf("to", "subject", "text", "cc", "bcc").forEach { k -> if (k !in keys) keys.add(k) }
    }
    val importantRegex = Regex("^(?:to|cc|bcc|recipients|recipient|subject|text|body|message_body)$", RegexOption.IGNORE_CASE)
    val fields = keys.map { key ->
        val elem = args[key]
        val isString = elem == null || (elem is JsonPrimitive && elem.isString)
        val initialText = when {
            elem == null -> ""
            elem is JsonPrimitive && elem.isString -> elem.content
            else -> runCatching { lenientCardJson.encodeToString(JsonElement.serializer(), elem) }.getOrDefault(elem.toString())
        }
        AppApprovalField(
            key = key,
            label = if (key == "text") "Message" else humanizeActionWords(key),
            isJson = !isString,
            isImportant = importantRegex.matches(key),
            initialText = initialText,
            summaryText = if (elem == null) "" else formatJsonValueReadable(elem),
        )
    }

    return AppApprovalPresentation(
        service = service,
        serviceName = serviceName,
        tool = tool,
        actionTitle = actionTitle,
        accountId = payload?.accountId.orEmpty(),
        valid = valid,
        messageReview = messageReview,
        nativeSend = nativeSend,
        fields = fields,
    )
}
