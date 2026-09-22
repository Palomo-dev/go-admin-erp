/**
 * Fase 2 · Parte C (Cobro con QR a pantalla completa) · ronda 7 (cierre,
 * lista congelada C1–C6 + hallazgos concretos de QA/tester de la ronda 6).
 *
 * Cubre, en Node y sin DOM:
 *  1. QA-2 · onPaid decide UNA vez, con el `prev` del updater, qué entrada
 *     queda confirmada (`confirmQrPaymentEntry` en payment.ts): la lista de
 *     pagos y el id tocado salen de la misma fuente. Se simula «payments de
 *     la clausura ≠ prev» (el cajero quitó la entrada QR con el poller vivo)
 *     y se afirma que la entrada tocada es la que EXISTE.
 *  2. Fin de línea (QA-1 / tester-1): `.gitattributes` fija LF; los guards
 *     C5 (qr-payment-f2c-r4) y D6 (desktop-display-r4) leen el fuente
 *     normalizando `\r\n` y C5 consulta el índice (`git ls-files --eol`),
 *     no el checkout.
 *  3. Trazabilidad (QA-3 / tester-2): la regla real del botón «Generar QR de
 *     pago» es «deshabilitado cuando las OTRAS entradas cubren el total,
 *     incluido total 0»; el toast de handleQrPayment es la segunda red.
 *
 * Helpers copiados a propósito (un test no importa de otro). Organización
 * ficticia (org 120), sin nombres reales.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { confirmQrPaymentEntry, type CashReceivedEntry } from '@/lib/pos/display/payment';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const readSrc = (rel: string): string => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
const CHECKOUT = readSrc('components/pos/CheckoutDialog.tsx');
const ON_PAID = CHECKOUT.slice(CHECKOUT.indexOf('onPaid={() => {'), CHECKOUT.indexOf('<SerialSelectorDialog'));

type Entry = CashReceivedEntry;
const TOTAL = 25_000;

/** Lo que hacía onPaid hasta la ronda 6 con el `payments` de la clausura (para demostrar la divergencia). */
function legacyConfirmedId(closurePayments: ReadonlyArray<Entry>, qrEntryId: string | undefined, fallbackId: string): string {
  return qrEntryId !== undefined && closurePayments.some((p) => p.id === qrEntryId) ? qrEntryId : fallbackId;
}

// ---------------------------------------------------------------------------
// 1 · QA-2: una sola fuente para la lista y el id tocado
// ---------------------------------------------------------------------------

