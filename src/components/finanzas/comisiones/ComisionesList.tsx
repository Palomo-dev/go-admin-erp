'use client';

/**
 * Tabla de comisiones agrupada por vendedor (Figma 1012:87993): la fila del
 * vendedor con sus totales y «Pagar», y debajo sus comisiones con el documento
 * de origen, la tasa, el estado y el asiento. Tabla del kit (tarjetas en
 * móvil); las mutaciones viven en `useComisiones` (rutas de API).
 */

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BookOpen, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { AvatarIniciales, DataTable, ListCard, clasesBoton, type AccionFila, type ColumnaTabla, type EstadoTabla } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { AsientoComision, CommissionRow } from '@/lib/services/crm/commissionAdminService';
import { cancellationKind } from '@/lib/services/crm/commissionTransitions';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import { numeroAsiento, sourceHref, type FilaTablaComision, type GrupoVendedor, type TotalMoneda } from './comisionesModel';

type Fila = FilaTablaComision<CommissionRow>;
type Grupo = GrupoVendedor<CommissionRow>;

interface Props {
  filas: Fila[];
  estado: EstadoTabla;
  monedaBase: string | null;
  asientos: Record<string, AsientoComision>;
  plegados: ReadonlySet<string>;
  onPlegar: (clave: string) => void;
  /** Acciones por fila (vacías sin permiso de gestión). */
  accionesGrupo: (grupo: Grupo) => AccionFila[];
  accionesComision: (fila: CommissionRow) => AccionFila[];
  onPagarGrupo: ((grupo: Grupo) => void) | null;
  vacio: { titulo: string; descripcion: string };
  onReintentar: () => void;
  onLimpiarFiltros: () => void;
  termino: string;
  pie?: React.ReactNode;
}

/** Estado de la comisión con el tono del sistema de badges. */
function estadoComision(fila: CommissionRow): { clave: string; tono: 'advertencia' | 'exito' | 'peligro' | 'neutro' } {
  if (fila.status === 'accrued') return { clave: 'devengada', tono: 'neutro' };
  if (fila.status === 'paid') return { clave: 'pagada', tono: 'exito' };
  const kind = cancellationKind(fila.metadata);
  return { clave: kind === 'clawback' ? 'clawback' : kind === 'rejected' ? 'rechazada' : 'cancelada', tono: 'peligro' };
}

