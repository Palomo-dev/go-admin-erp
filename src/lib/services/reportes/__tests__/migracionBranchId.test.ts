// ============================================================================
// Reportes — el frontend y la migración no pueden divergir
// ============================================================================
// Este test es la red que faltaba el 2026-09-07: el commit 5bb0e906 añadió
// `p_branch_id` a las llamadas RPC del frontend SIN migración, la firma en BD
// seguía teniendo 3 argumentos y PostgREST devolvía 404 para todos esos
// reportes. Nadie se enteró hasta producción.
//
// Aquí se lee el código de `src/lib/services/reportes/**` y el `.sql` de la
// migración, y se exige que cuadren:
//   1. toda RPC `fn_reporte_*` que el frontend llame con `p_branch_id` tiene que
//      existir en la migración declarando ese parámetro;
//   2. `p_branch_id` tiene que ser el ÚLTIMO parámetro y llevar `DEFAULT NULL`;
//   3. la migración tiene que hacer DROP de la firma vieja de cada función:
//      dejar las dos firmas vivas convierte el 404 en un error de ambigüedad
//      («could not choose the best candidate function»), que fue justo lo que
//      pasó con `fn_pipeline_funnel`;
//   4. la migración tiene que volver a conceder los GRANT, porque el DROP se
//      lleva por delante la ACL de la función.
// ============================================================================

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..');
const MIGRACION = join(
  __dirname,
  '../../../../..',
  'supabase/migrations/20260922210000_reportes_filtro_por_sucursal.sql',
);
const ROLLBACK = join(
  __dirname,
  '../../../../..',
  'supabase/rollbacks/20260922210000_reportes_filtro_por_sucursal_rollback.sql',
);

/** Lee recursivamente todos los .ts de los servicios de reportes. */
function archivosTs(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === '__tests__') continue;
      salida.push(...archivosTs(ruta));
    } else if (entrada.name.endsWith('.ts')) {
      salida.push(ruta);
    }
  }
  return salida;
}

/**
 * Devuelve las RPC `fn_reporte_*` que el frontend invoca pasando `p_branch_id`.
 * Se recorre cada `.rpc('fn_...', { ... })` y se mira si su objeto de
 * parámetros —hasta el cierre de la llamada— menciona `p_branch_id`.
 */
function rpcsConBranchId(): string[] {
  const encontradas = new Set<string>();
  for (const archivo of archivosTs(RAIZ)) {
    const texto = readFileSync(archivo, 'utf8');
    const re = /\.rpc\(\s*'(fn_reporte_\w+)'\s*,\s*\{([\s\S]{0,600}?)\}\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(texto)) !== null) {
      if (m[2].includes('p_branch_id')) encontradas.add(m[1]);
    }
  }
  return [...encontradas].sort();
}

const SQL_MIGRACION = readFileSync(MIGRACION, 'utf8');
const SQL_ROLLBACK = readFileSync(ROLLBACK, 'utf8');
const RPCS = rpcsConBranchId();

