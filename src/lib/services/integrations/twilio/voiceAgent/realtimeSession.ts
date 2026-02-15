/**
 * Realtime Session — Conexión WebSocket con OpenAI Realtime API
 * GO Admin ERP
 *
 * Maneja la sesión bidireccional de audio entre Twilio Media Stream
 * y OpenAI Realtime API para el Voice Agent.
 */

import WebSocket from 'ws';
import { buildVoiceAgentPrompt, type VoiceAgentContext } from './voiceAgentPrompts';
import { VOICE_AGENT_TOOLS, executeToolCall } from './voiceAgentTools';

// ─── Tipos ──────────────────────────────────────────────

export interface RealtimeSessionConfig {
  orgId: number;
  callSid: string;
  agentContext: VoiceAgentContext;
  onAudioDelta?: (audioBase64: string) => void;
  onTranscript?: (text: string, role: 'user' | 'assistant') => void;
  onError?: (error: Error) => void;
  onEnd?: () => void;
}

interface RealtimeEvent {
  type: string;
  [key: string]: unknown;
}

// ─── Clase ──────────────────────────────────────────────

export class RealtimeSession {
  private ws: WebSocket | null = null;
  private config: RealtimeSessionConfig;
  private isConnected = false;

  constructor(config: RealtimeSessionConfig) {
    this.config = config;
  }

  /**
   * Inicia la conexión WebSocket con OpenAI Realtime API.
   */
  async connect(): Promise<void> {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview';

    if (!apiKey) {
      throw new Error('Falta OPENAI_API_KEY para Voice Agent');
    }

    const url = `wss://api.openai.com/v1/realtime?model=${model}`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      this.ws.on('open', () => {
        this.isConnected = true;
        this.initializeSession();
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleRealtimeEvent(JSON.parse(data.toString()));
      });

      this.ws.on('error', (error) => {
        console.error('[RealtimeSession] WebSocket error:', error);
        this.config.onError?.(error as Error);
        reject(error);
      });

      this.ws.on('close', () => {
        this.isConnected = false;
        this.config.onEnd?.();
      });
    });
  }

  /**
   * Configura la sesión con el system prompt y las tools.
   */
  private initializeSession(): void {
    const systemPrompt = buildVoiceAgentPrompt(this.config.agentContext);

    // Configurar sesión
    this.sendEvent({
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: systemPrompt,
        voice: 'alloy',
        input_audio_format: 'g711_ulaw',
        output_audio_format: 'g711_ulaw',
        input_audio_transcription: {
          model: 'whisper-1',
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        tools: VOICE_AGENT_TOOLS.map((tool) => ({
          type: tool.type,
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })),
      },
    });
  }

  /**
   * Envía audio desde Twilio Media Stream al modelo.
   */
  sendAudio(audioBase64: string): void {
    if (!this.isConnected || !this.ws) return;

    this.sendEvent({
      type: 'input_audio_buffer.append',
      audio: audioBase64,
    });
  }

  /**
   * Procesa eventos del OpenAI Realtime API.
   */
  private async handleRealtimeEvent(event: RealtimeEvent): Promise<void> {
    switch (event.type) {
      case 'response.audio.delta': {
        // Audio generado por el modelo → enviar a Twilio
        const delta = event.delta as string;
        this.config.onAudioDelta?.(delta);
        break;
      }

      case 'response.audio_transcript.delta': {
        // Transcripción del audio del asistente
        const text = event.delta as string;
        this.config.onTranscript?.(text, 'assistant');
        break;
      }

      case 'conversation.item.input_audio_transcription.completed': {
        // Transcripción del audio del usuario
        const transcript = event.transcript as string;
        this.config.onTranscript?.(transcript, 'user');
        break;
      }

      case 'response.function_call_arguments.done': {
        // El modelo quiere ejecutar una función
        const callId = event.call_id as string;
        const name = event.name as string;
        const args = JSON.parse(event.arguments as string);

        console.log(`[RealtimeSession] Function call: ${name}`, args);

        const result = await executeToolCall(name, args, this.config.orgId);

        // Enviar resultado de vuelta al modelo
        this.sendEvent({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: result,
          },
        });

        // Pedir al modelo que responda con el resultado
        this.sendEvent({ type: 'response.create' });
        break;
      }

      case 'error': {
        console.error('[RealtimeSession] API error:', event.error);
        this.config.onError?.(new Error(JSON.stringify(event.error)));
        break;
      }

      case 'session.created':
      case 'session.updated':
        console.log(`[RealtimeSession] ${event.type} - Call: ${this.config.callSid}`);
        break;
    }
  }

  /**
   * Envía un evento al WebSocket de OpenAI.
   */
  private sendEvent(event: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(event));
  }

  /**
   * Cierra la sesión.
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }

  /**
   * Verifica si la sesión está activa.
   */
  get connected(): boolean {
    return this.isConnected;
  }
}