export function ComisionesList(props: Props) {
  const { filas, estado: estadoTabla, monedaBase, asientos, plegados, onPlegar, accionesGrupo, accionesComision, onPagarGrupo } = props;
  const t = useTranslations('finanzasComisiones');
  const { paraDocumento } = useMonedaOrganizacion();
  const { formatDate } = useFormatDate();
  const fmt = (valor: number, moneda?: string | null) => formatMoneda(valor, paraDocumento(moneda || monedaBase));
  const sumas = (totales: TotalMoneda[], campo: 'base' | 'comision') => totales.map((m) => fmt(m[campo], m.moneda)).join(' + ');
  const nombre = (n: string | null) => n || t('sinNombre');

  const insigniaGrupo = (g: Grupo) =>
    g.pendientes.length > 0 ? (
      <Badge tono="advertencia" apariencia="suave" tamano="sm">
        {t('estado.porPagar')}
      </Badge>
    ) : (
      <Badge tono="neutro" apariencia="suave" tamano="sm">
        {t('estado.sinPendientes')}
      </Badge>
    );

  const insigniaComision = (c: CommissionRow) => {
    const e = estadoComision(c);
    return (
      <Badge tono={e.tono} apariencia="suave" tamano="sm">
        {t(`estado.${e.clave}`)}
      </Badge>
    );
  };

  const documento = (c: CommissionRow) => {
    const href = sourceHref(c);
    const etiqueta = t(`origen.${c.source_type}`);
    const chip = 'inline-flex max-w-full items-center gap-1 rounded-md border border-line bg-surface px-2 py-0.5 text-xs font-medium';
    return href ? (
      <Link href={href} className={`${chip} text-brand hover:bg-hover`} onClick={(e) => e.stopPropagation()}>
        <FileText className="size-3.5 shrink-0" aria-hidden="true" strokeWidth={1.5} />
        <span className="truncate">{etiqueta}</span>
      </Link>
    ) : (
      <span className={`${chip} text-fg-secondary`}>{etiqueta}</span>
    );
  };

  const columnas: ColumnaTabla<Fila>[] = [
    {
      id: 'vendedor',
      encabezado: t('columnas.vendedor'),
      celda: (f) =>
        f.tipo === 'grupo' ? (
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-fg-secondary hover:bg-hover"
              onClick={(e) => {
                e.stopPropagation();
                onPlegar(f.grupo.clave);
              }}
              aria-expanded={!plegados.has(f.grupo.clave)}
              aria-label={t(plegados.has(f.grupo.clave) ? 'desplegar' : 'plegar', { nombre: nombre(f.grupo.nombre) })}
            >
              {plegados.has(f.grupo.clave) ? <ChevronRight className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
            </button>
            <AvatarIniciales nombre={nombre(f.grupo.nombre)} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-semibold text-fg">{nombre(f.grupo.nombre)}</span>
              <span className="text-xs text-fg-secondary">{t('nComisiones', { count: f.grupo.filas.length })}</span>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-0.5 pl-9">
            {documento(f.fila)}
            {f.fila.status === 'cancelled' && f.fila.notes && <span className="max-w-[18rem] text-xs text-fg-secondary">{t('motivo', { motivo: f.fila.notes })}</span>}
          </div>
        ),
    },
    {
      id: 'fecha',
      encabezado: t('columnas.fecha'),
      ocultarDebajo: 'md',
      celda: (f) => (f.tipo === 'comision' ? <span className="whitespace-nowrap text-fg">{f.fila.accrued_at ? formatDate(f.fila.accrued_at) : '—'}</span> : null),
    },
    {
      id: 'base',
      encabezado: t('columnas.base'),
      variante: 'importe',
      alinear: 'derecha',
      ocultarDebajo: 'lg',
      celda: (f) => (f.tipo === 'grupo' ? <span className="font-medium">{sumas(f.grupo.totales, 'base')}</span> : fmt(Number(f.fila.base_amount), f.fila.currency)),
    },
    {
      id: 'metodo',
      encabezado: t('columnas.metodo'),
      ocultarDebajo: 'lg',
      celda: (f) =>
        f.tipo === 'comision' ? (
          <span className="whitespace-nowrap text-fg-secondary">
            {Number(f.fila.commission_rate) > 0 ? t('tasa', { tasa: Number(f.fila.commission_rate) }) : t('fijo', { valor: fmt(Number(f.fila.commission_amount), f.fila.currency) })}
          </span>
        ) : null,
    },
    {
      id: 'comision',
      encabezado: t('columnas.comision'),
      variante: 'importe',
      alinear: 'derecha',
      celda: (f) =>
        f.tipo === 'grupo' ? (
          <span className="font-semibold text-fg">{sumas(f.grupo.totales, 'comision')}</span>
        ) : (
          <span className="text-fg">{fmt(Number(f.fila.commission_amount), f.fila.currency)}</span>
        ),
    },
    { id: 'estado', encabezado: t('columnas.estado'), celda: (f) => (f.tipo === 'grupo' ? insigniaGrupo(f.grupo) : insigniaComision(f.fila)) },
    {
      id: 'asiento',
      encabezado: t('columnas.asiento'),
      ocultarDebajo: 'xl',
      celda: (f) => {
        if (f.tipo !== 'comision') return null;
        const a = asientos[f.fila.id];
        return a ? (
          <Link
            href={`/app/finanzas/contabilidad/asientos/${a.id}`}
            className="inline-flex items-center gap-1 rounded-md bg-brand-tint px-2 py-0.5 text-xs font-medium text-brand-deep hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <BookOpen className="size-3.5" aria-hidden="true" strokeWidth={1.5} />
            {numeroAsiento(a)}
          </Link>
        ) : (
          <span className="text-fg-muted">—</span>
        );
      },
    },
  ];

  const tarjeta = (f: Fila) =>
    f.tipo === 'grupo' ? (
      <ListCard
        avatar={{ nombre: nombre(f.grupo.nombre) }}
        titulo={nombre(f.grupo.nombre)}
        subtitulo={t('nComisiones', { count: f.grupo.filas.length })}
        valor={sumas(f.grupo.totales, 'comision')}
        estado={insigniaGrupo(f.grupo)}
        acciones={accionesGrupo(f.grupo)}
        onClick={() => onPlegar(f.grupo.clave)}
      />
    ) : (
      <ListCard
        icono={FileText}
        titulo={t(`origen.${f.fila.source_type}`)}
        subtitulo={[f.fila.accrued_at ? formatDate(f.fila.accrued_at) : null, Number(f.fila.commission_rate) > 0 ? t('tasa', { tasa: Number(f.fila.commission_rate) }) : null]
          .filter(Boolean)
          .join(' · ')}
        valor={fmt(Number(f.fila.commission_amount), f.fila.currency)}
        estado={insigniaComision(f.fila)}
        acciones={accionesComision(f.fila)}
        className="ml-4"
      />
    );

  return (
    <DataTable
      etiqueta={t('tablaEtiqueta')}
      columnas={columnas}
      filas={filas}
      obtenerId={(f) => f.id}
      estado={estadoTabla}
      etiquetaFila={(f) => (f.tipo === 'grupo' ? nombre(f.grupo.nombre) : `${t(`origen.${f.fila.source_type}`)} · ${nombre(f.fila.payee_name)}`)}
      atributosFila={(f) => ({ 'data-commission-row': f.tipo === 'comision' ? f.id : undefined, 'data-grupo': f.tipo === 'grupo' ? '' : undefined })}
      accionesRapidas={(f) =>
        f.tipo === 'grupo' && onPagarGrupo && f.grupo.pendientes.length > 0 ? (
          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => onPagarGrupo(f.grupo)}>
            {t('acciones.pagar')}
          </button>
        ) : null
      }
      acciones={(f) => (f.tipo === 'grupo' ? accionesGrupo(f.grupo) : accionesComision(f.fila))}
      tarjetaMovil={tarjeta}
      vacio={props.vacio}
      sinResultados={{ titulo: t('sinResultados.titulo'), descripcion: t('sinResultados.descripcion') }}
      error={{ titulo: t('error.titulo'), descripcion: t('error.descripcion') }}
      onReintentar={props.onReintentar}
      onLimpiarFiltros={props.onLimpiarFiltros}
      termino={props.termino}
      filasEsqueleto={5}
      pie={props.pie}
    />
  );
}
