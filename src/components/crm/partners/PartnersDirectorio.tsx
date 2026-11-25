'use client';

/**
 * Pestaña «Partners» (Figma 1316:773848, anotación 1316:774932; estados
 * 1411:42449 cargando y 1411:42968 error): KPI, buscador, filtros de nivel y
 * estado, y la tabla con nivel, comisión efectiva (propia / del nivel / sin
 * nivel), deals, revenue atribuido (oportunidades ganadas de deals no
 * rechazados), por pagar (pendiente + aprobada, solo admin/manager) y estado.
 * La fila abre la ficha; «Registrar deal» y «Reactivar» no la abren.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, Briefcase } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/kit/StatCard';
import { KpiCompacto } from '@/components/kit/KpiCompacto';
import { SearchInput } from '@/components/kit/SearchInput';
import { DataTable, type ColumnaTabla, type EstadoTabla } from '@/components/kit/DataTable';
import { Pagination } from '@/components/kit/Pagination';
import { ListCard } from '@/components/kit/ListCard';
import { clasesBoton } from '@/components/kit/botonClases';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import type { PartnerTier, PartnerView } from '@/lib/services/crm/partnerService';
import { formatMoney, formatRate } from '@/lib/services/crm/partnerModel';
import { rankTiers } from '@/lib/services/crm/partnerTierFor';
import {
  FILTROS_PARTNERS_INICIALES,
  SIN_NIVEL,
  filtrarPartners,
  fuenteTasa,
  hayFiltrosPartners,
  ordenarPartners,
  paginar,
  siguienteOrden,
  tonoNivel,
  type FiltrosPartners,
  type KpisPartners,
  type OrdenPartners,
} from './redPartnersLogica';

interface Props {
  partners: PartnerView[];
  tiers: PartnerTier[];
  kpis: KpisPartners | null;
  anio: number;
  moneda: string;
  estado: EstadoTabla;
  puedeGestionar: boolean;
  filtros: FiltrosPartners;
  onFiltros: (f: FiltrosPartners) => void;
  onRegistrarDeal: (p: PartnerView) => void;
  onReactivar: (p: PartnerView) => void;
  onReintentar: () => void;
}

export function PartnersDirectorio({ partners, tiers, kpis, anio, moneda, estado, puedeGestionar, filtros, onFiltros, onRegistrarDeal, onReactivar, onReintentar }: Props) {
  const t = useTranslations('crm.redPartners');
  const idioma = useLocale();
  const router = useRouter();
  const [orden, setOrden] = useState<OrdenPartners | null>(null);
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);

  const filtrados = useMemo(() => ordenarPartners(filtrarPartners(partners, filtros), orden), [partners, filtros, orden]);
  const visibles = paginar(filtrados, pagina, tamano);
  const entero = (n: number) => new Intl.NumberFormat(idioma).format(n);
  const dinero = (v: number, p?: PartnerView) => formatMoney(v, p?.commissions_currency ?? moneda);
  const cambiarFiltros = (f: FiltrosPartners) => {
    setPagina(1);
    onFiltros(f);
  };
  const estadoTabla: EstadoTabla = estado !== 'listo' ? estado : filtrados.length === 0 && hayFiltrosPartners(filtros) ? 'sinResultados' : 'listo';
  const anioTexto = String(anio);
  const cargandoKpis = estado === 'cargando' || !kpis;

  const accion = (p: PartnerView) =>
    p.is_active ? (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRegistrarDeal(p);
        }}
        className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
      >
        <Briefcase aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('acciones.registrarDeal')}
      </button>
    ) : puedeGestionar ? (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onReactivar(p);
        }}
        className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
      >
        {t('acciones.reactivar')}
      </button>
    ) : null;

  const columnas: ColumnaTabla<PartnerView>[] = [
    {
      id: 'nombre',
      encabezado: t('directorio.col.partner'),
      ordenable: true,
      celda: (p) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm text-fg">{p.name}</span>
          {p.company_name && <span className="truncate text-xs text-fg-secondary">{p.company_name}</span>}
        </div>
      ),
    },
    { id: 'nivel', encabezado: t('directorio.col.nivel'), celda: (p) => <Badge tono={tonoNivel(p.tier_id, tiers)} tamano="sm">{p.tier?.name ?? t('nivel.sinNivel')}</Badge> },
    {
      id: 'comision',
      encabezado: t('directorio.col.comision'),
      celda: (p) => (
        <div className="flex flex-col">
          <span className="text-sm tabular-nums text-fg">{formatRate(p.effective_rate)}</span>
          <span className="text-xs text-fg-secondary">{t(`tasa.${fuenteTasa(p)}`)}</span>
        </div>
      ),
    },
    { id: 'deals', encabezado: t('directorio.col.deals'), ordenable: true, celda: (p) => <span className="tabular-nums">{entero(p.deals_count)}</span> },
    { id: 'revenue', encabezado: t('directorio.col.revenue'), variante: 'importe', ordenable: true, celda: (p) => dinero(p.revenue_attributed ?? 0, p) },
    ...(puedeGestionar
      ? [{ id: 'porPagar', encabezado: t('directorio.col.porPagar'), variante: 'importe' as const, celda: (p: PartnerView) => (p.currency_mixed ? t('directorio.variasMonedas') : dinero(p.commissions.outstanding, p)) }]
      : []),
    { id: 'estado', encabezado: t('directorio.col.estado'), celda: (p) => <Badge tono={p.is_active ? 'exito' : 'neutro'} tamano="sm">{p.is_active ? t('estado.activo') : t('estado.inactivo')}</Badge> },
    { id: 'accion', encabezado: t('directorio.col.accion'), celda: accion, className: 'w-[160px]' },
  ];

  const opcionesNivel = [{ valor: SIN_NIVEL, etiqueta: t('nivel.sinNivel') }, ...rankTiers(tiers).map((x) => ({ valor: x.id, etiqueta: x.name }))];

  return (
    <div className="flex flex-col gap-4">
      {estado !== 'error' && estado !== 'sinPermiso' && (
        <>
          <div className="hidden gap-4 lg:grid lg:grid-cols-4" role="group" aria-label={t('kpi.grupo')}>
            <StatCard etiqueta={t('kpi.activos')} valor={entero(kpis?.activos ?? 0)} detalle={t('kpi.inactivos', { n: kpis?.inactivos ?? 0 })} cargando={cargandoKpis} />
            <StatCard
              etiqueta={t('kpi.dealsAnio', { anio: anioTexto })}
              valor={entero(kpis?.dealsAnio ?? 0)}
              detalle={t('kpi.ganadosAbiertos', { ganados: kpis?.ganadosAnio ?? 0, abiertos: kpis?.abiertosAnio ?? 0 })}
              cargando={cargandoKpis}
            />
            {puedeGestionar && (
              <StatCard
                etiqueta={t('kpi.porPagar')}
                valor={dinero(kpis?.porPagar ?? 0)}
                detalle={t('kpi.porPagarDetalle', { n: kpis?.porPagarCantidad ?? 0 })}
                tono={kpis?.porPagarCantidad ? 'advertencia' : 'neutro'}
                iconoDetalle={kpis?.porPagarCantidad ? AlertTriangle : undefined}
                cargando={cargandoKpis}
              />
            )}
            {puedeGestionar && (
              <StatCard
                etiqueta={t('kpi.pagadasAnio', { anio: anioTexto })}
                valor={dinero(kpis?.pagadoAnio ?? 0)}
                detalle={t('kpi.pagadasDetalle', { n: kpis?.pagadasAnio ?? 0 })}
                tono={kpis?.pagadasAnio ? 'exito' : 'neutro'}
                tendencia={kpis?.pagadasAnio ? 'sube' : undefined}
                cargando={cargandoKpis}
              />
            )}
          </div>
          <KpiCompacto
            className="lg:hidden"
            etiqueta={t('kpi.grupo')}
            cargando={cargandoKpis}
            cifras={[
              { id: 'activos', etiqueta: t('kpi.activosCorto'), valor: entero(kpis?.activos ?? 0) },
              { id: 'deals', etiqueta: t('kpi.dealsCorto'), valor: entero(kpis?.dealsAnio ?? 0) },
              ...(puedeGestionar ? [{ id: 'porPagar', etiqueta: t('kpi.porPagarCorto'), valor: dinero(kpis?.porPagar ?? 0), tono: kpis?.porPagarCantidad ? ('advertencia' as const) : ('neutro' as const) }] : []),
            ]}
          />
        </>
      )}

      {estado !== 'sinPermiso' && (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput
            value={filtros.q}
            onChange={(q) => cambiarFiltros({ ...filtros, q })}
            onValueChange={(q) => cambiarFiltros({ ...filtros, q })}
            placeholder={t('directorio.buscar')}
            etiqueta={t('directorio.buscar')}
            className="min-w-0 lg:flex-[1.4]"
          />
          <div className="grid grid-cols-2 gap-3 lg:flex lg:flex-[2]">
            <SelectCrm
              aria-label={t('directorio.filtroNivel')}
              className="lg:flex-1"
              valor={filtros.nivel}
              onValorChange={(nivel) => cambiarFiltros({ ...filtros, nivel })}
              opcionVacia={t('directorio.nivelTodos')}
              opciones={opcionesNivel.map((o) => ({ valor: o.valor, etiqueta: t('directorio.nivelOpcion', { nivel: o.etiqueta }) }))}
            />
            <SelectCrm
              aria-label={t('directorio.filtroEstado')}
              className="lg:flex-1"
              valor={filtros.estado}
              onValorChange={(v) => cambiarFiltros({ ...filtros, estado: (v || 'activos') as FiltrosPartners['estado'] })}
              opciones={(['activos', 'inactivos', 'todos'] as const).map((v) => ({ valor: v, etiqueta: t(`directorio.estado.${v}`) }))}
            />
          </div>
        </div>
      )}

      <DataTable<PartnerView>
        columnas={columnas}
        filas={visibles}
        obtenerId={(p) => p.id}
        etiqueta={t('directorio.etiqueta')}
        estado={estadoTabla}
        orden={orden}
        onOrdenar={(campo) => setOrden((o) => siguienteOrden(o, campo))}
        onFilaClick={(p) => router.push(`/app/crm/partners/${p.id}`)}
        etiquetaFila={(p) => p.name}
        tarjetaMovil={(p) => (
          <ListCard
            avatar={{ nombre: p.name }}
            titulo={p.name}
            insignia={<Badge tono={tonoNivel(p.tier_id, tiers)} tamano="sm">{p.tier?.name ?? t('nivel.sinNivel')}</Badge>}
            subtitulo={p.company_name ?? p.email}
            meta={`${formatRate(p.effective_rate)} · ${t('movil.deals', { n: p.deals_count })}`}
            valor={dinero(p.revenue_attributed ?? 0, p)}
            estado={!p.is_active ? <Badge tono="neutro" tamano="sm">{t('estado.inactivo')}</Badge> : undefined}
            onClick={() => router.push(`/app/crm/partners/${p.id}`)}
          />
        )}
        error={{ titulo: t('estados.error.titulo'), descripcion: t('estados.error.descripcion') }}
        sinPermiso={{ titulo: t('estados.sinPermiso.titulo'), descripcion: t('estados.sinPermiso.descripcion') }}
        onReintentar={onReintentar}
        onLimpiarFiltros={() => cambiarFiltros(FILTROS_PARTNERS_INICIALES)}
        termino={filtros.q || undefined}
        filasEsqueleto={5}
        pie={
          estadoTabla === 'listo' && filtrados.length > 0 ? (
            <Pagination
              pagina={pagina}
              tamano={tamano}
              total={filtrados.length}
              onPaginaChange={setPagina}
              onTamanoChange={(n) => {
                setTamano(n);
                setPagina(1);
              }}
              opcionesTamano={[10, 25, 50]}
              sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
              className="border-t border-line px-4 py-2"
            />
          ) : undefined
        }
      />
    </div>
  );
}