describe('reportes — el frontend y la migración de p_branch_id cuadran', () => {
  it('el frontend sigue llamando con p_branch_id a las 9 RPC conocidas', () => {
    // Si este test falla porque la lista creció, NO lo relajes: añade la función
    // nueva a la migración (o a una nueva) antes de tocar el frontend.
    expect(RPCS).toEqual([
      'fn_reporte_cierre_caja',
      'fn_reporte_cxc_aging',
      'fn_reporte_cxp_aging',
      'fn_reporte_flujo_efectivo',
      'fn_reporte_impuestos',
      'fn_reporte_movimientos_inventario',
      'fn_reporte_rotacion_inventario',
      'fn_reporte_ventas_por_hora',
      'fn_reporte_ventas_resumen',
    ]);
  });

  it.each(RPCS)('%s está creada en la migración', (rpc) => {
    expect(SQL_MIGRACION).toContain(`CREATE OR REPLACE FUNCTION public.${rpc}(`);
  });

  it.each(RPCS)('%s declara p_branch_id como ÚLTIMO parámetro y con DEFAULT NULL', (rpc) => {
    const m = new RegExp(
      `CREATE OR REPLACE FUNCTION public\\.${rpc}\\(([\\s\\S]*?)\\)\\s*\\n\\s*RETURNS`,
    ).exec(SQL_MIGRACION);
    expect(m).not.toBeNull();

    const params = m![1]
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    expect(params[params.length - 1]).toBe('p_branch_id bigint DEFAULT NULL');
    // y solo una vez: nada de dos parámetros de sucursal
    expect(params.filter((p) => p.startsWith('p_branch_id'))).toHaveLength(1);
  });

  it.each(RPCS)('%s hace DROP de la firma vieja (nada de sobrecargas)', (rpc) => {
    expect(SQL_MIGRACION).toContain(`DROP FUNCTION IF EXISTS public.${rpc}(`);

    // El DROP debe ir ANTES del CREATE de esa misma función.
    const iDrop = SQL_MIGRACION.indexOf(`DROP FUNCTION IF EXISTS public.${rpc}(`);
    const iCreate = SQL_MIGRACION.indexOf(`CREATE OR REPLACE FUNCTION public.${rpc}(`);
    expect(iDrop).toBeGreaterThan(-1);
    expect(iDrop).toBeLessThan(iCreate);

    // Y la firma que se borra NO puede incluir ya p_branch_id: sería borrar la
    // nueva en vez de la vieja.
    const firmaDrop = /^[^)]*\)/.exec(SQL_MIGRACION.slice(iDrop))![0];
    expect(firmaDrop).not.toContain('bigint, timestamptz, timestamptz, bigint');
  });

  it.each(RPCS)('%s vuelve a conceder los GRANT tras el DROP', (rpc) => {
    // El DROP se lleva la ACL: si la migración no re-concede, `authenticated`
    // pierde EXECUTE y el reporte falla con 403 en vez de 404.
    const grants = SQL_MIGRACION.match(
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${rpc}\\([^)]*\\) TO [^;]+;`, 'g'),
    );
    expect(grants).not.toBeNull();
    const todos = grants!.join(' ');
    expect(todos).toContain('authenticated');
    expect(todos).toContain('service_role');
  });

  it.each(RPCS)('%s conserva SECURITY DEFINER y el search_path', (rpc) => {
    const cuerpo = new RegExp(
      `CREATE OR REPLACE FUNCTION public\\.${rpc}\\([\\s\\S]*?AS \\$function\\$`,
    ).exec(SQL_MIGRACION)![0];
    expect(cuerpo).toContain('SECURITY DEFINER');
    expect(cuerpo).toContain("SET search_path TO 'public'");
  });

  it('existe la reversión y devuelve cada función a su firma sin p_branch_id', () => {
    for (const rpc of RPCS) {
      // El rollback borra la firma NUEVA (la que lleva el bigint extra)...
      expect(SQL_ROLLBACK).toContain(`DROP FUNCTION IF EXISTS public.${rpc}(`);
      // ...y recrea la vieja, que no declara p_branch_id.
      const m = new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${rpc}\\(([^)]*)\\)`,
      ).exec(SQL_ROLLBACK);
      expect(m).not.toBeNull();
      expect(m![1]).not.toContain('p_branch_id');
    }
  });

  it('cada filtro por sucursal usa la forma que no cambia nada con NULL', () => {
    // `(p_branch_id IS NULL OR <tabla>.branch_id = p_branch_id)` garantiza que
    // una llamada sin sucursal devuelva exactamente lo mismo que antes.
    const predicados = SQL_MIGRACION.match(/\(p_branch_id IS NULL OR [\w.]+\.branch_id = p_branch_id\)/g);
    expect(predicados).not.toBeNull();
    expect(predicados!.length).toBeGreaterThanOrEqual(30);

    // Ningún filtro desnudo `branch_id = p_branch_id` sin la guarda del NULL.
    const desnudos = SQL_MIGRACION.match(/(?<!OR )\b\w+\.branch_id = p_branch_id\b/g) ?? [];
    expect(desnudos).toHaveLength(0);
  });
});
