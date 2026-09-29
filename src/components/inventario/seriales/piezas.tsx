'use client';

import type { ReactNode, SyntheticEvent } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  ClipboardCheck,
  BedDouble,
  ClipboardList,
  Clock,
  ExternalLink,
  Factory,
  FileMinus,
  FileText,
  Package,
  Receipt,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Truck,
  Undo2,
  Wrench,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EnlaceDocumento as EnlaceDocumentoKit } from '@/components/kit/inventario';
import { TONO_ESTADO_SERIAL, type EstadoSerial } from '@/components/inventario/productos/logica/seriales';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { DocumentoSerial, EventoSerial, TipoDocumentoSerial } from '@/lib/services/seriales/contrato';
import { cn } from '@/utils/Utils';
import {
  claveEvento,
  eventosVisibles,
  numeroDocumento,
  rutaDocumento,
  type ClaveEvento,
  type SituacionGarantia,
  type TonoEvento,
} from './logica';

const ESTADOS_CONOCIDOS = Object.keys(TONO_ESTADO_SERIAL);

/** Etiqueta traducida del estado de un serial (o el valor crudo si no se conoce). */
export function useEtiquetaEstadoSerialB4(): (estado: string) => string {
  const t = useTranslations('inventarioSeriales.estados');
  return (estado: string) => (ESTADOS_CONOCIDOS.includes(estado) ? t(estado) : estado);
}

/** Estado de un serial: tono de `TONO_ESTADO_SERIAL` con punto (el mismo de la sub-pestaña del producto). */
export function BadgeEstadoSerial({ estado, tamano = 'sm' }: { estado: string; tamano?: 'sm' | 'md' }) {
  const etiqueta = useEtiquetaEstadoSerialB4();
  const tono = ESTADOS_CONOCIDOS.includes(estado) ? TONO_ESTADO_SERIAL[estado as EstadoSerial] : 'neutro';
  return (
    <Badge tono={tono} tamano={tamano} punto className="whitespace-nowrap">
      {etiqueta(estado)}
    </Badge>
  );
}

/** Icono de cada tipo de documento (encabezado de la trazabilidad). */
export const ICONO_DOCUMENTO_SERIAL: Record<TipoDocumentoSerial, LucideIcon> = {
  venta: Receipt,
  factura_venta: FileText,
  nota_credito: FileMinus,
  devolucion: Undo2,
  anulacion_venta: XCircle,
  factura_compra: ReceiptText,
  orden_compra: ClipboardList,
  ajuste: ClipboardCheck,
  traslado: ArrowLeftRight,
  orden_produccion: Factory,
  folio: BedDouble,
  pedido_web: ShoppingBag,
  producto: Package,
  otro: FileText,
  garantia: ShieldCheck,
};

/**
 * Nombre de un documento para texto plano («Venta FACT-0019»): el tipo con
 * las etiquetas del núcleo (`inventario.documentos`) y el reclamo de garantía
 * con las de B4.
 */
export function useEtiquetaDocumento(): (doc: DocumentoSerial | null | undefined) => string {
  const tn = useTranslations('inventario.documentos');
  const t = useTranslations('inventarioSeriales.documentos');
  return (doc) => {
    if (!doc) return '';
    const tipo = doc.tipo === 'garantia' ? t('garantia') : tn.has(doc.tipo) ? tn(doc.tipo) : tn('otro');
    return `${tipo} ${numeroDocumento(doc)}`.trim();
  };
}

/**
 * Enlace a un documento: el de `kit/inventario` (tipo, número y ruta que
 * resuelve el núcleo) y, para el reclamo de garantía que el núcleo no conoce,
 * el mismo aspecto con la ruta del reclamo. No propaga el clic: dentro de una
 * fila que abre el serial, abre el documento.
 */
