/**
 * Núcleo del enlace entre /pos-display y el receptor de la Parte A
 * (BroadcastChannelReceiver), SIN React: ciclo de vida del canal, salud de
 * la conexión, último estado aceptado y decisión de resaltado. El hook
 * useDisplayReceiver solo lo envuelve en estado de React. Así la salud (qué
 * es «caja viva», cuándo se repite need_snapshot, cuándo se olvida la caja)
 * se prueba en Node con un BroadcastChannel real (src/__tests__/pos-display).
 *
 * Reglas:
 * - Conectado = último mensaje aceptado hace < staleAfterMs y sin `bye`
 *   posterior. Se evalúa en un intervalo (healthIntervalMs) Y al aceptar cada
 *   `hello` o `state`, así el primer estado se pinta en cuanto llega
 *   (PLAN §12: < 100 ms) sin esperar al siguiente tick.
 * - Al perder la caja se suelta la instancia activa, se OLVIDA el último
 *   estado y hello (una caja nueva que latiera sin anunciarse no debe
 *   resucitar un carrito viejo) y se vuelve a pedir snapshot cada
 *   resnapshotIntervalMs hasta que alguien conteste.
 * - Caja viva pero SIN estado aceptado (adoptada por un latido tras bye o
 *   silencio): la vista queda en Conectando (logic.ts · resolveView) y se
 *   sigue pidiendo need_snapshot cada resnapshotIntervalMs a esa instancia
 *   hasta que conteste con un `state`. Antes (ronda 3) la pantalla se creía
 *   viva, pintaba Reposo con un pedido en curso y no volvía a preguntar.
 * - Cada `state` aceptado se sanea UNA vez (logic.ts · sanitizeDisplayState)
 *   antes de guardarse: las vistas nunca ven una línea sin `modifiers` ni un
 *   cobro sin total.
 * - `highlightUntil`: instante hasta el que OrderView resalta la línea
 *   cambiada. Solo avanza cuando de verdad entró o cambió una línea respecto
 *   al carrito anterior aceptado DE LA MISMA instancia (shouldHighlightLine).
 *   Se distingue «no había estado» (al montar, tras olvidar la caja o al
 *   relevar de instancia: lo que llega es el snapshot de lo que la caja ya
 *   tenía y NO resalta) de «había estado sin carrito» (Reposo → primera
 *   línea: SÍ resalta). Decisión de la ronda 4: un relevo entre dos pestañas
 *   de /app/pos no es «una línea nueva» para el cliente.
 * - `updateRequired`: solo llegan sobres de otra versión del protocolo.
 * - Táctil declarado = táctil RESUELTO (ronda 3 de F2-B, QA-2): lo que viaja
 *   en `capabilities.touch` (need_snapshot y display_alive) es
 *   `resolveTouch(detección, hello.settings.touch)`, lo mismo que decide si
 *   la vista de propina pinta botones (CustomerDisplay). Antes viajaba la
 *   detección cruda y, con el forzado activo (`touch` / `no-touch`, PLAN
 *   §4.4 «si el hardware miente»), la caja prometía «esperando la propina…»
 *   sobre una pantalla sin botones, o «registre lo que indique el cliente»
 *   sobre una con botones. Sin hello aún se declara la detección; al aceptar
 *   un hello cuyo forzado cambia el resultado se REEMITE `display_alive` en
 *   el acto (startPresence del receptor es idempotente y, si cambia
 *   `touch`, manda uno sin esperar al latido), así la caja se entera antes
 *   del siguiente latido. Un cambio de ajustes en
 *   caliente llega por el resaludo de la caja (hello nuevo) y sigue el mismo
 *   camino.
 */

import { STALE_AFTER_MS, type DisplayReceiver } from '@/lib/pos/display/transport';
import type {
  DisplayCapabilities,
  DisplayPresentationSettings,
  DisplayState,
  DownMessage,
  UpMessageDraft,
} from '@/lib/pos/display/protocol';
import { HIGHLIGHT_MS, resolveTouch, sanitizeDisplayState, shouldHighlightAfterState } from './logic';

