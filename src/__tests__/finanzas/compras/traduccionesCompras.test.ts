/**
 * Traducciones de facturas de compra y cuentas por pagar.
 *
 * - `facturasCompra` y `cuentasPorPagar` tienen exactamente las mismas claves
 *   en es/en/fr/pt (una clave que falta en un idioma se ve como la clave cruda).
 * - Cada `t('…')` literal de las pantallas nuevas existe en `messages/es.json`.
 * - Las claves dinámicas (estado de pago, recepción, códigos de error del
 *   contrato) tienen texto para todos sus valores.
 */
import * as fs from 'fs';
import * as path from 'path';
import { ERRORES_COMPRA } from '@/lib/services/compras/contrato';

const RAIZ = path.resolve(__dirname, '../../../..');
const IDIOMAS = ['es', 'en', 'fr', 'pt'] as const;
const NAMESPACES = ['facturasCompra', 'cuentasPorPagar'] as const;

type Arbol = { [k: string]: string | Arbol };
const mensajes = Object.fromEntries(
  IDIOMAS.map((l) => [l, JSON.parse(fs.readFileSync(path.join(RAIZ, 'messages', `${l}.json`), 'utf8')) as Arbol]),
) as Record<(typeof IDIOMAS)[number], Arbol>;

function claves(o: Arbol, p = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? claves(v, `${p}${k}.`) : [`${p}${k}`]));
}

function valor(o: Arbol, ruta: string): unknown {
  return ruta.split('.').reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Arbol)[k] : undefined), o);
}

const PANTALLAS = [
  'src/components/finanzas/facturas-compra/listado/FacturasCompraListado.tsx',
  'src/components/finanzas/facturas-compra/detalle/DetalleFacturaCompraV2.tsx',
  'src/components/finanzas/facturas-compra/detalle/DialogosCompra.tsx',
  'src/components/finanzas/facturas-compra/formulario/FormularioFacturaCompra.tsx',
  'src/components/finanzas/cuentas-por-pagar/RegistrarPagoProveedor.tsx',
  'src/components/finanzas/cuentas-por-pagar/ProgramarPagoDialog.tsx',
  'src/components/finanzas/cuentas-por-pagar/listado/CuentasPorPagarListado.tsx',
  'src/components/finanzas/cuentas-por-pagar/detalle/CuentaPorPagarDetalle.tsx',
  'src/components/finanzas/cuentas-por-pagar/AprobacionesPanel.tsx',
  'src/components/finanzas/cuentas-por-pagar/EstadoCuentaProveedorDialog.tsx',
  'src/components/finanzas/cuentas-por-pagar/PlanCuotasDialog.tsx',
  'src/components/finanzas/cuentas-por-pagar/BandaAntiguedad.tsx',
];

/** Claves literales `x('clave')` por namespace de cada `useTranslations`. Un
 *  componente por bloque: se asocia cada llamada al último `useTranslations`
 *  con ese nombre de variable declarado antes en el archivo. */
function clavesLiterales(archivo: string): string[] {
  const src = fs.readFileSync(path.join(RAIZ, archivo), 'utf8');
  const decl = [...src.matchAll(/const\s+(\w+)\s*=\s*useTranslations\(\s*'([^']+)'\s*\)/g)].map((m) => ({
    pos: m.index ?? 0,
    v: m[1],
    ns: m[2],
  }));
  const out: string[] = [];
  for (const { v } of decl) {
    const re = new RegExp(`\\b${v}(?:\\.rich)?\\(\\s*'([^'$]+)'`, 'g');
    for (const m of src.matchAll(re)) {
      const pos = m.index ?? 0;
      const vigente = decl.filter((d) => d.v === v && d.pos < pos).pop();
      if (vigente) out.push(`${vigente.ns}.${m[1]}`);
    }
  }
  return [...new Set(out)];
}

describe('traducciones de compras y CxP', () => {
  it.each(NAMESPACES)('%s tiene las mismas claves en los cuatro idiomas', (ns) => {
    const base = claves(mensajes.es[ns] as Arbol).sort();
    expect(base.length).toBeGreaterThan(0);
    for (const l of IDIOMAS) expect(claves(mensajes[l][ns] as Arbol).sort()).toEqual(base);
  });

  it.each(PANTALLAS)('cada clave literal de %s existe', (archivo) => {
    const faltan = clavesLiterales(archivo).filter((k) => typeof valor(mensajes.es, k) !== 'string');
    expect(faltan).toEqual([]);
  });

  it('las claves dinámicas tienen texto para todos sus valores', () => {
    const requeridas = [
      ...['borrador', 'pendiente', 'parcial', 'vencida', 'pagada', 'anulada'].map((e) => `facturasCompra.estadoPago.${e}`),
      ...['por_recibir', 'recibido', 'no_aplica'].map((e) => `facturasCompra.recepcion.${e}`),
      ...ERRORES_COMPRA.map((c) => `facturasCompra.errores.${c}`),
      ...['monto_invalido', 'excede_saldo'].map((c) => `cuentasPorPagar.programar.errores.${c}`),
      ...['numero', 'proveedor', 'nit', 'emitida', 'vence', 'moneda', 'total', 'neto', 'saldo', 'estado', 'recepcion'].map(
        (c) => `facturasCompra.listado.exportar.columnas.${c}`,
      ),
      ...['pendiente', 'parcial', 'vencida', 'pagada', 'anulada'].map((e) => `cuentasPorPagar.estado.${e}`),
      ...['al_dia', 'd1_30', 'd31_60', 'd61_90', 'd90_mas'].map((k) => `cuentasPorPagar.antiguedad.tramos.${k}`),
      ...['pending', 'approved', 'rejected', 'cancelled'].map((s) => `cuentasPorPagar.detalle.programacion.${s}`),
      ...['factura', 'cuenta', 'pago'].map((s) => `cuentasPorPagar.estadoCuenta.tipos.${s}`),
      ...['proveedor', 'nit', 'factura', 'vence', 'moneda', 'monto', 'saldo', 'estado', 'dias'].map(
        (c) => `cuentasPorPagar.listado.exportar.columnas.${c}`,
      ),
    ];
    for (const l of IDIOMAS) {
      expect(requeridas.filter((k) => typeof valor(mensajes[l], k) !== 'string')).toEqual([]);
    }
  });
});
