'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Download, Plus, Target, Upload } from 'lucide-react';
import { PageHeader } from '@/components/kit/PageHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { SearchInput } from '@/components/kit/SearchInput';
import { TabBar } from '@/components/kit/TabBar';
import { clasesBoton } from '@/components/kit/botonClases';
import { useEsEscritorio } from '@/components/kit/useEsEscritorio';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { useCatalogosCrm } from '@/components/crm/acciones/useCatalogosCrm';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { KpisOportunidades } from '@/components/crm/oportunidad/KpisOportunidades';
import { FiltrosOportunidades, ChipsFiltrosOportunidades } from '@/components/crm/oportunidad/FiltrosOportunidades';
import { TablaOportunidades } from '@/components/crm/oportunidad/TablaOportunidades';
import { ListaMovilOportunidades } from '@/components/crm/oportunidad/ListaMovilOportunidades';
import { AccionesMasivas } from '@/components/crm/oportunidad/AccionesMasivas';
import { useAccionesOportunidad } from '@/components/crm/oportunidad/useAccionesOportunidad';
import { useListaOportunidades, type PestanaEstado } from '@/components/crm/oportunidad/useListaOportunidades';
import { filtrosVacios, hayFiltros, parametrosFiltros, parametrosPeriodo, type FiltrosOportunidades as Filtros, type OrdenOportunidades } from '@/components/crm/oportunidad/filtrosLogica';
import { alternarSeleccion, csvOportunidades, estadoPantalla, permisosPantalla, seleccionarPagina, type EtapaApi } from '@/components/crm/oportunidad/oportunidadLogica';

/**
 * Oportunidades (CRM ola 3B, plan §4.4; Figma 773:23160 y sus estados 773:*,
 * móvil 775:* y 845:82719): pestañas por estado con conteo, 4 KPI en moneda
 * base, búsqueda por nombre o cliente, filtros, orden y paginación en el
 * servidor, selección masiva y menú «⋯». Las 42 oportunidades 'lead'
 * heredadas llevan la etiqueta «Lead» (D2). Toda escritura, por `/api/crm/**`.
 */
const ORDENES: OrdenOportunidades[] = ['cierre', 'creada', 'monto', 'proximo', 'nombre'];

