// ============================================================
// Reportes de Compras
// Llama a las RPCs: fn_reporte_compras_proveedor, fn_reporte_ordenes_compra
// ============================================================
// Las facturas de compra son de finanzas y las órdenes de compra de
// inventario: cada arreglo entra al catálogo con su módulo, y los dos se
// muestran en la tarjeta «Compras».

import { supabase as browserSupabase } from '@/lib/supabase/config';
import type { ReportesClient } from '../types';
// `fetch` acepta el cliente de Supabase por parámetro: en el navegador cae al
// cliente con la sesión del usuario; en el servidor el route handler pasa el
// cliente de sesión de `getServerOrgContext()`.
import { normalizeBranchParam } from '@/lib/services/branchFilterHelper';
import type { DefinicionModulo, LecturaReporte, ReportData, PeriodoCierre } from '../types';
import { rangoDelPeriodo } from '../rangoPeriodo';

function buildReportData(
  id: string, titulo: string, modulo: string, periodo: PeriodoCierre,
  kpis: ReportData['kpis'], columnas: ReportData['columnas'],
  filas: Record<string, unknown>[], totales?: Record<string, unknown>,
): ReportData {
  return { id, titulo, modulo, kpis, columnas, filas, totales, generadoEn: new Date().toISOString(), periodo };
}

const num = (v: unknown): number => Number(v ?? 0) || 0;
const lista = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

const ESTADO_ORDEN: Record<string, string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  partial: 'Recibida parcial',
  received: 'Recibida',
  cancelled: 'Cancelada',
};

export const comprasFinanzasReports: DefinicionModulo[] = [
  {
    id: 'compras-proveedor',
    modulo: 'finance',
    titulo: 'Compras por proveedor',
    descripcion: 'Facturas de compra confirmadas del periodo por proveedor, con su saldo pendiente',
    categoria: 'financiero',
    alcance: 'sucursal',
    periodosSugeridos: ['mensual', 'trimestral', 'anual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_compras_proveedor', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
        p_branch_id: normalizeBranchParam(branchId),
      });
      if (error) throw error;

      const d = (data ?? {}) as Record<string, unknown>;
      const t = (d.totales ?? {}) as Record<string, unknown>;
      const proveedores = lista<Record<string, unknown>>(d.proveedores);
      const total = num(t.total);
      const vencidas = proveedores.reduce((s, p) => s + num(p.vencidas), 0);
      const principal = proveedores[0];

      const lectura: LecturaReporte[] = [];
      if (vencidas > 0) {
        lectura.push({ tono: 'alerta', texto: `${vencidas} facturas del periodo están vencidas y con saldo.`, href: '/app/finanzas/cuentas-por-pagar', etiquetaAccion: 'Ver cuentas por pagar' });
      }
      if (principal && total > 0 && num(principal.total) / total >= 0.5 && proveedores.length > 1) {
        lectura.push({ tono: 'info', texto: `${String(principal.proveedor)} concentra ${Math.round((num(principal.total) / total) * 100)} % de las compras del periodo.` });
      }

      return {
        ...buildReportData(
          'compras-proveedor', 'Compras por proveedor', 'finance', periodo,
          [
            { titulo: 'Total comprado', valor: total, formato: 'moneda' },
            { titulo: 'Impuestos', valor: num(t.impuestos), formato: 'moneda' },
            { titulo: 'Saldo por pagar', valor: num(t.saldo), formato: 'moneda' },
            { titulo: 'Facturas', valor: num(t.facturas), formato: 'numero' },
            { titulo: 'Proveedores', valor: num(t.proveedores), formato: 'numero' },
          ],
          [
            { key: 'proveedor', titulo: 'Proveedor', tipo: 'texto' },
            { key: 'nit', titulo: 'NIT', tipo: 'texto' },
            { key: 'facturas', titulo: 'Facturas', tipo: 'numero', alinear: 'right' },
            { key: 'subtotal', titulo: 'Subtotal', tipo: 'moneda', alinear: 'right' },
            { key: 'impuestos', titulo: 'Impuestos', tipo: 'moneda', alinear: 'right' },
            { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
            { key: 'saldo', titulo: 'Saldo', tipo: 'moneda', alinear: 'right' },
            { key: 'vencidas', titulo: 'Vencidas', tipo: 'numero', alinear: 'right' },
          ],
          proveedores.map((p) => ({
            proveedor: p.proveedor,
            nit: p.nit ?? '',
            facturas: num(p.facturas),
            subtotal: num(p.subtotal),
            impuestos: num(p.impuestos),
            total: num(p.total),
            saldo: num(p.saldo),
            vencidas: num(p.vencidas),
          })),
          { facturas: num(t.facturas), subtotal: num(t.subtotal), impuestos: num(t.impuestos), total, saldo: num(t.saldo) },
        ),
        lectura,
      };
    },
  },
];

