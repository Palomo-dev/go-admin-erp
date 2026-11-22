/**
 * «Anular devolución» (Figma 873:573997): la lógica pura que elige el diálogo,
 * la fecha del asiento espejo y «Qué se revierte"; el cuerpo y los errores del
 * route handler; el contrato de la migración y las claves en los 4 idiomas.
 * Datos ficticios; sin organizaciones reales.
 */
import fs from 'fs';
import path from 'path';
import es from '../../../../messages/es.json';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import pt from '../../../../messages/pt.json';
import {
  bloqueoAnulacion,
  claveErrorAnulacion,
  codigoErrorAnulacion,
  CODIGOS_ERROR_ANULACION,
  consecuenciasAnulacion,
  cuerpoAnulacion,
  diaDeFecha,
  dialogoAnulacion,
  estadoHttpAnulacion,
  mesDeFecha,
  normalizarDiagnostico,
  opcionesFechaEspejo,
  reenvioNotaCredito,
  type DiagnosticoAnulacion,
} from '@/lib/pos/devoluciones/anularDevolucionLogica';
import { buildCheckoutEnvelope } from '@/lib/offline/checkoutRpc';

const BASE: DiagnosticoAnulacion = normalizarDiagnostico({
  return_id: 8,
  estado: 'processed',
  metodo: 'cash',
  total: '89900.00',
  tiene_permiso: true,
  nota: { id: 'nc-1', numero: 'NC-000033', estado_dian: 'rechazada', fecha_aceptacion: null },
  fecha_original: '2026-09-23',
  hoy: '2026-11-21',
  periodo_original_abierto: true,
  periodo_hoy_abierto: true,
  caja_abierta: 509,
  saldo_a_favor: null,
  asientos: [{ id: 20118, fecha: '2026-09-23T15:42:00+00:00', numero: '#20.118', memo: 'Reintegro' }],
  bloqueo: null,
  caso: 'anulable',
});

describe('diagnóstico → diálogo', () => {
  test('normaliza el JSON de la RPC (números, fechas, nota y asientos)', () => {
    expect(BASE.total).toBe(89900);
    expect(BASE.nota).toEqual({ id: 'nc-1', numero: 'NC-000033', estado_dian: 'rechazada', fecha_aceptacion: null });
    expect(BASE.asientos[0]).toMatchObject({ id: 20118, numero: '#20.118' });
    const vacio = normalizarDiagnostico(null);
    expect(vacio.caso).toBe('bloqueada');
    expect(vacio.tiene_permiso).toBe(false);
    expect(normalizarDiagnostico({ fecha_original: '2026-09-23T00:00:00Z', caso: 'otro' })).toMatchObject({ fecha_original: '2026-09-23', caso: 'bloqueada' });
  });

  test('nota rechazada o sin transmitir con permiso → diálogo de anular (2719:190434 / 190511)', () => {
    expect(dialogoAnulacion(BASE)).toBe('anular');
    expect(bloqueoAnulacion(BASE)).toBeNull();
  });

  test('nota aceptada por la DIAN → «No se puede anular» con venta nueva (2719:190584)', () => {
    const d = { ...BASE, caso: 'nota_aceptada' as const, bloqueo: 'nota_aceptada_dian' };
    expect(dialogoAnulacion(d)).toBe('no_se_puede');
    // Aunque no tenga permiso, la nota aceptada manda: la salida es la venta nueva.
    expect(dialogoAnulacion({ ...d, tiene_permiso: false })).toBe('no_se_puede');
  });

  test('otro impedimento o sin permiso → bloqueada con su razón', () => {
    expect(dialogoAnulacion({ ...BASE, caso: 'bloqueada' })).toBe('bloqueada');
    expect(bloqueoAnulacion({ ...BASE, caso: 'bloqueada', bloqueo: 'efectivo_sin_caja' })).toBe('efectivo_sin_caja');
    expect(dialogoAnulacion({ ...BASE, tiene_permiso: false })).toBe('bloqueada');
    expect(bloqueoAnulacion({ ...BASE, tiene_permiso: false })).toBe('sin_permiso');
    expect(bloqueoAnulacion({ ...BASE, caso: 'ya_anulada', bloqueo: 'ya_anulada' })).toBe('ya_anulada');
  });
});

