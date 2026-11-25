package dev.agentgitu.mobile.data.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

@Serializable
data class PikpamUser(
    val id: JsonElement? = null,
    val email: String = "",
    val name: String? = null,
)

@Serializable
data class PikpamLoginResponse(
    val token: String = "",
    val user: PikpamUser? = null,
)

@Serializable
data class PikpamCredits(
    val balance: Double = 0.0,
    val available: Double? = null,
    val currencyFormatted: String? = null,
)

@Serializable
data class PikpamCreditsResponse(
    val ok: Boolean = false,
    val credits: PikpamCredits? = null,
    val user: PikpamUser? = null,
)

@Serializable
data class PikpamProvisioningInfo(
    val state: String = "",
    val customerMessage: String = "",
)

@Serializable
data class PikpamCloudInstance(
    val id: String = "",
    val name: String = "Cloud Agent",
    val plan: String = "",
    val status: String = "UNKNOWN",
    val domain: String? = null,
    val customDomain: String? = null,
    val agentUrl: String? = null,
    val provisioning: PikpamProvisioningInfo? = null,
) {
    val isActive: Boolean
        get() = status.equals("ACTIVE", ignoreCase = true)
}

@Serializable
data class PikpamInstancesResponse(
    val instances: List<PikpamCloudInstance> = emptyList(),
)

@Serializable
data class PikpamInstanceAccessResponse(
    val vpsId: String? = null,
    val name: String? = null,
    val status: String = "",
    val agentUrl: String? = null,
    val registrationToken: String? = null,
    val error: String? = null,
)

@Serializable
data class PikpamFreeClaimResponse(
    val eligible: Boolean = false,
    val available: Boolean = false,
    val claimed: Boolean = false,
    val message: String? = null,
)

@Serializable
data class PikpamVoiceWallet(
    val spendableCredits: Double = 0.0,
    val eligible: Boolean = true,
)

@Serializable
data class PikpamVoiceStatusResponse(
    val available: Boolean = false,
    val wsUrl: String = "",
    val defaultAgentName: String = "",
    val wallet: PikpamVoiceWallet? = null,
)

@Serializable
data class PikpamVoiceTokenResponse(
    val token: String = "",
    val wsUrl: String = "",
    val roomName: String = "",
    val livekitRoomName: String = "",
    val identity: String = "",
    val agentName: String? = null,
)

data class PikpamAccountState(
    val token: String,
    val user: PikpamUser?,
    val credits: PikpamCredits?,
    val instances: List<PikpamCloudInstance>,
    val freeClaim: PikpamFreeClaimResponse?,
)

