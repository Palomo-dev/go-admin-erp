'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock, Download, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/kit/PageHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { KpiCompacto } from '@/components/kit/KpiCompacto';
import { Dialogo } from '@/components/kit/Dialogo';
import { clasesBoton } from '@/components/kit/botonClases';
import { CargarMas } from '@/components/crm/kit/CargarMas';
import { TimelineFilters } from '@/components/crm/kit/TimelineFilters';
import { CustomerLinkPicker } from '@/components/crm/kit/CustomerLinkPicker';
import type { ClienteVinculable } from '@/components/crm/kit/customerLinkPickerLogica';
import { ACCIONES_RAPIDAS, type AccionRapidaCrm } from '@/components/crm/kit/quickActionLogica';
import { filtrosVacios } from '@/components/crm/kit/timelineFiltersLogica';
import { AccionesRapidasCrm } from '@/components/crm/acciones/AccionesRapidasCrm';
import { claveError, emitirCambioCrm, pedirCrm } from '@/components/crm/acciones/apiCrm';
import { buscarClientesCrm } from '@/components/crm/acciones/buscarClientes';
import { useCatalogosCrm } from '@/components/crm/acciones/useCatalogosCrm';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { toPlainDate } from '@/lib/utils/dateDisplay';
import { horaEnZona } from '@/components/crm/kit/fechasCrm';
import { etiquetaRango } from '@/components/kit/rangoFechas';
import { localeIntl } from '@/components/kit/idioma';
import { agruparPorDia, CLAVES_KPI_ACTIVIDADES, csvActividades, cuerpoDuplicado, cuerpoEdicionEntrada, estadoPantallaActividades, etiquetaDia, filtrosPorDefecto, rutaEntrada, sonFiltrosPorDefecto, type EntradaFeed } from './actividadesPantallaLogica';
import { useActividadesPantalla } from './useActividadesPantalla';
import { EntradaActividad } from './EntradaActividad';
import { EditarEntradaDialog } from './EditarEntradaDialog';
import { FiltrosMovilActividades } from './FiltrosMovilActividades';

/**
 * Actividades (CRM ola 3A, plan §4.9; Figma 769:12376 y estados 769–770):
 * línea de tiempo de la organización agrupada por día en la zona de la
 * organización, chips por tipo, responsable, cliente u oportunidad, rango,
 * 7 KPI, «Cargar 20 más», menú «⋯» que edita, duplica o elimina solo lo que
 * el servidor permite, «Nueva actividad» por tipo (con las acciones rápidas)
 * y Exportar. Escrituras por `/api/crm/activities|notes/**`.
 */
