/**
 * Fase 2 · Parte C (Cobro con QR a pantalla completa) · ronda 11 (corrección
 * de los hallazgos AA/AB del tester de la ronda 10).
 *
 *  AA · Vencido por reloj LOCAL sin veredicto del proveedor, el cajero
 *      conserva «Verificar pago»: UNA consulta por pulsación (start +
 *      checkNow + stop). `providerTerminal` distingue el veredicto del
 *      proveedor (expired/rejected/cancelled por el poller) del vencimiento
 *      local (solo la cuenta atrás): tras el veredicto no hay botón.
 *  AB · `status`/`remaining` se reinician DURANTE el render al cambiar `open`
 *      (patrón de estado derivado, `openSeen`), no en el efecto pasivo: no
 *      hay frame «expirado» al reabrir para un QR nuevo.
 *
 * Aquí lo estático (fuente del diálogo) y lo puro (QrPoller en Node: la
 * secuencia start → checkNow → stop que hace la consulta única). El diálogo
 * real montado con React queda en tester-f2c-r10. Organización ficticia
 * (org 120), sin nombres reales.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { QrPoller } from '@/lib/services/integrations/qrShared/qrPoller';

const SRC = join(process.cwd(), 'src');
const readSrc = (rel: string): string => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
const QR_DIALOG = readSrc('components/shared/QrPaymentDialog.tsx');

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
  new QrPoller({ reference: 'POS-120-r11', organizationId: 120, ...over });

// ---------------------------------------------------------------------------
// AA · QrPoller: la consulta única de «Verificar pago»
// ---------------------------------------------------------------------------

describe('AA · consulta única: start → checkNow → stop', () => {
  /** Lo que hace handleManualCheck en el estado vencido con el poller parado. */
  async function oneShot(poller: QrPoller, answer: string | Error): Promise<void> {
    if (!poller.isRunning) poller.start();
    const check = poller.checkNow();
    if (answer instanceof Error) pending.shift()!.reject(answer);
    else pending.shift()!.resolve(answer);
    await check;
    await flush();
    poller.stop();
  }

  it('`pending`: un solo fetch, ningún timer después y el poller parado; una segunda pulsación abre otra consulta', async () => {
    const onPaid = jest.fn();
    const poller = mk({ onPaid });
    await oneShot(poller, 'pending');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    expect(poller.isRunning).toBe(false);
    jest.advanceTimersByTime(30 * 60_000);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await oneShot(poller, 'paid');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onPaid).toHaveBeenCalledTimes(1);
  });

  it('`paid`: onPaid una vez y el stop() posterior es inocuo (el poller ya se paró solo)', async () => {
    const onPaid = jest.fn();
    const onStatusChange = jest.fn();
    const poller = mk({ onPaid, onStatusChange });
    await oneShot(poller, 'paid');
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(onStatusChange).toHaveBeenCalledWith('paid');
    expect(poller.isRunning).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('red caída: onError con el poller aún «corriendo» (por eso el diálogo lo avisa con oneShotCheckRef) y luego parado sin timer', async () => {
    const onError = jest.fn();
    let runningAtError: boolean | null = null;
    const poller = mk({
      onError: (e) => {
        runningAtError = poller.isRunning;
        onError(e);
      },
    });
    await oneShot(poller, new Error('red caída'));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(runningAtError).toBe(true);
    expect(poller.isRunning).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('`expired` del proveedor en la consulta única: onExpired (veredicto) y nada más que consultar', async () => {
    const onExpired = jest.fn();
    const onPaid = jest.fn();
    const poller = mk({ onExpired, onPaid });
    await oneShot(poller, 'expired');
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(onPaid).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Estático: el cableado del diálogo
// ---------------------------------------------------------------------------

describe('AA/AB · estático: QrPaymentDialog', () => {
  const manual = QR_DIALOG.slice(QR_DIALOG.indexOf('const handleManualCheck = async'), QR_DIALOG.indexOf('// Render'));
  const pollerEffect = QR_DIALOG.slice(QR_DIALOG.indexOf('const poller = new QrPoller('), QR_DIALOG.indexOf('pollerRef.current = poller;'));
  const countdown = QR_DIALOG.slice(QR_DIALOG.indexOf('// Efecto: cuenta regresiva'), QR_DIALOG.indexOf('// Handlers'));

  it('AA · `providerTerminal` lo pone SOLO el poller (onStatusChange terminal y onExpired), nunca la cuenta atrás local', () => {
    expect(pollerEffect.match(/setProviderTerminal\(true\)/g)?.length).toBe(2);
    expect(countdown).not.toContain('setProviderTerminal');
    expect(QR_DIALOG).toContain('const canVerifyExpired = isExpired && !isPaid && !providerTerminal;');
  });

  it('AA · el botón «Verificar pago» vive en `isWaiting || canVerifyExpired` y el texto del estado vencido lo nombra', () => {
    expect(QR_DIALOG).toContain('{isWaiting || canVerifyExpired ? (');
    expect(QR_DIALOG).toContain("'Verificar pago'");
    expect(QR_DIALOG).toContain('Si el cliente ya pagó, pulse «Verificar pago»');
  });

  it('AA/AC · consulta única: `oneShot` en el estado vencido con el poller parado O dentro de la gracia (que se cancela al pulsar); en finally se vuelve a parar salvo que haya pagado', () => {
    expect(manual).toContain('const inGrace = canVerifyExpired && graceTimerRef.current !== null;');
    expect(manual).toContain('const oneShot = canVerifyExpired && (inGrace || !poller.isRunning);');
    // AC (ronda 12): la gracia de Z se cancela ANTES de consultar, para que su
    // stop() no descarte el `paid` que el cajero pidió a mano.
    expect(manual.indexOf('clearTimeout(graceTimerRef.current);')).toBeGreaterThan(0);
    expect(manual.indexOf('clearTimeout(graceTimerRef.current);')).toBeLessThan(manual.indexOf('await poller.checkNow();'));
    expect(manual).toContain('if (oneShot && !paidHandledRef.current) poller.stop();');
    // El `finally` para el poller ANTES de soltar `checking`, y siempre limpia la bandera del aviso de error.
    expect(manual.indexOf('oneShotCheckRef.current = false;')).toBeLessThan(manual.indexOf('poller.stop();'));
    expect(manual.indexOf('poller.stop();')).toBeLessThan(manual.indexOf('setChecking(false);'));
  });

  it('AA · onError avisa si el poller murió O si la consulta era la única (oneShotCheckRef); el aviso de W no sobrevive al vencimiento local', () => {
    expect(pollerEffect).toContain('if (poller.isRunning && !oneShotCheckRef.current) return;');
    expect(countdown).toContain('setVerifyFailed(false);');
  });

  it('AB · reinicio derivado durante el render: `openSeen` antes de los refs y el efecto [open] ya no reinicia estado renderizado', () => {
    const derived = QR_DIALOG.indexOf('const [openSeen, setOpenSeen] = useState<boolean>(open);');
    expect(derived).toBeGreaterThan(0);
    expect(derived).toBeLessThan(QR_DIALOG.indexOf('const pollerRef = useRef'));
    const block = QR_DIALOG.slice(derived, QR_DIALOG.indexOf('const pollerRef = useRef'));
    for (const reset of ["setStatus('pending')", 'setRemaining(getRemainingSeconds(expiresAt))', 'setChecking(false)', 'setVerifyFailed(false)', 'setProviderTerminal(false)']) {
      expect(block).toContain(reset);
    }
    const openEffect = QR_DIALOG.slice(QR_DIALOG.indexOf('useEffect(() => {\n    if (!open) return;'), QR_DIALOG.indexOf('const poller = new QrPoller('));
    expect(openEffect).not.toContain('setStatus(');
    expect(openEffect).not.toContain('setRemaining(');
    expect(openEffect).toContain('paidHandledRef.current = false;');
    expect(openEffect).toContain('terminalNotifiedRef.current = false;');
    expect(openEffect).toContain('oneShotCheckRef.current = false;');
  });
});
