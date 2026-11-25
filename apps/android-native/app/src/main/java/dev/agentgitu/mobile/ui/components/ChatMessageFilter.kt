package dev.agentgitu.mobile.ui.components

/**
 * Text hygiene & Markdown/Rich-Output block parser matching Agent Gitu's web UI
 * (`cwVisibleReply`, `applyOutputHygiene`, `cwProseLayout`, `outRenderBlocks`).
 */
sealed interface ChatBlock {
    data class OutputBlock(
        val kind: String,
        val payload: String,
    ) : ChatBlock

    data class CodeBlock(
        val language: String,
        val code: String,
    ) : ChatBlock

    data class TableBlock(
        val headers: List<String>,
        val rows: List<List<String>>,
    ) : ChatBlock

    data class HeadingBlock(
        val level: Int,
        val text: String,
    ) : ChatBlock

    data class ListBlock(
        val ordered: Boolean,
        val items: List<Pair<String, String>>,
    ) : ChatBlock

    data class QuoteBlock(
        val text: String,
    ) : ChatBlock

    data class ImageBlock(
        val url: String,
        val alt: String,
    ) : ChatBlock

    data class ParagraphBlock(
        val text: String,
    ) : ChatBlock
}

object ChatMessageFilter {
    private val CODE_SPLIT_REGEX = Regex("(```[\\s\\S]*?(?:```|$)|~~~[\\s\\S]*?(?:~~~|$)|`[^`\\n]+`)")
    private val COWORK_STATE_TAIL = Regex("\\s*<cowork_state>[\\s\\S]*?(?:</cowork_state>\\s*$|$)", RegexOption.IGNORE_CASE)
    private val COWORK_STATE_ANY = Regex("<cowork_state>[\\s\\S]*?(?:</cowork_state>|$)", RegexOption.IGNORE_CASE)
    private val TOOL_BLOCK_TAIL = Regex("\\s*<tool>[\\s\\S]*?</tool>\\s*$", RegexOption.IGNORE_CASE)
    private val TOOL_BLOCK_ANY = Regex("<tool>[\\s\\S]*?</tool>", RegexOption.IGNORE_CASE)
    private val INTERNAL_TAG_TAIL = Regex(
        "\\s*<(?:[|｜]\\s*(?:DSML\\s*[|｜]\\s*)?(?:tool_calls?|tool_name|parameters|calls|invoke)\\b|[|｜]+\\s*DSML\\b|tool(?:\\s|>|$)|tool_calls?\\b|invoke\\s+name\\s*=)[\\s\\S]*$",
        RegexOption.IGNORE_CASE,
    )
    private val PARTIAL_TAG_TAIL = Regex("\\s*<[|｜][^>]*$|\\s*<t(?:o(?:o(?:l)?)?)?$", RegexOption.IGNORE_CASE)

    private val FENCE_START = Regex("^ {0,3}(`{3,}|~{3,})(.*)$")
    private val SEPARATOR_RUN = Regex("^ {0,3}([-=*_~\\u2010-\\u2015\\u2022\\u00b7\\u2500-\\u257f])[ \\t]*(?:\\1[ \\t]*){2,}$")
    private val WRAPPED_TITLE = Regex("^ {0,3}([-=*_~\\u2010-\\u2015\\u2022\\u00b7\\u2500-\\u257f])\\1{2,}[ \\t]*(\\S.*?)\\s*\\1{3,}[ \\t]*$")
    private val RULE_CHARS_ONLY = Regex("^[-=*_~\\u2010-\\u2015\\u2022\\u00b7\\u2500-\\u257f]+$")
    private val INLINE_LADDER = Regex("^(.+?\\S)[ \\t]*[-=*_~\\u2010-\\u2015\\u2022\\u00b7\\u2500-\\u257f]{3,}[ \\t]*(\\S.*)$")
    private val BARE_HASH_BANNER = Regex("^ {0,3}#+[ \\t]*$")
    private val HEADING_LINE = Regex("^ {0,3}(#{1,6})[ \\t]+(.+?)[ \\t]*#*[ \\t]*$")
    private val BULLET_LINE = Regex("^ {0,4}(?:[-*•])[ \\t]+(.+)$")
    private val ORDERED_LINE = Regex("^ {0,4}(\\d+[.)])[ \\t]+(.+)$")
    private val QUOTE_LINE = Regex("^ {0,3}>[ \\t]?(.*)$")
    private val IMAGE_LINE = Regex("^ {0,3}!\\[([^\\]]*)]\\(([^\\s)]+)(?:[ \\t]+\"([^\"]*)\")?\\)[ \\t]*$")
    private val TABLE_DIVIDER = Regex("^\\|?[\\s:|-]+\\|?$")
    private val OUTPUT_INFO = Regex("^output(?:[ \\t]+([a-zA-Z][a-zA-Z0-9_-]*))?.*$", RegexOption.IGNORE_CASE)

