package dev.agentgitu.mobile.ui.components

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatMessageAndA2uiTest {

    @Test
    fun filtersInternalMarkupAndDecorativeRulesWhilePreservingCode() {
        val raw = """
            ----------------
            RESULTS
            ----------------
            TYPECHECK ---- PASS
            Here is **bold** and `code` <cowork_state>{"internal":true}</cowork_state>
            ####
            ```kotlin
            // ---- keep inside code ----
            val x = "<cowork_state>literal</cowork_state>"
            ```
            <tool>hidden call</tool>
        """.trimIndent()

        val filtered = ChatMessageFilter.filterVisibleReply(raw)
        assertTrue(filtered.contains("## RESULTS"))
        assertTrue(filtered.contains("TYPECHECK — PASS"))
        assertTrue(filtered.contains("// ---- keep inside code ----"))
        assertTrue(filtered.contains("<cowork_state>literal</cowork_state>"))
        assertTrue(!filtered.contains("{\"internal\":true}"))
        assertTrue(!filtered.contains("<tool>"))
        assertTrue(!filtered.contains("####"))
    }

    @Test
    fun parsesMarkdownHeadingsListsTablesCodeAndOutputBlocks() {
        val md = """
            ## Summary
            - First item
            - Second item

            | Service | Status |
            | --- | --- |
            | API | Healthy |

            ```output a2ui
            {"title":"Deploy","messages":[{"version":"1.0","createSurface":{"surfaceId":"s1","catalogId":"https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json"}},{"version":"1.0","updateComponents":{"surfaceId":"s1","components":[{"id":"root","component":"Text","text":"Ready"}]}}]}
            ```
        """.trimIndent()

        val blocks = ChatMessageFilter.parseBlocks(md)
        assertTrue(blocks.any { it is ChatBlock.HeadingBlock && it.level == 2 && it.text == "Summary" })
        assertTrue(blocks.any { it is ChatBlock.ListBlock && it.items.size == 2 })
        assertTrue(blocks.any { it is ChatBlock.TableBlock && it.headers == listOf("Service", "Status") && it.rows.size == 1 })
        assertTrue(blocks.any { it is ChatBlock.OutputBlock && it.kind == "a2ui" })
    }

    @Test
    fun parsesA2uiV1PayloadAndResolvesDataModelActionContext() {
        val payload = """
            {
              "title": "Deploy options",
              "messages": [
                {"version": "1.0", "createSurface": {"surfaceId": "deploy", "catalogId": "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json"}},
                {"version": "1.0", "updateDataModel": {"surfaceId": "deploy", "path": "/", "value": {"env": ["staging"], "notes": "Ship v2"}}},
                {"version": "1.0", "updateComponents": {"surfaceId": "deploy", "components": [
                  {"id": "root", "component": "Column", "children": ["title", "env"]},
                  {"id": "title", "component": "Text", "text": "## Choose target"},
                  {"id": "env", "component": "ChoicePicker", "value": {"path": "/env"}}
                ]}}
              ]
            }
        """.trimIndent()

        val parsed = A2uiProtocol.parse(payload)
        assertNotNull(parsed)
        assertEquals("Deploy options", parsed!!.title)
        assertEquals("deploy", parsed.surfaceId)
        assertEquals("root", parsed.rootId)
        assertEquals(3, parsed.components.size)

        val liveModel = parsed.initialDataModel.toMutableMap()
        liveModel["/env"] = JsonArray(listOf(JsonPrimitive("prod")))

        val ctx = buildJsonObject {
            put("env", buildJsonObject { put("path", JsonPrimitive("/env")) })
            put("notes", buildJsonObject { put("@path", JsonPrimitive("/notes")) })
        }
        val formatted = A2uiProtocol.formatActionMessage(parsed.title, "deploy_confirm", ctx, liveModel)
        assertEquals("[Deploy options] deploy_confirm — env: prod; notes: Ship v2", formatted)
    }

    @Test
    fun rejectsMalformedOrDeletedA2uiSurface() {
        val deleted = """
            [
              {"version": "1.0", "createSurface": {"surfaceId": "s1"}},
              {"version": "1.0", "updateComponents": {"surfaceId": "s1", "components": [{"id": "root", "component": "Text", "text": "Hi"}]}},
              {"version": "1.0", "deleteSurface": {"surfaceId": "s1"}}
            ]
        """.trimIndent()
        assertNull(A2uiProtocol.parse(deleted))
    }
}