export function OportunidadesPantalla() {
  const t = useTranslations('crm.oportunidad.lista');
  const router = useRouter();
  const escritorio = useEsEscritorio();
  const { getToday, timezone } = useFormatDate();
  const hoy = getToday();
  const cat = useCatalogosCrm();
  const permisos = permisosPantalla(cat.permisos);
  const [filtros, setFiltros] = useState<Filtros>(filtrosVacios);
  const [estado, setEstado] = useState<PestanaEstado>('open');
  const [orden, setOrden] = useState<OrdenOportunidades>('cierre');
  const [asc, setAsc] = useState(true);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const query = parametrosFiltros(filtros, hoy, cat.usuarioId).toString();
  const periodo = parametrosPeriodo(hoy, timezone).toString();
  const d = useListaOportunidades({ query, estado, orden, ascendente: asc, periodo, acumular: !escritorio });
  const etapas: EtapaApi[] = useMemo(() => cat.etapas.map((e) => ({ ...e, color: null })), [cat.etapas]);
  const acciones = useAccionesOportunidad({ etapas, permisos, usuarioId: cat.usuarioId, onVer: (id) => router.push(`/app/crm/oportunidades/${id}`), onCambio: () => d.recargar() });

  const pantalla = cat.cargando ? 'cargando' : estadoPantalla({ cargando: d.cargando, error: d.error, total: d.total, hayFiltros: hayFiltros(filtros, true) || estado !== 'all' });
  const sinNada = pantalla === 'sinResultados' && !hayFiltros(filtros, true) && (d.resumen?.conteos.total ?? 1) === 0;
  const estadoFinal = sinNada ? 'vacio' : pantalla;
  const seleccionadas = d.filas.filter((f) => seleccion.has(f.id));
  const c = d.resumen?.conteos;

  const exportar = (filas = seleccionadas.length ? seleccionadas : d.filas) => {
    const csv = csvOportunidades(filas, cat.usuarios, ['oportunidad', 'cliente', 'etapa', 'monto', 'moneda', 'prob', 'cierre', 'responsable', 'proximo', 'estado', 'tipo'].map((k) => t(`csv.${k}`)));
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'oportunidades.csv';
    a.click();
    URL.revokeObjectURL(url);
  };
  const ordenar = (o: OrdenOportunidades) => {
    if (o === orden) setAsc(!asc);
    else {
      setOrden(o);
      setAsc(true);
    }
  };

  const nueva = permisos.crear && (
    <Link href="/app/crm/oportunidades/nuevo" className={clasesBoton()}>
      <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('nueva')}
    </Link>
  );

  return (
    <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:p-6">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={estadoFinal === 'sinPermiso' ? t('subtituloSinPermiso') : t('subtitulo')}
        icono={Target}
        migas={[{ etiqueta: t('migas.crm'), href: '/app/crm' }, { etiqueta: t('titulo') }]}
        cargando={d.cargando}
        acciones={
          estadoFinal !== 'sinPermiso' && (
            <>
              <Link href="/app/crm/leads/importar" className={clasesBoton({ variante: 'secundario' })}>
                <Upload aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('importar')}
              </Link>
              <button type="button" onClick={() => exportar(d.filas)} disabled={d.filas.length === 0} className={clasesBoton({ variante: 'secundario' })}>
                <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('exportar')}
              </button>
              {nueva}
            </>
          )
        }
        movil={{ titulo: t('titulo'), subtitulo: t('subtituloMovil', { n: d.total ?? 0 }), accion: permisos.crear ? <Link href="/app/crm/oportunidades/nuevo" aria-label={t('nueva')} className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover"><Plus aria-hidden="true" className="size-5" /></Link> : undefined }}
      />

      {estadoFinal === 'sinPermiso' ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} accion={{ etiqueta: t('sinPermiso.volver'), href: '/app/crm' }} />
        </div>
      ) : estadoFinal === 'vacio' ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante="empty" icono={Target} titulo={t('vacio.titulo')} descripcion={t('vacio.descripcion')} accion={permisos.crear ? { etiqueta: t('nueva'), href: '/app/crm/oportunidades/nuevo', icono: Plus } : undefined} accionSecundaria={{ etiqueta: t('vacio.verPipeline'), href: '/app/crm/pipeline' }} />
        </div>
      ) : (
        <>
          <TabBar
            id="oportunidades-estado"
            etiqueta={t('pestanas.aria')}
            valor={estado}
            onValorChange={(v) => {
              setEstado(v);
              setSeleccion(new Set());
            }}
            pestanas={(['open', 'won', 'lost', 'all'] as const).map((v) => ({ valor: v, etiqueta: t(`pestanas.${v}`), contador: c ? (v === 'all' ? c.total : c[v]) : undefined }))}
          />
          <KpisOportunidades resumen={d.resumen} hoy={hoy} cargando={!d.resumen && !d.errorResumen} error={d.errorResumen ? t('errorKpi') : null} onReintentar={d.recargar} />
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={filtros.q} onChange={(q) => setFiltros({ ...filtros, q })} placeholder={t('buscar')} etiqueta={t('buscar')} atajo="/" cargando={d.cargando} className="min-w-0 flex-1" />
            <FiltrosOportunidades filtros={filtros} onFiltros={setFiltros} usuarios={cat.usuarios} pipelines={cat.pipelines} etapas={cat.etapas} />
            <label className="sr-only" htmlFor="oportunidades-orden">{t('orden.aria')}</label>
            <SelectCrm
              id="oportunidades-orden"
              valor={`${orden}:${asc ? 'asc' : 'desc'}`}
              onValorChange={(v) => { const [o, dir] = v.split(':'); setOrden(o as OrdenOportunidades); setAsc(dir === 'asc'); }}
              opciones={ORDENES.flatMap((o) => ['asc', 'desc'].map((dir) => ({ valor: `${o}:${dir}`, etiqueta: `${t(`orden.${o}`)} ${dir === 'asc' ? '↑' : '↓'}` })))}
              className="w-auto gap-2"
            />
          </div>
          <ChipsFiltrosOportunidades filtros={filtros} onFiltros={setFiltros} usuarios={cat.usuarios} pipelines={cat.pipelines} etapas={cat.etapas} />
          {estadoFinal === 'error' ? (
            <div className="rounded-xl border border-line bg-surface"><EmptyState variante="error" titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={d.recargar} /></div>
          ) : estadoFinal === 'sinResultados' ? (
            <div className="rounded-xl border border-line bg-surface"><EmptyState variante="search" termino={filtros.q || undefined} titulo={t('sinResultados.titulo')} descripcion={t('sinResultados.descripcion')} onLimpiarFiltros={() => { setFiltros(filtrosVacios()); setEstado('all'); }} /></div>
          ) : escritorio ? (
            <TablaOportunidades
              filas={d.filas}
              cargando={d.cargando || estadoFinal === 'cargando'}
              usuarios={cat.usuarios}
              usuarioId={cat.usuarioId}
              permisos={permisos}
              acciones={acciones}
              seleccion={seleccion}
              onSeleccion={(id) => setSeleccion(alternarSeleccion(seleccion, id))}
              onSeleccionPagina={() => setSeleccion(seleccionarPagina(seleccion, d.filas.map((f) => f.id)))}
              onAbrir={(id) => router.push(`/app/crm/oportunidades/${id}`)}
              orden={orden}
              ascendente={asc}
              onOrden={ordenar}
              conCierre
              pagina={d.pagina}
              tamano={d.tamano}
              total={d.total ?? 0}
              onPagina={d.setPagina}
              onTamano={d.setTamano}
            />
          ) : (
            <ListaMovilOportunidades filas={d.filas} total={d.total} cargando={d.cargando} usuarios={cat.usuarios} usuarioId={cat.usuarioId} permisos={permisos} acciones={acciones} seleccion={seleccion} onSeleccion={(id) => setSeleccion(alternarSeleccion(seleccion, id))} onAbrir={(id) => router.push(`/app/crm/oportunidades/${id}`)} onCargarMas={d.cargarMas} />
          )}
          {seleccionadas.length > 0 && (
            <AccionesMasivas seleccionadas={seleccionadas} total={d.total ?? 0} etapas={etapas} usuarios={cat.usuarios} usuarioId={cat.usuarioId} permisos={permisos} onLimpiar={() => setSeleccion(new Set())} onExportar={() => exportar()} />
          )}
        </>
      )}
      {acciones.dialogos}
    </div>
  );
}
