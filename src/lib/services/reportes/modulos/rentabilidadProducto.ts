// ============================================================
// Rentabilidad por producto: forma común de `fn_reporte_rentabilidad_producto`
// ============================================================
// La usan «Rentabilidad por producto» (finanzas) y su gemela de inventario.
// La RPC se llama dentro del `fetch` de cada definición —los tests de alcance
// leen el cuerpo del `fetch`—; aquí solo se da forma al resultado.

import type { LecturaReporte, ReportData, VistaReporte } from '../types';

const num = (v: unknown): number => Number(v ?? 0) || 0;

interface ProductoRentabilidad {
  producto_id: number;
  nombre: string;
  sku: string | null;
  categoria: string | null;
  cantidad: number;
  ingreso: number;
  costo: number;
  margen: number;
  margen_pct: number;
  sin_costo: boolean;
}

export interface VistaRentabilidad {
  kpis: ReportData['kpis'];
  columnas: ReportData['columnas'];
  filas: Record<string, unknown>[];
  totales: Record<string, unknown>;
  vistas: VistaReporte[];
  lectura: LecturaReporte[];
}

const pct = (margen: number, ingreso: number) => (ingreso !== 0 ? Math.round((margen / ingreso) * 10000) / 100 : 0);

export function vistaRentabilidadProducto(data: unknown): VistaRentabilidad {
  const d = (data ?? {}) as Record<string, unknown>;
  const t = (d.totales ?? {}) as Record<string, unknown>;
  const productos: ProductoRentabilidad[] = (Array.isArray(d.productos) ? d.productos : []).map(
    (p: Record<string, unknown>) => ({
      producto_id: num(p.producto_id),
      nombre: String(p.nombre ?? '—'),
      sku: p.sku == null ? null : String(p.sku),
      categoria: p.categoria == null ? null : String(p.categoria),
      cantidad: num(p.cantidad),
      ingreso: num(p.ingreso),
      costo: num(p.costo),
      margen: num(p.margen),
      margen_pct: num(p.margen_pct),
      sin_costo: Boolean(p.sin_costo),
    }),
  );

  const ingreso = num(t.ingreso);
  const costo = num(t.costo);
  const margen = num(t.margen);
  const lineasSinCosto = num(t.lineas_sin_costo);

  const porCategoria = new Map<string, { cantidad: number; ingreso: number; costo: number; productos: number }>();
  for (const p of productos) {
    const clave = p.categoria ?? 'Sin categoría';
    const acc = porCategoria.get(clave) ?? { cantidad: 0, ingreso: 0, costo: 0, productos: 0 };
    acc.cantidad += p.cantidad;
    acc.ingreso += p.ingreso;
    acc.costo += p.costo;
    acc.productos += 1;
    porCategoria.set(clave, acc);
  }

  const lectura: LecturaReporte[] = [];
  if (lineasSinCosto > 0) {
    lectura.push({
      tono: 'aviso',
      texto: `${lineasSinCosto} líneas vendidas no tienen costo registrado: el margen de esos productos sale sobrestimado.`,
      href: '/app/inventario/productos',
      etiquetaAccion: 'Revisar costos',
    });
  }
  if (margen < 0) {
    lectura.push({ tono: 'alerta', texto: 'El costo de lo vendido supera el ingreso del periodo.' });
  }
  if (d.truncado) {
    lectura.push({ tono: 'aviso', texto: 'La tabla muestra los 2.000 productos de mayor ingreso; los totales cubren todos.' });
  }

  return {
    kpis: [
      { titulo: 'Ingreso neto', valor: ingreso, formato: 'moneda' },
      { titulo: 'Costo de lo vendido', valor: costo, formato: 'moneda' },
      { titulo: 'Margen bruto', valor: margen, formato: 'moneda' },
      { titulo: 'Margen %', valor: num(t.margen_pct), formato: 'porcentaje' },
      { titulo: 'Productos', valor: num(t.productos), formato: 'numero' },
    ],
    columnas: [
      { key: 'nombre', titulo: 'Producto', tipo: 'texto' },
      { key: 'sku', titulo: 'SKU', tipo: 'texto' },
      { key: 'categoria', titulo: 'Categoría', tipo: 'texto' },
      { key: 'cantidad', titulo: 'Cantidad', tipo: 'numero', alinear: 'right' },
      { key: 'ingreso', titulo: 'Ingreso neto', tipo: 'moneda', alinear: 'right' },
      { key: 'costo', titulo: 'Costo', tipo: 'moneda', alinear: 'right' },
      { key: 'margen', titulo: 'Margen', tipo: 'moneda', alinear: 'right' },
      { key: 'margen_pct', titulo: 'Margen %', tipo: 'porcentaje', alinear: 'right' },
    ],
    filas: productos.map((p) => ({
      nombre: p.sin_costo ? `${p.nombre} (sin costo)` : p.nombre,
      sku: p.sku ?? '',
      categoria: p.categoria ?? 'Sin categoría',
      cantidad: p.cantidad,
      ingreso: p.ingreso,
      costo: p.costo,
      margen: p.margen,
      margen_pct: p.margen_pct,
    })),
    totales: { cantidad: num(t.cantidad), ingreso, costo, margen, margen_pct: num(t.margen_pct) },
    vistas: [{
      id: 'por-categoria',
      titulo: 'Por categoría',
      columnas: [
        { key: 'categoria', titulo: 'Categoría', tipo: 'texto' },
        { key: 'productos', titulo: 'Productos', tipo: 'numero', alinear: 'right' },
        { key: 'cantidad', titulo: 'Cantidad', tipo: 'numero', alinear: 'right' },
        { key: 'ingreso', titulo: 'Ingreso neto', tipo: 'moneda', alinear: 'right' },
        { key: 'costo', titulo: 'Costo', tipo: 'moneda', alinear: 'right' },
        { key: 'margen', titulo: 'Margen', tipo: 'moneda', alinear: 'right' },
        { key: 'margen_pct', titulo: 'Margen %', tipo: 'porcentaje', alinear: 'right' },
      ],
      filas: [...porCategoria.entries()]
        .map(([categoria, c]) => ({
          categoria,
          productos: c.productos,
          cantidad: c.cantidad,
          ingreso: c.ingreso,
          costo: c.costo,
          margen: c.ingreso - c.costo,
          margen_pct: pct(c.ingreso - c.costo, c.ingreso),
        }))
        .sort((a, b) => b.ingreso - a.ingreso),
    }],
    lectura,
  };
}