describe('fecha del asiento espejo', () => {
  test('los dos periodos abiertos: «Hoy» por defecto y la original habilitada', () => {
    expect(opcionesFechaEspejo(BASE)).toEqual({ hoy: true, original: true, inicial: 'hoy', ayuda: 'original_abierto' });
  });

  test('periodo original cerrado: solo «Hoy» (2719:190511)', () => {
    expect(opcionesFechaEspejo({ ...BASE, periodo_original_abierto: false })).toEqual({ hoy: true, original: false, inicial: 'hoy', ayuda: 'original_cerrado' });
  });

  test('periodo de hoy cerrado: solo la fecha original; los dos cerrados: ninguna', () => {
    expect(opcionesFechaEspejo({ ...BASE, periodo_hoy_abierto: false })).toMatchObject({ hoy: false, original: true, inicial: 'original', ayuda: 'hoy_cerrado' });
    expect(opcionesFechaEspejo({ ...BASE, periodo_hoy_abierto: false, periodo_original_abierto: false })).toMatchObject({ inicial: null, ayuda: 'ambos_cerrados' });
  });

  test('misma mensualidad: la ayuda lo dice', () => {
    expect(opcionesFechaEspejo({ ...BASE, fecha_original: '2026-11-02' }).ayuda).toBe('mismo_mes');
  });

  test('mes y día del día de la organización sin correrse (TZ del proceso irrelevante)', () => {
    expect(mesDeFecha('2026-09-01', 'es-CO').toLowerCase()).toContain('septiembre');
    expect(mesDeFecha('2026-09-30', 'es-CO')).toMatch(/2026/);
    expect(diaDeFecha('2026-09-01', 'es-CO')).toMatch(/^1\b/);
    expect(mesDeFecha('no-fecha', 'es-CO')).toBe('');
  });
});

describe('qué se revierte', () => {
  const lineas = [
    { nombre: 'Tenis urbanos · talla 40', cantidad: 1, repuesta: true },
    { nombre: 'Medias', cantidad: 2, repuesta: false },
  ];

  test('efectivo con nota rechazada: asientos, inventario, nota, caja y venta (orden del Figma)', () => {
    expect(consecuenciasAnulacion(BASE, lineas)).toEqual([
      { clave: 'asientos', numeros: '#20.118' },
      { clave: 'inventario', unidades: 1, productos: 'Tenis urbanos · talla 40' },
      { clave: 'notaRechazada', numero: 'NC-000033' },
      { clave: 'caja', sesion: 509 },
      { clave: 'venta' },
    ]);
  });

  test('saldo a favor, nota sin transmitir y sin caja abierta', () => {
    const d = { ...BASE, metodo: 'store_credit' as const, caja_abierta: null, saldo_a_favor: { id: 's1', usado: false }, nota: { ...BASE.nota!, estado_dian: 'sin_transmitir' as const } };
    expect(consecuenciasAnulacion(d, []).map((c) => c.clave)).toEqual(['asientos', 'notaSinTransmitir', 'saldo', 'venta']);
    expect(consecuenciasAnulacion({ ...BASE, caja_abierta: null, asientos: [], nota: null }, []).map((c) => c.clave)).toEqual(['sinAsientos', 'cajaSinSesion', 'venta']);
  });
});

describe('route handler: cuerpo y errores', () => {
  test('motivo de 5+ caracteres limpio y fecha hoy | original (hoy por defecto)', () => {
    expect(cuerpoAnulacion({ motivo: '  Registrada   por error ', fecha_espejo: 'original' })).toEqual({ motivo: 'Registrada por error', fecha_espejo: 'original' });
    expect(cuerpoAnulacion({ motivo: 'Cambio de talla' })).toEqual({ motivo: 'Cambio de talla', fecha_espejo: 'hoy' });
    expect(cuerpoAnulacion({ motivo: 'abc' })).toEqual({ error: 'motivo_obligatorio' });
    expect(cuerpoAnulacion({ motivo: 'Motivo suficiente', fecha_espejo: 'ayer' })).toEqual({ error: 'fecha_espejo_invalida' });
    expect(cuerpoAnulacion(null)).toEqual({ error: 'motivo_obligatorio' });
  });

  test('códigos de la RPC → código estable y HTTP', () => {
    expect(codigoErrorAnulacion({ message: 'efectivo_sin_caja' })).toBe('efectivo_sin_caja');
    expect(codigoErrorAnulacion({ message: 'nota_aceptada_dian' })).toBe('nota_aceptada_dian');
    expect(codigoErrorAnulacion({ message: 'new row violates periodo_cerrado' })).toBe('periodo_cerrado');
    expect(codigoErrorAnulacion({ message: 'boom' })).toBe('generico');
    expect(estadoHttpAnulacion('motivo_obligatorio')).toBe(400);
    expect(estadoHttpAnulacion('sin_permiso')).toBe(403);
    expect(estadoHttpAnulacion('devolucion_no_encontrada')).toBe(404);
    expect(estadoHttpAnulacion('efectivo_sin_caja')).toBe(409);
    expect(estadoHttpAnulacion('generico')).toBe(500);
    expect(claveErrorAnulacion('saldo_a_favor_aplicado')).toBe('saldoAFavorAplicado');
  });
});

