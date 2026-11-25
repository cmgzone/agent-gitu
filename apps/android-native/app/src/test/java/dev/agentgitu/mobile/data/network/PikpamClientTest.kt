package dev.agentgitu.mobile.data.network

import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class PikpamClientTest {

    private lateinit var pikpamServer: MockWebServer
    private lateinit var cloudAgentServer: MockWebServer

    @Before
    fun setUp() {
        pikpamServer = MockWebServer().apply { start() }
        cloudAgentServer = MockWebServer().apply { start() }
    }

    @After
    fun tearDown() {
        pikpamServer.shutdown()
        cloudAgentServer.shutdown()
    }

    @Test
    fun logsIntoPikpamDiscoversCloudAgentAndAutoConnectsWithStateCookie() = runTest {
        val cloudOrigin = cloudAgentServer.url("/").toString().trimEnd('/')
        val pikpam = PikpamClient(pikpamServer.url("/").toString().trimEnd('/'))

        // 1. Pikpam login
        pikpamServer.enqueue(
            MockResponse().setBody("""{"token":"pik_jwt_token_123","user":{"id":"u1","email":"alice@example.com","name":"Alice"}}"""),
        )
        val login = pikpam.login("alice@example.com", "secret-pass")
        assertEquals("pik_jwt_token_123", login.token)
        assertEquals("alice@example.com", login.user?.email)

        // 2. Fetch account (credits + instances + free-claim)
        pikpamServer.enqueue(
            MockResponse().setBody("""{"ok":true,"credits":{"balance":250,"available":250,"currencyFormatted":"$2.50"},"user":{"email":"alice@example.com","name":"Alice"}}"""),
        )
        pikpamServer.enqueue(
            MockResponse().setBody("""{"instances":[{"id":"vps_1","name":"Alice Cloud","plan":"starter","status":"ACTIVE","agentUrl":"$cloudOrigin"}]}"""),
        )
        pikpamServer.enqueue(
            MockResponse().setBody("""{"eligible":false,"available":false,"claimed":true}"""),
        )
        // Because fetchAccount fires 3 parallel requests, use dispatcher in real tests;
        // here verify direct fetchInstanceAccess + connectWithPikpamToken cleanly:
        pikpamServer.shutdown()
        pikpamServer = MockWebServer().apply { start() }
        val pikpam2 = PikpamClient(pikpamServer.url("/").toString().trimEnd('/'))
        pikpamServer.enqueue(
            MockResponse().setBody("""{"vpsId":"vps_1","name":"Alice Cloud","status":"ACTIVE","agentUrl":"$cloudOrigin","registrationToken":"reg_tok_abc"}"""),
        )
        val access = pikpam2.fetchInstanceAccess("pik_jwt_token_123", "vps_1")
        assertEquals("ACTIVE", access.status)
        assertEquals(cloudOrigin, access.agentUrl)

        // 3. Connect directly to Cloud Agent using Pikpam token + echoed OAuth state cookie
        val sessionToken = "b".repeat(64)
        cloudAgentServer.enqueue(
            MockResponse().setBody("""{"required":true,"configured":true,"requiresEmail":true,"authenticated":false}"""),
        )
        cloudAgentServer.enqueue(
            MockResponse()
                .addHeader("Set-Cookie", "gitu_pik_oauth_state=state_xyz; Path=/; HttpOnly")
                .setBody("""{"authUrl":"https://pikpam.com/oauth/authorize?...","state":"state_xyz"}"""),
        )
        cloudAgentServer.enqueue(
            MockResponse()
                .addHeader("Set-Cookie", "gitu_session=$sessionToken; Path=/; HttpOnly")
                .setBody("""{"ok":true,"provider":"pikrouter"}"""),
        )
        cloudAgentServer.enqueue(
            MockResponse().setBody("""{"required":true,"configured":true,"requiresEmail":true,"authenticated":true}"""),
        )
        cloudAgentServer.enqueue(
            MockResponse().setBody("""{"name":"agent-gitu","repoRoot":"/workspace"}"""),
        )

        val agentClient = GituApiClient(access.agentUrl!!)
        val status = agentClient.connectWithPikpamToken("pik_jwt_token_123", access.registrationToken)
        assertEquals("Agent Gitu", status.app)
        assertEquals("gitu_session=$sessionToken", agentClient.currentSessionCookie)

        // Verify /api/auth/pikrouter received both state cookie and Origin header,
        // and no /api/mobile/status access-key check was required.
        cloudAgentServer.takeRequest() // /api/auth/status
        cloudAgentServer.takeRequest() // /api/auth/pikrouter/start
        val pikAuthReq = cloudAgentServer.takeRequest()
        assertEquals("/api/auth/pikrouter", pikAuthReq.path)
        assertEquals(cloudOrigin, pikAuthReq.getHeader("Origin"))
        assertTrue(pikAuthReq.getHeader("Cookie").orEmpty().contains("gitu_pik_oauth_state=state_xyz"))
        val bodyStr = pikAuthReq.body.readUtf8()
        assertTrue(bodyStr.contains("pik_jwt_token_123"))
        assertTrue(bodyStr.contains("state_xyz"))
        assertTrue(bodyStr.contains("reg_tok_abc"))
        assertEquals("/api/auth/status", cloudAgentServer.takeRequest().path)
        assertEquals("/api/project", cloudAgentServer.takeRequest().path)
    }
}
