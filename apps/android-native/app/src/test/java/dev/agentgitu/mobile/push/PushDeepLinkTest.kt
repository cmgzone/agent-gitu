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

    @Test
    fun parsesLiveActivityWorkingAndReplyPayloads() {
        val working = PushDeepLink.parseLiveActivity(
            mapOf(
                "liveActivity" to "1",
                "kind" to "working",
                "title" to "Forge",
                "body" to "Running unit tests…",
                "agentName" to "Forge",
                "phase" to "Testing",
                "progress" to "75",
                "target" to "run",
                "targetId" to "run_42",
            ),
        )
        assertNotNull(working)
        assertEquals("working", working!!.kind)
        assertEquals(true, working.isWorking)
        assertEquals(75, working.progress)
        assertEquals("run_42", working.target?.targetId)

        val reply = PushDeepLink.parseLiveActivity(
            mapOf(
                "kind" to "reply",
                "target" to "cowork",
                "targetId" to "conv_7",
            ),
            fallbackTitle = "Orb",
            fallbackBody = "Here is your summary.",
        )
        assertNotNull(reply)
        assertEquals(false, reply!!.isWorking)
        assertEquals("Orb", reply.title)
        assertEquals("Here is your summary.", reply.body)
    }
}