export function EnlaceDocumento({ documento, className }: { documento: DocumentoSerial | null | undefined; className?: string }) {
  const etiqueta = useEtiquetaDocumento();
  const t = useTranslations('inventario.documentos');
  if (!documento) return null;
  const detener = (e: SyntheticEvent) => e.stopPropagation();
  if (documento.tipo !== 'garantia') {
    return (
      <span className="inline-flex max-w-full" onClick={detener} onKeyDown={detener}>
        <EnlaceDocumentoKit documento={{ ...documento, tipo: documento.tipo }} className={className} />
      </span>
    );
  }
  const href = rutaDocumento(documento);
  const texto = etiqueta(documento);
  if (!href) return <span className={cn('text-sm text-fg-secondary', className)}>{texto}</span>;
  return (
    <Link
      href={href}
      aria-label={t('abrir', { documento: texto })}
      onClick={detener}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-sm text-sm font-medium text-brand hover:underline',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
        className,
      )}
    >
      <span className="truncate">{texto}</span>
      <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
    </Link>
  );
}

/** Columna «Garantía»: dos líneas según la situación (Figma 590:319445). */
export function CeldaGarantia({ situacion, compacta = false }: { situacion: SituacionGarantia; compacta?: boolean }) {
  const t = useTranslations('inventarioSeriales.garantia');
  const { formatPlain } = useFormatDate();
  let linea1: ReactNode;
  let linea2: ReactNode = null;
  let tono = 'text-fg';
  switch (situacion.tipo) {
    case 'vigente':
      linea1 = situacion.meses ? t('vigenteMeses', { meses: situacion.meses }) : t('vigente');
      linea2 = t('hasta', { fecha: formatPlain(situacion.fin) });
      break;
    case 'por_vencer':
      linea1 = t('porVencer', { dias: situacion.dias });
      linea2 = t('hasta', { fecha: formatPlain(situacion.fin) });
      tono = 'text-warning-text';
      break;
    case 'vencida':
      linea1 = t('vencida');
      linea2 = t('vencioEl', { fecha: formatPlain(situacion.fin) });
      tono = 'text-danger-text';
      break;
    case 'empieza_al_vender':
      linea1 = t('empiezaAlVender');
      linea2 = t('meses', { meses: situacion.meses });
      tono = 'text-fg-muted';
      break;
    case 'en_reclamo':
      linea1 = t('enReclamo');
      linea2 = situacion.codigo ? (
        <Link
          href={`/app/inventario/garantias/${situacion.id}`}
          onClick={(e) => e.stopPropagation()}
          className="rounded text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {situacion.codigo}
        </Link>
      ) : null;
      break;
    case 'en_rma':
      linea1 = t('enRma');
      linea2 = situacion.rma;
      break;
    case 'no_aplica':
      linea1 = t('noAplica');
      linea2 = t('dadoDeBaja');
      tono = 'text-fg-muted';
      break;
    default:
      linea1 = t('sinGarantia');
      tono = 'text-fg-muted';
  }
  return (
    <div className="flex min-w-0 flex-col">
      <span className={cn('truncate', tono)}>{linea1}</span>
      {!compacta && linea2 && <span className="truncate text-xs text-fg-secondary tabular-nums">{linea2}</span>}
    </div>
  );
}

const ICONO_EVENTO: Record<ClaveEvento, LucideIcon> = {
  recibido: Package,
  recibidoDe: Package,
  trasladado: ArrowLeftRight,
  reservado: Clock,
  vendido: Receipt,
  vendidoA: Receipt,
  reemplazoEntregado: RotateCcw,
  devuelto: Undo2,
  danado: AlertTriangle,
  rma: Truck,
  reclamoAbierto: ShieldCheck,
  reclamoAprobado: CheckCircle2,
  reparado: Wrench,
  reemplazado: RotateCcw,
  reembolsado: CheckCircle2,
  reclamoRechazado: XCircle,
  garantiaReiniciada: RotateCcw,
  cambioEstado: Clock,
};

