/**
 * Doble de Supabase Realtime Broadcast para la Fase 3, parte B: varios
 * «clientes» (`createRealtimeDouble()`) comparten un «servidor» en memoria
 * (`RealtimeBus`). Cada `client.channel(topic, opts)` devuelve un canal con
 * la forma mínima que usa supabaseBroadcastTransport.ts (`on`, `send`,
 * `subscribe`, `unsubscribe`) y el servidor entrega cada `send` a los DEMÁS
 * canales unidos al mismo topic que tengan un `on('broadcast', { event })`
 * para ese evento (como Broadcast con `self: false`).
 *
 * El join es controlable: por defecto se confirma en el siguiente microtask
 * (`autoJoin: true`); con `autoJoin: false` la prueba decide cuándo llamar
 * `bus.join(channel, 'SUBSCRIBED' | 'CHANNEL_ERROR' | ...)`.
 *
 * Fixtures sin nombres de organizaciones reales.
 */

import type { SupabaseChannelLike, SupabaseClientLike } from '@/lib/pos/display/supabaseBroadcastTransport';

export interface SentRecord {
  topic: string;
  event: string;
  payload: unknown;
}

export interface DoubleChannel extends SupabaseChannelLike {
  readonly topic: string;
  readonly opts: { config: { private: boolean; broadcast: { self: boolean; ack: boolean } } };
  readonly joined: boolean;
  readonly unsubscribed: boolean;
  /** Eventos a los que se hizo `on('broadcast', { event })`. */
  readonly listening: string[];
  /** Fuerza un estado de suscripción (lo que haría el servidor). */
  setStatus(status: string, err?: Error): void;
  /** Entrega un mensaje a este canal como si viniera del servidor (sin pasar por `send`). */
  inject(event: string, payload: unknown): void;
}

export class RealtimeBus {
  readonly channels = new Set<DoubleChannel>();
  readonly sent: SentRecord[] = [];
  /** Cuántas veces se llamó `removeChannel`. */
  removed = 0;

  /** Entrega a todos los canales unidos del topic, salvo al emisor. */
  deliver(from: DoubleChannel | null, topic: string, event: string, payload: unknown): void {
    for (const channel of Array.from(this.channels)) {
      if (channel === from || channel.topic !== topic || !channel.joined) continue;
      channel.inject(event, payload);
    }
  }
}

export interface RealtimeDoubleOptions {
  bus: RealtimeBus;
  /** Confirmar el join en el siguiente microtask (por defecto). */
  autoJoin?: boolean;
  /** Si `send` debe rechazar (para probar que el transporte lo traga). */
  failSend?: boolean;
  /** Sin `removeChannel` (cliente que no lo expone). */
  withoutRemoveChannel?: boolean;
}

export interface RealtimeDouble {
  client: SupabaseClientLike;
  /** Canales creados por este cliente, en orden. */
  channels: DoubleChannel[];
}

export function createRealtimeDouble(options: RealtimeDoubleOptions): RealtimeDouble {
  const { bus } = options;
  const autoJoin = options.autoJoin ?? true;
  const channels: DoubleChannel[] = [];

  const client: SupabaseClientLike = {
    channel(topic, opts) {
      const bindings = new Map<string, Array<(message: { payload?: unknown }) => void>>();
      let statusCallback: ((status: string, err?: Error) => void) | undefined;
      let joined = false;
      let unsubscribed = false;

      const channel: DoubleChannel = {
        topic,
        opts,
        get joined() {
          return joined;
        },
        get unsubscribed() {
          return unsubscribed;
        },
        get listening() {
          return Array.from(bindings.keys());
        },
        on(type, filter, callback) {
          if (type !== 'broadcast') throw new Error(`doble: solo broadcast, no ${type}`);
          const list = bindings.get(filter.event) ?? [];
          list.push(callback);
          bindings.set(filter.event, list);
          return channel;
        },
        async send(args) {
          if (options.failSend) throw new Error('doble: send falló');
          bus.sent.push({ topic, event: args.event, payload: args.payload });
          bus.deliver(channel, topic, args.event, args.payload);
          return 'ok';
        },
        subscribe(callback) {
          statusCallback = callback;
          bus.channels.add(channel);
          if (autoJoin) queueMicrotask(() => channel.setStatus('SUBSCRIBED'));
          return channel;
        },
        async unsubscribe() {
          unsubscribed = true;
          joined = false;
          bus.channels.delete(channel);
          return 'ok';
        },
        setStatus(status, err) {
          joined = status === 'SUBSCRIBED';
          statusCallback?.(status, err);
        },
        inject(event, payload) {
          for (const cb of bindings.get(event) ?? []) cb({ payload });
        },
      };
      channels.push(channel);
      return channel;
    },
    ...(options.withoutRemoveChannel
      ? {}
      : {
          async removeChannel() {
            bus.removed += 1;
            return 'ok';
          },
        }),
  };

  return { client, channels };
}
