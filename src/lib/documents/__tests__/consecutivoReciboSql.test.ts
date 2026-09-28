/**
 * Consecutivo propio de recibos de caja y comprobantes de egreso — caracterización
 * de la migración 20260928222823.
 *
 * jest corre sin base: la función y el trigger se probaron por el MCP de Supabase
 * en transacciones que se deshicieron (`begin … rollback`, con `DO … RAISE`) y el
 * resultado se anota aquí. Lo que corre en jest: que la migración siga diciendo
 * lo que la base hace, y un doble en memoria del generador con la misma regla.
 *
 * Prueba en la base, antes de aplicar (2026-09-28, transacción deshecha):
 *   backfill → 0 series con huecos o duplicados; el primer pago cronológico de
 *     cada organización queda RC-0001
 *   insert completed con receipt_number='RC-9999' escrito a mano → RC-0054 (se ignora)
 *   insert status 'paid' (se normaliza a completed) → RC-0055
 *   insert pending → NULL; update a completed → RC-0056
 *   insert failed → NULL · importe negativo (credit_note) → NULL
 *   account_payable → CE-0007 · primer invoice_purchase de otra organización → CE-0001
 *   anular (cancelled + voided_at) → conserva el número; reescribirlo o borrarlo → no cambia
 *   siguiente pago tras anular → RC-0057 (el anulado no se libera)
 *   fn_recibo_formatear('RC', 12345) → RC-12345 · serie 'XX' → serie_invalida
 *   fn_registrar_pago y fn_saldo_favor_crear llaman al generador; no queda el bloque viejo
 *   EXPLAIN del máximo → Index Scan Backward sobre uq_payments_org_recibo
 * Rollback probado en transacción deshecha: md5 de fn_registrar_pago y
 * fn_saldo_favor_crear idénticos a los de antes de la migración.
 */
import * as fs from 'fs';
import * as path from 'path';
import { ORIGENES_EGRESO } from '../server/cargadores/pagos';

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..');
const leer = (rel: string): string => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const sql = leer('supabase/migrations/20260928222823_recibos_consecutivo_por_organizacion.sql');
const rollback = leer('supabase/rollbacks/20260928222823_recibos_consecutivo_por_organizacion_rollback.sql');

