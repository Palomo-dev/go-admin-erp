/**
 * GO Assistant — `buscar_guia`, `revisar_permisos_usuario` y la garantía de
 * que cada ruta citada en las guías es una página real de `src/app`.
 */

import fs from 'fs';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssistantCapabilities } from '@/lib/ai/assistant/capabilities';
import { GUIAS, METODOS_PAGO_POR_SUCURSAL_DISPONIBLE, RUTA_CARGOS, buscarGuias } from '../guias/guias';
import { buscarGuia, revisarPermisosUsuario } from '../tools/guias';
import { getTool, resetRegistry } from '../toolRegistry';
import type { ToolContext } from '../types';

const RAIZ = path.resolve(__dirname, '../../../../..');
const APP = path.join(RAIZ, 'src/app');

function existePagina(ruta: string): boolean {
  const sinQuery = ruta.split('?')[0].replace(/^\/+|\/+$/g, '');
  return fs.existsSync(path.join(APP, sinQuery, 'page.tsx')) || fs.existsSync(path.join(APP, sinQuery, 'page.ts'));
}

function caps(p: Partial<AssistantCapabilities> = {}): AssistantCapabilities {
  return {
    level: 'read',
    enabledTools: null,
    permissions: new Set(),
    isAdmin: false,
    activeModules: new Set(),
    undoWindowMinutes: 15,
    bulkMaxRows: 500,
    ...p,
  };
}

