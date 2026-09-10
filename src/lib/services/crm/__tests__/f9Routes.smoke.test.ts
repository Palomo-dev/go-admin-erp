/**
 * F9 — guardrails de las rutas de la Ficha 360.
 *
 * No se importan los módulos en runtime: `@/lib/utils/orgContext` arrastra
 * `svix` (ESM-only) y jest corre en CJS. Se verifica el contrato por análisis
 * estático del fuente, que es lo que se rompe en la práctica: handler exportado,
 * `organization_id` de sesión (nunca del body) y cero cliente browser en server.
 */
import fs from 'fs';
import path from 'path';

const API = path.join(process.cwd(), 'src/app/api/crm');

const ROUTES: Array<{ name: string; file: string; handlers: string[] }> = [
  { name: 'POST /api/crm/activities', file: 'activities/route.ts', handlers: ['POST'] },
  { name: 'POST /api/crm/notes', file: 'notes/route.ts', handlers: ['POST'] },
  { name: 'POST /api/crm/tasks', file: 'tasks/route.ts', handlers: ['POST'] },
  { name: 'POST /api/crm/meetings', file: 'meetings/route.ts', handlers: ['POST'] },
  { name: 'PATCH /api/crm/meetings/[id]', file: 'meetings/[id]/route.ts', handlers: ['PATCH'] },
  { name: 'PATCH /api/crm/opportunities/[id]/stage', file: 'opportunities/[id]/stage/route.ts', handlers: ['PATCH'] },
  { name: 'GET /api/crm/timeline/[type]/[id]', file: 'timeline/[type]/[id]/route.ts', handlers: ['GET'] },
];

const read = (file: string) => fs.readFileSync(path.join(API, file), 'utf8');

describe('F9 · rutas de la Ficha 360', () => {
  test.each(ROUTES.map((r) => [r.name, r] as const))('%s existe y exporta su handler', (_n, r) => {
    const src = read(r.file);
    for (const h of r.handlers) {
      expect(src).toMatch(new RegExp(`export async function ${h}\\s*\\(`));
    }
  });

  test.each(ROUTES.map((r) => [r.name, r] as const))('%s toma organization_id de sesión', (_n, r) => {
    const src = read(r.file);
    expect(src).toMatch(/getServerOrgContext/);
    expect(src).toMatch(/OrgContextError/);
    // organization_id nunca se lee del body (regla 3)
    expect(src).not.toMatch(/body\.organization_id|json\.organization_id|parsed\.data\.organization_id/);
  });

  test.each(ROUTES.map((r) => [r.name, r] as const))('%s no importa el cliente browser de supabase', (_n, r) => {
    expect(read(r.file)).not.toMatch(/@\/lib\/supabase\/config/);
  });

  test('las rutas con body validan con zod', () => {
    for (const f of ['activities/route.ts', 'notes/route.ts', 'tasks/route.ts', 'meetings/route.ts', 'meetings/[id]/route.ts', 'opportunities/[id]/stage/route.ts']) {
      expect(read(f)).toMatch(/safeParse/);
    }
  });

  test('el cambio de etapa solo se hace por opportunityStageService', () => {
    const src = read('opportunities/[id]/stage/route.ts');
    expect(src).toMatch(/from '@\/lib\/services\/crm\/opportunityStageService'/);
    // sin update directo de stage_id en la ruta
    expect(src).not.toMatch(/\.update\(/);
  });
});
