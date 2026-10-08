import { fileURLToPath } from 'node:url';
import { cli, defineAgent, inference, llm, ServerOptions, voice } from '@livekit/agents';

/** Audio runs in LiveKit Cloud. The existing authenticated Gitu tab remains the task authority. */
class ExistingGituModel extends llm.LLM {
  constructor(room, participantIdentity, callId) {
    super(); this.room = room; this.participantIdentity = participantIdentity; this.callId = callId;
  }
  label() { return 'gitu.existing-agent'; }
  chat(options) { return new ExistingGituStream(this, options); }
}

class ExistingGituStream extends llm.LLMStream {
  constructor(model, options) {
    super(model, { ...options, connOptions: { maxRetry: 0, retryIntervalMs: 1000, timeoutMs: 35_000, ...options.connOptions } });
    this.model = model;
  }
  async run() {
    const item = [...this.chatCtx.items].reverse().find(entry => entry.type === 'message' && entry.role === 'user');
    const id = String(item?.id || 'greeting').replace(/[^\w-]/g, '').slice(0, 80);
    const text = item?.textContent || '';
    const response = await this.model.room.localParticipant.performRpc({
      destinationIdentity: this.model.participantIdentity, method: 'gitu.voice.reply',
      payload: JSON.stringify({ callId: this.model.callId, id, text }), responseTimeout: 40,
    });
    if (this.abortController.signal.aborted) return;
    const result = JSON.parse(response);
    if (typeof result.text !== 'string') throw new Error('Gitu returned no spoken answer.');
    this.queue.put({ id, delta: { role: 'assistant', content: result.text } });
  }
}

export default defineAgent({
  entry: async ctx => {
    const metadata = JSON.parse(ctx.job.metadata || '{}');
    if (!/^[\w-]{1,80}$/.test(metadata.callId || '') || !/^user-[\w-]+$/.test(metadata.participantIdentity || '')) throw new Error('Invalid Gitu voice dispatch.');
    await ctx.connect();
    await ctx.waitForParticipant(metadata.participantIdentity);
    const session = new voice.AgentSession({
      stt: new inference.STT({ model: process.env.GITU_VOICE_STT_MODEL || 'assemblyai/universal-3-6-pro', language: 'en' }),
      llm: new ExistingGituModel(ctx.room, metadata.participantIdentity, metadata.callId),
      tts: new inference.TTS({ model: process.env.GITU_VOICE_TTS_MODEL || 'fishaudio/s2.1-pro', voice: process.env.GITU_VOICE_TTS_VOICE || 'fa4c9eb3dccc4806b382b40d61c6b10a' }),
      turnHandling: { turnDetection: 'stt', interruption: { enabled: true, minWords: 1 }, preemptiveGeneration: { enabled: false } },
    });
    await session.start({ agent: voice.Agent.create({ instructions: 'Speak through the existing Gitu conversation bridge. All identity, memory, task routing and permissions belong to that conversation.' }), room: ctx.room, record: false });
    ctx.addShutdownCallback(async () => { await session.close(); });
    await session.generateReply();
  },
});

cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), agentName: process.env.GITU_VOICE_AGENT_NAME || 'gitu-voice' }));
