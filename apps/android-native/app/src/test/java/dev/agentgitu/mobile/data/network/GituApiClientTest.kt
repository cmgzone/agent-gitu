package dev.agentgitu.mobile.data.network

import dev.agentgitu.mobile.data.model.RunEvent
import dev.agentgitu.mobile.ui.viewmodel.GituAppViewModel
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class GituApiClientTest {

    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun connectsCapturesSessionCookieAndSendsBearerKey() = runTest {
        val cookieToken = "a".repeat(64)
        server.enqueue(
            MockResponse().setBody("""{"required":true,"configured":true,"requiresEmail":true,"authenticated":false}"""),
        )
        server.enqueue(
            MockResponse()
                .addHeader("Set-Cookie", "gitu_session=$cookieToken; Path=/; HttpOnly")
                .setBody("""{"ok":true}"""),
        )
        server.enqueue(
            MockResponse().setBody("""{"app":"Agent Gitu","mobileProtocol":1,"version":"0.4.15"}"""),
        )

        val baseUrl = server.url("/").toString().trimEnd('/')
        val client = GituApiClient(baseUrl, accessKey = "secret-access-key-1234")
        val status = client.connect(email = "owner@example.com", password = "my-strong-passphrase")

        assertEquals("Agent Gitu", status.app)
        assertEquals(1, status.mobileProtocol)
        assertEquals("gitu_session=$cookieToken", client.currentSessionCookie)

        val statusReq = server.takeRequest()
        assertEquals("/api/auth/status", statusReq.path)
        assertEquals("Bearer secret-access-key-1234", statusReq.getHeader("Authorization"))

        val loginReq = server.takeRequest()
        assertEquals("/api/auth/login", loginReq.path)

        val mobileReq = server.takeRequest()
        assertEquals("/api/mobile/status", mobileReq.path)
        assertEquals("gitu_session=$cookieToken", mobileReq.getHeader("Cookie"))
    }

    @Test
    fun mergesEventsAndExtractsReasoning() {
        val prev = listOf(
            RunEvent(i = 1, t = "2026-11-25T09:00:00Z", text = "Started"),
            RunEvent(
                i = 2,
                t = "2026-11-25T09:00:01Z",
                text = "",
                typed = buildJsonObject {
                    put("type", "reasoning")
                    put("text", "Checking tests")
                },
            ),
        )
        val incoming = listOf(
            RunEvent(i = 2, t = "2026-11-25T09:00:01Z", text = "", typed = prev[1].typed),
            RunEvent(
                i = 3,
                t = "2026-11-25T09:00:02Z",
                text = "Done",
                typed = buildJsonObject {
                    put("type", "thought_summary")
                    put("text", "All passing")
                },
            ),
        )
        val merged = GituAppViewModel.mergeRunEvents(prev, incoming)
        assertEquals(listOf(1, 2, 3), merged.map { it.i })

        val reasoning = GituAppViewModel.extractReasoningText(merged)
        assertTrue(reasoning.contains("Checking tests"))
        assertTrue(reasoning.contains("All passing"))
    }

    @Test
    fun sendTeamMessageOmitsThreadIdForMainConversation() = runTest {
        server.enqueue(MockResponse().setResponseCode(202).setBody("""{"ok":true,"queued":false}"""))
        val client = GituApiClient(server.url("").toString().trimEnd('/'))
        client.sendTeamMessage("conv_1", "msg_1", "Hello team", threadId = "main")
        val recorded = server.takeRequest()
        val body = recorded.body.readUtf8()
        assertTrue("Main chat message must not send threadId=main", !body.contains("threadId"))
    }

    @Test
    fun voiceCallLifecycleEndpointsMatchServerProtocol() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"configured":true,"mode":"pikpam","url":"wss://demo.livekit.cloud","agentName":"gitu-voice","pikpamConnected":true,"worker":{"phase":"ready","message":"Pikpam Managed Voice is ready."}}""",
            ),
        )
        server.enqueue(
            MockResponse().setResponseCode(201).setBody(
                """{"callId":"call_123","mode":"pikpam","url":"wss://demo.livekit.cloud","token":"jwt_token","name":"Chief"}""",
            ),
        )
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"text":"I checked the logs and everything looks healthy.","runId":"run_42"}""",
            ),
        )
        server.enqueue(
            MockResponse().setResponseCode(200).setBody("""{"ok":true}"""),
        )

        val client = GituApiClient(server.url("").toString().trimEnd('/'))
        client.setPikpamToken("pikpam-jwt-123")
        val cfg = client.voiceConfig()
        assertTrue(cfg.configured)
        assertEquals("pikpam", cfg.mode)
        assertEquals("gitu-voice", cfg.agentName)

        val started = client.startVoiceCall(
            kind = "cowork",
            conversationId = "conv_9",
            threadId = "main",
            agentId = "agent_chief",
        )
        assertEquals("call_123", started.callId)
        assertEquals("pikpam", started.mode)
        assertEquals("jwt_token", started.token)

        val rawReply = client.voiceCallReplyRaw("call_123", "turn_1", "How are the logs?")
        assertTrue(rawReply.contains("everything looks healthy"))

        client.endVoiceCall("call_123")

        val cfgReq = server.takeRequest()
        assertEquals("/api/voice/config", cfgReq.path)
        assertEquals("pikpam-jwt-123", cfgReq.getHeader("X-Pikpam-Token"))

        val startReq = server.takeRequest()
        assertEquals("/api/voice/calls", startReq.path)
        assertEquals("pikpam-jwt-123", startReq.getHeader("X-Pikpam-Token"))
        val startBody = startReq.body.readUtf8()
        assertTrue(startBody.contains("\"kind\":\"cowork\""))
        assertTrue("Voice call must omit threadId=main", !startBody.contains("threadId"))

        val replyReq = server.takeRequest()
        assertEquals("/api/voice/calls/call_123/reply", replyReq.path)
        assertTrue(replyReq.body.readUtf8().contains("How are the logs?"))

        val endReq = server.takeRequest()
        assertEquals("DELETE", endReq.method)
        assertEquals("/api/voice/calls/call_123", endReq.path)
    }
}
