/// <reference types="jest" />
/**
 * F0-SEC r3 · el motor de reportes ejecuta con el cliente que se le inyecta.
 *
 * Trasladado de `app/api/ai-assistant/reportes/__tests__/reportesSessionClient.f0secR3.test.ts`
 * al retirar esa ruta (Figma Reportes §22: las preguntas sobre reportes van al
 * GO Asistente, `consultar_reporte`). Lo que fija sigue valiendo para todo el
 * que ejecute reportes desde el servidor:
 *  1. `ejecutarReporte(..., client)` entrega ESE cliente a `fetch` y la RPC
 *     corre con él y con la organización recibida;
 *  2. sin cliente inyectado, `fetch` cae al cliente browser (la página
 *     `app/reportes` no cambia);
 *  3. guardarraíl estático: ningún módulo de reportes usa el cliente browser
 *     directamente dentro de `fetch` (todos pasan por `client ?? browserSupabase`).
 */
import fs from 'fs';
import path from 'path';

const sessionRpc = jest.fn(async () => ({ data: { total_pipeline: 10, forecast: 5, por_etapa: [] }, error: null }));
const browserRpc = jest.fn(async () => ({ data: { total_pipeline: 99, forecast: 99, por_etapa: [] }, error: null }));
const SESSION_CLIENT = { rpc: sessionRpc, from: jest.fn() };

jest.mock('@/lib/supabase/config', () => ({ supabase: { rpc: browserRpc, from: jest.fn() } }));

import { crmReports } from '@/lib/services/reportes/modulos/crmReports';
import { ejecutarReporte } from '@/lib/services/reportes/reportesEngine';
import type { PeriodoCierre, ReportesClient } from '@/lib/services/reportes/types';

const periodo: PeriodoCierre = { tipo: 'mensual', fechaInicio: '2026-09-01', fechaFin: '2026-09-30', etiqueta: 'Septiembre 2026' } as PeriodoCierre;

beforeEach(() => {
  sessionRpc.mockClear();
  browserRpc.mockClear();
});

describe('motor de reportes: el cliente inyectado llega a fetch', () => {
  test('ejecutarReporte(..., client) → crmReports usa ese cliente', async () => {
    await ejecutarReporte('crm-ranking-vendedores', 7, periodo, null, SESSION_CLIENT as unknown as ReportesClient);
    expect(sessionRpc).toHaveBeenCalledWith('fn_reporte_crm_ranking_vendedores', expect.objectContaining({ p_organization_id: 7 }));
    expect(browserRpc).not.toHaveBeenCalled();
  });

  test('sin cliente (página app/reportes en el navegador) → cae al cliente browser, como antes', async () => {
    const funnel = crmReports.find((r) => r.id === 'crm-funnel')!;
    await funnel.fetch(7, periodo, null);
    expect(browserRpc).toHaveBeenCalledWith('fn_reporte_crm_funnel', expect.objectContaining({ p_organization_id: 7 }));
    expect(sessionRpc).not.toHaveBeenCalled();
  });
});

describe('guardarraíl estático: los 19 módulos de reportes aceptan el cliente inyectado', () => {
  const dir = path.join(process.cwd(), 'src', 'lib', 'services', 'reportes', 'modulos');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));

  test('cada fetch declara `client?: ReportesClient` y resuelve `client ?? browserSupabase`; nada usa `supabase` a pelo', () => {
    expect(files.length).toBeGreaterThanOrEqual(19);
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      // `rentabilidadProducto.ts` no es un módulo: da forma al resultado de una
      // RPC que cada `fetch` llama por su cuenta (los tests de alcance leen
      // ese cuerpo). Un archivo sin `fetch` no puede saltarse el cliente.
      if (!src.includes('async fetch(')) continue;
      const fetches = (src.match(/async fetch\(/g) ?? []).length;
      const withClient = (src.match(/async fetch\(orgId: number, periodo: PeriodoCierre, branchId\?: number \| null, client\?: ReportesClient\)/g) ?? []).length;
      const fallbacks = (src.match(/const db = client \?\? browserSupabase;/g) ?? []).length;
      const rawUses = src.replace(/import \{ supabase as browserSupabase \}[^\n]*/g, '').match(/\bsupabase\b/g) ?? [];
      if (fetches === 0 || withClient !== fetches || fallbacks !== fetches || rawUses.length > 0) {
        offenders.push(`${f}: fetch=${fetches} conClient=${withClient} fallback=${fallbacks} usosDirectos=${rawUses.length}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
