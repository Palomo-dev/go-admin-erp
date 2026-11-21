/**
 * Devoluciones del POS rediseñadas (Figma `873:573997`, aprobado 2026-11-21):
 * lista blanca de filtros, presentación, importación de motivos y el contrato
 * de la migración de lectura. Sin Supabase ni React.
 */
import fs from 'fs';
import path from 'path';
import {
  filtrosDevoluciones,
  parametrosFiltroDevoluciones,
  parametrosListadoDevoluciones,
  TAMANO_DEVOLUCIONES_DEFECTO,
} from '@/lib/pos/devoluciones/filtrosDevoluciones';
import {
  BADGE_ESTADO_DEVOLUCION,
  esParcial,
  estadoDevolucion,
  estadoVentaParaDevolver,
  normalizarMetodoReintegro,
  numeroDevolucion,
  porcentajeSobreVentas,
  textoPlano,
} from '@/lib/pos/devoluciones/presentacionDevoluciones';
import { filasCsvMotivos, normalizarCodigoMotivo } from '@/lib/pos/devoluciones/motivosCsv';
import { resolverEstado } from '@/components/kit/estadoTono';

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const leer = (ruta: string) => fs.readFileSync(path.join(REPO, ruta), 'utf8');

describe('filtrosDevoluciones (lista blanca)', () => {
  test('acepta solo estados, métodos y motivos conocidos', () => {
    const f = filtrosDevoluciones({
      estado: 'processed,hackeado,cancelled',
      metodo: ['cash', 'transferencia'],
      motivo: '3,abc,-1,7',
      q: '  F-0014\u0000 ',
    });
    expect(f.estados).toEqual(['processed', 'cancelled']);
    expect(f.metodos).toEqual(['cash']);
    expect(f.motivos).toEqual([3, 7]);
    expect(f.busqueda).toBe('F-0014');
  });

  test('fechas inválidas se ignoran y un rango invertido se ordena', () => {
    expect(filtrosDevoluciones({ desde: '2026-02-30', hasta: 'ayer' })).toMatchObject({ desde: null, hasta: null });
    expect(filtrosDevoluciones({ desde: '2026-09-23', hasta: '2026-09-01' })).toMatchObject({ desde: '2026-09-01', hasta: '2026-09-23' });
  });

  test('orden, página y tamaño fuera de la lista vuelven al defecto', () => {
    const f = filtrosDevoluciones({ orden: 'cliente; drop', dir: 'arriba', pagina: '-3', tamano: '7' });
    expect(f.orden).toEqual({ campo: 'fecha', direccion: 'desc' });
    expect(f.pagina).toBe(1);
    expect(f.tamano).toBe(TAMANO_DEVOLUCIONES_DEFECTO);
  });

  test('los parámetros de las RPC llevan null cuando no hay filtro y el desplazamiento por página', () => {
    const f = filtrosDevoluciones({ pagina: '3', tamano: '50', orden: 'total', dir: 'asc' });
    const extra = { organizacionId: 120, sucursalId: null, desde: '2026-09-01T05:00:00Z', hasta: '2026-09-24T04:59:59Z' };
    expect(parametrosFiltroDevoluciones(f, extra)).toEqual({
      p_organization_id: 120,
      p_branch_id: null,
      p_desde: extra.desde,
      p_hasta: extra.hasta,
      p_busqueda: null,
      p_estados: null,
      p_metodos: null,
      p_motivos: null,
    });
    expect(parametrosListadoDevoluciones(f, extra)).toMatchObject({ p_orden: 'total', p_direccion: 'asc', p_limite: 50, p_desplazamiento: 100 });
  });
});

describe('presentación', () => {
  test('número visible DEV-000008 a partir del id', () => {
    expect(numeroDevolucion(8)).toBe('DEV-000008');
    expect(numeroDevolucion(1234567)).toBe('DEV-1234567');
  });

  test('cada estado de returns cae en un tono de la tabla única (Procesada éxito, Pendiente advertencia, Anulada peligro)', () => {
    expect(resolverEstado(BADGE_ESTADO_DEVOLUCION.processed)).toMatchObject({ tono: 'exito', conocido: true });
    expect(resolverEstado(BADGE_ESTADO_DEVOLUCION.pending)).toMatchObject({ tono: 'advertencia', conocido: true });
    expect(resolverEstado(BADGE_ESTADO_DEVOLUCION.cancelled)).toMatchObject({ tono: 'peligro', conocido: true });
    expect(estadoDevolucion(null)).toBe('processed');
    expect(normalizarMetodoReintegro(null)).toBe('sin_definir');
    expect(normalizarMetodoReintegro('store_credit')).toBe('store_credit');
  });

  test('el motivo guardado como HTML por la pantalla vieja se ve como texto', () => {
    expect(textoPlano('<p>Talla <strong>incorrecta</strong></p><p>cambio&nbsp;pedido</p>')).toBe('Talla incorrecta cambio pedido');
    expect(textoPlano(null)).toBe('');
  });

  test('% sobre las ventas con un decimal; sin ventas no hay porcentaje', () => {
    expect(porcentajeSobreVentas(1284300, 48320500)).toBe(2.7);
    expect(porcentajeSobreVentas(1000, 0)).toBeNull();
  });

  test('estado de la venta en el buscador y devolución parcial', () => {
    expect(estadoVentaParaDevolver(3, 0)).toBe('pagada');
    expect(estadoVentaParaDevolver(4, 1)).toBe('devuelta_parcial');
    expect(estadoVentaParaDevolver(2, 2)).toBe('devuelta');
    expect(esParcial(1, 3)).toBe(true);
    expect(esParcial(2, 2)).toBe(false);
  });
});