describe('traducciones posDevolucionesAnular', () => {
  type Arbol = { [k: string]: string | Arbol };
  const hojas = (o: Arbol, prefijo = ''): Map<string, string> => {
    const m = new Map<string, string>();
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string') m.set(prefijo + k, v);
      else for (const [kk, vv] of hojas(v, `${prefijo}${k}.`)) m.set(kk, vv);
    }
    return m;
  };
  const variables = (s: string) =>
    [...new Set(Array.from(s.replace(/\{\w+, plural,[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, (p) => `{${p.slice(1, p.indexOf(','))}}`).matchAll(/\{(\w+)\}/g)).map((x) => x[1]))].sort();
  const idiomas = { es, en, fr, pt } as Record<string, { posDevolucionesAnular?: Arbol }>;
  const base = hojas(idiomas.es.posDevolucionesAnular!);

  test('mismas claves y mismas variables en los 4 idiomas', () => {
    for (const [idioma, m] of Object.entries(idiomas)) {
      const h = hojas(m.posDevolucionesAnular ?? {});
      expect([idioma, [...h.keys()].sort()]).toEqual([idioma, [...base.keys()].sort()]);
      for (const [clave, texto] of base) expect([idioma, clave, variables(h.get(clave) ?? '')]).toEqual([idioma, clave, variables(texto)]);
    }
  });

  test('cada código de error y cada estado de la nota tiene texto', () => {
    for (const codigo of [...CODIGOS_ERROR_ANULACION, 'generico' as const]) expect([codigo, base.has(`errores.${claveErrorAnulacion(codigo)}`)]).toEqual([codigo, true]);
    for (const estado of ['aceptada', 'rechazada', 'en_envio', 'sin_transmitir', 'anulada']) expect(base.has(`estadosNota.${estado}`)).toBe(true);
  });
});

describe('contrato de la migración 20261122001319', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../../../supabase/migrations/20261122001319_pos_devoluciones_anular.sql'), 'utf8');
  const rollback = fs.readFileSync(path.join(__dirname, '../../../../supabase/rollbacks/20261122001319_pos_devoluciones_anular_rollback.sql'), 'utf8');

  test('cerrada a anon, permiso pos.void y org de la sesión como parámetro', () => {
    expect(sql).toMatch(/revoke all on function public\.fn_devolucion_anular\(integer, integer, text, text\) from public, anon/);
    expect(sql).toMatch(/revoke all on function public\.fn_devolucion_anulacion_estado\(integer, integer\) from public, anon/);
    expect(sql).toMatch(/fn_tiene_permiso\(p_organization_id, 'pos\.void'\)/);
    expect(sql).toMatch(/where id = p_return_id and organization_id = p_organization_id\s+for update/);
  });

  test('reglas del Contador: espejo, periodo, caja abierta y nota aceptada', () => {
    expect(sql).toMatch(/fn_revertir_asiento_en_fecha\(v_asiento\.id/);
    expect(sql).toMatch(/fn_is_period_open/);
    expect(sql).toMatch(/'efectivo_sin_caja'/);
    expect(sql).toMatch(/'nota_aceptada_dian'/);
    expect(sql).toMatch(/fn_caja_abierta_para/);
    expect(sql).toMatch(/'out', v_qty/);
    // Sin nombres de organizaciones ni credenciales.
    expect(sql).not.toMatch(/service_role_key|eyJ[a-zA-Z0-9]{20,}/);
  });

  test('el rollback quita funciones y columnas y avisa que no revierte datos', () => {
    expect(rollback).toMatch(/drop function if exists public\.fn_devolucion_anular/);
    expect(rollback).toMatch(/drop column if exists voided_at/);
    expect(rollback).toMatch(/no revierte datos/i);
  });
});

describe('«Reenviar nota crédito a la DIAN»', () => {
  const nota = (estado: string, extra: Partial<{ estado: string; einvoice_status: string | null }> = {}) => ({
    estado: 'issued',
    einvoice_status: null as string | null,
    ...extra,
    envio: { job_id: 'job-1', estado },
  });

  test('solo con el envío rechazado o fallido, la nota viva y la devolución sin anular', () => {
    expect(reenvioNotaCredito(nota('rejected'), { anulada: false, permiso: true })).toEqual({ visible: true, jobId: 'job-1', permitido: true });
    expect(reenvioNotaCredito(nota('failed'), { anulada: false, permiso: false })).toEqual({ visible: true, jobId: 'job-1', permitido: false });
    for (const estado of ['accepted', 'pending', 'processing', 'sent', 'cancelled']) {
      expect([estado, reenvioNotaCredito(nota(estado), { anulada: false, permiso: true }).visible]).toEqual([estado, false]);
    }
    expect(reenvioNotaCredito(nota('rejected', { einvoice_status: 'accepted' }), { anulada: false, permiso: true }).visible).toBe(false);
    expect(reenvioNotaCredito(nota('rejected', { estado: 'void' }), { anulada: false, permiso: true }).visible).toBe(false);
    expect(reenvioNotaCredito(nota('rejected'), { anulada: true, permiso: true }).visible).toBe(false);
    expect(reenvioNotaCredito({ estado: 'issued', einvoice_status: null, envio: null }, { anulada: false, permiso: true }).visible).toBe(false);
    expect(reenvioNotaCredito(null, { anulada: false, permiso: true }).visible).toBe(false);
  });

  test('reutiliza el reintento de la cola (sin segunda implementación de envío)', () => {
    const pagina = fs.readFileSync(path.join(__dirname, '../../../components/pos/devoluciones/DevolucionDetallePage.tsx'), 'utf8');
    expect(pagina).toMatch(/import \{ reintentarEnvioDian \} from '@\/lib\/finanzas\/notas\/clienteNotas'/);
    expect(pagina).not.toMatch(/\/api\/factus\/credit-note|encolarDocumento/);
  });
});

describe('venta nueva enlazada a la devolución (20261122004635)', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../../../supabase/migrations/20261122004635_pos_venta_reventa_de_devolucion.sql'), 'utf8');
  const rollback = fs.readFileSync(path.join(__dirname, '../../../../supabase/rollbacks/20261122004635_pos_venta_reventa_de_devolucion_rollback.sql'), 'utf8');

  test('columna nula en sales, validación en la base y parche verificado de pos_checkout_v1', () => {
    expect(sql).toMatch(/alter table public\.sales add column if not exists resale_of_return_id integer\s+references public\.returns\(id\) on delete set null/);
    expect(sql).toMatch(/r\.organization_id = p_org and r\.status = 'processed'/);
    expect(sql).toMatch(/revoke all on function public\.fn_venta_reventa_de\(integer, jsonb\) from public, anon, authenticated/);
    expect(sql).toMatch(/no aparecen una sola vez/);
    expect(rollback).toMatch(/drop column if exists resale_of_return_id/);
    expect(rollback).toMatch(/no revierte datos/i);
  });

  test('el sobre lleva la devolución solo en una venta nueva', () => {
    const base = {
      saleId: 's1', createdAt: '2026-11-21T10:00:00Z', organizationId: 7, branchId: 3, userId: null, currency: 'COP',
      itemCalcs: [], subtotal: 0, taxTotal: 0, discountTotal: 0, total: 0, promotionIds: [], invoiceCommissionAmount: 0,
    };
    const carrito = (extra: Record<string, unknown>) => ({ id: 'c1', organization_id: 7, branch_id: 3, status: 'active', items: [], subtotal: 0, tax_amount: 0, tax_total: 0, discount_amount: 0, discount_total: 0, total: 0, created_at: '', updated_at: '', ...extra });
    const sobre = (cart: Record<string, unknown>, mode?: 'sale' | 'debt' | 'settle') =>
      buildCheckoutEnvelope({ ...base, mode, checkout: { cart, payments: [] } } as unknown as Parameters<typeof buildCheckoutEnvelope>[0]);
    expect(sobre(carrito({ resale_of_return_id: 8 })).resale_of_return_id).toBe(8);
    expect(sobre(carrito({ resale_of_return_id: 8 }), 'debt').resale_of_return_id).toBe(8);
    expect(sobre(carrito({ resale_of_return_id: 8 }), 'settle').resale_of_return_id).toBeUndefined();
    expect('resale_of_return_id' in sobre(carrito({}))).toBe(false);
  });
});