/** Sin caja este tiempo, la pantalla deja Conectando y vuelve a Reposo (PLAN §10). */
export const DISCONNECTED_TO_IDLE_MS = 60_000;
/** Cada cuánto se repite `need_snapshot` mientras no hay caja o la que hay no ha mandado estado. */
export const RESNAPSHOT_INTERVAL_MS = 2_000;
/** Cada cuánto se evalúa la salud de la conexión. */
/**
 * 250 ms y no 500: el peor caso sin `bye` (caja muerta de golpe) es
 * STALE_AFTER_MS + un tick, y el PLAN §12 F0 pide Conectando en ≤ 3 s.
 */
export const HEALTH_INTERVAL_MS = 250;

export interface DisplayHello {
  organizationId: number;
  cashier: { name: string } | null;
  sessionOpen: boolean;
  /** Moneda de la caja (hello.currency); null con un emisor anterior que no la mande. */
  currency: string | null;
  /**
   * Ajustes de presentación de la organización (hello.settings, Fase 2):
   * propina, calificación, desglose, nombre del cliente, idioma y forzado
   * táctil. Ausente con un emisor de la Fase 0: la pantalla se queda en
   * «solo resumen». Se pasa tal cual (isDownMessage solo garantiza que es un
   * objeto): quien lo consuma debe sanear campo a campo.
   */
  settings?: DisplayPresentationSettings;
}

export interface DisplayLinkSnapshot {
  connected: boolean;
  /** true tras disconnectedToIdleMs sin caja. */
  disconnectedTooLong: boolean;
  updateRequired: boolean;
  hello: DisplayHello | null;
  /** Último estado aceptado, ya saneado. null sin caja o con caja que aún no mandó estado. */
  state: DisplayState | null;
  /** now() + HIGHLIGHT_MS del último cambio real de línea; 0 si nunca hubo. */
  highlightUntil: number;
}

export const INITIAL_LINK_SNAPSHOT: DisplayLinkSnapshot = Object.freeze({
  connected: false,
  disconnectedTooLong: false,
  updateRequired: false,
  hello: null,
  state: null,
  highlightUntil: 0,
});

export interface DisplayLinkOptions {
  receiver: DisplayReceiver;
  /** Capacidades que viajan en need_snapshot y display_alive (PLAN §4.4). Se leen en cada envío. */
  capabilities: () => DisplayCapabilities;
  /** Se llama con cada instantánea nueva (solo cuando algo cambió). */
  onChange: (snapshot: DisplayLinkSnapshot) => void;
  /** Reloj: el MISMO que use el receptor (`lastReceivedAt` se compara con él). Por defecto Date.now. */
  now?: () => number;
  staleAfterMs?: number;
  resnapshotIntervalMs?: number;
  healthIntervalMs?: number;
  disconnectedToIdleMs?: number;
}

export interface DisplayLink {
  readonly snapshot: DisplayLinkSnapshot;
  /** Reevalúa la salud ahora (la corre también el intervalo). */
  evaluateHealth(): void;
  /** Reenvía la presencia con las capacidades actuales (p. ej. tras un resize). */
  refreshPresence(): void;
  /**
   * Manda una intención a la caja que se sigue (Fase 2): `qr_paid_claim`,
   * `tip_selected`, `rating`. Solo con caja conectada; sin ella se descarta
   * (no hay a quién avisar y la caja que llegue después no debe recibir un
   * aviso de un cobro que ya no existe). Nunca lanza.
   */
  send(msg: UpMessageDraft): void;
  /** Deja de escuchar, cierra el receptor (con display_bye) y vuelve a la instantánea inicial. */
  stop(): void;
}

