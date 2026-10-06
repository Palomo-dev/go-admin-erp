/**
 * Selector de embudo con «N abiertas · monto» (Figma 1821:189325) y regla de
 * pestañas del Pipeline (2026-10-06): secciones en `?pestana=`, vista
 * Kanban/Tabla en `?vista=`, y los enlaces viejos `?vista=pronostico` siguen
 * abriendo su sección.
 */
// El servicio arrastra la verificación de webhooks (svix, ESM); aquí no se usa.
jest.mock('svix', () => ({ Webhook: class {} }));
// PipelinePantalla arrastra el cliente del navegador (pide variables de entorno); la prueba solo usa funciones puras.
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

import { agregarAbiertasPorPipeline, type ResumenPipelinesApi } from '@/lib/services/crm/oportunidadesLecturaService';
import { abiertasDePipeline } from '../usePipelines';
import { lineaPipeline } from '../SelectorPipeline';
import { seccionPipelineDeUrl } from '../PipelinePantalla';

const t = (clave: string, v?: Record<string, string | number>) => `${clave}:${v?.n ?? ''}`;

describe('agregarAbiertasPorPipeline', () => {
  test('agrupa por pipeline y moneda; la moneda vacía cuenta como la base', () => {
    const r = agregarAbiertasPorPipeline(
      [
        { pipeline_id: 'p1', amount: 100, currency: 'COP' },
        { pipeline_id: 'p1', amount: '50', currency: null },
        { pipeline_id: 'p1', amount: 10, currency: 'usd' },
        { pipeline_id: 'p2', amount: null, currency: 'COP' },
      ],
      'COP',
    );
    expect(r.p1.cantidad).toBe(3);
    expect(r.p1.grupos).toEqual(
      expect.arrayContaining([
        { moneda: 'COP', monto: 150, cantidad: 2 },
        { moneda: 'USD', monto: 10, cantidad: 1 },
      ]),
    );
    expect(r.p2).toEqual({ cantidad: 1, grupos: [{ moneda: 'COP', monto: 0, cantidad: 1 }] });
  });
});

describe('abiertasDePipeline', () => {
  const resumen: ResumenPipelinesApi = {
    base: 'COP',
    truncado: false,
    tasas: [],
    por_pipeline: {
      p1: { cantidad: 2, grupos: [{ moneda: 'COP', monto: 300, cantidad: 2 }] },
      p2: { cantidad: 1, grupos: [{ moneda: 'EUR', monto: 9, cantidad: 1 }] },
    },
  };

  test('sin resumen (cargando o falló) → null: el selector vuelve a «N etapas»', () => {
    expect(abiertasDePipeline(null, 'p1', '2026-10-06')).toBeNull();
  });

  test('pipeline sin abiertas → 0 y total 0', () => {
    expect(abiertasDePipeline(resumen, 'px', '2026-10-06')).toEqual({ cantidad: 0, total: 0, base: 'COP', sinTasa: 0 });
  });

  test('todo en la base → suma directa', () => {
    expect(abiertasDePipeline(resumen, 'p1', '2026-10-06')).toMatchObject({ cantidad: 2, total: 300, sinTasa: 0 });
  });

  test('ninguna convertible (sin tasa) → total null, nunca un monto inventado', () => {
    expect(abiertasDePipeline(resumen, 'p2', '2026-10-06')).toMatchObject({ cantidad: 1, total: null, sinTasa: 1 });
  });
});

describe('lineaPipeline', () => {
  const p = { id: 'p1', name: 'Ventas', stages: [1, 2, 3] };
  test('sin resumen solo cuenta etapas', () => {
    expect(lineaPipeline(t, p, null)).toBe('etapas:3');
  });
  test('con abiertas y monto: «N abiertas · monto · N etapas»', () => {
    const linea = lineaPipeline(t, p, { cantidad: 2, total: 1500, base: 'COP', sinTasa: 0 });
    const partes = linea.split(' · ');
    expect(partes[0]).toBe('abiertas:2');
    expect(partes[1]).toMatch(/1[.,\s]?500/);
    expect(partes[2]).toBe('etapas:3');
  });
  test('sin monto convertible o sin abiertas: se omite el monto', () => {
    expect(lineaPipeline(t, p, { cantidad: 2, total: null, base: 'COP', sinTasa: 2 })).toBe('abiertas:2 · etapas:3');
    expect(lineaPipeline(t, p, { cantidad: 0, total: 0, base: 'COP', sinTasa: 0 })).toBe('abiertas:0 · etapas:3');
  });
});

describe('seccionPipelineDeUrl (regla de pestañas)', () => {
  test('?pestana= manda', () => {
    expect(seccionPipelineDeUrl('pronostico', 'kanban')).toBe('pronostico');
    expect(seccionPipelineDeUrl('clientes', null)).toBe('clientes');
  });
  test('enlaces de antes: ?vista=pronostico|clientes|automatizacion abren su sección', () => {
    expect(seccionPipelineDeUrl(null, 'pronostico')).toBe('pronostico');
    expect(seccionPipelineDeUrl(null, 'automatizacion')).toBe('automatizacion');
  });
  test('vista Kanban/Tabla o valor desconocido → Oportunidades', () => {
    expect(seccionPipelineDeUrl(null, 'tabla')).toBe('oportunidades');
    expect(seccionPipelineDeUrl('xyz', 'kanban')).toBe('oportunidades');
    expect(seccionPipelineDeUrl(null, null)).toBe('oportunidades');
  });
});