export const comprasInventarioReports: DefinicionModulo[] = [
  {
    id: 'ordenes-compra',
    modulo: 'inventory',
    titulo: 'Órdenes de compra',
    descripcion: 'Órdenes creadas en el periodo por estado, con lo recibido y el valor pendiente de recibir',
    categoria: 'operativo',
    alcance: 'sucursal',
    periodosSugeridos: ['semanal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_ordenes_compra', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
        p_branch_id: normalizeBranchParam(branchId),
      });
      if (error) throw error;

      const d = (data ?? {}) as Record<string, unknown>;
      const t = (d.totales ?? {}) as Record<string, unknown>;
      const ordenes = lista<Record<string, unknown>>(d.ordenes);
      const borrador = num(t.borrador);

      const lectura: LecturaReporte[] = [];
      if (num(t.valor_pendiente) > 0) {
        lectura.push({ tono: 'info', texto: `${num(t.enviadas) + num(t.parciales)} órdenes enviadas siguen pendientes de recibir.`, href: '/app/inventario/ordenes-compra', etiquetaAccion: 'Ver órdenes' });
      }
      if (borrador > 0) {
        lectura.push({ tono: 'aviso', texto: `${borrador} órdenes siguen en borrador y no se han enviado al proveedor.`, href: '/app/inventario/ordenes-compra', etiquetaAccion: 'Revisar' });
      }
      if (d.truncado) {
        lectura.push({ tono: 'aviso', texto: 'La tabla muestra las 2.000 órdenes más recientes; los totales cubren todas.' });
      }

      return {
        ...buildReportData(
          'ordenes-compra', 'Órdenes de compra', 'inventory', periodo,
          [
            { titulo: 'Órdenes', valor: num(t.ordenes), formato: 'numero' },
            { titulo: 'Valor ordenado', valor: num(t.total), formato: 'moneda' },
            { titulo: 'Pendiente de recibir', valor: num(t.valor_pendiente), formato: 'moneda' },
            { titulo: 'Recibidas', valor: num(t.recibidas), formato: 'numero' },
            { titulo: 'En borrador', valor: borrador, formato: 'numero' },
          ],
          [
            { key: 'orden', titulo: 'Orden', tipo: 'texto' },
            { key: 'proveedor', titulo: 'Proveedor', tipo: 'texto' },
            { key: 'estado', titulo: 'Estado', tipo: 'texto' },
            { key: 'creada', titulo: 'Creada', tipo: 'fecha' },
            { key: 'esperada', titulo: 'Esperada', tipo: 'fecha' },
            { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
            { key: 'recibido_pct', titulo: 'Recibido', tipo: 'porcentaje', alinear: 'right' },
          ],
          ordenes.map((o) => ({
            orden: `OC-${o.orden_id}`,
            proveedor: o.proveedor,
            estado: ESTADO_ORDEN[String(o.estado)] ?? String(o.estado),
            creada: o.creada,
            esperada: o.esperada ?? null,
            total: num(o.total),
            recibido_pct: num(o.recibido_pct),
          })),
          { total: num(t.total) },
        ),
        vistaPrincipal: 'Órdenes',
        vistas: [{
          id: 'por-estado',
          titulo: 'Por estado',
          columnas: [
            { key: 'estado', titulo: 'Estado', tipo: 'texto' },
            { key: 'ordenes', titulo: 'Órdenes', tipo: 'numero', alinear: 'right' },
          ],
          filas: (['draft', 'sent', 'partial', 'received', 'cancelled'] as const).map((e) => ({
            estado: ESTADO_ORDEN[e],
            ordenes: num(t[{ draft: 'borrador', sent: 'enviadas', partial: 'parciales', received: 'recibidas', cancelled: 'canceladas' }[e]]),
          })),
          totales: { ordenes: num(t.ordenes) },
        }],
        lectura,
      };
    },
  },
];
