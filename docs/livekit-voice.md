# Live calls with the existing Gitu agent

Gitu's phone control uses LiveKit Cloud for audio. A separate `gitu-voice` worker runs speech recognition and synthesis. It calls a room-scoped RPC on the authenticated Gitu tab; Gitu resolves the selected teammate, conversation, topic, model, memories and current task on every utterance. The worker never receives Gitu credentials or executes workspace tools.

## Cloud setup

1. Click Gitu's phone icon and enter your project’s `wss://` URL, API key and API secret in the secure form. Keys use Gitu's existing encrypted credential store. The API returns configuration status, not keys.
2. Gitu prepares the bundled `gitu-voice` worker automatically through LiveKit's Cloud deployment API. The first connection shows preparation/build/start status; subsequent calls reuse the deployment. Retry preserves the deployment ID, and only the four bundled worker files are uploaded. Project files, Gitu credentials, and conversation history are excluded. Your Cloud project must have agent-deployment capacity and Inference access.
3. Allow microphone access and start a call. Calls work with localhost/installed Gitu as well as hosted Gitu because the audio worker uses room RPC, not inbound access to the computer.

There is no worker-name field to configure in LiveKit's API-key settings. The bundled worker registers that name from its source code. For manual deployment or troubleshooting, see [LiveKit's Cloud deployment quickstart](https://docs.livekit.io/deploy/agents/quickstart/) and deploy the `voice-worker` directory with `lk agent create`.

The worker defaults to LiveKit Inference's AssemblyAI speech recognition and Fish Audio synthesis. `GITU_VOICE_STT_MODEL`, `GITU_VOICE_TTS_MODEL`, and `GITU_VOICE_TTS_VOICE` configure the audio models/voice on the worker. The reasoning model is the agent's existing selected model in Gitu.

## Conversation behavior

- Questions use public current task state and conversation context without acquiring the execution lock or running tools.
- New tasks, queued requests and live corrections go through the existing Gitu dispatchers and permission checks.
- Cowork exposes Steer, Queue and Ask while busy. Steer is applied at the next safe model/tool boundary; Queue starts after current work; Ask leaves work untouched.
- Interrupting speech or ending a call does not cancel a task. Only an explicit stop-task request or the existing Stop control cancels work.
- Final voice exchanges appear in the existing chat. Raw audio recording is disabled.
- Calls stay attached to their original agent and topic when the user browses elsewhere. A new call selects the new target explicitly.

## Migration

Deploy the same worker beside a self-hosted LiveKit server and replace the project URL/keys in Gitu. Speech models must also be available on that installation; self-hosting transport does not automatically replace LiveKit Inference. Gitu conversation and execution logic stay unchanged.
