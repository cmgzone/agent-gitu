package dev.agentgitu.mobile.data.network

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

enum class ConnectionMode {
    LOCAL,
    REMOTE,
}

data class ConnectLink(
    val server: String,
    val mode: ConnectionMode,
)

object ServerUrlValidator {
    fun normalizeServerUrl(raw: String): String {
        val trimmed = raw.trim()
        require(trimmed.isNotEmpty()) {
            "Enter the full server address, including http:// or https://."
        }
        val uri = try {
            URI(trimmed)
        } catch (_: Exception) {
            throw IllegalArgumentException("Enter the full server address, including http:// or https://.")
        }
        val scheme = uri.scheme?.lowercase()
        val host = uri.host
        if (scheme !in setOf("http", "https") || host.isNullOrBlank()) {
            throw IllegalArgumentException("Enter the full server address, including http:// or https://.")
        }
        if (!uri.userInfo.isNullOrEmpty() || !uri.query.isNullOrEmpty() || !uri.fragment.isNullOrEmpty()) {
            throw IllegalArgumentException("Use a server address such as https://gitu.example.com, without credentials or query parameters.")
        }
        val path = uri.path.orEmpty()
        if (path.isNotEmpty() && path != "/") {
            throw IllegalArgumentException("Use only the server origin (e.g. https://gitu.example.com) without a path.")
        }
        val portSuffix = if (uri.port != -1 && !isDefaultPort(scheme, uri.port)) ":${uri.port}" else ""
        return "$scheme://${host.lowercase()}$portSuffix"
    }

    fun isLocalHost(host: String): Boolean {
        val normalized = host.lowercase().trim('[', ']')
        if (normalized == "localhost" || normalized == "127.0.0.1" || normalized == "::1" || normalized == "10.0.2.2") {
            return true
        }
        if (normalized.endsWith(".local")) return true
        val ipv4 = normalized.split(".")
        if (ipv4.size == 4 && ipv4.all { it.toIntOrNull() in 0..255 }) {
            val a = ipv4[0].toInt()
            val b = ipv4[1].toInt()
            if (a == 10) return true
            if (a == 172 && b in 16..31) return true
            if (a == 192 && b == 168) return true
            if (a == 100 && b in 64..127) return true // Tailscale / CGNAT
        }
        return false
    }

    fun inferMode(serverUrl: String): ConnectionMode {
        return try {
            val host = URI(normalizeServerUrl(serverUrl)).host.orEmpty()
            if (isLocalHost(host)) ConnectionMode.LOCAL else ConnectionMode.REMOTE
        } catch (_: Exception) {
            ConnectionMode.LOCAL
        }
    }

    fun parseConnectLink(raw: String?): ConnectLink? {
        if (raw.isNullOrBlank()) return null
        val uri = try {
            URI(raw.trim())
        } catch (_: Exception) {
            return null
        }
        if (uri.scheme?.lowercase() != "agentgitu" || uri.host?.lowercase() != "connect") {
            return null
        }
        val query = uri.rawQuery ?: return null
        val serverParam = query.split("&")
            .mapNotNull { part ->
                val idx = part.indexOf('=')
                if (idx <= 0) null
                else part.substring(0, idx) to URLDecoder.decode(part.substring(idx + 1), StandardCharsets.UTF_8.name())
            }
            .firstOrNull { it.first == "server" }
            ?.second
            ?: return null
        val normalized = try {
            normalizeServerUrl(serverParam)
        } catch (_: Exception) {
            return null
        }
        return ConnectLink(server = normalized, mode = inferMode(normalized))
    }

    private fun isDefaultPort(scheme: String?, port: Int): Boolean {
        return (scheme == "http" && port == 80) || (scheme == "https" && port == 443)
    }
}