const CAJA_TONO: Record<TonoEvento, string> = {
  marca: 'bg-brand-tint text-brand',
  informacion: 'bg-info-subtle text-info-text',
  exito: 'bg-success-subtle text-success-text',
  advertencia: 'bg-warning-subtle text-warning-text',
  peligro: 'bg-danger-subtle text-danger-text',
  neutro: 'bg-subtle text-fg-secondary',
};

export interface PasoPendiente {
  titulo: string;
  detalle?: string;
}

/**
 * Historial de un serial (Figma «Historial del serial»): lista ordenada con
 * conector, icono del evento, qué pasó, detalle, fecha en la zona de la
 * organización y el documento enlazado. `pendiente` añade el siguiente paso
 * aún no hecho («Pendiente de enviar al proveedor»).
 */
export function HistorialSerial({
  eventos,
  proveedor,
  pendiente,
  compacto = false,
  etiqueta,
}: {
  eventos: readonly EventoSerial[];
  proveedor?: string | null;
  pendiente?: PasoPendiente | null;
  compacto?: boolean;
  etiqueta: string;
}) {
  const t = useTranslations('inventarioSeriales.historial');
  const te = useEtiquetaEstadoSerialB4();
  const { formatDateTime, formatDate } = useFormatDate();
  const lista = eventosVisibles(eventos);

  if (lista.length === 0 && !pendiente) {
    return <p className="text-sm text-fg-secondary">{t('vacio')}</p>;
  }

  return (
    <ol aria-label={etiqueta} className="flex flex-col">
      {lista.map((e, i) => {
        const { clave, tono } = claveEvento(e, proveedor);
        const Icono = ICONO_EVENTO[clave];
        const meta = (e.metadata ?? {}) as Record<string, unknown>;
        const ultimo = i === lista.length - 1 && !pendiente;
        const titulo = t(`eventos.${clave}`, {
          proveedor: proveedor ?? '',
          cliente: e.cliente?.nombre ?? '',
          sucursal: e.a_sucursal ?? e.de_sucursal ?? '',
          reemplazo: typeof meta.reemplazo === 'string' ? meta.reemplazo : '',
          de: te(e.de_estado ?? ''),
          a: te(e.a_estado ?? ''),
        });
        const detalle = [
          e.tipo === 'rma_created' && typeof meta.rma === 'string' ? t('detalle.rma', { rma: meta.rma }) : null,
          typeof meta.reemplazo_de === 'string' ? t('detalle.reemplazoDe', { serial: meta.reemplazo_de }) : null,
          e.usuario && (e.tipo === 'sold' || e.tipo === 'warranty_resolved' || e.tipo === 'warranty_claim') ? t('detalle.por', { usuario: e.usuario }) : null,
          e.notas,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <li key={e.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span aria-hidden="true" className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', CAJA_TONO[tono])}>
                <Icono className="size-4" strokeWidth={1.75} />
              </span>
              {!ultimo && <span aria-hidden="true" className="my-1 w-px flex-1 bg-line" />}
            </div>
            <div className={cn('min-w-0 flex-1', ultimo ? 'pb-0' : 'pb-4')}>
              <p className="text-sm font-medium text-fg">{titulo}</p>
              {!compacto && detalle && <p className="mt-0.5 text-[13px] text-fg-secondary">{detalle}</p>}
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
                <time dateTime={e.fecha} className="tabular-nums">
                  {compacto ? formatDate(e.fecha) : formatDateTime(e.fecha)}
                </time>
                <EnlaceDocumento documento={e.documento} className="text-xs" />
              </p>
            </div>
          </li>
        );
      })}
      {pendiente && (
        <li className="flex gap-3">
          <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning-subtle text-warning-text">
            <Wrench className="size-4" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-fg">{pendiente.titulo}</p>
            {pendiente.detalle && <p className="mt-0.5 text-[13px] text-fg-secondary">{pendiente.detalle}</p>}
            <p className="mt-0.5 text-xs text-fg-muted">{t('pendiente')}</p>
          </div>
        </li>
      )}
    </ol>
  );
}