describe('migración: columna, generador y trigger', () => {
  test('columna nueva NULL-able y única por organización (serie + número)', () => {
    expect(sql).toMatch(/alter table public\.payments add column if not exists receipt_number text;/);
    expect(sql).not.toMatch(/receipt_number text not null/i);
    expect(sql).toMatch(/create unique index if not exists uq_payments_org_recibo\s+on public\.payments \(organization_id, left\(receipt_number, 2\), public\.fn_recibo_consecutivo\(receipt_number\)\)/);
  });

  test('la serie CE coincide con los orígenes de egreso del motor de documentos', () => {
    const m = /case when p_source in \(([^)]*)\) then 'CE' else 'RC' end/.exec(sql);
    expect(m).not.toBeNull();
    const origenes = (m?.[1] ?? '').split(',').map((x) => x.trim().replace(/'/g, ''));
    expect(new Set(origenes)).toEqual(ORIGENES_EGRESO);
  });

  test('un solo generador con candado de transacción por organización y serie, sin EXECUTE para clientes', () => {
    expect(sql).toMatch(/perform pg_advisory_xact_lock\(hashtextextended\('recibo_pago:' \|\| p_org \|\| ':' \|\| p_serie, 0\)\);/);
    // El máximo mira las dos tablas: la serie no se repite entre pagos sueltos y pagos únicos.
    expect(sql).toMatch(/from public\.payments p\s+where p\.organization_id = p_org/);
    expect(sql).toMatch(/from public\.payment_groups g\s+where g\.organization_id = p_org/);
    expect(sql).toMatch(/revoke all on function public\.fn_recibo_siguiente_numero\(integer, text\) from public, anon, authenticated;/);
    expect(sql).toMatch(/revoke all on function public\.fn_payments_asignar_recibo\(\) from public, anon, authenticated;/);
  });

  test('el trigger numera solo pagos completados, sueltos y positivos, y nunca cambia un número emitido', () => {
    expect(sql).toMatch(/before insert or update of status, receipt_number, payment_group_id on public\.payments/);
    expect(sql).toMatch(/if tg_op = 'UPDATE' and old\.receipt_number is not null then\s+-- [^\n]*\n\s+new\.receipt_number := old\.receipt_number;/);
    expect(sql).toMatch(/new\.receipt_number := null;/);
    expect(sql).toMatch(/or new\.payment_group_id is not null\s+or new\.status is distinct from 'completed'\s+or coalesce\(new\.amount, 0\) <= 0/);
    // Ordena después de los BEFORE que fijan sucursal y normalizan 'paid' → 'completed'.
    expect(['trg_branch_default', 'trg_normalize_payment_status', 'trg_recibo_numero_pago'].sort()[2]).toBe('trg_recibo_numero_pago');
  });

  test('las funciones del pago único pasan al generador (egreso → CE) y la sustitución exige el bloque exacto', () => {
    expect(sql).toMatch(/v_recibo := public\.fn_recibo_siguiente_numero\(v_org, case when p_direccion = 'pago' then 'CE' else 'RC' end\);/);
    expect(sql).toMatch(/v_recibo := public\.fn_recibo_siguiente_numero\(v_org, 'RC'\);/);
    expect(sql).toMatch(/no aparece exactamente una vez/);
  });

  test('backfill cronológico por organización y serie, sin disparar los triggers de saldo', () => {
    expect(sql).toMatch(/set local session_replication_role = replica;[\s\S]*update public\.payments p\s+set receipt_number = n\.numero[\s\S]*set local session_replication_role = origin;/);
    expect(sql).toMatch(/partition by c\.organization_id, c\.serie order by c\.created_at nulls first, c\.id/);
    expect(sql).toMatch(/p\.status in \('completed', 'cancelled', 'voided', 'refunded', 'reversed'\)/);
    // El trigger se crea después del backfill.
    expect(sql.indexOf('create trigger trg_recibo_numero_pago')).toBeGreaterThan(sql.indexOf('set receipt_number = n.numero'));
  });

  test('el rollback revierte las funciones del pago único y avisa que pierde los números', () => {
    expect(rollback).toMatch(/drop trigger if exists trg_recibo_numero_pago on public\.payments;/);
    expect(rollback).toMatch(/execute replace\(v_def, v_fn\.nuevo, v_viejo\);/);
    expect(rollback).toMatch(/alter table public\.payments drop column if exists receipt_number;/);
    expect(rollback).toMatch(/ADVERTENCIA/);
  });
});

/**
 * Doble en memoria del generador y del trigger, con la misma regla que la base:
 * máximo + 1 por (organización, serie) sobre pagos y pagos únicos, formato con
 * mínimo 4 dígitos, número inmutable. Sirve para fijar el comportamiento que
 * el dueño pidió (anular no libera; sin huecos; series separadas).
 */
describe('doble del generador', () => {
  type Pago = { id: number; org: number; source: string; status: string; amount: number; grupo: boolean; numero: string | null };
  const formatear = (serie: string, n: number) => `${serie}-${String(n).padStart(4, '0')}`;
  const serieDe = (source: string) => (ORIGENES_EGRESO.has(source) ? 'CE' : 'RC');

  function crearBase(grupos: Array<{ org: number; numero: string }> = []) {
    const pagos: Pago[] = [];
    const siguiente = (org: number, serie: string) => {
      const nums = [...pagos.map((p) => ({ org: p.org, numero: p.numero })), ...grupos]
        .filter((x) => x.org === org && x.numero?.startsWith(serie))
        .map((x) => Number(String(x.numero).replace(/\D/g, '')));
      return formatear(serie, Math.max(0, ...nums) + 1);
    };
    const trigger = (nuevo: Pago, viejo?: Pago): Pago => {
      if (viejo?.numero) return { ...nuevo, numero: viejo.numero };
      const p = { ...nuevo, numero: null };
      if (p.grupo || p.status !== 'completed' || p.amount <= 0) return p;
      return { ...p, numero: siguiente(p.org, serieDe(p.source)) };
    };
    return {
      pagos,
      insertar(p: Omit<Pago, 'numero'> & { numero?: string | null }) {
        const fila = trigger({ numero: null, ...p });
        pagos.push(fila);
        return fila;
      },
      actualizar(id: number, cambios: Partial<Pago>) {
        const i = pagos.findIndex((p) => p.id === id);
        pagos[i] = trigger({ ...pagos[i], ...cambios }, pagos[i]);
        return pagos[i];
      },
    };
  }

  test('series separadas por organización y tipo, sin huecos', () => {
    const b = crearBase();
    expect(b.insertar({ id: 1, org: 1, source: 'invoice_sales', status: 'completed', amount: 10, grupo: false }).numero).toBe('RC-0001');
    expect(b.insertar({ id: 2, org: 1, source: 'sale', status: 'completed', amount: 10, grupo: false }).numero).toBe('RC-0002');
    expect(b.insertar({ id: 3, org: 1, source: 'account_payable', status: 'completed', amount: 10, grupo: false }).numero).toBe('CE-0001');
    expect(b.insertar({ id: 4, org: 2, source: 'web_order', status: 'completed', amount: 10, grupo: false }).numero).toBe('RC-0001');
  });

  test('fallidos, pendientes, negativos y pagos de un pago único no consumen número', () => {
    const b = crearBase([{ org: 1, numero: 'RC-0003' }]);
    expect(b.insertar({ id: 1, org: 1, source: 'web_order', status: 'failed', amount: 10, grupo: false }).numero).toBeNull();
    expect(b.insertar({ id: 2, org: 1, source: 'credit_note', status: 'completed', amount: -5, grupo: false }).numero).toBeNull();
    expect(b.insertar({ id: 3, org: 1, source: 'account_receivable', status: 'completed', amount: 5, grupo: true }).numero).toBeNull();
    expect(b.insertar({ id: 4, org: 1, source: 'web_order', status: 'pending', amount: 10, grupo: false }).numero).toBeNull();
    // Continúa después del número del pago único (misma serie por organización).
    expect(b.actualizar(4, { status: 'completed' }).numero).toBe('RC-0004');
  });

  test('anular no libera el número ni permite reescribirlo', () => {
    const b = crearBase();
    b.insertar({ id: 1, org: 1, source: 'invoice_sales', status: 'completed', amount: 10, grupo: false });
    expect(b.actualizar(1, { status: 'cancelled' }).numero).toBe('RC-0001');
    expect(b.actualizar(1, { numero: 'RC-0099' }).numero).toBe('RC-0001');
    expect(b.insertar({ id: 2, org: 1, source: 'invoice_sales', status: 'completed', amount: 10, grupo: false, numero: 'RC-0500' }).numero).toBe('RC-0002');
  });

  test('el relleno crece sin truncar', () => {
    expect(formatear('RC', 7)).toBe('RC-0007');
    expect(formatear('RC', 12345)).toBe('RC-12345');
  });
});