describe('QA-2 · confirmQrPaymentEntry: lista de pagos e id tocado salen del mismo `prev`', () => {
  const fallback: Entry = { id: 'respaldo', method: 'breb_qr', amount: 10_000 };

  it('la entrada de origen existe: se confirma (método e importe del código) y es la tocada', () => {
    const prev: Entry[] = [
      { id: 'cash', method: 'cash', amount: 15_000 },
      { id: 'q1', method: 'qr', amount: 10_000 },
    ];
    const r = confirmQrPaymentEntry({ payments: prev, qrEntryId: 'q1', method: 'breb_qr', amount: 10_000, fallback });
    expect(r.confirmedId).toBe('q1');
    expect(r.payments).toEqual([
      { id: 'cash', method: 'cash', amount: 15_000 },
      { id: 'q1', method: 'breb_qr', amount: 10_000 },
    ]);
    expect(r.payments.some((p) => p.id === r.confirmedId)).toBe(true);
    // Sin mutar la entrada original.
    expect(prev[1]).toEqual({ id: 'q1', method: 'qr', amount: 10_000 });
  });

  it('la entrada de origen ya no existe (el cajero la quitó): se añade el respaldo y ESE es el tocado', () => {
    const prev: Entry[] = [{ id: 'cash', method: 'cash', amount: 15_000 }];
    const r = confirmQrPaymentEntry({ payments: prev, qrEntryId: 'q1', method: 'breb_qr', amount: 10_000, fallback });
    expect(r.confirmedId).toBe('respaldo');
    expect(r.payments).toEqual([{ id: 'cash', method: 'cash', amount: 15_000 }, fallback]);
    expect(prev).toHaveLength(1);
  });

  it('sin qrEntryId (o vacío / null): respaldo', () => {
    const prev: Entry[] = [{ id: 'q1', method: 'qr', amount: TOTAL }];
    for (const id of [undefined, '', null]) {
      const r = confirmQrPaymentEntry({ payments: prev, qrEntryId: id, method: 'breb_qr', amount: TOTAL, fallback });
      expect(r.confirmedId).toBe('respaldo');
      expect(r.payments).toHaveLength(2);
    }
  });

  it('método vacío conserva el de la entrada; lista no válida cuenta como vacía', () => {
    const prev: Entry[] = [{ id: 'q1', method: 'redeban_qr', amount: TOTAL }];
    const r = confirmQrPaymentEntry({ payments: prev, qrEntryId: 'q1', method: '', amount: 20_000, fallback });
    expect(r.payments[0]).toEqual({ id: 'q1', method: 'redeban_qr', amount: 20_000 });
    const bad = confirmQrPaymentEntry({ payments: undefined as unknown as Entry[], qrEntryId: 'q1', method: 'breb_qr', amount: TOTAL, fallback });
    expect(bad.payments).toEqual([fallback]);
    expect(bad.confirmedId).toBe('respaldo');
  });

  it('payments de la clausura ≠ prev: la versión anterior marcaba un id inexistente; ahora la tocada es la que existe', () => {
    // Clausura capturada al abrir el diálogo QR: aún tiene la entrada q1.
    const closure: Entry[] = [
      { id: 'cash', method: 'cash', amount: 15_000 },
      { id: 'q1', method: 'qr', amount: 10_000 },
    ];
    // Estado real al confirmar: el cajero quitó q1 con el poller vivo.
    const prev: Entry[] = [{ id: 'cash', method: 'cash', amount: 15_000 }];

    // Antes: la lista decidía con `prev` (añadía el respaldo) y el id con la
    // clausura (q1) → se tocaba un id que no existe y el respaldo quedaba
    // sin marcar (reabría el HALLAZGO P: «Aplicar» propina lo reescribía).
    const legacyList = [...prev, fallback];
    const legacyId = legacyConfirmedId(closure, 'q1', fallback.id);
    expect(legacyId).toBe('q1');
    expect(legacyList.some((p) => p.id === legacyId)).toBe(false);

    // Ahora: una sola fuente (`prev`).
    const r = confirmQrPaymentEntry({ payments: prev, qrEntryId: 'q1', method: 'breb_qr', amount: 10_000, fallback });
    expect(r.confirmedId).toBe('respaldo');
    expect(r.payments.some((p) => p.id === r.confirmedId)).toBe(true);
    expect(r.payments).toEqual([{ id: 'cash', method: 'cash', amount: 15_000 }, fallback]);
  });

  it('invariante: confirmedId siempre está en la lista devuelta (una sola entrada por el total y mixto)', () => {
    const casos: Array<{ prev: Entry[]; id: string | undefined }> = [
      { prev: [{ id: 'q', method: 'qr', amount: TOTAL }], id: 'q' },
      { prev: [{ id: 'q', method: 'qr', amount: TOTAL }], id: 'otra' },
      { prev: [], id: 'q' },
      { prev: [{ id: 'cash', method: 'cash', amount: 15_000 }, { id: 'q', method: 'qr', amount: 10_000 }], id: 'q' },
    ];
    for (const { prev, id } of casos) {
      const r = confirmQrPaymentEntry({ payments: prev, qrEntryId: id, method: 'breb_qr', amount: 10_000, fallback });
      expect(r.payments.some((p) => p.id === r.confirmedId)).toBe(true);
      // Nunca dos entradas confirmadas: o se reescribe la de origen o se añade UNA.
      expect(r.payments.length).toBe(prev.some((p) => p.id === id) ? prev.length : prev.length + 1);
    }
  });

  it('CheckoutDialog (estático): onPaid no decide con el `payments` de la clausura; el id viaja por ref del updater de payments al de touchedIds', () => {
    expect(ON_PAID.length).toBeGreaterThan(0);
    expect(CHECKOUT).toContain('const confirmedQrEntryIdRef = useRef<string | null>(null);');
    expect(CHECKOUT).toMatch(/import \{[^}]*\bconfirmQrPaymentEntry\b[^}]*\} from '@\/lib\/pos\/display\/payment';/);
    // Una sola decisión, dentro del updater y con `prev`.
    expect(ON_PAID).toContain('confirmQrPaymentEntry({ payments: prev, qrEntryId, method: qrPaymentMethod, amount: qrPaymentAmount, fallback: newPayment })');
    expect(ON_PAID).toContain('confirmedQrEntryIdRef.current = confirmed.confirmedId;');
    expect(ON_PAID).toContain('return confirmed.payments;');
    // El updater de touchedIds lee el ref, no la clausura.
    expect(ON_PAID).toMatch(/setTouchedIds\(prev => \{\s*const confirmedQrEntryId = confirmedQrEntryIdRef\.current \?\? newPayment\.id;\s*return prev\.has\(confirmedQrEntryId\) \? prev : new Set\(prev\)\.add\(confirmedQrEntryId\);\s*\}\);/);
    expect(ON_PAID).not.toMatch(/payments\.some\(/);
    expect(ON_PAID).not.toMatch(/prev\.some\(p => p\.id === qrEntryId\)/);
    // Orden: el ref se limpia, se fija en el updater de payments y se lee en el de touchedIds.
    expect(ON_PAID.indexOf('confirmedQrEntryIdRef.current = null;')).toBeLessThan(ON_PAID.indexOf('setPayments('));
    expect(ON_PAID.indexOf('setPayments(')).toBeLessThan(ON_PAID.indexOf('setTouchedIds('));
    // El hook de `payments` se declara antes que el de `touchedIds`: su updater corre primero en el render.
    expect(CHECKOUT.indexOf('const [payments, setPayments] = useState<PaymentEntry[]>([]);')).toBeLessThan(
      CHECKOUT.indexOf('const [touchedIds, setTouchedIds] = useState<Set<string>>(() => new Set());'),
    );
  });
});

