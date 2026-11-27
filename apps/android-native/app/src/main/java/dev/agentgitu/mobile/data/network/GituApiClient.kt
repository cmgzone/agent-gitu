package dev.agentgitu.mobile.data.network

import android.webkit.CookieManager
import dev.agentgitu.mobile.data.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.concurrent.TimeUnit

class GituApiException(
    message: String,
    val statusCode: Int = 0,
    val code: String? = null,
) : Exception(message)

class GituApiClient(
    rawBaseUrl: String,
    private var accessKey: String = "",
    private val httpClient: OkHttpClient = defaultHttpClient(),
) {
    val baseUrl: String = ServerUrlValidator.normalizeServerUrl(rawBaseUrl)

    private val cookies = java.util.concurrent.ConcurrentHashMap<String, String>()
    @Volatile
    private var pikpamToken: String = ""

    val currentPikpamToken: String
        get() = pikpamToken

    fun setPikpamToken(token: String) {
        pikpamToken = token.trim()
    }

    val currentSessionCookie: String?
        get() = cookies["gitu_session"]?.let { "gitu_session=$it" }

    val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
        encodeDefaults = true
    }

    companion object {
        private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()

        fun defaultHttpClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(25, TimeUnit.SECONDS)
            .writeTimeout(25, TimeUnit.SECONDS)
            .followRedirects(false)
            .build()

        fun encodeQuery(value: String): String =
            URLEncoder.encode(value, StandardCharsets.UTF_8.name())
    }

    fun syncCookiesToWebView(webView: android.webkit.WebView? = null) {
        try {
            val manager = CookieManager.getInstance()
            manager.setAcceptCookie(true)
            if (webView != null) {
                manager.setAcceptThirdPartyCookies(webView, true)
            }
            if (cookies.isNotEmpty()) {
                val secureSuffix = if (baseUrl.startsWith("https://", ignoreCase = true)) "; Secure" else ""
                for ((k, v) in cookies) {
                    manager.setCookie(baseUrl, "$k=$v; Path=/$secureSuffix")
                }
                manager.flush()
            }
        } catch (_: Throwable) {
            // Safe no-op in JVM unit tests where Android WebView is absent.
        }
    }

    fun clearSession() {
        cookies.clear()
        accessKey = ""
        try {
            val manager = CookieManager.getInstance()
            manager.removeAllCookies(null)
            manager.flush()
        } catch (_: Throwable) {
            // Safe no-op in JVM unit tests.
        }
    }

    suspend fun health(): HealthStatus = requestRaw("/healthz", method = "GET")

    suspend fun connect(email: String, password: String): MobileStatus {
        val auth: AuthStatus = request("/api/auth/status")
        if (auth.required && !auth.configured) {
            throw GituApiException("Create your Agent Gitu account on the server computer first.")
        }
        if (auth.configured && !auth.authenticated) {
            if (password.isBlank()) {
                throw GituApiException("Enter your Agent Gitu account password.")
            }
            if (auth.requiresEmail && email.isBlank()) {
                throw GituApiException("Enter your registered email address.")
            }
            val payload = buildJsonObject {
                put("password", password)
                if (email.isNotBlank()) put("email", email.trim())
            }
            request<JsonElement>("/api/auth/login", method = "POST", body = payload)
        }
        return finishConnect()
    }

    /** Authenticate against any Agent Gitu server (Cloud Agent or Local) using a Pikpam JWT token. */
    suspend fun connectWithPikpamToken(pikpamToken: String, registrationToken: String? = null): MobileStatus {
        val auth = runCatching { request<AuthStatus>("/api/auth/status") }.getOrNull()
        if (auth == null || !auth.authenticated) {
            val startRes = request<JsonObject>(
                "/api/auth/pikrouter/start",
                method = "POST",
                body = buildJsonObject { put("redirectPath", "/callback") },
            )
            val state = startRes["state"]?.jsonPrimitive?.contentOrNull
                ?: throw GituApiException("Could not start Pikpam sign-in on this Agent Gitu server.")
            val loginBody = buildJsonObject {
                put("token", pikpamToken.trim())
                put("state", state)
                if (!registrationToken.isNullOrBlank()) put("registrationToken", registrationToken.trim())
            }
            request<JsonElement>("/api/auth/pikrouter", method = "POST", body = loginBody)
        }
        return finishConnect()
    }

    /** Authenticate against a Local or Self-Hosted Agent Gitu server using Pikpam email + password. */
    suspend fun connectWithPikpamCredentials(email: String, password: String): MobileStatus {
        val auth = runCatching { request<AuthStatus>("/api/auth/status") }.getOrNull()
        if (auth == null || !auth.authenticated) {
            val loginBody = buildJsonObject {
                put("mode", "login")
                put("email", email.trim())
                put("password", password)
            }
            request<JsonElement>("/api/auth/pikrouter", method = "POST", body = loginBody)
        }
        return finishConnect()
    }

    private suspend fun finishConnect(): MobileStatus {
        val status = if (accessKey.isNotBlank()) {
            runCatching { request<MobileStatus>("/api/mobile/status") }.getOrElse { err ->
                if (err is GituApiException && (err.statusCode == 404 || err.statusCode == 401)) {
                    verifyAuthenticatedSession()
                } else {
                    throw err
                }
            }
        } else {
            verifyAuthenticatedSession()
        }
        syncCookiesToWebView()
        return status
    }

    private suspend fun verifyAuthenticatedSession(): MobileStatus {
        // /api/mobile/status requires a static AGENT_GITU_ACCESS_KEY bearer token,
        // whereas all workspace APIs (/api/runs, /api/cowork/*, /api/mobile/runs/*/events,
        // /api/mobile/files, /api/mobile/push, /api/inbox/*) accept the authenticated
        // gitu_session cookie issued by Pikpam or password login.
        val auth = request<AuthStatus>("/api/auth/status")
        if (auth.configured && !auth.authenticated) {
            throw GituApiException("Sign-in did not establish an active session. Please try again.")
        }
        projectInfo()
        return MobileStatus(app = "Agent Gitu", mobileProtocol = 1)
    }

    suspend fun disconnect() {
        try {
            request<JsonElement>("/api/auth/logout", method = "POST", body = buildJsonObject {})
        } finally {
            clearSession()
        }
    }

    // --- Projects, Workspace & Files ---

    suspend fun projectInfo(): ProjectInfo = request("/api/project")

    suspend fun homeInfo(): HomeInfo = request("/api/home")

    suspend fun listProjects(): List<Project> {
        val current = runCatching { projectInfo() }.getOrNull()
        val home = runCatching { homeInfo() }.getOrNull()
        val runs = runCatching { listRuns() }.getOrElse { emptyList() }
        val dirs = if (!home?.projectsPath.isNullOrBlank()) {
            runCatching {
                request<BrowseResponse>("/api/browse?path=${encodeQuery(home!!.projectsPath)}").dirs
            }.getOrElse { emptyList() }
        } else {
            emptyList()
        }

        val ordered = LinkedHashMap<String, Project>()
        if (current != null && current.repoRoot.isNotBlank()) {
            ordered[current.repoRoot] = Project(current.name.ifBlank { basename(current.repoRoot) }, current.repoRoot)
        }
        if (home != null && home.workspace.isNotBlank()) {
            ordered.putIfAbsent(home.workspace, Project("Gitu workspace", home.workspace))
        }
        for (dir in dirs) {
            if (dir.isNotBlank()) ordered.putIfAbsent(dir, Project(basename(dir), dir))
        }
        for (run in runs) {
            val path = run.projectPath ?: continue
            if (path.isNotBlank()) {
                ordered.putIfAbsent(path, Project(run.project?.ifBlank { basename(path) } ?: basename(path), path))
            }
        }
        return ordered.values.toList()
    }

    fun artifactInlineUrl(artifactId: String): String =
        "$baseUrl/api/cowork/artifacts/${encodeQuery(artifactId)}?inline=1"

    fun buildAuthHeaders(): Map<String, String> = buildMap {
        if (accessKey.isNotBlank()) {
            put("Authorization", "Bearer $accessKey")
            put("X-Gitu-Access-Key", accessKey)
        }
        val cookieHeader = cookies.entries.joinToString("; ") { (k, v) -> "$k=$v" }
        if (cookieHeader.isNotBlank()) {
            put("Cookie", cookieHeader)
        }
    }

    fun buildMediaOkHttpClient(): OkHttpClient = httpClient.newBuilder()
        .followRedirects(true)
        .addInterceptor { chain ->
            val req = chain.request()
            val reqHost = req.url.host
            val baseHost = runCatching { java.net.URI(baseUrl).host }.getOrNull()
            if (baseHost != null && reqHost.equals(baseHost, ignoreCase = true)) {
                val b = req.newBuilder()
                buildAuthHeaders().forEach { (k, v) -> b.header(k, v) }
                chain.proceed(b.build())
            } else {
                chain.proceed(req)
            }
        }
        .build()

    suspend fun createProject(name: String): Project = request(
        "/api/projects",
        method = "POST",
        body = buildJsonObject { put("name", name.trim()) },
    )

    suspend fun listFiles(root: String, path: String = ""): FileListing =
        request("/api/mobile/files?root=${encodeQuery(root)}&path=${encodeQuery(path)}")

    suspend fun saveFile(root: String, path: String, revision: String?, content: String): JsonElement =
        request(
            "/api/mobile/files",
            method = "PUT",
            body = buildJsonObject {
                put("root", root)
                put("path", path)
                if (revision != null) put("revision", revision)
                put("content", content)
                put("approved", true)
            },
        )

    // --- Git ---

    suspend fun gitStatus(projectPath: String): GitStatus =
        request("/api/git?path=${encodeQuery(projectPath)}")

    suspend fun gitDiff(projectPath: String, file: String? = null): GitDiffResponse {
        val q = buildString {
            append("/api/git/diff?path=").append(encodeQuery(projectPath))
            if (!file.isNullOrBlank()) append("&file=").append(encodeQuery(file))
        }
        return request(q)
    }

    suspend fun gitCommit(projectPath: String, message: String): JsonElement =
        request(
            "/api/git/commit",
            method = "POST",
            body = buildJsonObject {
                put("path", projectPath)
                put("message", message)
            },
        )

    suspend fun gitPush(projectPath: String): JsonElement =
        request(
            "/api/git/push",
            method = "POST",
            body = buildJsonObject { put("path", projectPath) },
        )

    // --- Agent Runs ---

    suspend fun listRuns(): List<Run> = request("/api/runs")

    suspend fun runEvents(runId: String, after: Int = -1): EventPage =
        request("/api/mobile/runs/${encodeQuery(runId)}/events?after=$after")

    suspend fun startRun(
        goal: String,
        projectPath: String,
        mode: String = "agent",
        provider: String? = null,
        model: String? = null,
        effort: String? = null,
    ): StartRunResponse = request(
        "/api/runs",
        method = "POST",
        body = buildJsonObject {
            put("goal", goal)
            put("projectPath", projectPath)
            put("mode", mode)
            if (!provider.isNullOrBlank()) put("provider", provider)
            if (!model.isNullOrBlank()) put("model", model)
            if (!effort.isNullOrBlank()) put("effort", effort)
            put("autoApprove", false)
            put("review", mode == "agent")
        },
    )

    suspend fun sendRunMessage(runId: String, text: String): JsonElement =
        request(
            "/api/runs/${encodeQuery(runId)}/message",
            method = "POST",
            body = buildJsonObject { put("text", text) },
        )

    suspend fun stopRun(runId: String): JsonElement =
        request("/api/runs/${encodeQuery(runId)}/stop", method = "POST", body = buildJsonObject {})

    suspend fun deleteRun(runId: String): JsonElement =
        request("/api/runs/${encodeQuery(runId)}", method = "DELETE")

    suspend fun resolveApproval(approvalId: String, approved: Boolean): JsonElement =
        request(
            "/api/approvals/${encodeQuery(approvalId)}",
            method = "POST",
            body = buildJsonObject { put("approved", approved) },
        )

    suspend fun resolvePlanReview(reviewId: String, approved: Boolean, note: String): JsonElement =
        request(
            "/api/plan-review/${encodeQuery(reviewId)}",
            method = "POST",
            body = buildJsonObject {
                put("approved", approved)
                put("note", note)
            },
        )

    suspend fun submitAnswer(answerId: String, answer: String): JsonElement =
        request(
            "/api/answers/${encodeQuery(answerId)}",
            method = "POST",
            body = buildJsonObject { put("answer", answer) },
        )

    suspend fun submitRunConnection(
        runId: String,
        label: String? = null,
        provider: String? = null,
        baseUrl: String? = null,
        documentationUrl: String? = null,
        validationPath: String? = null,
        capabilities: List<String> = emptyList(),
        token: String,
        existingConnectionId: String? = null,
    ): JsonElement = request(
        "/api/runs/${encodeQuery(runId)}/connection",
        method = "POST",
        body = buildJsonObject {
            if (!existingConnectionId.isNullOrBlank()) put("id", existingConnectionId)
            if (!label.isNullOrBlank()) put("label", label.trim())
            if (!provider.isNullOrBlank()) put("provider", provider.trim().lowercase())
            if (!baseUrl.isNullOrBlank()) put("baseUrl", baseUrl.trim())
            if (!documentationUrl.isNullOrBlank()) put("documentationUrl", documentationUrl.trim())
            if (!validationPath.isNullOrBlank()) put("validationPath", validationPath.trim())
            if (capabilities.isNotEmpty()) {
                put("capabilities", JsonArray(capabilities.map { JsonPrimitive(it) }))
            }
            put("token", token.trim())
        },
    )

    suspend fun runCheckpoints(runId: String): CheckpointsResponse =
        request("/api/runs/${encodeQuery(runId)}/checkpoints")

    suspend fun restoreCheckpoint(runId: String, checkpointId: String): JsonElement =
        request(
            "/api/runs/${encodeQuery(runId)}/checkpoints/${encodeQuery(checkpointId)}/restore",
            method = "POST",
            body = buildJsonObject {},
        )

    // --- Cowork / AI Teams ---

    suspend fun listTeammates(): List<Teammate> = request<AgentsResponse>("/api/cowork/agents").agents

    suspend fun saveTeammate(
        id: String?,
        name: String,
        tagline: String,
        systemPrompt: String,
        color: String,
        shape: String? = null,
        allowShell: Boolean,
        allowWrites: Boolean,
        chiefOfStaff: Boolean,
        provider: String? = null,
        model: String? = null,
        effort: String? = null,
        updateModel: Boolean = false,
    ): Teammate = request<SaveTeammateResponse>(
        "/api/cowork/agents",
        method = "POST",
        body = buildJsonObject {
            if (!id.isNullOrBlank()) put("id", id)
            put("name", name)
            put("tagline", tagline)
            put("systemPrompt", systemPrompt)
            put(
                "avatar",
                buildJsonObject {
                    put("color", color)
                    if (!shape.isNullOrBlank()) put("shape", shape)
                },
            )
            put("allowShell", allowShell)
            put("allowWrites", allowWrites)
            put("chiefOfStaff", chiefOfStaff)
            if (updateModel) {
                if (provider.isNullOrBlank()) put("provider", JsonNull) else put("provider", provider)
                if (model.isNullOrBlank()) put("model", JsonNull) else put("model", model)
            } else {
                if (!provider.isNullOrBlank()) put("provider", provider)
                if (!model.isNullOrBlank()) put("model", model)
            }
            if (!effort.isNullOrBlank()) put("effort", effort)
        },
    ).agent

    suspend fun listConversations(): List<TeamConversation> =
        request<ConversationsResponse>("/api/cowork/conversations").conversations

    suspend fun createConversation(
        memberIds: List<String>,
        title: String? = null,
        chiefId: String? = null,
    ): TeamConversation = request<CreateConversationResponse>(
        "/api/cowork/conversations",
        method = "POST",
        body = buildJsonObject {
            put("kind", if (memberIds.size > 1) "group" else "dm")
            put("memberIds", JsonArray(memberIds.map { JsonPrimitive(it) }))
            if (!title.isNullOrBlank()) put("title", title)
            if (!chiefId.isNullOrBlank()) put("chiefId", chiefId)
        },
    ).conversation

    suspend fun deleteTeammate(agentId: String): JsonElement = request(
        "/api/cowork/agents/${encodeQuery(agentId)}",
        method = "DELETE",
    )

    suspend fun uploadAgentAvatar(agentId: String, dataUrl: String): UploadAvatarResponse = request(
        "/api/cowork/agents/${encodeQuery(agentId)}/avatar",
        method = "POST",
        body = buildJsonObject {
            put("dataUrl", dataUrl)
        },
    )

    suspend fun deleteAgentAvatar(agentId: String): UploadAvatarResponse = request(
        "/api/cowork/agents/${encodeQuery(agentId)}/avatar",
        method = "DELETE",
    )

    suspend fun teamChat(conversationId: String, threadId: String = "main"): TeamView {
        val threadParam = if (threadId.isBlank() || threadId == "main") "" else "&thread=${encodeQuery(threadId)}"
        return request(
            "/api/cowork/conversations/${encodeQuery(conversationId)}/messages?rosterRevision=0$threadParam",
        )
    }

    suspend fun sendTeamMessage(
        conversationId: String,
        messageId: String,
        text: String,
        threadId: String = "main",
        files: List<PendingAttachment> = emptyList(),
        referencedMessageIds: List<String> = emptyList(),
    ): SendTeamMessageResponse = request(
        "/api/cowork/conversations/${encodeQuery(conversationId)}/messages",
        method = "POST",
        body = buildJsonObject {
            put("id", messageId)
            put("text", text)
            // Main conversation thread MUST omit threadId — server validates threadId against created sub-threads.
            if (threadId.isNotBlank() && threadId != "main") {
                put("threadId", threadId)
            }
            if (referencedMessageIds.isNotEmpty()) {
                put("referencedMessageIds", JsonArray(referencedMessageIds.map { JsonPrimitive(it) }))
            }
            if (files.isNotEmpty()) {
                put(
                    "files",
                    JsonArray(
                        files.map { f ->
                            buildJsonObject {
                                put("name", f.name)
                                put("type", f.mime)
                                put("dataUrl", f.dataUrl)
                            }
                        },
                    ),
                )
            }
        },
    )

    suspend fun editTeamMessage(
        conversationId: String,
        messageId: String,
        text: String,
        revision: Int,
    ): JsonElement = request(
        "/api/cowork/conversations/${encodeQuery(conversationId)}/messages/${encodeQuery(messageId)}",
        method = "PATCH",
        body = buildJsonObject {
            put("text", text)
            put("revision", revision)
        },
    )

    suspend fun retryTeamMessage(
        conversationId: String,
        messageId: String,
        attempt: Int,
    ): JsonElement = request(
        "/api/cowork/conversations/${encodeQuery(conversationId)}/messages/${encodeQuery(messageId)}/retry",
        method = "POST",
        body = buildJsonObject {
            put("attempt", attempt)
        },
    )

    suspend fun deleteTeamMessage(
        conversationId: String,
        messageId: String,
    ): JsonElement = request(
        "/api/cowork/conversations/${encodeQuery(conversationId)}/messages/${encodeQuery(messageId)}",
        method = "DELETE",
    )

    suspend fun deleteTeamRequest(requestId: String): JsonElement = request(
        "/api/cowork/requests/${encodeQuery(requestId)}",
        method = "DELETE",
    )

    suspend fun getAgentComputer(agentId: String): AgentComputerResponse = request(
        "/api/cowork/agents/${encodeQuery(agentId)}/computer",
        method = "GET",
    )

    suspend fun agentComputerAction(
        agentId: String,
        action: String,
        input: JsonObject? = null,
    ): AgentComputerResponse = request(
        "/api/cowork/agents/${encodeQuery(agentId)}/computer",
        method = "POST",
        body = buildJsonObject {
            put("action", action)
            if (input != null) put("input", input)
        },
    )

    suspend fun agentComputerInput(
        agentId: String,
        input: JsonObject,
    ): JsonElement = request(
        "/api/cowork/agents/${encodeQuery(agentId)}/computer",
        method = "POST",
        body = buildJsonObject {
            put("action", "input")
            put("input", input)
        },
    )

    suspend fun serverBrowserAction(
        agentId: String,
        action: String,
    ): JsonElement = request(
        "/api/server-browser/${encodeQuery(agentId)}",
        method = "POST",
        body = buildJsonObject {
            put("action", action)
        },
    )

    fun agentComputerViewUrl(agentId: String, preview: Boolean = false): String {
        val suffix = if (preview) "?preview=1" else ""
        return "$baseUrl/api/cowork/agents/${encodeQuery(agentId)}/computer/view$suffix"
    }

    fun serverBrowserViewUrl(agentId: String): String =
        "$baseUrl/api/server-browser/${encodeQuery(agentId)}/view"

    suspend fun addConversationFolder(conversationId: String, path: String, label: String? = null): TeamFolder =
        request<ConversationFolderResponse>(
            "/api/cowork/conversations/${encodeQuery(conversationId)}/folders",
            method = "POST",
            body = buildJsonObject {
                put("path", path)
                if (!label.isNullOrBlank()) put("label", label)
            },
        ).folder

    suspend fun removeConversationFolder(conversationId: String, folderId: String): JsonElement =
        request(
            "/api/cowork/conversations/${encodeQuery(conversationId)}/folders/${encodeQuery(folderId)}",
            method = "DELETE",
        )

    // --- Connected Apps & Custom Connections ---

    suspend fun connectedApps(agentId: String = "", search: String = ""): ConnectedAppsResponse {
        val parts = mutableListOf<String>()
        if (agentId.isNotBlank()) parts.add("agentId=${encodeQuery(agentId)}")
        if (search.isNotBlank()) parts.add("search=${encodeQuery(search)}")
        val qs = if (parts.isEmpty()) "" else "?${parts.joinToString("&")}"
        return request("/api/connected-apps$qs")
    }

    suspend fun connectApp(
        agentId: String,
        service: String,
        requestId: String? = null,
        fields: Map<String, String> = emptyMap(),
        authConfigId: String? = null,
        authScheme: String? = null,
        alias: String? = null,
    ): ConnectAppResponse = request(
        "/api/connected-apps/connect",
        method = "POST",
        body = buildJsonObject {
            put("agentId", agentId)
            put("service", service)
            if (!requestId.isNullOrBlank()) put("requestId", requestId)
            if (!authConfigId.isNullOrBlank()) put("authConfigId", authConfigId)
            if (!authScheme.isNullOrBlank()) put("authScheme", authScheme)
            if (!alias.isNullOrBlank()) put("alias", alias)
            if (fields.isNotEmpty()) {
                put("fields", buildJsonObject { fields.forEach { (k, v) -> put(k, v) } })
            }
        },
    )

    suspend fun detectMailbox(address: String): MailDetectResponse =
        request("/api/connected-apps/mail/detect?address=${encodeQuery(address.trim())}")

    suspend fun assignAppAccount(agentId: String, accountId: String): JsonElement = request(
        "/api/connected-apps/assign",
        method = "POST",
        body = buildJsonObject {
            put("agentId", agentId)
            put("accountId", accountId)
        },
    )

    suspend fun disconnectAppAccount(agentId: String, accountId: String): JsonElement = request(
        "/api/connected-apps/disconnect",
        method = "POST",
        body = buildJsonObject {
            put("agentId", agentId)
            put("accountId", accountId)
        },
    )

    suspend fun revokeAppPermission(permissionId: String): JsonElement = request(
        "/api/connected-apps/permissions/${encodeQuery(permissionId)}",
        method = "DELETE",
    )

    suspend fun configureComposio(apiKey: String): JsonElement = request(
        "/api/connected-apps/configure",
        method = "POST",
        body = buildJsonObject { put("apiKey", apiKey.trim()) },
    )

    suspend fun connectMailbox(
        agentId: String,
        address: String,
        password: String,
        imapHost: String,
        imapPort: Int,
        smtpHost: String,
        smtpPort: Int,
    ): JsonElement = request(
        "/api/connected-apps/mail",
        method = "POST",
        body = buildJsonObject {
            put("agentId", agentId)
            put("address", address.trim())
            put("username", address.trim())
            put("password", password)
            put("imap", buildJsonObject { put("host", imapHost.trim()); put("port", imapPort); put("secure", imapPort == 993) })
            put("smtp", buildJsonObject { put("host", smtpHost.trim()); put("port", smtpPort); put("secure", smtpPort == 465) })
        },
    )

    suspend fun listCustomConnections(): List<CustomConnectionProfile> =
        runCatching { request<CustomConnectionsResponse>("/api/connections").connections }.getOrDefault(emptyList())

    suspend fun saveCustomConnection(
        label: String,
        provider: String,
        baseUrl: String,
        token: String,
        validationPath: String = "/",
        id: String? = null,
        documentationUrl: String? = null,
        capabilities: List<String> = listOf("connection.discover"),
        authType: String = "auto",
        authHeader: String? = null,
        authPrefix: String? = null,
        existingOperations: List<CustomConnectionOperation> = emptyList(),
        structuredAuthJson: JsonElement? = null,
    ): CustomConnectionProfile {
        val cleanCaps = capabilities.map { it.trim() }.filter { it.isNotBlank() }.ifEmpty { listOf("connection.discover") }
        val keptOps = existingOperations
            .filter { it.id != "validate" && cleanCaps.contains(it.capability) }
            .map { op ->
                buildJsonObject {
                    put("id", op.id)
                    put("label", op.label)
                    put("capability", op.capability)
                    put("method", op.method)
                    put("path", op.path)
                    put("risk", op.risk)
                }
            }
        val validateOp = buildJsonObject {
            put("id", "validate")
            put("label", "Test connection")
            put("capability", cleanCaps.first())
            put("method", "GET")
            put("path", validationPath.trim().ifBlank { "/" })
            put("risk", "read")
        }
        return request<SaveCustomConnectionResponse>(
            "/api/connections",
            method = "POST",
            body = buildJsonObject {
                if (!id.isNullOrBlank()) put("id", id)
                put("label", label.trim())
                put("provider", provider.trim().lowercase().ifBlank { "custom" })
                put("baseUrl", baseUrl.trim())
                if (!documentationUrl.isNullOrBlank()) put("documentationUrl", documentationUrl.trim())
                when {
                    structuredAuthJson != null -> put("auth", structuredAuthJson)
                    authType == "header" -> put(
                        "auth",
                        buildJsonObject {
                            put("type", "header")
                            put("header", authHeader?.trim().orEmpty())
                            if (!authPrefix.isNullOrBlank()) put("prefix", authPrefix.trim())
                        },
                    )
                    authType == "bearer" -> put("auth", buildJsonObject { put("type", "bearer") })
                    else -> put("auth", JsonNull)
                }
                put("capabilities", JsonArray(cleanCaps.map { JsonPrimitive(it) }))
                put("operations", JsonArray(keptOps + validateOp))
                if (token.isNotBlank()) put("token", token.trim())
            },
        ).connection
    }

    suspend fun saveCredentialForRequest(
        requestId: String,
        setupJson: String,
        token: String? = null,
        values: Map<String, String>? = null,
    ): CustomConnectionProfile = request<SaveCustomConnectionResponse>(
        "/api/cowork/requests/${encodeQuery(requestId)}/credential-save",
        method = "POST",
        body = buildJsonObject {
            put("setup", setupJson)
            if (values != null && values.isNotEmpty()) {
                put("values", buildJsonObject { values.forEach { (k, v) -> put(k, v) } })
            } else if (token != null) {
                put("token", token)
            }
        },
    ).connection

    suspend fun probeSshHostKey(requestId: String, baseUrl: String): String {
        val obj = request<JsonObject>(
            "/api/cowork/requests/${encodeQuery(requestId)}/ssh-host-key",
            method = "POST",
            body = buildJsonObject { put("baseUrl", baseUrl.trim()) },
        )
        return obj["fingerprint"]?.jsonPrimitive?.contentOrNull.orEmpty()
    }

    suspend fun saveSshCredentialForRequest(
        requestId: String,
        label: String,
        baseUrl: String,
        password: String,
        hostFingerprint: String,
    ): String {
        val obj = request<JsonObject>(
            "/api/cowork/requests/${encodeQuery(requestId)}/ssh-save",
            method = "POST",
            body = buildJsonObject {
                put("label", label.trim())
                put("baseUrl", baseUrl.trim())
                put("password", password)
                put("hostFingerprint", hostFingerprint)
            },
        )
        val conn = obj["connection"] as? JsonObject
        return conn?.get("id")?.jsonPrimitive?.contentOrNull.orEmpty()
    }

    suspend fun submitBrowserAuthForRequest(
        requestId: String,
        setupJson: String,
        values: Map<String, String>,
        terms: List<String>,
    ): JsonElement = request(
        "/api/cowork/requests/${encodeQuery(requestId)}/browser-auth",
        method = "POST",
        body = buildJsonObject {
            put("setup", setupJson)
            put("values", buildJsonObject { values.forEach { (k, v) -> put(k, v) } })
            put("terms", JsonArray(terms.map { JsonPrimitive(it) }))
        },
    )

    suspend fun testCustomConnection(id: String): JsonElement = request(
        "/api/connections/${encodeQuery(id)}/test",
        method = "POST",
        body = buildJsonObject {},
    )

    suspend fun deleteCustomConnection(id: String): JsonElement = request(
        "/api/connections/${encodeQuery(id)}",
        method = "DELETE",
    )

    suspend fun stopTeamChat(conversationId: String): JsonElement =
        request(
            "/api/cowork/conversations/${encodeQuery(conversationId)}/stop",
            method = "POST",
            body = buildJsonObject {},
        )

    suspend fun createTeamThread(conversationId: String, title: String): TeamThread =
        request<CreateThreadResponse>(
            "/api/cowork/conversations/${encodeQuery(conversationId)}/threads",
            method = "POST",
            body = buildJsonObject { put("title", title) },
        ).thread

    suspend fun resolveTeamRequest(
        requestId: String,
        action: String,
        response: String? = null,
        connectionId: String? = null,
        setupJson: String? = null,
        reviewedArgs: JsonObject? = null,
        rememberForChief: Boolean = false,
        chiefPattern: String? = null,
        chiefScope: String? = null,
    ): JsonElement = request(
        "/api/cowork/requests/${encodeQuery(requestId)}",
        method = "POST",
        body = buildJsonObject {
            put("action", action)
            if (response != null) put("response", response)
            if (!connectionId.isNullOrBlank()) put("connectionId", connectionId)
            if (!setupJson.isNullOrBlank()) put("setup", setupJson)
            if (reviewedArgs != null) put("reviewedArgs", reviewedArgs)
            if (rememberForChief) {
                put("rememberForChief", true)
                if (!chiefPattern.isNullOrBlank()) put("chiefPattern", chiefPattern.trim())
                if (!chiefScope.isNullOrBlank()) put("chiefScope", chiefScope)
            }
        },
    )

    // --- Shared Inbox ---

    suspend fun inboxState(): InboxStateResponse = request("/api/inbox/state")

    suspend fun inboxMessagesResponse(roomId: String): InboxMessagesResponse =
        request("/api/inbox/rooms/${encodeQuery(roomId)}/messages")

    suspend fun inboxMessages(roomId: String): List<InboxMessage> =
        inboxMessagesResponse(roomId).messages

    suspend fun sendInboxMessage(
        roomId: String,
        text: String,
        visibility: String = "public",
    ): JsonElement =
        request(
            "/api/inbox/rooms/${encodeQuery(roomId)}/messages",
            method = "POST",
            body = buildJsonObject {
                put("text", text)
                if (visibility == "owner_only") put("visibility", "owner_only")
            },
        )

    suspend fun createInboxRoom(
        title: String,
        kind: String = "group",
        agentIds: List<String> = emptyList(),
        memberIds: List<String> = emptyList(),
        agentTriggerMode: String = if (kind == "group") "mention" else "auto",
        notesVisibility: String = "owner_only",
        projectPath: String? = null,
    ): InboxCreateRoomResponse =
        request(
            "/api/inbox/rooms",
            method = "POST",
            body = buildJsonObject {
                put("title", title)
                put("kind", kind)
                put("activeAgentIds", JsonArray(agentIds.map { JsonPrimitive(it) }))
                if (memberIds.isNotEmpty()) put("memberIds", JsonArray(memberIds.map { JsonPrimitive(it) }))
                put("agentTriggerMode", agentTriggerMode)
                put("notesVisibility", notesVisibility)
                if (!projectPath.isNullOrBlank()) put("projectPath", projectPath.trim())
            },
        )

    suspend fun updateInboxRoom(
        roomId: String,
        title: String? = null,
        memberIds: List<String>? = null,
        activeAgentIds: List<String>? = null,
        agentTriggerMode: String? = null,
        toolPolicyOverride: String? = null,
        clearToolPolicyOverride: Boolean = false,
        notesVisibility: String? = null,
        projectPath: String? = null,
        clearProjectPath: Boolean = false,
    ): JsonElement =
        request(
            "/api/inbox/rooms/${encodeQuery(roomId)}",
            method = "PATCH",
            body = buildJsonObject {
                if (title != null) put("title", title)
                if (memberIds != null) put("memberIds", JsonArray(memberIds.map { JsonPrimitive(it) }))
                if (activeAgentIds != null) put("activeAgentIds", JsonArray(activeAgentIds.map { JsonPrimitive(it) }))
                if (agentTriggerMode != null) put("agentTriggerMode", agentTriggerMode)
                if (clearToolPolicyOverride) put("toolPolicyOverride", "")
                else if (toolPolicyOverride != null) put("toolPolicyOverride", toolPolicyOverride)
                if (notesVisibility != null) put("notesVisibility", notesVisibility)
                if (clearProjectPath) put("projectPath", "")
                else if (projectPath != null) put("projectPath", projectPath)
            },
        )

    suspend fun deleteInboxRoom(roomId: String): JsonElement =
        request(
            "/api/inbox/rooms/${encodeQuery(roomId)}",
            method = "DELETE",
        )

    suspend fun inboxWorkspace(roomId: String): InboxWorkspaceResponse =
        request("/api/inbox/rooms/${encodeQuery(roomId)}/workspace")

    suspend fun summarizeInboxMeeting(
        roomId: String,
        focus: String? = null,
    ): InboxSummarizeResponse {
        val raw = executeRawJson(
            path = "/api/inbox/rooms/${encodeQuery(roomId)}/summarize",
            method = "POST",
            body = buildJsonObject {
                if (!focus.isNullOrBlank()) put("focus", focus.trim())
            },
            readTimeoutSeconds = 90L,
        )
        return json.decodeFromString(raw)
    }

    suspend fun addInboxNote(
        roomId: String,
        kind: String,
        title: String,
        content: String,
    ): JsonElement =
        request(
            "/api/inbox/rooms/${encodeQuery(roomId)}/notes",
            method = "POST",
            body = buildJsonObject {
                put("kind", kind)
                put("title", title)
                put("content", content)
            },
        )

    suspend fun deleteInboxNote(roomId: String, noteId: String): JsonElement =
        request(
            "/api/inbox/rooms/${encodeQuery(roomId)}/notes/${encodeQuery(noteId)}",
            method = "DELETE",
        )

    suspend fun shareInboxNote(
        roomId: String,
        noteId: String,
        text: String? = null,
        includeTasks: Boolean = false,
    ): JsonElement =
        request(
            "/api/inbox/rooms/${encodeQuery(roomId)}/notes/${encodeQuery(noteId)}/share",
            method = "POST",
            body = buildJsonObject {
                if (!text.isNullOrBlank()) put("text", text.trim())
                put("includeTasks", includeTasks)
            },
        )

    suspend fun addInboxTask(
        roomId: String,
        title: String,
        description: String? = null,
        kind: String = "action",
        assignee: String? = null,
        projectPath: String? = null,
    ): JsonElement =
        request(
            "/api/inbox/rooms/${encodeQuery(roomId)}/tasks",
            method = "POST",
            body = buildJsonObject {
                put("title", title)
                if (!description.isNullOrBlank()) put("description", description.trim())
                put("kind", kind)
                if (!assignee.isNullOrBlank()) put("assignee", assignee.trim())
                if (!projectPath.isNullOrBlank()) put("projectPath", projectPath.trim())
            },
        )

    suspend fun updateInboxTask(
        roomId: String,
        taskId: String,
        status: String? = null,
        title: String? = null,
        kind: String? = null,
        assignee: String? = null,
    ): JsonElement =
        request(
            "/api/inbox/rooms/${encodeQuery(roomId)}/tasks/${encodeQuery(taskId)}",
            method = "PATCH",
            body = buildJsonObject {
                if (status != null) put("status", status)
                if (title != null) put("title", title)
                if (kind != null) put("kind", kind)
                if (assignee != null) put("assignee", assignee)
            },
        )

    suspend fun deleteInboxTask(roomId: String, taskId: String): JsonElement =
        request(
            "/api/inbox/rooms/${encodeQuery(roomId)}/tasks/${encodeQuery(taskId)}",
            method = "DELETE",
        )

    suspend fun delegateInboxTaskCode(
        roomId: String,
        taskId: String,
        projectPath: String? = null,
        mode: String = "agent",
    ): InboxDelegateCodeResponse =
        request(
            "/api/inbox/rooms/${encodeQuery(roomId)}/tasks/${encodeQuery(taskId)}/delegate-code",
            method = "POST",
            body = buildJsonObject {
                if (!projectPath.isNullOrBlank()) put("projectPath", projectPath.trim())
                put("mode", mode)
            },
        )

    suspend fun delegateInboxTaskSubAgent(
        roomId: String,
        taskId: String,
        role: String = "research-specialist",
        saveAsNote: Boolean = true,
    ): InboxDelegateSubAgentResponse {
        val raw = executeRawJson(
            path = "/api/inbox/rooms/${encodeQuery(roomId)}/tasks/${encodeQuery(taskId)}/delegate-subagent",
            method = "POST",
            body = buildJsonObject {
                put("role", role)
                put("saveAsNote", saveAsNote)
            },
            readTimeoutSeconds = 90L,
        )
        return json.decodeFromString(raw)
    }

    suspend fun createInboxInvite(
        label: String,
        scopeType: String = "workspace",
        toolPolicy: String = "read_only",
        roomId: String? = null,
        targetEmail: String? = null,
        defaultAgentIds: List<String> = emptyList(),
        maxUses: Int = 1,
        expiresInDays: Int = 7,
    ): InboxCreateInviteResponse =
        request(
            "/api/inbox/invites",
            method = "POST",
            body = buildJsonObject {
                if (label.isNotBlank()) put("label", label)
                put("scopeType", if (!roomId.isNullOrBlank()) "group" else scopeType)
                if (!roomId.isNullOrBlank()) put("roomId", roomId)
                if (!targetEmail.isNullOrBlank()) put("targetEmail", targetEmail.trim())
                if (defaultAgentIds.isNotEmpty()) {
                    put("defaultAgentIds", JsonArray(defaultAgentIds.map { JsonPrimitive(it) }))
                }
                put("toolPolicy", toolPolicy)
                put("maxUses", maxUses.coerceAtLeast(1))
                put("expiresInDays", expiresInDays.coerceAtLeast(1))
            },
        )

    suspend fun revokeInboxInvite(inviteId: String): JsonElement =
        request(
            "/api/inbox/invites/${encodeQuery(inviteId)}/revoke",
            method = "POST",
            body = buildJsonObject {},
        )

    suspend fun updateInboxMember(
        memberId: String,
        status: String? = null,
        toolPolicy: String? = null,
        allowedAgentIds: List<String>? = null,
    ): JsonElement =
        request(
            "/api/inbox/members/${encodeQuery(memberId)}",
            method = "PATCH",
            body = buildJsonObject {
                if (status != null) put("status", status)
                if (toolPolicy != null) put("toolPolicy", toolPolicy)
                if (allowedAgentIds != null) {
                    put("allowedAgentIds", JsonArray(allowedAgentIds.map { JsonPrimitive(it) }))
                }
            },
        )

    // --- Settings, Models, Chief, Cron, Local Link, Push ---

    suspend fun modelsCatalog(forceRefresh: Boolean = false): ModelsCatalogResponse =
        request(if (forceRefresh) "/api/models?refresh=1" else "/api/models")

    suspend fun saveModelSelection(provider: String, model: String): ModelSelection = request(
        "/api/model-selection",
        method = "POST",
        body = buildJsonObject {
            put("provider", provider)
            put("model", model)
        },
    )

    suspend fun codingPermissions(): CodingPermissions = request("/api/coding-permissions")

    suspend fun updateCodingPermissions(access: String): CodingPermissions =
        request(
            "/api/coding-permissions",
            method = "POST",
            body = buildJsonObject { put("access", access) },
        )

    suspend fun updateAutonomy(persistent: Boolean, maxCostUsd: Double?): AutonomySettings =
        request(
            "/api/autonomy",
            method = "POST",
            body = buildJsonObject {
                put("persistent", persistent)
                if (maxCostUsd == null) put("maxCostUsd", JsonNull) else put("maxCostUsd", maxCostUsd)
            },
        )

    suspend fun chiefSettings(): ChiefSettingsResponse = request("/api/chief/settings")

    suspend fun updateChiefPreset(preset: String): JsonElement =
        request(
            "/api/chief/settings",
            method = "POST",
            body = buildJsonObject { put("preset", preset) },
        )

    suspend fun cronJobs(): List<CronJob> =
        runCatching { request<CronListResponse>("/api/cron").jobs }.getOrElse { emptyList() }

    suspend fun localLinkStatus(): LocalLinkStatusResponse =
        request("/api/local-link/status")

    suspend fun pushStatus(deviceId: String): PushStatus =
        request("/api/mobile/push?deviceId=${encodeQuery(deviceId)}")

    suspend fun registerPush(deviceId: String, token: String): PushStatus =
        request(
            "/api/mobile/push",
            method = "POST",
            body = buildJsonObject {
                put("deviceId", deviceId)
                put("token", token)
            },
        )

    suspend fun unregisterPush(deviceId: String): PushStatus =
        request(
            "/api/mobile/push",
            method = "DELETE",
            body = buildJsonObject { put("deviceId", deviceId) },
        )

    suspend fun sendTestPush(deviceId: String): JsonElement =
        request(
            "/api/mobile/push/test",
            method = "POST",
            body = buildJsonObject { put("deviceId", deviceId) },
        )

    // --- Native LiveKit Voice Calling ---

    suspend fun voiceConfig(): VoiceConfigStatus = request("/api/voice/config")

    suspend fun configureVoice(
        url: String,
        apiKey: String,
        apiSecret: String,
        agentName: String = "gitu-voice",
    ): VoiceConfigStatus = request(
        "/api/voice/config",
        method = "PUT",
        body = buildJsonObject {
            put("url", url.trim())
            put("apiKey", apiKey.trim())
            put("apiSecret", apiSecret.trim())
            put("agentName", agentName.trim().ifBlank { "gitu-voice" })
        },
    )

    suspend fun prepareVoiceWorker(): VoiceWorkerStatus = request(
        "/api/voice/prepare",
        method = "POST",
        body = buildJsonObject {},
    )

    suspend fun voiceWorkerStatus(): VoiceWorkerStatus = request("/api/voice/worker")

    suspend fun startVoiceCall(
        kind: String,
        conversationId: String? = null,
        threadId: String? = null,
        agentId: String? = null,
        runId: String? = null,
        provider: String? = null,
        model: String? = null,
        projectPath: String? = null,
    ): VoiceCallStartResponse = request(
        "/api/voice/calls",
        method = "POST",
        body = buildJsonObject {
            put("kind", kind)
            if (!conversationId.isNullOrBlank()) put("conversationId", conversationId)
            if (!threadId.isNullOrBlank() && threadId != "main") put("threadId", threadId)
            if (!agentId.isNullOrBlank()) put("agentId", agentId)
            if (!runId.isNullOrBlank()) put("runId", runId)
            if (!provider.isNullOrBlank()) put("provider", provider)
            if (!model.isNullOrBlank()) put("model", model)
            if (!projectPath.isNullOrBlank()) put("projectPath", projectPath)
        },
    )

    /**
     * Calls POST /api/voice/calls/{callId}/reply with an extended read timeout so
     * multi-step agent turns finish cleanly, returning the raw JSON string for the
     * LiveKit RPC bridge (`gitu.voice.reply`).
     */
    suspend fun voiceCallReplyRaw(
        callId: String,
        turnId: String,
        text: String,
    ): String {
        val body = buildJsonObject {
            put("id", turnId)
            put("text", text)
        }
        return executeRawJson(
            path = "/api/voice/calls/${encodeQuery(callId)}/reply",
            method = "POST",
            body = body,
            readTimeoutSeconds = 120L,
        )
    }

    suspend fun endVoiceCall(callId: String): JsonElement = request(
        "/api/voice/calls/${encodeQuery(callId)}",
        method = "DELETE",
    )

    // --- Core HTTP ---

    private suspend inline fun <reified T> request(
        path: String,
        method: String = "GET",
        body: JsonElement? = null,
    ): T {
        require(path.startsWith("/api/")) { "Invalid Gitu API route." }
        return requestRaw(path, method, body)
    }

    private suspend inline fun <reified T> requestRaw(
        path: String,
        method: String = "GET",
        body: JsonElement? = null,
    ): T {
        val rawText = executeRawJson(path, method, body)
        return try {
            json.decodeFromString<T>(rawText)
        } catch (err: Exception) {
            throw GituApiException("Unexpected server response on $path: ${err.message}")
        }
    }

    private suspend fun executeRawJson(
        path: String,
        method: String,
        body: JsonElement?,
        readTimeoutSeconds: Long? = null,
    ): String = withContext(Dispatchers.IO) {
        val builder = Request.Builder()
            .url("$baseUrl$path")
            .header("Origin", baseUrl)
        if (accessKey.isNotBlank()) {
            builder.header("Authorization", "Bearer $accessKey")
        }
        if (path.startsWith("/api/voice/") && pikpamToken.isNotBlank()) {
            builder.header("X-Pikpam-Token", pikpamToken)
        }
        if (cookies.isNotEmpty()) {
            builder.header("Cookie", cookies.entries.joinToString("; ") { "${it.key}=${it.value}" })
        }

        val requestBody = body?.toString()?.toRequestBody(JSON_MEDIA)
        when (method.uppercase()) {
            "GET" -> builder.get()
            "POST" -> builder.post(requestBody ?: "{}".toRequestBody(JSON_MEDIA))
            "PUT" -> builder.put(requestBody ?: "{}".toRequestBody(JSON_MEDIA))
            "PATCH" -> builder.patch(requestBody ?: "{}".toRequestBody(JSON_MEDIA))
            "DELETE" -> if (requestBody != null) builder.delete(requestBody) else builder.delete()
            else -> builder.method(method, requestBody)
        }

        val callClient = if (readTimeoutSeconds != null) {
            httpClient.newBuilder()
                .readTimeout(readTimeoutSeconds, TimeUnit.SECONDS)
                .build()
        } else {
            httpClient
        }

        val response = try {
            callClient.newCall(builder.build()).execute()
        } catch (err: IOException) {
            throw GituApiException("Could not reach the Gitu server: ${err.message ?: "network error"}")
        }

        response.use { res ->
            val rawText = res.body?.string().orEmpty()
            for (setCookie in res.headers("Set-Cookie")) {
                val pair = setCookie.substringBefore(';').trim()
                val eq = pair.indexOf('=')
                if (eq > 0) {
                    val name = pair.substring(0, eq).trim()
                    val value = pair.substring(eq + 1).trim()
                    if (value.isEmpty() || setCookie.contains("Max-Age=0", ignoreCase = true)) {
                        cookies.remove(name)
                    } else {
                        cookies[name] = value
                    }
                }
            }

            if (!res.isSuccessful) {
                val errPayload = runCatching { json.decodeFromString<ErrorPayload>(rawText) }.getOrNull()
                if (errPayload?.code == "APP_LOCKED") {
                    throw GituApiException(
                        "Your session is locked. Sign in again with your app password.",
                        statusCode = res.code,
                        code = errPayload.code,
                    )
                }
                val message = when {
                    res.code == 401 && !path.startsWith("/api/auth/") ->
                        errPayload?.error ?: "Unauthorized. Check your access key or sign in again."
                    !errPayload?.error.isNullOrBlank() -> errPayload!!.error!!
                    else -> "Request failed (${res.code})."
                }
                throw GituApiException(message, statusCode = res.code, code = errPayload?.code)
            }

            rawText
        }
    }

    private fun basename(path: String): String =
        path.replace('\\', '/').trimEnd('/').substringAfterLast('/').ifBlank { path }
}
