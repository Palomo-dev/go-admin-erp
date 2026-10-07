/// <reference types="jest" />
/**
 * Cola de campañas por páginas (org 125, 2026-10-07): la campaña de etapa pedía siempre los
 * mismos primeros N objetivos; ya estaban atendidos y encolaba 0 aunque 347 de 645 nunca
 * se habían llamado. Ahora los objetivos se piden por páginas estables (orden por id) y la
 * cola recorre páginas hasta llenar su cupo.
 */
import * as fs from 'fs';
import * as path from 'path';
import { buildCampaignTargets, type VoiceAgentCampaign } from '@/lib/services/crm/voiceAgentService';

type Filtro = [string, unknown, unknown];

function clienteOportunidades(total: number) {
  const opps = Array.from({ length: total }, (_, i) => ({
    id: `opp-${String(i).padStart(4, '0')}`,
    customer_id: `cli-${String(i).padStart(4, '0')}`,
    stage_id: 'etapa-1',
  }));
  const llamadas: Filtro[][] = [];
  return {
    llamadas,
    from() {
      const filtros: Filtro[] = [];
      llamadas.push(filtros);
      const q: Record<string, unknown> = {};
      const f = (n: string) => (a?: unknown, b?: unknown) => { filtros.push([n, a, b]); return q; };
      Object.assign(q, { select: f('select'), eq: f('eq'), not: f('not'), order: f('order'), limit: f('limit'), range: f('range') });
      q.then = (ok: (v: unknown) => unknown) => {
        const r = filtros.find((x) => x[0] === 'range');
        const l = filtros.find((x) => x[0] === 'limit');
        const datos = r ? opps.slice(Number(r[1]), Number(r[2]) + 1) : opps.slice(0, Number(l?.[1] ?? opps.length));
        return Promise.resolve({ data: datos, error: null }).then(ok);
      };
      return q;
    },
  };
}

const campana = { id: 'c1', voice_agent_id: 'a1', target_source: 'pipeline_stage', target_config: { stage_id: 'etapa-1' } } as unknown as VoiceAgentCampaign;

describe('buildCampaignTargets — páginas estables', () => {
  it('la segunda página trae objetivos distintos a la primera (antes repetía los mismos N)', async () => {
    const sb = clienteOportunidades(645);
    const p1 = await buildCampaignTargets(sb as never, 125, campana, 200, 0);
    const p2 = await buildCampaignTargets(sb as never, 125, campana, 200, 200);
    const p4 = await buildCampaignTargets(sb as never, 125, campana, 200, 600);
    expect(p1).toHaveLength(200);
    expect(p2).toHaveLength(200);
    expect(p2[0].customer_id).toBe('cli-0200');
    expect(new Set([...p1, ...p2].map((t) => t.customer_id)).size).toBe(400);
    expect(p4).toHaveLength(45);
  });
  it('ordena por id para que la paginación sea estable', async () => {
    const sb = clienteOportunidades(10);
    await buildCampaignTargets(sb as never, 125, campana, 5, 5);
    const f = sb.llamadas[0];
    expect(f).toContainEqual(['order', 'id', { ascending: true }]);
    expect(f).toContainEqual(['range', 5, 9]);
  });
});

describe('enqueueCampaignTargets — recorre páginas hasta llenar el cupo', () => {
  const fuente = fs.readFileSync(path.join(__dirname, '../../lib/services/crm/voiceAgentService.ts'), 'utf8');
  const cola = fuente.slice(fuente.indexOf('async function enqueueCampaignTargets'), fuente.indexOf('async function describirLlamadaViva') > 0 ? fuente.indexOf('async function describirLlamadaViva') : undefined);
  it('pide páginas sucesivas y no solo los primeros `room`', () => {
    expect(cola).toMatch(/buildCampaignTargets\(supabase, orgId, campaign, PAGINA_OBJETIVOS, pagina \* PAGINA_OBJETIVOS\)/);
    expect(cola).not.toMatch(/buildCampaignTargets\(supabase, orgId, campaign, room\)/);
    expect(cola).toMatch(/for \(let pagina = 0; pagina < MAX_PAGINAS_OBJETIVOS && rows\.length < room; pagina\+\+\)/);
  });
});

describe('cola — corridas cortas (2026-10-07: 200 objetivos tardaron 46 s y otra ruta murió a los 60 s)', () => {
  const fuente = fs.readFileSync(path.join(__dirname, '../../lib/services/crm/voiceAgentService.ts'), 'utf8');
  it('encola como máximo TOPE_ENCOLAR_POR_CORRIDA (≤ 50) por corrida, no 200', () => {
    const tope = Number(fuente.match(/const TOPE_ENCOLAR_POR_CORRIDA = (\d+);/)?.[1]);
    expect(tope).toBeGreaterThan(0);
    expect(tope).toBeLessThanOrEqual(50);
    expect(fuente).toMatch(/Math\.min\(dayRoom, TOPE_ENCOLAR_POR_CORRIDA\) - pendingCount/);
    expect(fuente).not.toMatch(/Math\.min\(dayRoom, 200\)/);
  });
  it('el agente de etapa se consulta una vez por etapa, no por objetivo', () => {
    expect(fuente).toMatch(/agentePorEtapa\.set\(target\.stage_id, await findStageAgentId\(/);
  });
});
