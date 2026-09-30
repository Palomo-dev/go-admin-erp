// ============================================================================
// Retenciones de compra — la lógica que ve la pantalla
// ============================================================================
// Pantallas aprobadas en Figma (docs/design/RETENCIONES-COMPRAS.md):
//   - config-retenciones: base mínima en UVT → pesos del año vigente;
//   - detalle-factura: aviso «bajo la base mínima» (solo avisa, no bloquea);
//   - dialogo-confirmar: el asiento previo que armaría la confirmación;
//   - certificado-retenciones: periodo por defecto (mes de la factura o año en
//     curso) y el mismo recorte que aplica el motor en el servidor.
// Los mapeadores normalizan el jsonb de las RPC: nada de NaN ni de clases
// inventadas en la UI.
// ============================================================================

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

import { baseMinimaEnMoneda, retencionBajoBaseMinima } from '@/lib/services/compras/logica';
import { aAsientoPrevio, aConfiguracionRetenciones, aResumenCertificado } from '@/lib/services/compras/retenciones';
import { rangoMesDe } from '@/components/finanzas/cuentas-por-pagar/CertificadoRetencionesDialog';
import { periodoCertificado } from '@/lib/documents/server/cargadores/certificadoRetenciones';

describe('base mínima de la retención', () => {
  it('convierte UVT a pesos del año, redondeado al peso', () => {
    // 27 UVT × 49.799 (UVT 2025) = 1.344.573
    expect(baseMinimaEnMoneda(27, 49799)).toBe(1344573);
    expect(baseMinimaEnMoneda(4, 49799.5)).toBe(199198);
  });

  it('sin base mínima o sin UVT vigente no hay umbral', () => {
    expect(baseMinimaEnMoneda(null, 49799)).toBeNull();
    expect(baseMinimaEnMoneda(27, null)).toBeNull();
    expect(baseMinimaEnMoneda(undefined, undefined)).toBeNull();
    expect(baseMinimaEnMoneda(0, 49799)).toBeNull();
    expect(baseMinimaEnMoneda(27, Number.NaN)).toBeNull();
  });

  it('avisa solo cuando la base queda por debajo del umbral', () => {
    expect(retencionBajoBaseMinima(1344572, 27, 49799)).toBe(true);
    expect(retencionBajoBaseMinima(1344573, 27, 49799)).toBe(false);
    expect(retencionBajoBaseMinima(5000000, 27, 49799)).toBe(false);
  });

  it('sin umbral nunca avisa', () => {
    expect(retencionBajoBaseMinima(10, null, 49799)).toBe(false);
    expect(retencionBajoBaseMinima(10, 27, null)).toBe(false);
  });
});

describe('aConfiguracionRetenciones', () => {
  it('mapea la configuración y conserva cuenta propia o automática', () => {
    const c = aConfiguracionRetenciones({
      pais: 'COL',
      pais_nombre: 'Colombia',
      uvt: { anio: 2026, valor: 52374, norma: 'Resolución DIAN' },
      plantillas_pendientes: 2,
      retenciones: [
        { id: 9, nombre: 'Compras 2,5 %', tarifa: '2.5', activo: true, codigo: 'RETE_COMPRAS', clase: 'retefuente', base_minima_uvt: 27, cuenta: '236540', cuenta_nombre: 'Compras', cuenta_propia: true, plantilla_id: 3 },
        { id: 10, nombre: 'ICA', tarifa: 0.414, activo: false, clase: 'desconocida', cuenta: '2368', cuenta_propia: false },
      ],
    });
    expect(c.uvt).toEqual({ anio: 2026, valor: 52374, norma: 'Resolución DIAN' });
    expect(c.plantillasPendientes).toBe(2);
    expect(c.retenciones[0]).toMatchObject({ id: '9', tarifa: 2.5, clase: 'retefuente', baseMinimaUvt: 27, cuentaPropia: true, plantillaId: 3 });
    // Clase desconocida cae en retefuente (la de fn_clase_retencion por omisión).
    expect(c.retenciones[1]).toMatchObject({ clase: 'retefuente', activo: false, baseMinimaUvt: null, cuentaPropia: false, cuentaNombre: null });
  });

  it('sin UVT vigente devuelve null, no una UVT en cero', () => {
    expect(aConfiguracionRetenciones({ pais: 'COL', uvt: { anio: 2026, valor: null } }).uvt).toBeNull();
    expect(aConfiguracionRetenciones(null)).toMatchObject({ pais: '', uvt: null, retenciones: [] });
  });
});