export function ActividadesPantalla() {
  const t = useTranslations('crm.pantallaActividades');
  const te = useTranslations('crm.accionesRapidas.errores');
  const idioma = useLocale();
  const router = useRouter();
  const { timezone, getToday } = useFormatDate();
  const hoy = getToday();
  const cat = useCatalogosCrm();
  const d = useActividadesPantalla();
  const [editar, setEditar] = useState<EntradaFeed | null>(null);
  const [eliminar, setEliminar] = useState<EntradaFeed | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [errorDialogo, setErrorDialogo] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  const [selector, setSelector] = useState<'filtro' | AccionRapidaCrm | null>(null);
  const [nueva, setNueva] = useState<{ cliente: ClienteVinculable; accion: AccionRapidaCrm; clave: number } | null>(null);

  const porDefecto = sonFiltrosPorDefecto(d.filtros, hoy);
  const estado = estadoPantallaActividades({ cargando: d.cargando, errorStatus: d.errorStatus, hayError: !!d.error, mostradas: d.entradas.length, porDefecto });
  const n = (x: number | null | undefined) => new Intl.NumberFormat(idioma).format(x ?? 0);
  const rango = d.filtros.rango ? etiquetaRango(d.filtros.rango, localeIntl(idioma)) : t('todasLasFechas');
  const responsable = d.filtros.responsableId ? cat.usuarios.find((u) => u.id === d.filtros.responsableId)?.nombre ?? '—' : t('todosResponsables');

  const conError = async (fn: () => Promise<void>) => {
    setOcupado(true);
    setErrorDialogo(null);
    try {
      await fn();
    } catch (e) {
      setErrorDialogo(te(claveError(e)));
    } finally {
      setOcupado(false);
    }
  };
  const guardarEdicion = (v: { texto: string; fijada?: boolean; outcome?: string | null }) =>
    conError(async () => {
      if (!editar) return;
      const ruta = rutaEntrada(editar);
      if (!ruta) return;
      await pedirCrm(ruta, { method: 'PATCH', cuerpo: cuerpoEdicionEntrada(editar, v) });
      toast({ title: t('toast.editada') });
      setEditar(null);
      emitirCambioCrm({ entidad: editar.fuente === 'note' ? 'note' : 'activity', id: editar.id, accion: 'editar' });
    });
  const confirmarEliminar = () =>
    conError(async () => {
      if (!eliminar) return;
      const ruta = rutaEntrada(eliminar);
      if (!ruta) return;
      await pedirCrm(ruta, { method: 'DELETE' });
      toast({ title: t('toast.eliminada') });
      setEliminar(null);
      emitirCambioCrm({ entidad: eliminar.fuente === 'note' ? 'note' : 'activity', id: eliminar.id, accion: 'eliminar' });
    });
  const duplicar = async (e: EntradaFeed) => {
    const dup = cuerpoDuplicado(e);
    if (!dup) return;
    try {
      await pedirCrm(dup.ruta, { method: 'POST', cuerpo: dup.cuerpo });
      toast({ title: t('toast.duplicada') });
      emitirCambioCrm({ entidad: e.fuente === 'note' ? 'note' : 'activity', accion: 'duplicar' });
    } catch (err) {
      toast({ title: te(claveError(err)), variant: 'destructive' });
    }
  };
  const abrir = (e: EntradaFeed) => {
    if (e.oportunidad) router.push(`/app/crm/oportunidades/${e.oportunidad.id}`);
    else if (e.cliente) router.push(`/app/clientes/${e.cliente.id}`);
  };
  const exportar = () => {
    const csv = csvActividades(d.entradas, [t('csv.fecha'), t('csv.tipo'), t('csv.detalle'), t('csv.resultado'), t('csv.duracion'), t('csv.autor'), t('csv.cliente'), t('csv.oportunidad')], (iso) => (iso ? `${toPlainDate(new Date(iso), timezone)} ${horaEnZona(iso, timezone)}` : ''));
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'actividades.csv';
    a.click();
    URL.revokeObjectURL(url);
  };
  const nuevaActividad = (accion: AccionRapidaCrm) => {
    const ent = d.filtros.entidad;
    if (ent?.tipo === 'customer') setNueva({ cliente: { id: ent.id, full_name: ent.nombre, customer_type: null }, accion, clave: Date.now() });
    else setSelector(accion);
  };

  const menuNueva = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={clasesBoton()}>
          <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('nueva')}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {ACCIONES_RAPIDAS.map((a) => (
          <DropdownMenuItem key={a} onSelect={() => nuevaActividad(a)} className="flex flex-col items-start gap-0.5">
            <span className="text-sm text-fg">{t(`tipoNueva.${a}`)}</span>
            {(a === 'llamar' || a === 'tarea') && <span className="text-xs text-fg-muted">{t(`tipoNuevaDetalle.${a}`)}</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const selectorEntidad = d.filtros.entidad ? (
    <button type="button" onClick={() => d.setFiltros({ ...d.filtros, entidad: null })} className={clasesBoton({ variante: 'secundario', className: 'max-w-[220px]' })} aria-label={t('quitarEntidad', { nombre: d.filtros.entidad.nombre })}>
      <span className="truncate">{d.filtros.entidad.nombre}</span>
      <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
    </button>
  ) : (
    <button type="button" onClick={() => setSelector('filtro')} className={clasesBoton({ variante: 'secundario' })}>{t('clienteUOportunidad')}</button>
  );

  return (
    <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:p-6">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={estado === 'sinPermiso' ? undefined : t('subtitulo', { n: n(d.total), rango, responsable })}
        icono={CalendarClock}
        migas={[{ etiqueta: t('migas.crm'), href: '/app/crm' }, { etiqueta: t('titulo') }]}
        cargando={d.cargando}
        acciones={
          <>
            <button type="button" onClick={d.recargar} aria-label={t('recargar')} title={t('recargar')} className={clasesBoton({ variante: 'secundario', className: 'size-10 px-0' })}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
            <button type="button" onClick={exportar} disabled={d.entradas.length === 0} className={clasesBoton({ variante: 'secundario' })}>
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('exportar')}
            </button>
            {menuNueva}
          </>
        }
        movil={{ titulo: t('titulo'), subtitulo: t('subtituloMovil', { n: n(d.total) }), accion: menuNueva }}
      />

      {estado === 'sinPermiso' ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} accion={{ etiqueta: t('sinPermiso.volver'), href: '/app/crm' }} />
        </div>
      ) : (
        <>
          <KpiCompacto
            etiqueta={t('kpi.grupo')}
            cargando={!d.kpis}
            cifras={CLAVES_KPI_ACTIVIDADES.map((k) => ({ id: k, etiqueta: t(`kpi.${k}`), valor: n(d.kpis?.[k]), tono: k === 'tareasAbiertas' && d.kpis?.tareasAbiertas ? 'advertencia' : undefined }))}
          />
          <div className="rounded-xl border border-line bg-surface p-4">
            <TimelineFilters valor={d.filtros} onValorChange={d.setFiltros} usuarios={cat.usuarios} selectorEntidad={selectorEntidad} onAbrirPanel={() => setPanel(true)} />
          </div>
          <section aria-label={t('linea')} aria-busy={d.cargando || undefined} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
            {estado === 'cargando' ? (
              Array.from({ length: 5 }, (_, i) => <div key={i} aria-hidden="true" className="h-[68px] animate-pulse rounded-xl bg-subtle" />)
            ) : estado === 'error' ? (
              <EmptyState variante="error" titulo={t('error.titulo')} descripcion={te(claveError(d.error))} onReintentar={d.recargar} compacto />
            ) : estado === 'vacio' ? (
              <EmptyState
                variante="empty"
                icono={CalendarClock}
                titulo={t('vacio.titulo')}
                descripcion={t('vacio.descripcion')}
                accion={{ etiqueta: t('vacio.registrarLlamada'), onClick: () => nuevaActividad('llamar') }}
                accionSecundaria={{ etiqueta: t('vacio.verLeads'), href: '/app/crm/leads' }}
              />
            ) : estado === 'sinResultados' ? (
              <EmptyState variante="search" termino={d.filtros.texto || undefined} onLimpiarFiltros={() => d.setFiltros(filtrosPorDefecto(hoy))} compacto />
            ) : (
              <>
                {agruparPorDia(d.entradas, timezone).map((g) => {
                  const e = etiquetaDia(g.dia, hoy, idioma);
                  return (
                    <div key={g.dia || 'sin-fecha'} className="flex flex-col gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                        {e.relativo ? t(`dia.${e.relativo}`, { fecha: e.fecha }) : e.fecha || t('dia.sinFecha')}
                      </h3>
                      {g.entradas.map((x) => (
                        <EntradaActividad
                          key={`${x.fuente}-${x.id}`}
                          entrada={x}
                          onAbrir={abrir}
                          onEditar={(y) => (setErrorDialogo(null), setEditar(y))}
                          onDuplicar={(y) => void duplicar(y)}
                          onEliminar={(y) => (setErrorDialogo(null), setEliminar(y))}
                        />
                      ))}
                    </div>
                  );
                })}
                <CargarMas mostrados={d.entradas.length} total={d.total} hayMas={!!d.cursor} tamanoPagina={20} cargando={d.cargandoMas} error={d.errorMas ? te(claveError(d.errorMas)) : null} onCargar={() => void d.cargarMas()} entidad="actividades" />
              </>
            )}
          </section>
        </>
      )}

      <FiltrosMovilActividades abierto={panel} onAbiertoChange={setPanel} filtros={d.filtros} onFiltros={d.setFiltros} usuarios={cat.usuarios} selectorEntidad={selectorEntidad} onLimpiar={() => d.setFiltros({ ...filtrosVacios(), rango: null })} />
      <EditarEntradaDialog entrada={editar} onCerrar={() => setEditar(null)} onGuardar={(v) => void guardarEdicion(v)} ocupado={ocupado} error={errorDialogo} />
      <Dialogo
        abierto={!!eliminar}
        onAbiertoChange={(x) => !x && !ocupado && setEliminar(null)}
        titulo={t('eliminar.titulo')}
        descripcion={t('eliminar.descripcion')}
        icono={Trash2}
        ancho={440}
        primario={{ etiqueta: t('eliminar.confirmar'), onClick: () => void confirmarEliminar(), destructiva: true, cargando: ocupado }}
        textoCancelar={t('eliminar.cancelar')}
      >
        {errorDialogo && <p role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-[13px] text-danger-text">{errorDialogo}</p>}
      </Dialogo>
      <CustomerLinkPicker
        abierto={selector !== null}
        onAbiertoChange={(x) => !x && setSelector(null)}
        buscar={buscarClientesCrm}
        onSeleccionar={(c) => {
          if (selector === 'filtro') d.setFiltros({ ...d.filtros, entidad: { tipo: 'customer', id: c.id, nombre: c.full_name ?? '—' } });
          else if (selector) setNueva({ cliente: c, accion: selector, clave: Date.now() });
          setSelector(null);
        }}
      />
      {nueva && (
        <AccionesRapidasCrm
          variante="drawer"
          sinBarra
          clienteId={nueva.cliente.id}
          cliente={{ id: nueva.cliente.id, full_name: nueva.cliente.full_name, email: nueva.cliente.email, phone: nueva.cliente.phone }}
          abrirAccion={{ accion: nueva.accion, clave: nueva.clave }}
          onCerrado={() => setNueva(null)}
        />
      )}
    </div>
  );
}