export function readCapabilities(): DisplayCapabilities {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { touch: false, width: 0, height: 0 };
  }
  return {
    touch: (navigator.maxTouchPoints ?? 0) > 0,
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function sameSnapshot(a: DisplayLinkSnapshot, b: DisplayLinkSnapshot): boolean {
  return (
    a.connected === b.connected &&
    a.disconnectedTooLong === b.disconnectedTooLong &&
    a.updateRequired === b.updateRequired &&
    a.hello === b.hello &&
    a.state === b.state &&
    a.highlightUntil === b.highlightUntil
  );
}

/** Abre el enlace sobre un receptor ya construido: pide snapshot, arranca presencia y el intervalo de salud. */
export function startDisplayLink(options: DisplayLinkOptions): DisplayLink {
  const { receiver, capabilities, onChange } = options;
  const now = options.now ?? Date.now;
  const staleAfterMs = options.staleAfterMs ?? STALE_AFTER_MS;
  const resnapshotIntervalMs = options.resnapshotIntervalMs ?? RESNAPSHOT_INTERVAL_MS;
  const healthIntervalMs = options.healthIntervalMs ?? HEALTH_INTERVAL_MS;
  const disconnectedToIdleMs = options.disconnectedToIdleMs ?? DISCONNECTED_TO_IDLE_MS;

  let snapshot: DisplayLinkSnapshot = INITIAL_LINK_SNAPSHOT;
  let stopped = false;
  let disconnectedSince: number | null = now();
  let lastSnapshotAt: number | null = null;
  /**
   * Último `state` aceptado (ya saneado) y la instancia que lo mandó, para
   * decidir si hay que resaltar. null al montar, tras olvidar la caja y al
   * cambiar de instancia: lo siguiente que llegue es un snapshot de lo que
   * la caja ya tenía, no una línea nueva.
   */
  let previousState: DisplayState | null = null;
  let previousInstanceId: string | null = null;

  const publish = (patch: Partial<DisplayLinkSnapshot>) => {
    const next = { ...snapshot, ...patch };
    if (sameSnapshot(snapshot, next)) return;
    snapshot = next;
    if (!stopped) onChange(snapshot);
  };

  /** Último `touch` declarado a la caja (need_snapshot o display_alive); null antes del primero. */
  let declaredTouch: boolean | null = null;

  /**
   * Capacidades que se declaran: la detección del navegador con el táctil ya
   * RESUELTO por el forzado de los ajustes del hello aceptado (ver cabecera).
   * Sin hello, la detección tal cual (resolveTouch con override ausente).
   */
  const effectiveCapabilities = (): DisplayCapabilities => {
    const raw = capabilities();
    const resolved = resolveTouch(raw.touch === true, snapshot.hello?.settings?.touch);
    declaredTouch = resolved;
    return raw.touch === resolved ? raw : { ...raw, touch: resolved };
  };

  const askSnapshot = () => {
    lastSnapshotAt = now();
    receiver.send({ t: 'need_snapshot', capabilities: effectiveCapabilities() });
  };

  const shouldAskAgain = (at: number) => lastSnapshotAt === null || at - lastSnapshotAt >= resnapshotIntervalMs;

  /** Sin caja no hay estado que mostrar: lo que llegue después será un snapshot completo. Devuelve el parche a publicar. */
  const forgetCashier = (): Partial<DisplayLinkSnapshot> => {
    previousState = null;
    previousInstanceId = null;
    return { state: null, hello: null };
  };

  /**
   * Salud de la conexión a partir de lo que el receptor ya aceptó. Corre en
   * el intervalo (`fromTimer`) y, además, justo después de aceptar un `hello`
   * o `state`: así la vista deja Conectando en cuanto hay estado, no hasta un
   * tick después. Solo el intervalo repite need_snapshot a una caja viva sin
   * estado: el `hello` de un announce va seguido de su `state` en la misma
   * vuelta y no hay que preguntarle nada.
   */
  const evaluateHealth = (fromTimer = false) => {
    if (stopped) return;
    const at = now();
    const receivedAt = receiver.lastReceivedAt;
    const byeAt = receiver.lastByeAt;
    const alive = receivedAt !== null && at - receivedAt < staleAfterMs && !(byeAt !== null && byeAt >= receivedAt);

    const patch: Partial<DisplayLinkSnapshot> = {};
    if (alive !== snapshot.connected) {
      patch.connected = alive;
      if (alive) {
        disconnectedSince = null;
        patch.disconnectedTooLong = false;
      } else {
        disconnectedSince = at;
        // Que el próximo need_snapshot no vaya dirigido a una pestaña muerta.
        receiver.releaseActiveInstance();
        Object.assign(patch, forgetCashier());
      }
    }

    if (!alive) {
      if (shouldAskAgain(at)) askSnapshot();
      if (disconnectedSince !== null && at - disconnectedSince >= disconnectedToIdleMs) {
        patch.disconnectedTooLong = true;
      }
    } else if (fromTimer && previousState === null && shouldAskAgain(at)) {
      // Caja viva (adoptada por latido, o hello cuyo state no llegó) que no
      // ha dicho qué tiene: se le sigue pidiendo el snapshot hasta que
      // conteste con un state (PLAN §4.1.3: mientras tanto, Conectando).
      askSnapshot();
    }

    const incompatibleAt = receiver.incompatibleVersionAt;
    patch.updateRequired =
      incompatibleAt !== null && at - incompatibleAt < staleAfterMs && (receivedAt === null || receivedAt < incompatibleAt);

    publish(patch);
  };

  const offDown = receiver.onDown((msg: DownMessage) => {
    if (stopped) return;
    switch (msg.t) {
      case 'hello':
        publish({
          hello: {
            organizationId: msg.organizationId,
            cashier: msg.cashier,
            sessionOpen: msg.sessionOpen,
            currency: typeof msg.currency === 'string' && msg.currency.trim().length > 0 ? msg.currency : null,
            // Solo se añade la clave si viene: un hello de la Fase 0 produce el mismo objeto que antes.
            ...(msg.settings !== undefined ? { settings: msg.settings } : {}),
          },
        });
        evaluateHealth();
        // El forzado del hello cambia lo que la pantalla pinta: se declara el
        // táctil resuelto en el acto (display_alive nuevo), no en el siguiente latido.
        if (resolveTouch(capabilities().touch === true, msg.settings?.touch) !== declaredTouch) {
          receiver.startPresence(effectiveCapabilities());
        }
        break;
      case 'state': {
        const clean = sanitizeDisplayState(msg.state);
        const previous = previousInstanceId === msg.instanceId ? previousState : null;
        const patch: Partial<DisplayLinkSnapshot> = { state: clean };
        if (shouldHighlightAfterState(previous, clean)) patch.highlightUntil = now() + HIGHLIGHT_MS;
        previousState = clean;
        previousInstanceId = msg.instanceId;
        publish(patch);
        evaluateHealth();
        break;
      }
      case 'bye':
        // La caja se cerró a propósito: Conectando sin esperar al silencio.
        disconnectedSince = now();
        publish({ connected: false, ...forgetCashier() });
        break;
      case 'heartbeat':
        break;
    }
  });

  const health = setInterval(() => evaluateHealth(true), healthIntervalMs);
  askSnapshot();
  receiver.startPresence(effectiveCapabilities());

  return {
    get snapshot() {
      return snapshot;
    },
    evaluateHealth: () => evaluateHealth(true),
    refreshPresence: () => {
      if (!stopped) receiver.startPresence(effectiveCapabilities());
    },
    send: (msg) => {
      if (stopped || !snapshot.connected) return;
      receiver.send(msg);
    },
    stop: () => {
      if (stopped) return;
      stopped = true; // no se notifica nada más: quien paró el enlace ya sabe que vuelve a la instantánea inicial
      clearInterval(health);
      offDown();
      receiver.close();
      previousState = null;
      previousInstanceId = null;
      snapshot = INITIAL_LINK_SNAPSHOT;
    },
  };
}