describe('aAsientoPrevio', () => {
  it('mapea las líneas y el cuadre', () => {
    const a = aAsientoPrevio({
      ok: true,
      aviso: null,
      lineas: [
        { cuenta: '1435', nombre: 'Mercancías', debito: '1000000', credito: 0 },
        { cuenta: '2408', nombre: 'IVA descontable', debito: 190000, credito: 0 },
        { cuenta: '2365', descripcion: 'Retención en la fuente', debito: 0, credito: 25000 },
        { cuenta: '2205', nombre: 'Proveedores', debito: 0, credito: 1165000 },
      ],
      debitos: 1190000,
      creditos: 1190000,
      cuadra: true,
    });
    expect(a.ok).toBe(true);
    expect(a.cuadra).toBe(true);
    expect(a.lineas).toHaveLength(4);
    expect(a.lineas[0]).toEqual({ cuenta: '1435', nombre: 'Mercancías', descripcion: null, debito: 1000000, credito: 0 });
    // Al proveedor se le abona solo el neto: total − retenciones.
    expect(a.lineas[3].credito).toBe(1190000 - 25000);
  });

  it('sin asiento conserva el motivo y no inventa líneas', () => {
    const a = aAsientoPrevio({ ok: false, motivo: 'period_closed', detalle: '2026-09' });
    expect(a).toMatchObject({ ok: false, motivo: 'period_closed', detalle: '2026-09', lineas: [], cuadra: false });
    expect(aAsientoPrevio(undefined)).toMatchObject({ ok: false, motivo: null, debitos: 0, creditos: 0 });
  });
});

describe('aResumenCertificado', () => {
  it('cuenta facturas y conceptos y toma los totales por clase', () => {
    const r = aResumenCertificado({
      desde: '2026-01-01',
      hasta: '2026-09-30',
      conceptos: [{}, {}],
      facturas: [{}, {}, {}],
      totales: { retefuente: '12000', reteiva: 0, reteica: 4140, retenido: 16140 },
    });
    expect(r).toEqual({ desde: '2026-01-01', hasta: '2026-09-30', facturas: 3, conceptos: 2, retefuente: 12000, reteiva: 0, reteica: 4140, retenido: 16140 });
  });

  it('un resumen vacío es cero, nunca NaN', () => {
    expect(aResumenCertificado({ totales: { retenido: 'x' } })).toMatchObject({ facturas: 0, conceptos: 0, retenido: 0 });
  });
});

describe('periodo del certificado', () => {
  it('rangoMesDe: el mes calendario de la factura', () => {
    expect(rangoMesDe('2026-08-14', '2026-09-30')).toEqual({ desde: '2026-08-01', hasta: '2026-08-31' });
    expect(rangoMesDe('2024-02-10', '2026-09-30')).toEqual({ desde: '2024-02-01', hasta: '2024-02-29' });
    expect(rangoMesDe('2025-12-03', '2026-09-30')).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' });
  });

  it('rangoMesDe: el mes en curso no pasa de hoy', () => {
    expect(rangoMesDe('2026-09-02', '2026-09-30')).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' });
    expect(rangoMesDe('2026-09-02', '2026-09-15')).toEqual({ desde: '2026-09-01', hasta: '2026-09-15' });
  });

  it('periodoCertificado: por defecto, el año de hasta hasta hoy', () => {
    expect(periodoCertificado({}, '2026-09-30')).toEqual({ desde: '2026-01-01', hasta: '2026-09-30' });
  });

  it('periodoCertificado: respeta un periodo válido y recorta el futuro', () => {
    expect(periodoCertificado({ desde: '2026-08-01', hasta: '2026-08-31' }, '2026-09-30')).toEqual({ desde: '2026-08-01', hasta: '2026-08-31' });
    expect(periodoCertificado({ desde: '2026-08-01', hasta: '2027-01-31' }, '2026-09-30')).toEqual({ desde: '2026-08-01', hasta: '2026-09-30' });
  });

  it('periodoCertificado: desde posterior a hasta o mal formado cae al 1 de enero', () => {
    expect(periodoCertificado({ desde: '2026-09-10', hasta: '2026-08-31' }, '2026-09-30')).toEqual({ desde: '2026-01-01', hasta: '2026-08-31' });
    expect(periodoCertificado({ desde: '01/08/2026', hasta: 'ayer' }, '2026-09-30')).toEqual({ desde: '2026-01-01', hasta: '2026-09-30' });
  });
});