/** Cliente falso: `permissions` y `organization_members` con `maybeSingle()`. */
function sesion(filas: { permiso?: { code: string; name: string } | null; cargo?: string | null; sinColumna?: boolean }): SupabaseClient {
  return {
    from(tabla: string) {
      const q = {
        select: () => q,
        eq: () => q,
        limit: async () => (filas.sinColumna ? { data: null, error: { code: '42703', message: 'column does not exist' } } : { data: [], error: null }),
        maybeSingle: async () => {
          if (tabla === 'permissions') return { data: filas.permiso ?? null, error: null };
          if (tabla === 'organization_members')
            return { data: { job_position_id: filas.cargo ? 'x' : null, job_positions: filas.cargo ? { name: filas.cargo } : null }, error: null };
          return { data: null, error: null };
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

function ctx(c: AssistantCapabilities, sb: SupabaseClient): ToolContext {
  return { organizationId: 7, branchId: null, userId: 'u1', supabase: sb, capabilities: c, locale: 'es', currency: 'COP', channel: 'text', conversationId: null };
}

const PERMISO = { code: 'pos.promotions.remove', name: 'Quitar promoción de una línea' };

describe('guías: rutas reales', () => {
  const rutas = Array.from(new Set(GUIAS.flatMap((g) => g.rutas.map((r) => r.ruta)).concat(RUTA_CARGOS)));

  it.each(rutas)('%s existe en src/app', (ruta) => {
    expect(ruta.startsWith('/app/')).toBe(true);
    expect(existePagina(ruta)).toBe(true);
  });

  it('ids únicos y cada guía con pasos y rutas', () => {
    expect(new Set(GUIAS.map((g) => g.id)).size).toBe(GUIAS.length);
    for (const g of GUIAS) {
      expect(g.pasos.length).toBeGreaterThan(0);
      expect(g.rutas.length).toBeGreaterThan(0);
    }
  });

  it('método de pago por sucursal: la marca coincide con el formulario real', () => {
    const form = fs.readFileSync(path.join(RAIZ, 'src/components/finanzas/metodos-pago/PaymentMethodForm.tsx'), 'utf8');
    // Si el selector de sucursales llega al formulario, hay que activar la guía (y viceversa).
    expect(METODOS_PAGO_POR_SUCURSAL_DISPONIBLE).toBe(form.includes('branch_ids'));
  });
});

describe('buscar_guia', () => {
  it('«¿cómo creo un método de pago para una sucursal?» → guía por sucursal primero', async () => {
    const r = await buscarGuia.execute(ctx(caps(), sesion({})), { consulta: '¿Cómo creo un método de pago para una sucursal?' });
    const data = r.data as { guias: Array<{ id: string; disponible: boolean; rutas: Array<{ ruta: string }> }> };
    expect(data.guias[0].id).toBe('metodos-pago-sucursal');
    expect(data.guias[0].disponible).toBe(METODOS_PAGO_POR_SUCURSAL_DISPONIBLE);
    expect(data.guias[0].rutas[0].ruta).toBe('/app/finanzas/metodos-pago');
    expect(data.guias.map((g) => g.id)).toContain('metodos-pago');
  });

  it('por sucursal: si la columna branch_ids no está en la base, NO la afirma', async () => {
    const r = await buscarGuia.execute(ctx(caps(), sesion({ sinColumna: true })), { consulta: 'método de pago para una sucursal' });
    const g = (r.data as { guias: Array<{ id: string; disponible: boolean; pasos: string[] }> }).guias[0];
    expect(g.id).toBe('metodos-pago-sucursal');
    expect(g.disponible).toBe(false);
    expect(g.pasos[0]).toContain('todavía no está habilitada');
  });

  it('«¿cómo dejo que el cajero quite una promoción?» → guía de quitar promoción con la ruta de cargos', () => {
    const [g] = buscarGuias('¿cómo dejo que el cajero quite una promoción?');
    expect(g.id).toBe('quitar-promocion');
    expect(g.permisos).toContain('pos.promotions.remove');
    expect(g.rutas[0].ruta).toBe(RUTA_CARGOS);
  });

  it.each([
    ['crear un producto', 'productos'],
    ['cómo abro la caja', 'cajas'],
    ['configurar la facturación electrónica DIAN', 'facturacion-electronica'],
    ['invitar un usuario', 'usuarios'],
    ['crear una sucursal nueva', 'sucursales'],
    ['hacer un ajuste de inventario', 'inventario'],
    ['crear una promoción 2x1', 'promociones'],
    ['roles', 'roles-permisos'],
  ])('«%s» → %s', (q, id) => {
    expect(buscarGuias(q)[0]?.id).toBe(id);
  });

  it('sin coincidencia no inventa nada', async () => {
    const r = await buscarGuia.execute(ctx(caps(), sesion({})), { consulta: 'xyzzy' });
    expect((r.data as { encontradas: number }).encontradas).toBe(0);
  });

  it('parseArgs rechaza vacío', () => {
    expect(buscarGuia.parseArgs({ consulta: '  ' })).toBeNull();
    expect(buscarGuia.parseArgs(null)).toBeNull();
  });
});

describe('revisar_permisos_usuario', () => {
  it('sin el permiso: nombra el cargo y la ruta de Cargos', async () => {
    const r = await revisarPermisosUsuario.execute(ctx(caps(), sesion({ permiso: PERMISO, cargo: 'Cajero' })), { codigo: 'pos.promotions.remove' });
    const d = r.data as { tiene: boolean; ruta_para_activarlo: string | null };
    expect(d.tiene).toBe(false);
    expect(d.ruta_para_activarlo).toBe(RUTA_CARGOS);
    expect(r.message).toContain('cargo «Cajero» no tiene el permiso');
    expect(r.message).toContain('Roles y permisos > Cargos');
    expect(existePagina(RUTA_CARGOS)).toBe(true);
  });

  it('con el permiso por rol o cargo (RPC de capabilities)', async () => {
    const r = await revisarPermisosUsuario.execute(
      ctx(caps({ permissions: new Set(['pos.promotions.remove']) }), sesion({ permiso: PERMISO })),
      { codigo: 'pos.promotions.remove' }
    );
    expect((r.data as { tiene: boolean; por_administrador: boolean })).toMatchObject({ tiene: true, por_administrador: false });
  });

  it('el administrador lo tiene', async () => {
    const r = await revisarPermisosUsuario.execute(ctx(caps({ isAdmin: true }), sesion({ permiso: PERMISO })), { codigo: 'pos.promotions.remove' });
    expect((r.data as { por_administrador: boolean }).por_administrador).toBe(true);
  });

  it('código inexistente', async () => {
    const r = await revisarPermisosUsuario.execute(ctx(caps(), sesion({ permiso: null })), { codigo: 'no.existe' });
    expect((r.data as { existe: boolean }).existe).toBe(false);
  });

  it('parseArgs normaliza y rechaza basura', () => {
    expect(revisarPermisosUsuario.parseArgs({ codigo: ' POS.Promotions.Remove ' })).toEqual({ codigo: 'pos.promotions.remove' });
    expect(revisarPermisosUsuario.parseArgs({ codigo: "x'; drop" })).toBeNull();
  });
});

describe('registro', () => {
  it('las dos herramientas están registradas y son de lectura', () => {
    resetRegistry();
    for (const n of ['buscar_guia', 'revisar_permisos_usuario']) {
      const t = getTool(n);
      expect(t?.risk).toBe('low');
      expect(t?.minLevel).toBe('read');
    }
  });
});