    /**
     * Strips internal LLM markup (`<cowork_state>`, `<tool>`, `<|DSML|...>`) and applies
     * Agent Gitu output hygiene (removing decorative rules while preserving code fences).
     */
    fun filterVisibleReply(raw: String): String {
        if (raw.isBlank()) return ""
        val normalized = raw.replace("\r\n", "\n").replace('\r', '\n')
        val visible = stripInternalMarkup(normalized)
        return applyOutputHygiene(visible)
    }

    private fun stripInternalMarkup(text: String): String {
        val sb = StringBuilder(text.length)
        var last = 0
        for (match in CODE_SPLIT_REGEX.findAll(text)) {
            if (match.range.first > last) {
                sb.append(cleanProseChunk(text.substring(last, match.range.first)))
            }
            sb.append(match.value)
            last = match.range.last + 1
        }
        if (last < text.length) {
            sb.append(cleanProseChunk(text.substring(last)))
        }
        return sb.toString().trimStart()
    }

    private fun cleanProseChunk(chunk: String): String {
        var out = chunk
            .replace(COWORK_STATE_TAIL, "")
            .replace(COWORK_STATE_ANY, "")
            .replace(TOOL_BLOCK_TAIL, "")
            .replace(TOOL_BLOCK_ANY, "")
            .replace(INTERNAL_TAG_TAIL, "")
            .replace(PARTIAL_TAG_TAIL, "")
        val marker = "<cowork_state>"
        val lower = out.lowercase()
        val maxLen = minOf(out.length, marker.length - 1)
        for (len in maxLen downTo 1) {
            if (lower.endsWith(marker.substring(0, len))) {
                out = out.substring(0, out.length - len).trimEnd()
                break
            }
        }
        return out
    }

    private fun applyOutputHygiene(text: String): String {
        if (text.isBlank()) return ""
        val lines = text.split('\n')
        val out = mutableListOf<String>()
        var fenced = false
        var fenceChar = '`'
        var fenceLen = 3
        var i = 0
        while (i < lines.size) {
            val line = lines[i]
            val fMatch = FENCE_START.matchEntire(line)
            if (!fenced && fMatch != null) {
                fenced = true
                fenceChar = fMatch.groupValues[1][0]
                fenceLen = fMatch.groupValues[1].length
                out.add(line)
                i++
                continue
            }
            if (fenced) {
                val trimmed = line.trim()
                if (trimmed.length >= fenceLen && trimmed.all { it == fenceChar }) {
                    fenced = false
                }
                out.add(line)
                i++
                continue
            }

            if (BARE_HASH_BANNER.matches(line)) {
                i++
                continue
            }

            val wrapped = WRAPPED_TITLE.matchEntire(line)
            if (wrapped != null && !RULE_CHARS_ONLY.matches(wrapped.groupValues[2].trim())) {
                out.add("## ${wrapped.groupValues[2].trim()}")
                i++
                continue
            }

            if (SEPARATOR_RUN.matches(line)) {
                var cursor = i + 1
                while (cursor < lines.size && lines[cursor].isBlank()) cursor++
                val inner = mutableListOf<String>()
                var closeAt = -1
                while (cursor < lines.size && lines[cursor].isNotBlank()) {
                    if (SEPARATOR_RUN.matches(lines[cursor])) {
                        closeAt = cursor
                        break
                    }
                    inner.add(lines[cursor])
                    cursor++
                }
                if (closeAt >= 0 && inner.isNotEmpty()) {
                    if (inner.size == 1) out.add("## ${inner[0].trim()}")
                    else out.addAll(inner)
                    i = closeAt + 1
                    continue
                }
                i++
                continue
            }

            if (!line.trimStart().startsWith('|')) {
                val ladder = INLINE_LADDER.matchEntire(line)
                if (ladder != null) {
                    out.add("${ladder.groupValues[1].trim()} — ${ladder.groupValues[2].trim()}")
                    i++
                    continue
                }
            }
            out.add(line)
            i++
        }
        return out.joinToString("\n").replace(Regex("\n{3,}"), "\n\n").trim()
    }

