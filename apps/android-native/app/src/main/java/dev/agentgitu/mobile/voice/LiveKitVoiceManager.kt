package dev.agentgitu.mobile.voice

import android.content.Context
import android.media.AudioManager
import com.twilio.audioswitch.AudioDevice
import dev.agentgitu.mobile.data.network.GituApiClient
import dev.agentgitu.mobile.data.network.GituApiException
import dev.agentgitu.mobile.data.network.PikpamClient
import dev.agentgitu.mobile.ui.components.ChatMessageFilter
import io.livekit.android.LiveKit
import io.livekit.android.audio.AudioSwitchHandler
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.room.Room
import io.livekit.android.room.participant.Participant
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger

/**
 * Native Android LiveKit voice call controller implementing Agent Gitu's full
 * voice protocol (`/api/voice/calls` + LiveKit RPC `gitu.voice.reply` & `gitu.voice.status`
 * + `lk.transcription` text stream + `lk.agent.state` attribute tracking), with
 * automatic fallback to Pikpam's Managed LiveKit API (`https://pikpam.com/api/voice/token`)
 * so voice calling works without asking for API keys even against older Cloud VPS servers.
 */
class LiveKitVoiceManager(
    private val appContext: Context,
    private val scope: CoroutineScope,
    private val pikpamClient: PikpamClient,
    private val onReplyAccepted: (target: VoiceCallTarget, runId: String?) -> Unit,
    private val onNotice: (message: String, isError: Boolean) -> Unit,
) {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val generationCounter = AtomicInteger(0)

    private var activeRoom: Room? = null
    private var activeCallId: String? = null
    private var activeApi: GituApiClient? = null
    private var activeTarget: VoiceCallTarget? = null
    private var directPikpamRoomName: String? = null
    private var directPikpamToken: String? = null
    private var workerReady: Boolean = false
    private var replyError: String? = null

    private var callJob: Job? = null
    private var roomEventsJob: Job? = null
    private var timerJob: Job? = null
    private var readyWatchdogJob: Job? = null

    private val _state = MutableStateFlow(VoiceCallUiState())
    val state: StateFlow<VoiceCallUiState> = _state.asStateFlow()

    fun startCall(client: GituApiClient, target: VoiceCallTarget) {
        val current = _state.value
        if (current.active && current.target == target && current.phase != "error") {
            _state.update { it.copy(minimized = false) }
            return
        }

        callJob?.cancel()
        callJob = scope.launch {
            if (activeRoom != null || activeCallId != null) {
                teardownCallInternal(notifyServer = true, resetState = false)
            }

            val gen = generationCounter.incrementAndGet()
            activeApi = client
            activeTarget = target
            workerReady = false
            replyError = null

            val subtitle = if (target.kind == "main") "Coding Voice" else "Cowork Voice"
            _state.value = VoiceCallUiState(
                active = true,
                minimized = false,
                target = target,
                title = target.displayName.ifBlank { "Agent Gitu" },
                subtitle = subtitle,
                avatarShape = target.avatarShape,
                avatarColor = target.avatarColor,
                phase = "preparing",
                statusText = "Checking LiveKit voice…",
                speakerOn = true,
                muted = false,
            )

            try {
                // 1. Check LiveKit configuration on the connected Agent Gitu server
                val serverConfig = runCatching { client.voiceConfig() }.getOrNull()
                if (gen != generationCounter.get()) return@launch

                val phonePikpamToken = client.currentPikpamToken
                val useDirectPikpam: Boolean
                val callId: String
                val roomUrl: String
                val roomToken: String
                val resolvedTitle: String
                val resolvedMode: String

                if (serverConfig?.configured == true) {
                    useDirectPikpam = false
                    val isPikpamManaged = serverConfig.mode.equals("pikpam", ignoreCase = true)
                    _state.update {
                        it.copy(
                            mode = serverConfig.mode,
                            subtitle = if (isPikpamManaged) {
                                if (target.kind == "main") "Pikpam Coding Voice" else "Pikpam Cowork Voice"
                            } else {
                                subtitle
                            },
                        )
                    }
                    if (!isPikpamManaged && serverConfig.worker?.phase != "ready") {
                        _state.update { it.copy(phase = "preparing", statusText = "Preparing live voice…") }
                        prepareWorkerUntilReady(client, gen)
                        if (gen != generationCounter.get()) return@launch
                    }

                    _state.update { it.copy(phase = "connecting", statusText = "Dialing ${target.displayName}…") }
                    val started = client.startVoiceCall(
                        kind = target.kind,
                        conversationId = target.conversationId,
                        threadId = target.threadId,
                        agentId = target.agentId,
                        runId = target.runId,
                        provider = target.provider,
                        model = target.model,
                        projectPath = target.projectPath,
                    )
                    if (gen != generationCounter.get()) {
                        runCatching { client.endVoiceCall(started.callId) }
                        return@launch
                    }
                    callId = started.callId
                    roomUrl = started.url
                    roomToken = started.token
                    resolvedTitle = started.name.ifBlank { target.displayName.ifBlank { "Agent Gitu" } }
                    resolvedMode = started.mode.ifBlank { serverConfig.mode }
                } else if (phonePikpamToken.isNotBlank()) {
                    // Fallback: Connect directly via Pikpam's Managed LiveKit API so users signed
                    // into Pikpam NEVER get prompted for LiveKit API keys (even on older Cloud VPS servers).
                    useDirectPikpam = true
                    _state.update {
                        it.copy(
                            mode = "pikpam",
                            subtitle = if (target.kind == "main") "Pikpam Coding Voice" else "Pikpam Cowork Voice",
                            phase = "preparing",
                            statusText = "Connecting via Pikpam Voice…",
                        )
                    }
                    val pkStatus = pikpamClient.voiceStatus(phonePikpamToken)
                    if (gen != generationCounter.get()) return@launch
                    if (!pkStatus.available) {
                        _state.update {
                            it.copy(
                                active = true,
                                phase = "error",
                                statusText = "Pikpam Voice not enabled",
                                error = "Enable Managed LiveKit once in Pikpam Admin (pikpam.com/admin → Platform Settings → LiveKit & Voice), or enter your own LiveKit keys.",
                                canOpenByokSetup = true,
                                configUrl = serverConfig?.url.orEmpty(),
                                configAgentName = serverConfig?.agentName?.ifBlank { "gitu-voice" } ?: "gitu-voice",
                            )
                        }
                        return@launch
                    }

                    val generatedCallId = UUID.randomUUID().toString()
                    val roomSlug = "gitu-${UUID.randomUUID().toString().replace("-", "").take(20)}"
                    val identity = "user-${UUID.randomUUID()}"
                    val agentName = pkStatus.defaultAgentName.ifBlank { "gitu-voice" }
                    val agentMetadata = buildJsonObject {
                        put("participantIdentity", identity)
                        put("callId", generatedCallId)
                    }.toString()

                    _state.update { it.copy(phase = "connecting", statusText = "Dialing ${target.displayName}…") }
                    val minted = pikpamClient.mintVoiceToken(
                        token = phonePikpamToken,
                        roomName = roomSlug,
                        identity = identity,
                        participantName = "You",
                        agentName = agentName,
                        agentMetadata = agentMetadata,
                        ttlMinutes = 15,
                    )
                    if (gen != generationCounter.get()) {
                        pikpamClient.closeVoiceRoom(phonePikpamToken, minted.livekitRoomName.ifBlank { minted.roomName })
                        return@launch
                    }
                    if (minted.token.isBlank() || minted.wsUrl.isBlank()) {
                        throw GituApiException("Pikpam Voice did not return a LiveKit room token.")
                    }
                    callId = generatedCallId
                    roomUrl = minted.wsUrl
                    roomToken = minted.token
                    resolvedTitle = target.displayName.ifBlank { "Agent Gitu" }
                    resolvedMode = "pikpam"
                    directPikpamRoomName = minted.livekitRoomName.ifBlank { minted.roomName.ifBlank { roomSlug } }
                    directPikpamToken = phonePikpamToken
                } else {
                    _state.update {
                        it.copy(
                            active = false,
                            phase = "idle",
                            needsSetup = true,
                            configUrl = serverConfig?.url.orEmpty(),
                            configAgentName = serverConfig?.agentName?.ifBlank { "gitu-voice" } ?: "gitu-voice",
                            setupError = null,
                        )
                    }
                    return@launch
                }

                activeCallId = callId
                _state.update {
                    it.copy(
                        callId = callId,
                        mode = resolvedMode,
                        title = resolvedTitle,
                        phase = "connecting",
                        statusText = "Joining LiveKit room…",
                    )
                }

                // 4. Create native LiveKit Room and wire RPC + transcription + events
                val room = LiveKit.create(appContext)
                activeRoom = room
                configureSpeakerPreference(room, speakerOn = true)

                // Register `gitu.voice.reply` RPC bridge called by the LiveKit Cloud voice worker
                room.registerRpcMethod("gitu.voice.reply") { invocation ->
                    if (activeCallId != callId) {
                        throw IllegalStateException("This call ended.")
                    }
                    val caller = room.remoteParticipants[invocation.callerIdentity]
                    if (caller == null || caller.kind != Participant.Kind.AGENT) {
                        throw IllegalStateException("Only the dispatched voice agent can use this bridge.")
                    }
                    val payloadObj = json.parseToJsonElement(invocation.payload).jsonObject
                    val payloadCallId = payloadObj["callId"]?.jsonPrimitive?.contentOrNull
                    if (payloadCallId != callId) {
                        throw IllegalStateException("Wrong call.")
                    }
                    val turnId = payloadObj["id"]?.jsonPrimitive?.contentOrNull.orEmpty()
                    val spokenText = payloadObj["text"]?.jsonPrimitive?.contentOrNull.orEmpty()

                    replyError = null
                    _state.update {
                        it.copy(
                            phase = "thinking",
                            statusText = "Thinking…",
                            caption = if (spokenText.isNotBlank()) "You: $spokenText" else it.caption,
                            error = null,
                        )
                    }

                    val rawReply = try {
                        if (useDirectPikpam) {
                            handleDirectPikpamVoiceReply(client, activeTarget ?: target, turnId, spokenText)
                        } else {
                            client.voiceCallReplyRaw(callId, turnId, spokenText)
                        }
                    } catch (err: Throwable) {
                        val msg = err.message?.takeIf { it.isNotBlank() } ?: "Could not get agent reply."
                        replyError = msg
                        _state.update { it.copy(statusText = msg, caption = msg) }
                        return@registerRpcMethod """{"text":"I'm having trouble getting my reply. Please check the call status and try again."}"""
                    }

                    val parsedReply = runCatching { json.parseToJsonElement(rawReply).jsonObject }.getOrNull()
                    val replyText = parsedReply?.get("text")?.jsonPrimitive?.contentOrNull.orEmpty()
                    val replyRunId = parsedReply?.get("runId")?.jsonPrimitive?.contentOrNull

                    if (replyText.isNotBlank()) {
                        _state.update { it.copy(caption = replyText, statusText = "Speaking") }
                    }
                    if (target.kind == "main" && target.runId == null && !replyRunId.isNullOrBlank()) {
                        activeTarget = target.copy(runId = replyRunId)
                    }
                    runCatching { onReplyAccepted(activeTarget ?: target, replyRunId) }

                    rawReply
                }

                // Register `gitu.voice.status` RPC bridge for STT/LLM/TTS health updates
                room.registerRpcMethod("gitu.voice.status") { invocation ->
                    val caller = room.remoteParticipants[invocation.callerIdentity]
                    if (activeCallId != callId || caller == null || caller.kind != Participant.Kind.AGENT) {
                        throw IllegalStateException("This voice worker is not authorized.")
                    }
                    val statusObj = runCatching { json.parseToJsonElement(invocation.payload).jsonObject }.getOrNull()
                    if (statusObj?.get("callId")?.jsonPrimitive?.contentOrNull != callId) {
                        throw IllegalStateException("Wrong call.")
                    }
                    val stage = statusObj["stage"]?.jsonPrimitive?.contentOrNull.orEmpty()
                    val hasError = statusObj["error"]?.jsonPrimitive?.contentOrNull?.equals("true", ignoreCase = true) == true
                    val code = statusObj["code"]?.jsonPrimitive?.contentOrNull
                        ?.takeIf { Regex("^[A-Za-z0-9_]{1,48}$").matches(it) }
                        ?: "unavailable"

                    val stageName = when (stage) {
                        "tts" -> "Speech generation"
                        "llm" -> "Agent reply"
                        "stt" -> "Speech recognition"
                        else -> null
                    }
                    if (hasError && stageName != null) {
                        val msg = "$stageName failed ($code). Check LiveKit or retry the call."
                        replyError = msg
                        _state.update { it.copy(statusText = msg, caption = msg) }
                    } else if (stage == "audio") {
                        replyError = null
                    }
                    "{}"
                }

                // Register live transcription captions from LiveKit Cloud
                runCatching {
                    room.registerTextStreamHandler("lk.transcription") { reader, _ ->
                        scope.launch {
                            val sb = StringBuilder()
                            runCatching {
                                reader.flow.collect { chunk ->
                                    if (activeCallId != callId) return@collect
                                    sb.append(chunk)
                                    val text = sb.toString().takeLast(4000).trim()
                                    if (text.isNotBlank()) {
                                        _state.update { it.copy(caption = text) }
                                    }
                                }
                            }
                        }
                    }
                }

                // Collect RoomEvents for agent state, active speakers, reconnects, and disconnect
                roomEventsJob?.cancel()
                roomEventsJob = scope.launch {
                    room.events.collect { event ->
                        if (activeRoom !== room) return@collect
                        when (event) {
                            is RoomEvent.ParticipantConnected -> {
                                handleAgentParticipant(room, event.participant)
                            }
                            is RoomEvent.ParticipantDisconnected -> {
                                if (event.participant.kind == Participant.Kind.AGENT) {
                                    onNotice("The voice worker disconnected. Your task continues.", false)
                                    endCall()
                                }
                            }
                            is RoomEvent.ParticipantAttributesChanged -> {
                                if (event.participant.kind == Participant.Kind.AGENT) {
                                    handleAgentParticipant(room, event.participant)
                                    val agentState = event.changedAttributes["lk.agent.state"]
                                        ?: event.participant.attributes["lk.agent.state"]
                                    if (!agentState.isNullOrBlank()) {
                                        updateAgentPhase(agentState)
                                    }
                                }
                            }
                            is RoomEvent.ActiveSpeakersChanged -> {
                                val maxLevel = event.speakers.maxOfOrNull { it.audioLevel } ?: 0f
                                _state.update { it.copy(audioLevel = maxLevel.coerceIn(0f, 1f)) }
                            }
                            is RoomEvent.Reconnecting -> {
                                _state.update { it.copy(phase = "reconnecting", statusText = "Reconnecting…") }
                            }
                            is RoomEvent.Reconnected -> {
                                _state.update { it.copy(phase = "listening", statusText = "Listening") }
                            }
                            is RoomEvent.Disconnected -> {
                                if (activeRoom === room) {
                                    onNotice("Call ended. Your task continues.", false)
                                    teardownCallInternal(notifyServer = true, resetState = true)
                                }
                            }
                            else -> Unit
                        }
                    }
                }

                // 5. Connect to LiveKit Cloud room and publish local microphone
                room.connect(roomUrl, roomToken)
                if (gen != generationCounter.get()) {
                    teardownCallInternal(notifyServer = true, resetState = false)
                    return@launch
                }

                // Enable local microphone (AEC, NS, AGC handled natively by WebRTC/LiveKit)
                room.localParticipant.setMicrophoneEnabled(true)
                applySpeakerRoute(room, speakerOn = true)

                // Check if the agent worker already joined before our listener fired
                room.remoteParticipants.values.forEach { handleAgentParticipant(room, it) }

                // Start live call timer
                startCallTimer(gen)

                // 25s watchdog in case the LiveKit Cloud worker never joins
                readyWatchdogJob?.cancel()
                readyWatchdogJob = scope.launch {
                    delay(25_000L)
                    if (gen == generationCounter.get() && activeRoom === room && !workerReady) {
                        val msg = "The voice worker did not join. Check that gitu-voice is deployed in your LiveKit project and try again."
                        teardownCallInternal(notifyServer = true, resetState = false)
                        _state.update {
                            it.copy(
                                active = true,
                                phase = "error",
                                statusText = "Worker unavailable",
                                error = msg,
                            )
                        }
                    }
                }
            } catch (err: CancellationException) {
                throw err
            } catch (err: Throwable) {
                if (gen != generationCounter.get()) return@launch
                val insufficient = err is GituApiException &&
                    (err.statusCode == 402 || err.code.equals("INSUFFICIENT_CREDITS", ignoreCase = true))
                val msg = when (err) {
                    is GituApiException -> err.message ?: "Voice call request failed."
                    else -> err.message ?: "Could not connect LiveKit voice call."
                }
                teardownCallInternal(notifyServer = true, resetState = false)
                _state.update {
                    it.copy(
                        active = true,
                        phase = "error",
                        statusText = if (insufficient) "Low Pikpam credits" else "Could not connect",
                        error = msg,
                        insufficientCredits = insufficient,
                    )
                }
            }
        }
    }

    fun saveLiveKitConfig(
        client: GituApiClient,
        url: String,
        apiKey: String,
        apiSecret: String,
    ) {
        val current = _state.value
        val pendingTarget = activeTarget ?: current.target
        scope.launch {
            _state.update { it.copy(savingConfig = true, setupError = null) }
            runCatching {
                client.configureVoice(
                    url = url,
                    apiKey = apiKey,
                    apiSecret = apiSecret,
                    agentName = current.configAgentName.ifBlank { "gitu-voice" },
                )
            }.onSuccess {
                _state.update { it.copy(savingConfig = false, needsSetup = false, setupError = null) }
                if (pendingTarget != null) {
                    startCall(client, pendingTarget)
                }
            }.onFailure { err ->
                _state.update {
                    it.copy(
                        savingConfig = false,
                        setupError = err.message ?: "Could not save LiveKit Cloud credentials.",
                    )
                }
            }
        }
    }

    fun dismissSetup() {
        _state.update { it.copy(needsSetup = false, setupError = null, savingConfig = false) }
    }

    fun openByokSetup() {
        _state.update {
            it.copy(
                active = false,
                phase = "idle",
                needsSetup = true,
                setupError = null,
            )
        }
    }

    fun toggleMute() {
        val room = activeRoom ?: return
        val nextMuted = !_state.value.muted
        scope.launch {
            runCatching {
                room.localParticipant.setMicrophoneEnabled(!nextMuted)
            }.onSuccess {
                _state.update {
                    it.copy(
                        muted = nextMuted,
                        statusText = if (nextMuted && it.phase == "listening") "Muted" else if (!nextMuted && it.phase == "listening") "Listening" else it.statusText,
                    )
                }
            }
        }
    }

    fun toggleSpeaker() {
        val room = activeRoom ?: return
        val nextSpeaker = !_state.value.speakerOn
        applySpeakerRoute(room, nextSpeaker)
        _state.update { it.copy(speakerOn = nextSpeaker) }
    }

    fun setMinimized(minimized: Boolean) {
        _state.update { it.copy(minimized = minimized) }
    }

    fun retryLastCall() {
        val client = activeApi ?: return
        val target = activeTarget ?: _state.value.target ?: return
        startCall(client, target)
    }

    fun endCall() {
        generationCounter.incrementAndGet()
        callJob?.cancel()
        scope.launch {
            teardownCallInternal(notifyServer = true, resetState = true)
        }
    }

    private suspend fun prepareWorkerUntilReady(client: GituApiClient, gen: Int) {
        client.prepareVoiceWorker()
        val deadline = System.currentTimeMillis() + 16 * 60 * 1000L
        var attempt = 0
        while (gen == generationCounter.get()) {
            val worker = client.voiceWorkerStatus()
            if (gen != generationCounter.get()) return
            when (worker.phase) {
                "ready" -> return
                "failed" -> throw GituApiException(worker.message.ifBlank { "Voice worker setup failed. Try again." })
            }
            if (System.currentTimeMillis() > deadline) {
                throw GituApiException("LiveKit is still preparing voice. Try the call again shortly.")
            }
            _state.update {
                it.copy(
                    phase = "preparing",
                    statusText = worker.message.ifBlank { "Preparing live voice…" },
                )
            }
            val waitMs = minOf(1000L, 350L + attempt * 150L)
            attempt++
            delay(waitMs)
        }
    }

    private fun handleAgentParticipant(room: Room, participant: Participant) {
        if (activeRoom !== room || participant.kind != Participant.Kind.AGENT) return
        workerReady = true
        readyWatchdogJob?.cancel()
        val stateAttr = participant.attributes["lk.agent.state"]?.takeIf { it.isNotBlank() } ?: "listening"
        updateAgentPhase(stateAttr)
    }

    private fun updateAgentPhase(rawPhase: String) {
        val normalized = when (rawPhase.lowercase()) {
            "speaking" -> "speaking"
            "thinking" -> "thinking"
            "initializing", "connecting" -> "connecting"
            else -> "listening"
        }
        val label = replyError ?: when (normalized) {
            "speaking" -> "Speaking"
            "thinking" -> "Thinking…"
            "connecting" -> "Connecting…"
            else -> if (_state.value.muted) "Muted" else "Listening"
        }
        _state.update { it.copy(phase = normalized, statusText = label) }
    }

    private fun startCallTimer(gen: Int) {
        timerJob?.cancel()
        timerJob = scope.launch {
            var secs = 0
            while (isActive && gen == generationCounter.get()) {
                delay(1_000L)
                secs++
                _state.update { it.copy(elapsedSeconds = secs) }
            }
        }
    }

    private fun configureSpeakerPreference(room: Room, speakerOn: Boolean) {
        val handler = room.audioHandler as? AudioSwitchHandler ?: return
        handler.preferredDeviceList = if (speakerOn) {
            listOf(
                AudioDevice.BluetoothHeadset::class.java,
                AudioDevice.WiredHeadset::class.java,
                AudioDevice.Speakerphone::class.java,
                AudioDevice.Earpiece::class.java,
            )
        } else {
            listOf(
                AudioDevice.BluetoothHeadset::class.java,
                AudioDevice.WiredHeadset::class.java,
                AudioDevice.Earpiece::class.java,
                AudioDevice.Speakerphone::class.java,
            )
        }
    }

    @Suppress("DEPRECATION")
    private fun applySpeakerRoute(room: Room, speakerOn: Boolean) {
        configureSpeakerPreference(room, speakerOn)
        val handler = room.audioHandler as? AudioSwitchHandler
        if (handler != null) {
            val devices = handler.availableAudioDevices
            val preferred = if (speakerOn) {
                devices.firstOrNull { it is AudioDevice.Speakerphone }
            } else {
                devices.firstOrNull { it is AudioDevice.BluetoothHeadset }
                    ?: devices.firstOrNull { it is AudioDevice.WiredHeadset }
                    ?: devices.firstOrNull { it is AudioDevice.Earpiece }
            }
            if (preferred != null) {
                runCatching { handler.selectDevice(preferred) }
            }
        }
        runCatching {
            val audioManager = appContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
            audioManager?.isSpeakerphoneOn = speakerOn
        }
    }

    private suspend fun handleDirectPikpamVoiceReply(
        client: GituApiClient,
        target: VoiceCallTarget,
        turnId: String,
        spokenText: String,
    ): String {
        val cleanInput = spokenText.trim()
        if (cleanInput.isEmpty() || turnId == "greeting") {
            val greeting = "Hi, I'm ${target.displayName.ifBlank { "Agent Gitu" }}. What would you like to work on?"
            return buildJsonObject { put("text", greeting) }.toString()
        }

        if (target.kind == "cowork" && !target.conversationId.isNullOrBlank()) {
            val convId = target.conversationId
            val threadId = target.threadId?.ifBlank { "main" } ?: "main"
            val before = runCatching { client.teamChat(convId, threadId) }.getOrNull()
            val prevSeq = before?.messages?.maxOfOrNull { it.seq } ?: 0

            client.sendTeamMessage(
                conversationId = convId,
                messageId = "voice_${turnId.ifBlank { UUID.randomUUID().toString() }}",
                text = cleanInput,
                threadId = threadId,
            )

            // Wait up to 30 seconds for the teammate's reply message
            val deadline = System.currentTimeMillis() + 30_000L
            while (System.currentTimeMillis() < deadline) {
                delay(550L)
                val view = runCatching { client.teamChat(convId, threadId) }.getOrNull() ?: continue
                val agentReply = view.messages
                    .filter { it.role != "user" && it.seq > prevSeq && it.text.isNotBlank() }
                    .maxByOrNull { it.seq }
                if (agentReply != null && (!view.busy || agentReply.status == "sent")) {
                    val spoken = cleanForSpeech(agentReply.text)
                    return buildJsonObject {
                        put("text", spoken.ifBlank { "Done — I've updated the chat." })
                    }.toString()
                }
            }
            return buildJsonObject {
                put("text", "Got it — I'm working on that in our chat right now.")
            }.toString()
        }

        // Coding run voice turn
        val runId = if (!target.runId.isNullOrBlank()) {
            client.sendRunMessage(target.runId, cleanInput)
            target.runId
        } else {
            client.startRun(
                goal = cleanInput,
                projectPath = target.projectPath.orEmpty(),
                mode = "agent",
                provider = target.provider,
                model = target.model,
            ).runId
        }
        return buildJsonObject {
            put("text", "On it — I've kicked that off in your coding workspace, and we can keep talking while it runs.")
            if (runId.isNotBlank()) put("runId", runId)
        }.toString()
    }

    private fun cleanForSpeech(raw: String): String {
        val filtered = ChatMessageFilter.filterVisibleReply(raw)
        return filtered
            .replace(Regex("```[\\s\\S]*?```"), " ")
            .replace(Regex("\\[([^\\]]+)]\\([^)]+\\)"), "$1")
            .replace(Regex("[`*_~#>]"), "")
            .replace(Regex("\\s+"), " ")
            .trim()
            .take(1200)
    }

    private suspend fun teardownCallInternal(notifyServer: Boolean, resetState: Boolean) {
        val room = activeRoom
        val callId = activeCallId
        val client = activeApi
        val pkRoom = directPikpamRoomName
        val pkToken = directPikpamToken

        activeRoom = null
        activeCallId = null
        directPikpamRoomName = null
        directPikpamToken = null
        workerReady = false
        replyError = null

        roomEventsJob?.cancel()
        roomEventsJob = null
        timerJob?.cancel()
        timerJob = null
        readyWatchdogJob?.cancel()
        readyWatchdogJob = null

        if (resetState) {
            _state.value = VoiceCallUiState()
        }

        if (room != null) {
            runCatching { room.unregisterRpcMethod("gitu.voice.reply") }
            runCatching { room.unregisterRpcMethod("gitu.voice.status") }
            runCatching { room.unregisterTextStreamHandler("lk.transcription") }
            runCatching { room.disconnect() }
            runCatching { room.release() }
        }

        if (notifyServer && pkRoom != null && pkToken != null) {
            withContext(NonCancellable) {
                pikpamClient.closeVoiceRoom(pkToken, pkRoom)
            }
        } else if (notifyServer && callId != null && client != null) {
            withContext(NonCancellable) {
                runCatching { client.endVoiceCall(callId) }
            }
        }
    }
}
