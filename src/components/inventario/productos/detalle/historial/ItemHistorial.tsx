'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Barcode,
  DollarSign,
  History,
  Receipt,
  ShieldCheck,
  StickyNote,
  Tag,
  Truck,
  User,
  type LucideIcon,
} from 'lucide-react';
import { StatusBadge } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { EventoHistorial, TipoHistorial } from '@/lib/services/productoService';
import { formatDateInTz, formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { cn } from '@/utils/Utils';
import type { MonedaProducto } from '../ContextoProducto';
import { cambiosAuditoria, esCampoConocido } from './cambiosAuditoria';

export const ICONO_TIPO: Record<TipoHistorial, LucideIcon> = {
  auditoria: History,
  precio: Tag,
  costo: DollarSign,
  kardex: ArrowDownLeft,
  compra: Truck,
  venta: Receipt,
  nota: StickyNote,
  serial: Barcode,
  garantia: ShieldCheck,
};

export const TONO_TIPO: Record<TipoHistorial, string> = {
  auditoria: 'bg-subtle text-fg-secondary',
  precio: 'bg-brand-tint text-brand-deep',
  costo: 'bg-warning-subtle text-warning-text',
  kardex: 'bg-info-subtle text-info-text',
  compra: 'bg-info-subtle text-info-text',
  venta: 'bg-success-subtle text-success-text',
  nota: 'bg-subtle text-fg-secondary',
  serial: 'bg-brand-tint text-brand-deep',
  garantia: 'bg-danger-subtle text-danger-text',
};

const ESTADOS_PRODUCTO = ['active', 'inactive', 'discontinued', 'deleted'];
const ESTACIONES = ['hot_kitchen', 'cold_kitchen', 'bar', 'cashier', 'all'];
const MAX_VISIBLES = 3;
const MAX_TEXTO = 60;

export interface ContextoItem {
  productoId: number;
  timezone: string;
  locale: string;
  moneda: MonedaProducto;
  categorias: ReadonlyMap<number, string>;
  ahora: number;
}

const s = (d: Record<string, unknown>, k: string): string | null => {
  const v = d[k];
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t ? t : null;
};
const n = (d: Record<string, unknown>, k: string): number | null => {
  const v = d[k];
  if (v === null || v === undefined || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const recortar = (v: string) => (v.length > MAX_TEXTO ? `${v.slice(0, MAX_TEXTO - 1)}…` : v);

/** Un evento de la línea de tiempo: icono y tono por tipo, texto armado aquí (4 idiomas) desde `detalle`. */
export function ItemHistorial({ evento, ctx, ultimo }: { evento: EventoHistorial; ctx: ContextoItem; ultimo: boolean }) {
  const t = useTranslations('productoDetalle.historial');
  const tc = useTranslations('productoDetalle.comun');
  const te = useTranslations('productoDetalle.estado');
  const tr = useTranslations('productoDetalle.resumen');
  const d = evento.detalle;
  const decimal = new Intl.NumberFormat(ctx.locale, { maximumFractionDigits: 3 });
  const dinero = (v: number | null) => (v === null ? tc('sinDatos') : ctx.moneda.formatear(v));
  const fechaHora = (v: string | null) => formatDateTimeInTz(v, ctx.timezone, { locale: ctx.locale });
  const hora = formatDateInTz(evento.fecha, ctx.timezone, { locale: ctx.locale, hour: '2-digit', minute: '2-digit' });

  const Icono = evento.tipo === 'kardex' && s(d, 'direccion') === 'out' ? ArrowUpRight : ICONO_TIPO[evento.tipo];

  const valorCampo = (campo: string, v: unknown): string => {
    if (v === null || v === undefined || v === '') return tc('sinDatos');
    if (typeof v === 'boolean') return v ? tc('si') : tc('no');
    const texto = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (campo === 'status' && ESTADOS_PRODUCTO.includes(texto)) return te(texto as 'active');
    if (campo === 'product_type') return texto === 'service' ? t('valores.servicio') : t('valores.producto');
    if (campo === 'station' && ESTACIONES.includes(texto)) return tr(`estaciones.${texto as 'bar'}`);
    if (campo === 'category_id') return ctx.categorias.get(Number(v)) ?? `#${texto}`;
    if (campo === 'description') return t('valores.textoCambiado');
    if (typeof v === 'number' || (/^-?\d+(\.\d+)?$/.test(texto) && campo !== 'sku' && campo !== 'barcode' && campo !== 'reference')) {
      return decimal.format(Number(texto));
    }
    return recortar(texto);
  };

  const etiquetaCampo = (campo: string) => (esCampoConocido(campo) ? t(`campos.${campo}`) : campo);

  let titulo: ReactNode;
  const lineas: ReactNode[] = [];
  const insignias: ReactNode[] = [];
  let enlace: { href: string; texto: string } | null = null;

  switch (evento.tipo) {
    case 'auditoria': {
      const accion = s(d, 'accion') ?? '';
      titulo =
        accion === 'create' || accion === 'update' || accion === 'delete' ? t(`auditoria.acciones.${accion}`) : t('auditoria.otra', { accion: accion || '—' });
      if (accion === 'create') lineas.push(t('auditoria.creado'));
      else if (accion === 'delete') lineas.push(t('auditoria.eliminado'));
      else {
        const cambios = cambiosAuditoria(d.cambios);
        if (cambios.length === 0) lineas.push(<span className="text-fg-muted">{t('auditoria.sinDetalles')}</span>);
        else {
          const textos = cambios.map((c) =>
            t('auditoria.cambio', { campo: etiquetaCampo(c.campo), antes: valorCampo(c.campo, c.antes), despues: valorCampo(c.campo, c.despues) }),
          );
          const visibles = textos.slice(0, MAX_VISIBLES);
          const resto = textos.length - visibles.length;
          lineas.push(
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-left text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  aria-label={textos.join('; ')}
                >
                  {visibles.join(' · ')}
                  {resto > 0 && <span className="ml-1 font-medium text-link">{t('auditoria.mas', { count: resto })}</span>}
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm border-line bg-surface text-fg">
                <ul className="flex flex-col gap-1 text-xs">
                  {textos.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </TooltipContent>
            </Tooltip>,
          );
        }
      }
      break;
    }
    case 'precio':
    case 'costo': {
      const esPrecio = evento.tipo === 'precio';
      const valor = n(d, esPrecio ? 'precio' : 'costo');
      const anterior = n(d, 'anterior');
      titulo = esPrecio ? t('titulos.precio') : t('titulos.costo');
      lineas.push(
        anterior === null
          ? t('precio.inicial', { ahora: dinero(valor) })
          : t('precio.cambio', { antes: dinero(anterior), ahora: dinero(valor) }),
      );
      const comparacion = n(d, 'comparacion');
      if (esPrecio && comparacion) lineas.push(t('precio.comparacion', { valor: dinero(comparacion) }));
      const proveedor = s(d, 'proveedor');
      if (!esPrecio && proveedor) lineas.push(t('precio.proveedor', { proveedor }));
      const desde = s(d, 'desde');
      const hasta = s(d, 'hasta');
      lineas.push(
        <span className="text-fg-secondary">
          {hasta && !d.cancelado
            ? t('precio.vigenciaHasta', { desde: fechaHora(desde), hasta: fechaHora(hasta) })
            : t('precio.vigenciaDesde', { desde: fechaHora(desde) })}
        </span>,
      );
      if (d.cancelado === true) insignias.push(<Badge key="c" tono="neutro" tamano="sm">{t('precio.cancelado')}</Badge>);
      else if (desde && new Date(desde).getTime() > ctx.ahora)
        insignias.push(<Badge key="p" tono="informacion" tamano="sm">{t('precio.programado')}</Badge>);
      break;
    }
    case 'kardex': {
      const cantidad = decimal.format(n(d, 'cantidad') ?? 0);
      titulo = s(d, 'direccion') === 'out' ? t('kardex.salida', { cantidad }) : t('kardex.entrada', { cantidad });
      const origen = s(d, 'origen');
      if (origen) lineas.push(t('kardex.origen', { origen: t.has(`kardex.origenes.${origen}`) ? t(`kardex.origenes.${origen}`) : origen }));
      const sucursal = s(d, 'sucursal');
      if (sucursal) lineas.push(t('kardex.sucursal', { sucursal }));
      const costo = n(d, 'costo_unitario');
      if (costo !== null && costo > 0) lineas.push(t('kardex.costoUnitario', { costo: dinero(costo) }));
      const documento = s(d, 'origen_id');
      if (documento) lineas.push(t('kardex.documento', { documento: documento.length > 12 ? documento.slice(0, 8) : documento }));
      const nota = s(d, 'nota');
      if (nota) lineas.push(<span className="text-fg-secondary">{recortar(nota)}</span>);
      break;
    }
    case 'compra':
    case 'venta': {
      const tipoDoc = s(d, 'documento_tipo');
      const documento = s(d, 'documento') ?? '—';
      const id = s(d, 'documento_id');
      if (tipoDoc === 'orden_compra') {
        titulo = t('documentos.ordenCompra', { documento });
        if (id) enlace = { href: `/app/inventario/ordenes-compra/${id}`, texto: t('documentos.ver') };
      } else if (tipoDoc === 'factura_compra') {
        titulo = t('documentos.facturaCompra', { documento });
        if (id) enlace = { href: `/app/inventario/facturas-compra/${id}`, texto: t('documentos.ver') };
      } else if (tipoDoc === 'factura_venta') {
        titulo = t('documentos.facturaVenta', { documento });
        if (id) enlace = { href: `/app/finanzas/facturas-venta/${id}`, texto: t('documentos.ver') };
      } else {
        titulo = t('documentos.venta', { documento });
        if (id) enlace = { href: `/app/pos/ventas/${id}`, texto: t('documentos.ver') };
      }
      const cantidad = n(d, 'cantidad');
      const recibido = n(d, 'recibido');
      if (cantidad !== null) {
        lineas.push(
          tipoDoc === 'orden_compra' && recibido !== null
            ? t('documentos.cantidadRecibida', { cantidad: decimal.format(cantidad), recibido: decimal.format(recibido) })
            : t('documentos.cantidad', { cantidad: decimal.format(cantidad) }),
        );
      }
      const unitario = n(d, evento.tipo === 'compra' ? 'costo_unitario' : 'precio_unitario');
      const total = n(d, 'total');
      if (total !== null) lineas.push(t('documentos.total', { total: dinero(total), unitario: dinero(unitario) }));
      const tercero = s(d, evento.tipo === 'compra' ? 'proveedor' : 'cliente');
      if (tercero) lineas.push(evento.tipo === 'compra' ? t('documentos.proveedor', { nombre: tercero }) : t('documentos.cliente', { nombre: tercero }));
      const estado = s(d, 'estado');
      if (estado) insignias.push(<StatusBadge key="e" estado={estado} />);
      break;
    }
    case 'nota': {
      titulo = t('titulos.nota');
      const contenido = s(d, 'contenido');
      lineas.push(<span className="whitespace-pre-wrap break-words">{contenido ?? tc('sinDatos')}</span>);
      if (d.fijada === true) insignias.push(<Badge key="f" tono="marca" tamano="sm">{t('nota.fijada')}</Badge>);
      break;
    }
    case 'serial': {
      const serial = s(d, 'serial') ?? '—';
      titulo = t('serial.titulo', { serial });
      const ev = s(d, 'evento');
      if (ev) lineas.push(t.has(`serial.eventos.${ev}`) ? t(`serial.eventos.${ev}`) : ev);
      const de = s(d, 'de');
      const a = s(d, 'a');
      const estadoSerial = (x: string) => (t.has(`serial.estados.${x}`) ? t(`serial.estados.${x}`) : x);
      if (de || a) lineas.push(t('serial.transicion', { de: de ? estadoSerial(de) : '—', a: a ? estadoSerial(a) : '—' }));
      const nota = s(d, 'nota');
      if (nota) lineas.push(<span className="text-fg-secondary">{recortar(nota)}</span>);
      break;
    }
    case 'garantia': {
      titulo = t('garantia.titulo', { serial: s(d, 'serial') ?? '—' });
      const reclamo = s(d, 'reclamo_id');
      if (reclamo) enlace = { href: `/app/inventario/garantias/${reclamo}`, texto: t('garantia.ver') };
      const motivo = s(d, 'motivo');
      if (motivo) lineas.push(t('garantia.motivo', { motivo: recortar(motivo) }));
      const resolucion = s(d, 'resolucion');
      if (resolucion) {
        lineas.push(
          t('garantia.resolucion', {
            resolucion: t.has(`garantia.resoluciones.${resolucion}`) ? t(`garantia.resoluciones.${resolucion}`) : resolucion,
          }),
        );
      }
      const estado = s(d, 'estado');
      if (estado) insignias.push(<StatusBadge key="e" estado={estado} />);
      break;
    }
    default:
      titulo = String(evento.tipo);
  }

  const esVariante = evento.product_id !== ctx.productoId;

  return (
    <li className="relative flex gap-3">
      {!ultimo && <span aria-hidden className="absolute left-4 top-9 -bottom-3 w-px bg-line" />}
      <span aria-hidden className={cn('relative z-[1] flex size-8 shrink-0 items-center justify-center rounded-full', TONO_TIPO[evento.tipo])}>
        <Icono className="size-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2.5">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="sr-only">{t(`tipos.${evento.tipo}`)}: </span>
            <span className="text-sm font-medium text-fg">{titulo}</span>
            {insignias}
            {esVariante && (
              <Badge tono="neutro" tamano="sm">
                {t('variante', { nombre: evento.producto_nombre ?? `#${evento.product_id}` })}
              </Badge>
            )}
          </div>
          <time dateTime={evento.fecha} className="shrink-0 text-xs tabular-nums text-fg-secondary" title={fechaHora(evento.fecha)}>
            {hora}
          </time>
        </div>
        {lineas.length > 0 && (
          <div className="mt-1 flex flex-col gap-0.5 text-sm text-fg">
            {lineas.map((l, i) => (
              <div key={i} className="min-w-0 break-words">
                {l}
              </div>
            ))}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-secondary">
          <span className="inline-flex items-center gap-1">
            <User className="size-3.5" aria-hidden />
            {evento.usuario ?? tc('usuarioDesconocido')}
          </span>
          {enlace && (
            <Link href={enlace.href} className="font-medium text-link hover:underline">
              {enlace.texto}
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}
