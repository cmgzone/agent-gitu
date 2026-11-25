package dev.agentgitu.mobile.data.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ServerUrlValidatorTest {

    @Test
    fun normalizesValidOriginsAndStripsDefaultPorts() {
        assertEquals("https://gitu.example.com", ServerUrlValidator.normalizeServerUrl("  HTTPS://Gitu.Example.com:443/  "))
        assertEquals("http://192.168.1.42:8321", ServerUrlValidator.normalizeServerUrl("http://192.168.1.42:8321/"))
        assertEquals("http://10.0.2.2", ServerUrlValidator.normalizeServerUrl("http://10.0.2.2:80"))
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsPathsInServerAddress() {
        ServerUrlValidator.normalizeServerUrl("https://gitu.example.com/companion")
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsEmbeddedCredentials() {
        ServerUrlValidator.normalizeServerUrl("https://user:pass@gitu.example.com")
    }

    @Test
    fun classifiesLocalAndRemoteHosts() {
        assertTrue(ServerUrlValidator.isLocalHost("10.0.2.2"))
        assertTrue(ServerUrlValidator.isLocalHost("192.168.0.12"))
        assertTrue(ServerUrlValidator.isLocalHost("172.20.10.2"))
        assertTrue(ServerUrlValidator.isLocalHost("100.88.12.3"))
        assertTrue(ServerUrlValidator.isLocalHost("my-mac.local"))
        assertFalse(ServerUrlValidator.isLocalHost("gitu.example.com"))
    }

    @Test
    fun parsesQrPairingDeepLinks() {
        val local = ServerUrlValidator.parseConnectLink("agentgitu://connect?server=http%3A%2F%2F192.168.1.25%3A8321")
        assertNotNull(local)
        assertEquals("http://192.168.1.25:8321", local!!.server)
        assertEquals(ConnectionMode.LOCAL, local.mode)

        val remote = ServerUrlValidator.parseConnectLink("agentgitu://connect?server=https://gitu.example.com")
        assertNotNull(remote)
        assertEquals("https://gitu.example.com", remote!!.server)
        assertEquals(ConnectionMode.REMOTE, remote.mode)

        assertNull(ServerUrlValidator.parseConnectLink("https://evil.example.com/connect?server=http://10.0.2.2:8321"))
        assertNull(ServerUrlValidator.parseConnectLink("agentgitu://connect?server=javascript:alert(1)"))
    }
}
