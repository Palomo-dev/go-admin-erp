/**
 * Certificado de retenciones (Figma 09 · 1491:126182): piezas puras y
 * contrato de la serie CR con su migración.
 *
 * jest corre sin base. La RPC se probó por el MCP de Supabase antes de
 * aplicarla (2026-10-05, transacción abortada al final, organización 2):
 *   periodo enero–septiembre 2026, sucursal propia → CR-2026-0001 (nuevo)
 *   mismo proveedor, periodo y sucursal, mismos valores → CR-2026-0001 (reexpedido, no gasta número)
 *   periodo enero–agosto 2026 → CR-2026-0002 · periodo de 2025 → CR-2025-0001 (la serie va por año)
 *   proveedor de otra organización → P0002 PROVEEDOR_NO_ENCONTRADO
 *   sucursal de otra organización → P0002 SUCURSAL_NO_ENCONTRADA
 *   desde > hasta → 22023 PERIODO_INVALIDO
 *   privilegios: authenticated solo SELECT en la tabla, anon sin EXECUTE en la función.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  capitalizar,
  claveConstancia,
  claveDeclaradoEn,
  periodoEnMeses,
  rangoDeMeses,
  resumirValoresRetenidos,
  textoPeriodo,
  textoTarifa,
} from '../certificadoRetenciones';
import { crearFormateador } from '../formato';
import { cargarTextos } from '../textos';
import { contextoMoneda } from '@/lib/utils/moneda';

const f = crearFormateador({ moneda: contextoMoneda('COP', { locale: 'es-CO' }), zonaHoraria: 'America/Bogota', idioma: 'es' });

describe('resumirValoresRetenidos: filas y total de la tabla', () => {
  const conceptos = [
    { clase: 'reteica', concepto: 'ReteICA Medellín', cuenta: '2368', tarifa: '0.7', base: '18400000', valor: '128800' },
    { clase: 'retefuente', concepto: 'Retención en la fuente · servicios', cuenta: '2365', tarifa: 4, base: 1000000, valor: 40000 },
    { clase: 'retefuente', concepto: 'Retención en la fuente · compras', cuenta: '2365', tarifa: 2.5, base: 18400000, valor: 460000 },
    { clase: 'reteiva', concepto: 'ReteIVA · IVA de las compras', cuenta: '2367', tarifa: 15, base: 3496000, valor: 524400 },
    { clase: 'retefuente', concepto: 'Sin valor', cuenta: '2365', tarifa: 1, base: 0, valor: 0 },
  ];

  test('ordena fuente → IVA → ICA y por concepto, convierte a número y omite filas sin valor', () => {
    const r = resumirValoresRetenidos(conceptos);
    expect(r.filas.map((x) => [x.clase, x.concepto, x.base, x.tarifa, x.valor])).toEqual([
      ['retefuente', 'Retención en la fuente · compras', 18400000, 2.5, 460000],
      ['retefuente', 'Retención en la fuente · servicios', 1000000, 4, 40000],
      ['reteiva', 'ReteIVA · IVA de las compras', 3496000, 15, 524400],
      ['reteica', 'ReteICA Medellín', 18400000, 0.7, 128800],
    ]);
    expect(r.clases).toEqual(['retefuente', 'reteiva', 'reteica']);
  });

  test('el total suma solo los valores retenidos (nunca las bases) y sin ruido de coma flotante', () => {
    expect(resumirValoresRetenidos(conceptos).total).toBe(1153200);
    expect(resumirValoresRetenidos([{ valor: 0.1 }, { valor: 0.2 }]).total).toBe(0.3);
  });

  test('sin conceptos o con datos incompletos no falla', () => {
    expect(resumirValoresRetenidos(null)).toEqual({ filas: [], total: 0, clases: [] });
    const r = resumirValoresRetenidos([{ clase: 'otra', concepto: '', cuenta: null, valor: 10 }]);
    expect(r.filas).toEqual([{ clase: null, concepto: '—', cuenta: null, base: 0, tarifa: 0, valor: 10 }]);
    expect(r.clases).toEqual([]);
  });
});

describe('dónde se declara y constancia', () => {
  test('350 para fuente e IVA, ICA aparte, ambos juntos', () => {
    expect(claveDeclaradoEn(['retefuente'])).toBe('certificado.declarado350');
    expect(claveDeclaradoEn(['reteiva'])).toBe('certificado.declarado350');
    expect(claveDeclaradoEn(['reteica'])).toBe('certificado.declaradoIca');
    expect(claveDeclaradoEn(['retefuente', 'reteica'])).toBe('certificado.declarado350EIca');
    expect(claveDeclaradoEn([])).toBe('certificado.declarado350');
    expect(claveConstancia(['retefuente', 'reteica'])).toBe('certificado.constancia350EIca');
    expect(claveConstancia(['reteica'])).toBe('certificado.constanciaIca');
  });
});

describe('textoTarifa', () => {
  test('porcentaje en fuente e IVA, por mil en ICA', () => {
    expect(textoTarifa('retefuente', 2.5, f)).toBe('2,5 %');
    expect(textoTarifa('reteiva', 15, f)).toBe('15 %');
    expect(textoTarifa('reteica', 0.7, f)).toBe('7 ‰');
    expect(textoTarifa('reteica', 0.966, f)).toBe('9,66 ‰');
    expect(textoTarifa(null, 1, f)).toBe('1 %');
  });
});

describe('periodo en meses', () => {
  test('rangoDeMeses: del día 1 al último día del mes, sin pasar de hoy', () => {
    expect(rangoDeMeses('2026-01', '2026-09', '2026-10-05')).toEqual({ desde: '2026-01-01', hasta: '2026-09-30' });
    expect(rangoDeMeses('2026-02', '2026-02', '2026-10-05')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(rangoDeMeses('2024-02', '2024-02', '2026-10-05')).toEqual({ desde: '2024-02-01', hasta: '2024-02-29' });
    expect(rangoDeMeses('2025-12', '2026-10', '2026-10-05')).toEqual({ desde: '2025-12-01', hasta: '2026-10-05' });
  });

  test('rangoDeMeses: al revés, futuro o mal formado → null', () => {
    expect(rangoDeMeses('2026-09', '2026-01', '2026-10-05')).toBeNull();
    expect(rangoDeMeses('2026-11', '2026-11', '2026-10-05')).toBeNull();
    expect(rangoDeMeses('2026-13', '2026-13', '2026-10-05')).toBeNull();
    expect(rangoDeMeses('', '2026-01', '2026-10-05')).toBeNull();
  });

  test('periodoEnMeses: meses completos, o el mes en curso hasta el día de expedición', () => {
    expect(periodoEnMeses('2026-01-01', '2026-09-30')).toEqual({ anioDesde: 2026, mesDesde: 1, anioHasta: 2026, mesHasta: 9 });
    expect(periodoEnMeses('2026-01-01', '2026-10-05', '2026-10-05')).toEqual({ anioDesde: 2026, mesDesde: 1, anioHasta: 2026, mesHasta: 10 });
    expect(periodoEnMeses('2026-01-01', '2026-09-15')).toBeNull();
    expect(periodoEnMeses('2026-01-02', '2026-09-30')).toBeNull();
  });

  test('textoPeriodo en español y en inglés', async () => {
    const es = await cargarTextos('es');
    const en = await cargarTextos('en');
    const fEn = crearFormateador({ moneda: contextoMoneda('COP', { locale: 'es-CO' }), zonaHoraria: 'America/Bogota', idioma: 'en' });
    expect(textoPeriodo('2026-01-01', '2026-09-30', 'es', es, f)).toBe('enero a septiembre de 2026');
    expect(textoPeriodo('2026-09-01', '2026-09-30', 'es', es, f)).toBe('septiembre de 2026');
    expect(textoPeriodo('2025-12-01', '2026-01-31', 'es', es, f)).toBe('diciembre de 2025 a enero de 2026');
    expect(textoPeriodo('2026-09-01', '2026-09-15', 'es', es, f)).toBe('01/09/2026 a 15/09/2026');
    expect(capitalizar(textoPeriodo('2026-01-01', '2026-09-30', 'es', es, f))).toBe('Enero a septiembre de 2026');
    expect(textoPeriodo('2026-01-01', '2026-09-30', 'en', en, fEn)).toBe('January to September 2026');
  });
});

describe('migración de la serie CR', () => {
  const raiz = path.resolve(__dirname, '..', '..', '..', '..');
  const sql = fs.readFileSync(path.join(raiz, 'supabase/migrations/20261005182650_compras_certificado_retenciones_serie_cr.sql'), 'utf8');
  const rollback = fs.readFileSync(path.join(raiz, 'supabase/rollbacks/20261005182650_compras_certificado_retenciones_serie_cr_rollback.sql'), 'utf8');

  test('número CR-AAAA-NNNN: 4 cifras con ceros, sin truncar desde el 10000', () => {
    expect(sql).toMatch(
      /v_numero := 'CR-' \|\| v_anio \|\| '-' \|\| case when v_consecutivo < 10000 then lpad\(v_consecutivo::text, 4, '0'\) else v_consecutivo::text end;/,
    );
    // El mismo formato aplicado a mano: lo que la base produce para 12, 9999 y 10000.
    const numero = (anio: number, n: number) => `CR-${anio}-${n < 10000 ? String(n).padStart(4, '0') : String(n)}`;
    expect(numero(2026, 12)).toBe('CR-2026-0012');
    expect(numero(2026, 9999)).toBe('CR-2026-9999');
    expect(numero(2026, 10000)).toBe('CR-2026-10000');
    expect(numero(2026, 12)).toMatch(/^CR-\d{4}-\d{4,}$/);
  });

  test('consecutivo por organización y año, con candado y unicidad', () => {
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtextextended\('certificado_retenciones:' \|\| p_organization_id \|\| ':' \|\| v_anio, 0\)\)/);
    expect(sql).toMatch(/where c\.organization_id = p_organization_id and c\.series = 'CR' and c\.year = v_anio;/);
    expect(sql).toMatch(/create unique index if not exists uq_withholding_certificates_org_serie\s+on public\.withholding_certificates \(organization_id, series, year, consecutive\);/);
  });

  test('la foto sale de la RPC del certificado, con su guarda; reexpedir no gasta número', () => {
    expect(sql).toMatch(/perform public\.fn_finanzas_exigir_permiso\(p_organization_id, array\['finance\.view'\]\);/);
    expect(sql).toMatch(/v_datos := public\.fn_certificado_retenciones_proveedor\(p_organization_id, p_supplier_id, p_desde, v_hasta\);/);
    expect(sql).toMatch(/'reexpedido', true/);
  });

  test('tabla aditiva con RLS de lectura, sin escritura para clientes y función sin anon', () => {
    expect(sql).toMatch(/create table if not exists public\.withholding_certificates/);
    expect(sql).not.toMatch(/\bdrop\b/i);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/revoke all on table public\.withholding_certificates from anon, authenticated, public;/);
    expect(sql).toMatch(/grant select on table public\.withholding_certificates to authenticated;/);
    expect(sql).toMatch(/revoke all on function public\.fn_certificado_retenciones_expedir\(integer, integer, date, date, integer\) from public, anon;/);
    expect(sql).toMatch(/security definer\s+set search_path to 'public', 'pg_temp'/);
  });

  test('el rollback retira función y tabla y advierte que no restaura datos', () => {
    expect(rollback).toMatch(/drop function if exists public\.fn_certificado_retenciones_expedir\(integer, integer, date, date, integer\);/);
    expect(rollback).toMatch(/drop table if exists public\.withholding_certificates;/);
    expect(rollback).toMatch(/ADVERTENCIA/);
  });
});