describe('importar motivos (D16)', () => {
  test('respeta comillas y separador «;», normaliza el código y lee por posición', () => {
    const csv = '﻿Código;Nombre;Descripción;Requiere foto;Afecta inventario;Activo;Orden\n' + 'talla ;"Talla incorrecta";"Cambio de talla; mismo modelo";No;Sí;Sí;1\n' + 'garantia;Garantía;;Sí;No;No;4\n' + ';Sin código;;;;;\n';
    expect(filasCsvMotivos(csv)).toEqual([
      { code: 'TALLA', name: 'Talla incorrecta', description: 'Cambio de talla; mismo modelo', requires_photo: false, affects_inventory: true, is_active: true, display_order: 1 },
      { code: 'GARANTIA', name: 'Garantía', description: undefined, requires_photo: true, affects_inventory: false, is_active: false, display_order: 4 },
    ]);
  });

  test('una coma dentro de comillas no corre las columnas', () => {
    const csv = 'a,b,c,d,e,f,g\nDEFECTO,"Producto defectuoso","Llegó roto, sin caja",Sí,Sí,Sí,2\n';
    expect(filasCsvMotivos(csv)[0]).toMatchObject({ code: 'DEFECTO', description: 'Llegó roto, sin caja', requires_photo: true, display_order: 2 });
  });

  test('el servicio compara la unicidad con el código en MAYÚSCULAS', () => {
    expect(normalizarCodigoMotivo(' cambio_talla ')).toBe('CAMBIO_TALLA');
    const servicio = leer('src/components/pos/devoluciones/motivos/returnReasonsService.ts');
    expect(servicio).toContain("const codigo = normalizarCodigoMotivo(data.code);");
    expect(servicio).toContain(".eq('code', codigo)");
    expect(servicio).not.toContain(".eq('code', data.code)");
  });
});

describe('migración de lectura de devoluciones', () => {
  const nombre = '20261121192518_pos_devoluciones_listado_cifras';
  const sql = leer(`supabase/migrations/${nombre}.sql`);
  const rollback = leer(`supabase/rollbacks/${nombre}_rollback.sql`);

  test('las funciones públicas comprueban la organización y no se abren a anon', () => {
    for (const f of ['pos_devoluciones_listado', 'pos_devoluciones_cifras', 'pos_ventas_para_devolver', 'pos_motivos_devolucion_usos']) {
      const cuerpo = sql.slice(sql.indexOf(`create or replace function public.${f}(`));
      expect(cuerpo.slice(0, cuerpo.indexOf('$$;'))).toContain('fn_assert_acceso_org(p_organization_id)');
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon;`));
      expect(sql).not.toMatch(new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to [^;]*anon`));
    }
    // Las internas solo para service_role.
    expect(sql).toMatch(/revoke all on function public\.pos_devoluciones_filtradas\([^)]*\) from public, anon, authenticated;/);
    expect(sql).toMatch(/revoke all on function public\.pos_devoluciones_puede_ver\(integer\) from public, anon, authenticated;/);
  });

  test('la búsqueda llega escapada y la sucursal se valida', () => {
    expect(sql).toContain('public.pos_ventas_patron(p_busqueda)');
    expect(sql).toContain('public.pos_ventas_sucursales(p_organization_id, p_branch_id)');
  });

  test('el buscador de ventas exige pos.refund y no oculta ventas con devoluciones previas (D11)', () => {
    const buscador = sql.slice(sql.indexOf('create or replace function public.pos_ventas_para_devolver('));
    expect(buscador).toContain("fn_caja_puede(p_organization_id, 'pos.refund')");
    expect(buscador).not.toMatch(/not exists \(select 1 from public\.returns/);
  });

  test('el reintegro del listado es total_refund, sin volver a sumar el impuesto', () => {
    expect(sql).toContain('r.total_refund as total');
    expect(sql).not.toMatch(/total_refund\s*\+/);
  });

  test('el rollback quita todas las funciones nuevas y nada más', () => {
    for (const f of ['pos_motivos_devolucion_usos', 'pos_ventas_para_devolver', 'pos_devoluciones_cifras', 'pos_devoluciones_listado', 'pos_devoluciones_puede_ver', 'pos_devoluciones_filtradas']) {
      expect(rollback).toContain(`drop function if exists public.${f}(`);
    }
    expect(rollback.toLowerCase()).not.toMatch(/drop table|delete from|procesar_devolucion/);
  });
});

describe('rutas del rediseño', () => {
  test('los route handlers resuelven la organización de la sesión (withOrg)', () => {
    for (const ruta of ['route.ts', 'cifras/route.ts', 'ventas/route.ts', 'caja/route.ts', '[id]/route.ts']) {
      const codigo = leer(`src/app/api/pos/devoluciones/${ruta}`);
      expect(codigo).toContain('withOrg(');
      expect(codigo).not.toMatch(/organization_?[iI]d['"]?\s*:\s*(body|req)/);
    }
  });

  test('la caja del diálogo usa la misma regla de procesar_devolucion (fn_caja_abierta_para)', () => {
    expect(leer('src/lib/pos/devoluciones/listadoServidor.ts')).toContain("rpc('fn_caja_abierta_para'");
  });

  test('existe el detalle /app/pos/devoluciones/[id] (Inventario y la venta enlazan ahí)', () => {
    expect(fs.existsSync(path.join(REPO, 'src/app/app/pos/devoluciones/[id]/page.tsx'))).toBe(true);
    expect(leer('src/components/pos/ventas/detalle/VentaDetallePage.tsx')).toContain('href: `/app/pos/devoluciones/${d.id}`');
  });
});
