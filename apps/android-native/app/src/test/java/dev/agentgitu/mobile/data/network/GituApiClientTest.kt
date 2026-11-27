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
        assertTrue(startBody.contains("conv_9"))
        assertTrue(startBody.contains("\"kind\":\"cowork\""))
        assertTrue("Voice call must omit threadId=main", !startBody.contains("threadId"))

        val replyReq = server.takeRequest()
        assertEquals("/api/voice/calls/call_123/reply", replyReq.path)
        assertTrue(replyReq.body.readUtf8().contains("How are the logs?"))

        val endReq = server.takeRequest()
        assertEquals("DELETE", endReq.method)
        assertEquals("/api/voice/calls/call_123", endReq.path)
    }

    @Test
    fun inboxWorkspaceWhisperWatchAndDelegationEndpointsMatchServer() = runTest {
        server.enqueue(
            MockResponse().setBody(
                """{"notesVisibility":"owner_only","projectPath":"/work/acme","notes":[{"id":"n1","roomId":"r1","kind":"summary","title":"Kickoff","content":"Ship Friday","createdByType":"agent","createdByName":"Nova"}],"tasks":[{"id":"t1","roomId":"r1","title":"Build checkout","kind":"coding","status":"pending_approval","requestedByType":"member","requestedByName":"Sarah"}]}""",
            ),
        )
        server.enqueue(MockResponse().setResponseCode(201).setBody("""{"message":{"id":"m1"}}"""))
        server.enqueue(MockResponse().setBody("""{"room":{"id":"r1","agentTriggerMode":"watch"}}"""))
        server.enqueue(
            MockResponse().setResponseCode(201).setBody(
                """{"note":{"id":"n2","roomId":"r1","kind":"summary","title":"Meeting Summary","content":"Done"},"createdTasks":[{"id":"t2","roomId":"r1","title":"Deploy","kind":"action","status":"todo"}],"tasks":[]}""",
            ),
        )
        server.enqueue(
            MockResponse().setResponseCode(202).setBody(
                """{"runId":"run_99","projectPath":"/work/acme","task":{"id":"t1","roomId":"r1","title":"Build checkout","kind":"coding","status":"in_progress","codeRunId":"run_99"}}""",
            ),
        )
        server.enqueue(MockResponse().setResponseCode(201).setBody("""{"message":{"id":"m2"}}"""))

        val client = GituApiClient(server.url("").toString().trimEnd('/'))
        val ws = client.inboxWorkspace("r1")
        assertEquals("owner_only", ws.notesVisibility)
        assertEquals(1, ws.notes.size)
        assertEquals("pending_approval", ws.tasks.first().status)

        client.sendInboxMessage("r1", "Keep floor at 8k", visibility = "owner_only")
        client.updateInboxRoom("r1", agentTriggerMode = "watch", notesVisibility = "shared_readonly")
        val sum = client.summarizeInboxMeeting("r1")
        assertEquals("Meeting Summary", sum.note?.title)
        assertEquals(1, sum.createdTasks.size)

        val codeRes = client.delegateInboxTaskCode("r1", "t1")
        assertEquals("run_99", codeRes.runId)

        client.shareInboxNote("r1", "n2", text = "Recap for Sarah", includeTasks = true)

        val r1 = server.takeRequest()
        assertEquals("/api/inbox/rooms/r1/workspace", r1.path)
        val r2 = server.takeRequest()
        assertEquals("/api/inbox/rooms/r1/messages", r2.path)
        assertTrue(r2.body.readUtf8().contains(""""visibility":"owner_only""""))
        val r3 = server.takeRequest()
        assertEquals("PATCH", r3.method)
        assertTrue(r3.body.readUtf8().contains(""""agentTriggerMode":"watch""""))
        val r4 = server.takeRequest()
        assertEquals("/api/inbox/rooms/r1/summarize", r4.path)
        val r5 = server.takeRequest()
        assertEquals("/api/inbox/rooms/r1/tasks/t1/delegate-code", r5.path)
        val r6 = server.takeRequest()
        assertEquals("/api/inbox/rooms/r1/notes/n2/share", r6.path)
    }

    @Test
    fun coworkMessageMutationsRequestDeleteAndComputerHandoffEndpointsMatchServer() = runTest {
        server.enqueue(MockResponse().setResponseCode(202).setBody("""{"ok":true,"queued":false}"""))
        server.enqueue(MockResponse().setResponseCode(202).setBody("""{"ok":true,"queued":false}"""))
        server.enqueue(MockResponse().setResponseCode(202).setBody("""{"ok":true,"queued":false}"""))
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"ok":true}"""))
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"ok":true}"""))
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"computer":{"agentId":"ag_1","name":"gitu-cowork-abc","state":"running","control":"shared","workspace":"/workspace","useHostComputer":false}}""",
            ),
        )
        server.enqueue(
            MockResponse().setResponseCode(202).setBody(
                """{"computer":{"agentId":"ag_1","name":"gitu-cowork-abc","state":"running","control":"user","handoff":{"reason":"You have control."},"workspace":"/workspace","useHostComputer":false}}""",
            ),
        )
        server.enqueue(MockResponse().setResponseCode(200).setBody("""{"ok":true}"""))

        val baseUrl = server.url("").toString().trimEnd('/')
        val client = GituApiClient(baseUrl)

        client.sendTeamMessage("conv_1", "msg_2", "Follow up", referencedMessageIds = listOf("msg_1"))
        client.editTeamMessage("conv_1", "msg_2", "Follow up edited", revision = 0)
        client.retryTeamMessage("conv_1", "msg_2", attempt = 1)
        client.deleteTeamMessage("conv_1", "msg_2")
        client.deleteTeamRequest("req_77")

        val comp = client.getAgentComputer("ag_1").computer
        assertTrue(comp.isRunning)
        assertEquals("shared", comp.control)

        val handoffComp = client.agentComputerAction("ag_1", "take-control").computer
        assertTrue(handoffComp.isUserControl)
        assertEquals("You have control.", handoffComp.handoff?.reason)

        client.agentComputerInput(
            "ag_1",
            buildJsonObject {
                put("action", "launch")
                put("app", "browser")
            },
        )

        assertEquals("$baseUrl/api/cowork/agents/ag_1/computer/view", client.agentComputerViewUrl("ag_1"))
        assertEquals("$baseUrl/api/cowork/agents/ag_1/computer/view?preview=1", client.agentComputerViewUrl("ag_1", preview = true))
        assertEquals("$baseUrl/api/server-browser/ag_1/view", client.serverBrowserViewUrl("ag_1"))

        val sendReq = server.takeRequest()
        assertEquals("POST", sendReq.method)
        assertTrue(sendReq.body.readUtf8().contains(""""referencedMessageIds":["msg_1"]"""))

        val editReq = server.takeRequest()
        assertEquals("PATCH", editReq.method)
        assertEquals("/api/cowork/conversations/conv_1/messages/msg_2", editReq.path)
        val editBody = editReq.body.readUtf8()
        assertTrue(editBody.contains("Follow up edited"))
        assertTrue(editBody.contains(""""revision":0"""))

        val retryReq = server.takeRequest()
        assertEquals("POST", retryReq.method)
        assertEquals("/api/cowork/conversations/conv_1/messages/msg_2/retry", retryReq.path)
        assertTrue(retryReq.body.readUtf8().contains(""""attempt":1"""))

        val delMsgReq = server.takeRequest()
        assertEquals("DELETE", delMsgReq.method)
        assertEquals("/api/cowork/conversations/conv_1/messages/msg_2", delMsgReq.path)

        val delCardReq = server.takeRequest()
        assertEquals("DELETE", delCardReq.method)
        assertEquals("/api/cowork/requests/req_77", delCardReq.path)

        val getCompReq = server.takeRequest()
        assertEquals("GET", getCompReq.method)
        assertEquals("/api/cowork/agents/ag_1/computer", getCompReq.path)

        val handoffReq = server.takeRequest()
        assertEquals("POST", handoffReq.method)
        assertEquals("/api/cowork/agents/ag_1/computer", handoffReq.path)
        assertTrue(handoffReq.body.readUtf8().contains(""""action":"take-control""""))

        val launchReq = server.takeRequest()
        assertEquals("POST", launchReq.method)
        assertTrue(launchReq.body.readUtf8().contains(""""app":"browser""""))
    }
}