class PikpamClient(
    rawBaseUrl: String = DEFAULT_PIKPAM_BASE_URL,
    private val httpClient: OkHttpClient = GituApiClient.defaultHttpClient(),
) {
    val baseUrl: String = rawBaseUrl.trimEnd('/')

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
    }

    companion object {
        const val DEFAULT_PIKPAM_BASE_URL = "https://pikpam.com"
        private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
    }

    suspend fun login(email: String, password: String): PikpamLoginResponse {
        val body = buildJsonObject {
            put("email", email.trim())
            put("password", password)
        }
        val res = execute("/api/auth/login", method = "POST", body = body)
        val parsed = json.decodeFromString<PikpamLoginResponse>(res)
        if (parsed.token.isBlank()) {
            throw GituApiException("Pikpam login succeeded but no authentication token was returned.")
        }
        return parsed
    }

    suspend fun register(name: String, email: String, password: String): PikpamLoginResponse {
        val body = buildJsonObject {
            put("name", name.trim())
            put("email", email.trim())
            put("password", password)
        }
        val res = execute("/api/auth/register", method = "POST", body = body)
        val parsed = json.decodeFromString<PikpamLoginResponse>(res)
        if (parsed.token.isBlank()) {
            throw GituApiException("Pikpam registration succeeded but no token was returned.")
        }
        return parsed
    }

    suspend fun fetchAccount(token: String, fallbackUser: PikpamUser? = null): PikpamAccountState = coroutineScope {
        val creditsDef = async {
            runCatching { json.decodeFromString<PikpamCreditsResponse>(execute("/api/user/credits", token = token)) }.getOrNull()
        }
        val instancesDef = async {
            runCatching { json.decodeFromString<PikpamInstancesResponse>(execute("/api/cloud/vps/my-instances", token = token)) }.getOrNull()
        }
        val freeClaimDef = async {
            runCatching { json.decodeFromString<PikpamFreeClaimResponse>(execute("/api/cloud/vps/free-claim", token = token)) }.getOrNull()
        }

        val creditsRes = creditsDef.await()
        val instancesRes = instancesDef.await()
        val freeClaim = freeClaimDef.await()

        PikpamAccountState(
            token = token,
            user = creditsRes?.user ?: fallbackUser,
            credits = creditsRes?.credits,
            instances = instancesRes?.instances.orEmpty(),
            freeClaim = freeClaim,
        )
    }

    suspend fun fetchInstanceAccess(token: String, vpsId: String): PikpamInstanceAccessResponse {
        val encoded = GituApiClient.encodeQuery(vpsId.trim())
        val raw = execute("/api/cloud/vps/instances/$encoded/access", token = token)
        return json.decodeFromString(raw)
    }

    suspend fun claimFreeCloud(token: String, instanceName: String? = null) {
        val body = buildJsonObject {
            if (!instanceName.isNullOrBlank()) put("instanceName", instanceName.trim().take(64))
        }
        execute("/api/cloud/vps/free-claim", method = "POST", token = token, body = body)
    }

    suspend fun voiceStatus(token: String): PikpamVoiceStatusResponse {
        val raw = execute("/api/voice/status", method = "GET", token = token)
        return json.decodeFromString(raw)
    }

    suspend fun mintVoiceToken(
        token: String,
        roomName: String,
        identity: String,
        participantName: String = "You",
        agentName: String = "gitu-voice",
        agentMetadata: String,
        ttlMinutes: Int = 15,
    ): PikpamVoiceTokenResponse {
        val body = buildJsonObject {
            put("roomName", roomName)
            put("identity", identity)
            put("participantName", participantName)
            put("agentName", agentName.ifBlank { "gitu-voice" })
            put("agentMetadata", agentMetadata)
            put("canPublish", true)
            put("canSubscribe", true)
            put("canPublishData", true)
            put("ttlMinutes", ttlMinutes)
        }
        val raw = execute("/api/voice/token", method = "POST", token = token, body = body)
        return json.decodeFromString(raw)
    }

    suspend fun closeVoiceRoom(token: String, roomName: String) {
        val encoded = GituApiClient.encodeQuery(roomName)
        runCatching {
            execute("/api/voice/rooms/$encoded", method = "DELETE", token = token)
        }
    }

    private suspend fun execute(
        path: String,
        method: String = "GET",
        token: String? = null,
        body: JsonElement? = null,
    ): String = withContext(Dispatchers.IO) {
        val builder = Request.Builder().url("$baseUrl$path")
        if (!token.isNullOrBlank()) {
            builder.header("Authorization", "Bearer $token")
        }
        val reqBody = body?.toString()?.toRequestBody(JSON_MEDIA)
        when (method.uppercase()) {
            "GET" -> builder.get()
            "POST" -> builder.post(reqBody ?: "{}".toRequestBody(JSON_MEDIA))
            "DELETE" -> if (reqBody != null) builder.delete(reqBody) else builder.delete()
            else -> builder.method(method, reqBody)
        }

        val response = try {
            httpClient.newCall(builder.build()).execute()
        } catch (err: IOException) {
            throw GituApiException("Could not reach Pikpam (${err.message ?: "network error"}). Check your internet connection.")
        }

        response.use { res ->
            val raw = res.body?.string().orEmpty()
            if (!res.isSuccessful) {
                val parsedObj = runCatching { json.parseToJsonElement(raw).jsonObject }.getOrNull()
                val msg = parsedObj?.get("error")?.jsonPrimitive?.contentOrNull
                    ?: parsedObj?.get("message")?.jsonPrimitive?.contentOrNull
                val errCode = parsedObj?.get("code")?.jsonPrimitive?.contentOrNull
                    ?: if (res.code == 402) "INSUFFICIENT_CREDITS" else null
                throw GituApiException(
                    msg ?: "Pikpam request failed (${res.code}).",
                    statusCode = res.code,
                    code = errCode,
                )
            }
            raw
        }
    }
}
