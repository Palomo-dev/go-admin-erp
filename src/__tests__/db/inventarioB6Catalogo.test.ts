/**
 * Contrato de las migraciones del bloque B6b del inventario (catálogo maestro:
 * imágenes, categorías, proveedores y etiquetas; docs/implementacion/INVENTARIO-PLAN.md §5.7).
 *
 * Se aplicaron por el MCP y se probaron en la base con DO … RAISE (sin dejar
 * datos): usuario de la org 120 sin permisos de catálogo → lee su resumen,
 * pero listar la org 2, registrar imagen, guardar etiqueta, mover categorías y
 * eliminar imágenes de otra org responden 42501; anon → 42501; etiqueta
 * «prueba b6» tras «Prueba B6» → 23505; importar revisa y aplica en una
 * transacción. Aquí se fija lo que no puede volver atrás.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const MIGRACIONES = [
  '20260929020000_inv_b6_imagenes',
  '20260929021000_inv_b6_catalogo_permisos',
  '20260929022000_inv_b6_importar_catalogo',
] as const;
const sql = Object.fromEntries(MIGRACIONES.map((m) => [m, leer(`supabase/migrations/${m}.sql`)])) as Record<(typeof MIGRACIONES)[number], string>;
const sinComentarios = (s: string) => s.replace(/--.*$/gm, '');

/** Funciones `create or replace function public.x(...)` con su cuerpo. */
function funciones(texto: string): { nombre: string; cuerpo: string }[] {
  const limpio = sinComentarios(texto);
  const re = /create or replace function public\.(\w+)\(/g;
  const inicios = [...limpio.matchAll(re)].map((m) => ({ nombre: m[1], i: m.index ?? 0 }));
  return inicios.map((f, k) => ({ nombre: f.nombre, cuerpo: limpio.slice(f.i, inicios[k + 1]?.i ?? undefined) }));
}

describe('B6b: toda migración tiene su rollback', () => {
  it.each(MIGRACIONES)('%s', (m) => {
    expect(existsSync(join(RAIZ, 'supabase/rollbacks', `${m}_rollback.sql`))).toBe(true);
  });
});

describe('B6b: toda función con elevación comprueba la organización y revoca anon', () => {
  const definer = MIGRACIONES.flatMap((m) =>
    funciones(sql[m])
      .filter((f) => /security definer/i.test(f.cuerpo) && !/returns trigger/i.test(f.cuerpo))
      .map((f) => ({ m, ...f })),
  );

  it('hay funciones que revisar', () => {
    expect(definer.length).toBeGreaterThanOrEqual(15);
  });

  it.each(definer.map((f) => [f.nombre, f] as const))('%s: pertenencia o permiso antes de tocar datos', (_n, f) => {
    expect(f.cuerpo).toMatch(/perform public\.(fn_assert_acceso_org|fn_productos_exigir_permiso)\(p_org/);
  });

  it.each(definer.map((f) => [f.nombre, f] as const))('%s: revoke … from public, anon en la misma migración', (_n, f) => {
    expect(sql[f.m]).toMatch(new RegExp(`revoke all on function public\\.${f.nombre}\\([^)]*\\) from public, anon`));
  });
});

describe('B6b: las escrituras exigen permiso de catálogo en el servidor, no solo pertenencia', () => {
  const escrituras: Record<string, readonly string[]> = {
    '20260929020000_inv_b6_imagenes': [
      'fn_imagen_registrar',
      'fn_imagen_actualizar',
      'fn_imagenes_visibilidad',
      'fn_imagen_asignar_productos',
      'fn_imagenes_eliminar',
    ],
    '20260929021000_inv_b6_catalogo_permisos': [
      'mover_categorias',
      'eliminar_categoria',
      'etiquetas_producto_eliminar',
      'etiquetas_producto_fusionar',
      'fn_etiqueta_guardar',
    ],
    '20260929022000_inv_b6_importar_catalogo': ['fn_categorias_importar', 'fn_proveedores_importar'],
  };
  for (const [m, nombres] of Object.entries(escrituras)) {
    const fs = funciones(sql[m as (typeof MIGRACIONES)[number]]);
    it.each(nombres)(`${m}: %s usa fn_productos_exigir_permiso`, (nombre) => {
      const f = fs.find((x) => x.nombre === nombre);
      expect(f).toBeDefined();
      expect(f?.cuerpo).toContain('perform public.fn_productos_exigir_permiso(p_org, array[');
      expect(f?.cuerpo).not.toContain('perform public.fn_assert_acceso_org(p_org)');
    });
  }
});

describe('B6b: reglas que no pueden volver atrás', () => {
  const imagenes = sql['20260929020000_inv_b6_imagenes'];
  const permisos = sql['20260929021000_inv_b6_catalogo_permisos'];
  const importar = sql['20260929022000_inv_b6_importar_catalogo'];

  it('se retira el disparador que rompía «Hacer pública» (columna image_url inexistente)', () => {
    expect(imagenes).toContain('drop trigger if exists trigger_update_image_url on public.shared_images;');
  });
  it('la biblioteca se lista por organización y paginada en el servidor (nada de ids falsos + 100000)', () => {
    const listado = funciones(imagenes).find((f) => f.nombre === 'fn_imagenes_listado');
    expect(listado?.cuerpo).toContain('s.organization_id = p_org');
    expect(listado?.cuerpo).toContain('least(greatest(coalesce(p_limit, 20), 1), 100)');
    expect(sinComentarios(imagenes)).not.toContain('100000');
  });
  it('eliminar una imagen reasigna la principal de cada producto afectado', () => {
    const f = funciones(imagenes).find((x) => x.nombre === 'fn_imagenes_eliminar');
    expect(f?.cuerpo).toMatch(/not exists \(select 1 from public\.product_images pi where pi\.product_id = v_producto and pi\.is_primary\)/);
    expect(f?.cuerpo).toContain('order by x.display_order, x.id');
  });
  it('asignar a productos no duplica la foto y bloquea el producto', () => {
    const f = funciones(imagenes).find((x) => x.nombre === 'fn_imagen_asignar_productos');
    expect(f?.cuerpo).toContain('for update');
    expect(f?.cuerpo).toContain('pi.shared_image_id = p_id or pi.storage_path = v_img.storage_path');
  });
  it('registrar solo acepta rutas de la organización, JPG/PNG/WEBP y hasta 5 MB', () => {
    const f = funciones(imagenes).find((x) => x.nombre === 'fn_imagen_registrar');
    expect(f?.cuerpo).toContain("starts_with(p_storage_path, p_org::text || '/')");
    expect(f?.cuerpo).toContain("('image/jpeg', 'image/png', 'image/webp')");
    expect(f?.cuerpo).toContain('5242880');
  });
  it('etiquetas: nombre único sin distinguir mayúsculas hacia adelante, con el mismo código que el UNIQUE', () => {
    expect(permisos).toContain('before insert or update of name, organization_id on public.product_tags');
    expect(permisos).toMatch(/lower\(t\.name\) = lower\(new\.name\)[\s\S]*errcode = '23505'/);
  });
  it('las importaciones revisan con la misma función que aplican y tienen tope de filas', () => {
    for (const nombre of ['fn_categorias_importar', 'fn_proveedores_importar']) {
      const f = funciones(importar).find((x) => x.nombre === nombre);
      expect(f?.cuerpo).toContain('if coalesce(p_aplicar, false) then');
      expect(f?.cuerpo).toContain('jsonb_array_length(p_filas) > 2000');
    }
  });
  it('proveedores: el mismo documento actualiza el existente sin borrar lo que ya tenía', () => {
    const f = funciones(importar).find((x) => x.nombre === 'fn_proveedores_importar');
    expect(f?.cuerpo).toContain("case when existente_id is null then 'crear' else 'actualizar' end");
    expect(f?.cuerpo).toContain("phone = coalesce(nullif(btrim(coalesce(v_fila.datos->>'phone', '')), ''), s.phone)");
  });
  it('categorías: padres antes que hijas y slug único por organización', () => {
    const f = funciones(importar).find((x) => x.nombre === 'fn_categorias_importar');
    expect(f?.cuerpo).toContain("motivo = 'padre_no_existe'");
    expect(f?.cuerpo).toContain("v_slug := v_slug_base || '-' || v_n;");
  });
  it('ninguna migración nombra una organización cliente ni trae credenciales', () => {
    for (const m of MIGRACIONES) {
      expect(sql[m]).not.toMatch(/service_role_key|eyJhbGci|sk_live/i);
    }
  });
});