// ---------------------------------------------------------------------------
// 2 · Fin de línea: índice, no checkout
// ---------------------------------------------------------------------------

describe('QA-1 / tester-1 · fin de línea: .gitattributes y guards que no dependen del checkout', () => {
  it('.gitattributes en la raíz fija `* text=auto eol=lf`', () => {
    const attrs = readFileSync(join(ROOT, '.gitattributes'), 'utf8').replace(/\r\n/g, '\n');
    expect(attrs).toMatch(/^\* text=auto eol=lf$/m);
  });

  it('los guards C5 (qr-payment-f2c-r4) y D6 (desktop-display-r4) normalizan `\\r\\n` antes de comparar', () => {
    const c5 = readSrc('__tests__/pos-display/qr-payment-f2c-r4.test.ts');
    const d6 = readSrc('__tests__/pos-display/desktop-display-r4.test.ts');
    expect(c5).toContain(".replace(/\\r\\n/g, '\\n')");
    expect(d6).toContain(".replace(/\\r\\n/g, '\\n')");
    // C5 pregunta al índice de git, no a los bytes del checkout.
    expect(c5).toContain("execFileSync('git', ['ls-files', '--eol', '--'");
    expect(c5).not.toMatch(/it\.each\(files\)\('%s no contiene \\\\r'/);
  });
});

// ---------------------------------------------------------------------------
// 3 · Trazabilidad: la regla real del botón «Generar QR de pago»
// ---------------------------------------------------------------------------

describe('QA-3 / tester-2 · el botón «Generar QR» se deshabilita cuando las OTRAS entradas cubren el total, incluido total 0', () => {
  /** Misma expresión que el botón en CheckoutDialog (othersCoverTotal). */
  const othersCoverTotal = (payments: ReadonlyArray<Entry>, entryId: string, cartTotal: number): boolean =>
    payments.filter((p) => p.id !== entryId).reduce((sum, p) => sum + (Number(p.amount) || 0), 0) >= cartTotal;

  it('estático: la expresión del botón sigue siendo Σ otras ≥ cartTotal', () => {
    expect(CHECKOUT).toContain(
      'const othersCoverTotal = payments.filter((p) => p.id !== payment.id).reduce((sum, p) => sum + (Number(p.amount) || 0), 0) >= cartTotal;',
    );
    // Ronda 8 (F2C-R7-2): también deshabilitado mientras hay una generación en vuelo.
    expect(CHECKOUT).toContain('disabled={othersCoverTotal || isCreatingQr}');
    expect(CHECKOUT).toContain("toast.error('No hay saldo pendiente para cobrar con QR');");
  });

  it('total 0 (cortesía) con una sola entrada QR: 0 ≥ 0 ⇒ deshabilitado (el toast nunca llega por esa vía)', () => {
    expect(othersCoverTotal([{ id: 'q', method: 'breb_qr', amount: 0 }], 'q', 0)).toBe(true);
  });

  it('una sola entrada QR por el total ⇒ habilitado; efectivo 25.000 + entrada QR ⇒ deshabilitado; efectivo 15.000 + QR ⇒ habilitado', () => {
    expect(othersCoverTotal([{ id: 'q', method: 'breb_qr', amount: TOTAL }], 'q', TOTAL)).toBe(false);
    expect(othersCoverTotal([{ id: 'c', method: 'cash', amount: TOTAL }, { id: 'q', method: 'breb_qr', amount: 0 }], 'q', TOTAL)).toBe(true);
    expect(othersCoverTotal([{ id: 'c', method: 'cash', amount: 15_000 }, { id: 'q', method: 'breb_qr', amount: 10_000 }], 'q', TOTAL)).toBe(false);
  });
});
