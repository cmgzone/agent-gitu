package dev.agentgitu.mobile.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class PushDeepLinkTest {

    @Test
    fun parsesRunAndCoworkPayloads() {
        val runTarget = PushDeepLink.parsePayload(
            mapOf("target" to "run", "targetId" to "run_123", "workspaceId" to "ws_abc"),
        )
        assertNotNull(runTarget)
        assertEquals("run", runTarget!!.target)
        assertEquals("run_123", runTarget.targetId)
        assertEquals("ws_abc", runTarget.workspaceId)

        val coworkTarget = PushDeepLink.parsePayload(
            mapOf("target" to "cowork", "targetId" to "conv_9", "threadId" to "design-review"),
        )
        assertNotNull(coworkTarget)
        assertEquals("cowork", coworkTarget!!.target)
        assertEquals("conv_9", coworkTarget.targetId)
        assertEquals("design-review", coworkTarget.threadId)
    }

    @Test
    fun rejectsUnknownOrIncompletePayloads() {
        assertNull(PushDeepLink.parsePayload(emptyMap()))
        assertNull(PushDeepLink.parsePayload(mapOf("target" to "run", "targetId" to "")))
        assertNull(PushDeepLink.parsePayload(mapOf("target" to "unknown", "targetId" to "123")))
    }
}
