package dev.agentgitu.mobile

import androidx.compose.ui.graphics.Color
import dev.agentgitu.mobile.data.model.ConnectedServiceItem
import dev.agentgitu.mobile.data.model.TeamRequest
import dev.agentgitu.mobile.data.model.Teammate
import dev.agentgitu.mobile.ui.components.cardActionPresentation
import dev.agentgitu.mobile.ui.components.cardRequestPresentation
import dev.agentgitu.mobile.ui.components.computeCharacterColorMatrixValues
import dev.agentgitu.mobile.ui.components.contrastInkFor
import dev.agentgitu.mobile.ui.components.parseAppApprovalAction
import dev.agentgitu.mobile.ui.components.resolveAppLogoUrl
import dev.agentgitu.mobile.ui.components.resolveCharacterColorHex
import dev.agentgitu.mobile.ui.components.resolveOfficialCharacter
import dev.agentgitu.mobile.ui.screens.chiefOfStaffPresenceTeammates
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CharacterAndCardsTest {

    @Test
    fun resolveOfficialCharacter_matchesWebPrecedence() {
        // Explicit dot-* shape wins even if name is a different mascot
        val explicit = resolveOfficialCharacter(shapeName = "dot-orb", accentHex = "#4c7df0", label = "Nova")
        assertEquals("dot-orb", explicit.shape)

        // Legacy non-dot shape ("cube") with valid color matches closest RGB color (like Web cwAvatarShape), not hardcoded cube->block
        val legacyByColor = resolveOfficialCharacter(shapeName = "cube", accentHex = "#ec4899", label = "Custom")
        assertEquals("dot-pill", legacyByColor.shape)

        // Legacy dot-* alias maps to modern dot-*
        val legacyDot = resolveOfficialCharacter(shapeName = "dot-mint", accentHex = "#ff6b57", label = "Bot")
        assertEquals("dot-hexa", legacyDot.shape)

        // Known mascot name resolves when no shape or color is set
        val mascot = resolveOfficialCharacter(shapeName = null, accentHex = null, label = "Forge")
        assertEquals("dot-hexa", mascot.shape)
    }

    @Test
    fun colorMatrix_isNullWhenMatchingBaseAndNonNullWhenCustom() {
        assertNull(computeCharacterColorMatrixValues("#ff6b57", "#ff6b57"))
        assertNull(computeCharacterColorMatrixValues("#FF6B57", "#ff6b57"))

        val matrix = computeCharacterColorMatrixValues("#ff6b57", "#4c7df0")
        assertNotNull(matrix)
        assertEquals(20, matrix!!.size)
        // Alpha row stays untouched [0, 0, 0, 1, 0]
        assertEquals(1f, matrix[18], 0.0001f)
    }

    @Test
    fun resolveCharacterColorHex_preservesCustomHex() {
        assertEquals("#12ab34", resolveCharacterColorHex("dot-orb", "#12AB34", "Nova"))
        assertEquals("#9c6df2", resolveCharacterColorHex("dot-nova", null, "Nova"))
    }

    @Test
    fun contrastInk_picksDarkOnLightYellowAndWhiteOnDeepBlue() {
        assertEquals(Color(0xFF000000), contrastInkFor(Color(0xFFEAB308)))
        assertEquals(Color(0xFFFFFFFF), contrastInkFor(Color(0xFF4F6396)))
    }

    @Test
    fun cardRequestPresentation_humanizesRawShellAndJsonPayloads() {
        val approvalReq = TeamRequest(
            id = "req-1",
            kind = "question",
            title = "Approve run_command",
            detail = "Run build verification\n\n{\"command\":\"npm run build && git status\"}",
            delegatedGate = "approval",
        )
        val pres = cardRequestPresentation(approvalReq)
        assertEquals("approval", pres.kind)
        assertTrue(pres.title.contains("Run", ignoreCase = true))
        assertTrue(pres.technical.contains("npm run build"))

        val rawJsonQuestion = TeamRequest(
            id = "req-2",
            kind = "question",
            title = "Choose deployment target",
            detail = "{\"region\":\"eu-central\",\"replicas\":3}",
        )
        val qPres = cardRequestPresentation(rawJsonQuestion)
        assertEquals("question", qPres.kind)
        assertEquals("Open the details to see what the agent is asking about.", qPres.detail)
        assertTrue(qPres.technical.contains("eu-central"))
    }

    @Test
    fun parseAppApprovalAction_parsesEmailReviewWithoutRawJson() {
        val req = TeamRequest(
            id = "req-mail",
            kind = "recommendation",
            title = "Run GMAIL_SEND_EMAIL",
            detail = "Review this gmail action:\n{\"service\":\"gmail\",\"accountId\":\"acc-123\",\"tool\":\"GMAIL_SEND_EMAIL\",\"args\":{\"to\":\"client@example.com\",\"subject\":\"Project Update\",\"body\":\"Everything is deployed.\"}}",
        )
        val app = parseAppApprovalAction(req)
        assertNotNull(app)
        assertTrue(app!!.valid)
        assertEquals("Gmail", app.serviceName)
        assertEquals("Send email", app.actionTitle)
        assertTrue(app.messageReview)
        assertEquals(3, app.fields.size)
        assertEquals("client@example.com", app.fields.first { it.key == "to" }.initialText)
    }

    @Test
    fun cardActionPresentation_humanizesDestructiveAndTestCommands() {
        val rmPres = cardActionPresentation("run_command", "", "{\"command\":\"rm -rf dist\"}")
        assertEquals("Allow files to be removed?", rmPres.title)

        val testPres = cardActionPresentation("run_command", "", "{\"command\":\"npm test\"}")
        assertEquals("Run the project checks?", testPres.title)
    }

    @Test
    fun resolveAppLogoUrl_usesCatalogThenBrandFaviconFallback() {
        val catalog = listOf(
            ConnectedServiceItem(slug = "gmail", name = "Gmail", logo = "https://logos.composio.dev/api/gmail"),
        )
        assertEquals(
            "https://logos.composio.dev/api/gmail",
            resolveAppLogoUrl(serviceSlug = "gmail", servicesCatalog = catalog),
        )
        assertEquals(
            "https://icons.duckduckgo.com/ip3/github.com.ico",
            resolveAppLogoUrl(serviceSlug = "github", servicesCatalog = catalog),
        )
        assertEquals(
            "https://icons.duckduckgo.com/ip3/stripe.com.ico",
            resolveAppLogoUrl(baseUrl = "https://api.stripe.com/v1", servicesCatalog = emptyList()),
        )
    }

    @Test
    fun chiefOfStaffPresenceTeammates_returnsOnlyChiefsInOrder() {
        val roster = listOf(
            Teammate(id = "a1", name = "Atlas", chiefOfStaff = false),
            Teammate(id = "a2", name = "P.A", chiefOfStaff = true),
            Teammate(id = "a3", name = "Forge", chiefOfStaff = false),
            Teammate(id = "a4", name = "Ops Chief", chiefOfStaff = true),
        )
        assertEquals(
            listOf("a2", "a4"),
            chiefOfStaffPresenceTeammates(roster).map { it.id },
        )
        assertTrue(
            chiefOfStaffPresenceTeammates(
                listOf(Teammate(id = "a1", name = "Atlas", chiefOfStaff = false)),
            ).isEmpty(),
        )
    }
}