    /**
     * Parses filtered text into structured Markdown + Rich Output (`output <kind>`) blocks.
     */
    fun parseBlocks(rawText: String): List<ChatBlock> {
        val cleaned = filterVisibleReply(rawText)
        if (cleaned.isBlank()) return emptyList()

        val lines = cleaned.split('\n')
        val blocks = mutableListOf<ChatBlock>()
        val paraBuf = mutableListOf<String>()

        fun flushParagraph() {
            if (paraBuf.isNotEmpty()) {
                val joined = paraBuf.joinToString("\n").trim()
                if (joined.isNotEmpty()) blocks.add(ChatBlock.ParagraphBlock(joined))
                paraBuf.clear()
            }
        }

        var i = 0
        while (i < lines.size) {
            val line = lines[i]

            // Blank line separates paragraphs
            if (line.isBlank()) {
                flushParagraph()
                i++
                continue
            }

            // Fenced code or structured ```output <kind>``` block
            val fenceMatch = FENCE_START.matchEntire(line)
            if (fenceMatch != null) {
                flushParagraph()
                val marker = fenceMatch.groupValues[1]
                val fenceCh = marker[0]
                val minLen = marker.length
                val info = fenceMatch.groupValues[2].trim()
                val bodyLines = mutableListOf<String>()
                var closed = false
                i++
                while (i < lines.size) {
                    val cur = lines[i]
                    val tr = cur.trim()
                    if (tr.length >= minLen && tr.all { it == fenceCh }) {
                        closed = true
                        i++
                        break
                    }
                    bodyLines.add(cur)
                    i++
                }
                val body = bodyLines.joinToString("\n")
                val outMatch = OUTPUT_INFO.matchEntire(info)
                if (closed && outMatch != null) {
                    val kind = outMatch.groupValues[1].ifBlank { "chart" }.lowercase()
                    blocks.add(ChatBlock.OutputBlock(kind = kind, payload = body))
                } else {
                    blocks.add(ChatBlock.CodeBlock(language = info, code = body))
                }
                continue
            }

            // Standalone Markdown image (![alt](url))
            val imgMatch = IMAGE_LINE.matchEntire(line)
            if (imgMatch != null) {
                flushParagraph()
                val alt = imgMatch.groupValues[3].ifBlank { imgMatch.groupValues[1] }
                blocks.add(ChatBlock.ImageBlock(url = imgMatch.groupValues[2].trim(), alt = alt.trim()))
                i++
                continue
            }

            // Heading (# to ######)
            val headingMatch = HEADING_LINE.matchEntire(line)
            if (headingMatch != null) {
                flushParagraph()
                blocks.add(
                    ChatBlock.HeadingBlock(
                        level = headingMatch.groupValues[1].length,
                        text = headingMatch.groupValues[2].trim(),
                    ),
                )
                i++
                continue
            }

            // Markdown pipe table (header row + divider row + 1+ rows)
            if (isTableStart(lines, i)) {
                flushParagraph()
                val headers = splitTableRow(lines[i])
                i += 2 // skip header and divider
                val rows = mutableListOf<List<String>>()
                while (i < lines.size && lines[i].contains('|') && lines[i].isNotBlank()) {
                    rows.add(splitTableRow(lines[i]))
                    i++
                }
                blocks.add(ChatBlock.TableBlock(headers = headers, rows = rows))
                continue
            }

            // Blockquote (> ...)
            if (QUOTE_LINE.matches(line)) {
                flushParagraph()
                val quoteLines = mutableListOf<String>()
                while (i < lines.size) {
                    val qm = QUOTE_LINE.matchEntire(lines[i]) ?: break
                    quoteLines.add(qm.groupValues[1])
                    i++
                }
                blocks.add(ChatBlock.QuoteBlock(quoteLines.joinToString("\n").trim()))
                continue
            }

            // Bullet list
            if (BULLET_LINE.matches(line)) {
                flushParagraph()
                val items = mutableListOf<Pair<String, String>>()
                while (i < lines.size) {
                    val bm = BULLET_LINE.matchEntire(lines[i]) ?: break
                    items.add("•" to bm.groupValues[1].trim())
                    i++
                }
                blocks.add(ChatBlock.ListBlock(ordered = false, items = items))
                continue
            }

            // Ordered list
            if (ORDERED_LINE.matches(line)) {
                flushParagraph()
                val items = mutableListOf<Pair<String, String>>()
                while (i < lines.size) {
                    val om = ORDERED_LINE.matchEntire(lines[i]) ?: break
                    items.add(om.groupValues[1] to om.groupValues[2].trim())
                    i++
                }
                blocks.add(ChatBlock.ListBlock(ordered = true, items = items))
                continue
            }

            paraBuf.add(line)
            i++
        }
        flushParagraph()
        return blocks
    }

    private fun isTableStart(lines: List<String>, index: Int): Boolean {
        if (index + 1 >= lines.size) return false
        val header = lines[index].trim()
        val divider = lines[index + 1].trim()
        if (!header.contains('|') || !divider.contains('|') || !divider.contains('-')) return false
        return TABLE_DIVIDER.matches(divider)
    }

    private fun splitTableRow(line: String): List<String> =
        line.trim()
            .removePrefix("|")
            .removeSuffix("|")
            .split('|')
            .map { it.trim() }
}
