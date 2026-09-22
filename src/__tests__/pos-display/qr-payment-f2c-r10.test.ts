/**
 * Fase 2 · Parte C (Cobro con QR a pantalla completa) · ronda 10 (corrección
 * de los hallazgos X/Y/Z del tester y QA de la ronda 9).
 *
 *  X · QrPaymentDialog decide «hay vencimiento» con `parseExpiresAt` (la
 *      misma regla que la pantalla del cliente): «2026-13-99» o «  » no son
 *      fecha → sin cuenta atrás, sin NaN y sin vencer jamás por reloj local.
 *  Y · QrPoller.runPoll() no pisa el `inFlight` que un runPoll anidado
 *      (start() desde el propio onError de maxAttempts) ya registró, y
 *      stop() suelta la consulta en vuelo (su respuesta se descarta).
 *  Z · Vencimiento por reloj LOCAL: onTerminal('expired') una vez y el
 *      poller se para tras QR_LOCAL_EXPIRY_GRACE_MS (decisión documentada en
 *      el propio componente: un `paid` dentro de la gracia se registra; uno
 *      posterior se reconcilia por webhook, nunca desde el diálogo).
 *
 * Aquí solo lo puro (QrPoller en Node) y lo estático (fuente del diálogo);
 * el diálogo real montado con React queda en tester-f2c-r9. Organización
 * ficticia (org 120), sin nombres reales.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { QrPoller } from '@/lib/services/integrations/qrShared/qrPoller';
import { parseExpiresAt } from '@/lib/pos/display/payment';

const SRC = join(process.cwd(), 'src');
const readSrc = (rel: string): string => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
const QR_DIALOG = readSrc('components/shared/QrPaymentDialog.tsx');
const POLLER = readSrc('lib/services/integrations/qrShared/qrPoller.ts');

type Deferred = { resolve: (status: string) => void; reject: (e: Error) => void; url: string };
let pending: Deferred[] = [];
let fetchMock: jest.Mock;
const realFetch = globalThis.fetch;

beforeEach(() => {
  pending = [];
  fetchMock = jest.fn(
    (url: string) =>
      new Promise((res, rej) => {
        pending.push({
          url,
          resolve: (status) => res({ ok: true, status: 200, json: async () => ({ status }) }),
          reject: (e) => rej(e),
        });
      }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
});
afterEach(() => {
  globalThis.fetch = realFetch;
  jest.useRealTimers();
});

const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i += 1) await new Promise((r) => setImmediate(r));
};

const mk = (over: Partial<ConstructorParameters<typeof QrPoller>[0]> = {}): QrPoller =>
  new QrPoller({ reference: 'POS-120-r10', organizationId: 120, ...over });

// ---------------------------------------------------------------------------
// Y · reentrada de runPoll
// ---------------------------------------------------------------------------

describe('Y · QrPoller: start() desde onError (maxAttempts) no anula el guard de «en vuelo»', () => {
  it('tras el reinicio automático, checkNow() se suma a la consulta en vuelo (2 fetch, no 3) y queda una sola cadena', async () => {
    const poller = mk({
      maxAttempts: 1,
      onError: () => {
        if (!poller.isRunning) poller.start();
      },
    });
    poller.start();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    pending.shift()!.resolve('pending');
    await flush();
    jest.advanceTimersByTime(3000);
    await flush();
    // 2.º intento > maxAttempts(1) → onError → start() → consulta nueva.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(poller.isRunning).toBe(true);
    const joined = poller.checkNow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    pending.shift()!.resolve('pending');
    await joined;
    await flush();
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(3000);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    poller.stop();
  });

  it('el reinicio anidado entrega su `paid` al onPaid (la generación nueva es la viva)', async () => {
    const onPaid = jest.fn();
    const poller = mk({
      maxAttempts: 1,
      onPaid,
      onError: () => {
        if (!poller.isRunning) poller.start();
      },
    });
    poller.start();
    pending.shift()!.resolve('pending');
    await flush();
    jest.advanceTimersByTime(3000);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    pending.shift()!.resolve('paid');
    await flush();
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(poller.isRunning).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('stop() suelta la consulta en vuelo: el start() siguiente registra la SUYA y checkNow() se suma a la nueva, no a la muerta', async () => {
    const onStatusChange = jest.fn();
    const poller = mk({ onStatusChange });
    poller.start();
    poller.stop();
    poller.start();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const joined = poller.checkNow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // La vieja responde: se descarta (otra generación).
    pending.shift()!.resolve('paid');
    await flush();
    expect(onStatusChange).not.toHaveBeenCalled();
    // La nueva responde y checkNow resuelve con ella.
    pending.shift()!.resolve('pending');
    await joined;
    expect(onStatusChange).toHaveBeenCalledWith('pending');
    poller.stop();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('estático: runPoll captura la generación y solo registra `inFlight` si nadie lo hizo; stop() lo suelta', () => {
    expect(POLLER).toContain('if (this.inFlight === null && this.generation === generation) this.inFlight = run;');
    expect(POLLER).toMatch(/stop\(\): void \{[\s\S]*?this\.inFlight = null;[\s\S]*?\n  \}/);
  });
});

// ---------------------------------------------------------------------------
// X · vencimiento no fecha
// ---------------------------------------------------------------------------

describe('X · el diálogo decide el vencimiento con parseExpiresAt, como la pantalla', () => {
  it('«2026-13-99», «  », «» y undefined no son fecha; una ISO válida sí', () => {
    expect(parseExpiresAt('2026-13-99')).toBeNull();
    expect(parseExpiresAt('  ')).toBeNull();
    expect(parseExpiresAt('')).toBeNull();
    expect(parseExpiresAt(undefined)).toBeNull();
    expect(parseExpiresAt('2026-09-22T15:00:00.000Z')).toBe(Date.UTC(2026, 8, 22, 15));
  });

  it('estático: hasDeadline/getRemainingSeconds/cuenta atrás salen de `deadline` (parseExpiresAt), no de «string no vacío»', () => {
    expect(QR_DIALOG).toContain("import { parseExpiresAt } from '@/lib/pos/display/payment';");
    expect(QR_DIALOG).toContain('const deadline = useMemo(() => parseExpiresAt(expiresAt), [expiresAt]);');
    expect(QR_DIALOG).toContain('const hasDeadline = deadline !== null;');
    expect(QR_DIALOG).toContain('if (deadline === null) return 0;');
    expect(QR_DIALOG).toContain('if (!open || deadline === null) return;');
    expect(QR_DIALOG).not.toContain("typeof expiresAt === 'string' && expiresAt.length > 0");
    expect(QR_DIALOG).not.toContain('if (!open || !expiresAt) return;');
  });
});

// ---------------------------------------------------------------------------
// Z · vencimiento local: aviso + gracia + stop
// ---------------------------------------------------------------------------

describe('Z · vencimiento por reloj local: onTerminal una vez y stop() del poller tras la gracia', () => {
  it('estático: la gracia es una constante exportada, positiva y corta (≤ 60 s), documentada como decisión', () => {
    expect(QR_DIALOG).toMatch(/export const QR_LOCAL_EXPIRY_GRACE_MS = (\d[\d_]*);/);
    const raw = /export const QR_LOCAL_EXPIRY_GRACE_MS = (\d[\d_]*);/.exec(QR_DIALOG)![1].replace(/_/g, '');
    const ms = Number(raw);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(60_000);
    expect(QR_DIALOG).toContain('reconcilia por webhook');
  });

  it('estático: al llegar a 0 la cuenta atrás avisa onTerminal("expired"), programa stop() tras la gracia y el cleanup lo cancela; no vence un pago ya confirmado', () => {
    const countdown = /Efecto: cuenta regresiva cada segundo[\s\S]*?\}, \[open, deadline, expiresAt, notifyTerminal\]\);/.exec(QR_DIALOG);
    expect(countdown).not.toBeNull();
    const block = countdown![0];
    expect(block).toContain('if (paidHandledRef.current) return;');
    expect(block).toContain("notifyTerminal('expired');");
    expect(block).toContain('pollerRef.current?.stop();');
    expect(block).toContain('}, QR_LOCAL_EXPIRY_GRACE_MS);');
    expect(block).toContain('clearTimeout(graceTimerRef.current);');
    // notifyTerminal vive fuera del efecto [open] (useCallback sobre refs) para poder invocarse desde la cuenta atrás.
    expect(QR_DIALOG).toContain('const notifyTerminal = useCallback((terminal: QrTerminalStatus): void => {');
  });
});
