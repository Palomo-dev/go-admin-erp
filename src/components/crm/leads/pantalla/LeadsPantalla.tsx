'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Download, Plus, RefreshCw, Tags, TrendingUp, Upload, UserPlus, UserRoundPlus, XCircle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/kit/PageHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { SearchInput } from '@/components/kit/SearchInput';
import { BulkActionBar } from '@/components/kit/BulkActionBar';
import { DialogoMotivo } from '@/components/kit/DialogoMotivo';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import { clasesBoton } from '@/components/kit/botonClases';
import { useEsEscritorio } from '@/components/kit/useEsEscritorio';
import { CaptureBanner } from '@/components/crm/kit/CaptureBanner';
import type { AccionLead } from '@/components/crm/kit/leadRowLogica';
import type { AccionRapidaCrm } from '@/components/crm/kit/quickActionLogica';
import { NewLeadDialog } from '@/components/crm/leads/NewLeadDialog';
import { AccionesRapidasCrm } from '@/components/crm/acciones/AccionesRapidasCrm';
import { claveError, emitirCambioCrm, pedirCrm } from '@/components/crm/acciones/apiCrm';
import { puede } from '@/components/crm/acciones/catalogosCrmLogica';
import { useCatalogosCrm } from '@/components/crm/acciones/useCatalogosCrm';
import { useBranchOpcional } from '@/lib/context/BranchContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { MAX_LOTE_CALIFICAR } from '@/lib/services/crm/calificarLoteLogica';
import { alternar, aLeadFila, csvLeads, estadoPantallaLeads, filtrosLeadsVacios, hayFiltrosLeads } from './leadsPantallaLogica';
import { useLeadsPantalla } from './useLeadsPantalla';
import { LeadsKpis } from './LeadsKpis';
import { LeadsFiltros, LeadsFiltrosChips } from './LeadsFiltros';
import { LeadsTabla } from './LeadsTabla';
import { LeadsListaMovil } from './LeadsListaMovil';
import { LeadDetalleHoja } from './LeadDetalleHoja';
import { CalificarLead } from './CalificarLead';
import { CalificarLeadsLote } from './CalificarLeadsLote';
import { AsignarResponsableDialog } from './AsignarResponsableDialog';

/**
 * Pantalla Leads (CRM ola 3A, plan §4.1; Figma 765:446571 y 17 frames más):
 * clientes en etapa lead (D2) paginados en el servidor, KPI, búsqueda, chips
 * de filtro, `LeadRow`, selección masiva (asignar, calificar, exportar,
 * descartar), detalle rápido con acciones rápidas, «Calificar» en dos pasos y
 * el aviso de leads sin colocar. Estados: cargando, vacío, sin resultados,
 * error y sin permiso. Toda escritura va por `/api/crm/leads/**`.
 */
export function LeadsPantalla() {
  const t = useTranslations('crm.pantallaLeads');
  const te = useTranslations('crm.accionesRapidas.errores');
  const router = useRouter();
  const escritorio = useEsEscritorio();
  const moneda = useMonedaOrganizacion();
  const branchId = useBranchOpcional()?.branchFilter ?? null;
  const cat = useCatalogosCrm();
  const d = useLeadsPantalla({ acumularPaginas: !escritorio });
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [calificarId, setCalificarId] = useState<string | null>(null);
  const [loteIds, setLoteIds] = useState<string[] | null>(null);
  const [asignarIds, setAsignarIds] = useState<string[] | null>(null);
  const [descartarIds, setDescartarIds] = useState<string[] | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [accion, setAccion] = useState<{ id: string; accion: AccionRapidaCrm; clave: number } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [errorDialogo, setErrorDialogo] = useState<string | null>(null);

  const permisos = {
    convertir: puede(cat.permisos, 'crm.opportunities.create'),
    asignar: puede(cat.permisos, 'crm.leads.assign'),
    editar: puede(cat.permisos, 'crm.leads.edit') || puede(cat.permisos, 'crm.leads.assign'),
    crear: puede(cat.permisos, 'crm.leads.create'),
  };
  const filas = useMemo(() => d.filas.map((r) => aLeadFila(r, cat.usuarios)), [d.filas, cat.usuarios]);
  const porId = (id: string | null) => (id ? { fila: filas.find((f) => f.id === id) ?? null, api: d.filas.find((f) => f.id === id) ?? null } : { fila: null, api: null });
  const estado = estadoPantallaLeads({ cargando: d.cargando, errorStatus: d.errorStatus, hayError: !!d.error, total: d.total, filtros: d.filtros });
  const total = d.total ?? 0;
  const detalle = porId(detalleId);
  const aCalificar = porId(calificarId).fila;

  const limpiarSeleccion = () => {
    setSeleccion(new Set());
    setModoSeleccion(false);
  };
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

  const asignar = (ownerId: string | null) =>
    conError(async () => {
      const { data } = await pedirCrm<{ actualizados: number }>('/api/crm/leads/assign', { method: 'POST', cuerpo: { customer_ids: asignarIds ?? [], owner_id: ownerId } });
      toast({ title: t('asignar.hecho', { n: data?.actualizados ?? 0 }) });
      setAsignarIds(null);
      limpiarSeleccion();
      emitirCambioCrm({ entidad: 'lead', accion: 'asignar' });
    });

  const descartar = (motivo: string) =>
    conError(async () => {
      const ids = descartarIds ?? [];
      // Uno por uno: la ruta comprueba la autoría de cada lead (D5).
      for (const id of ids) await pedirCrm(`/api/crm/leads/${id}/discard`, { method: 'PATCH', cuerpo: { reason: motivo } });
      toast({ title: t('descartar.hecho', { n: ids.length }) });
      setDescartarIds(null);
      setDetalleId(null);
      setCalificarId(null);
      limpiarSeleccion();
      emitirCambioCrm({ entidad: 'lead', accion: 'descartar' });
    });

  const exportar = (ids: readonly string[]) => {
    const csv = csvLeads(d.filas.filter((r) => ids.includes(r.id)), cat.usuarios, [t('csv.nombre'), t('csv.documento'), t('csv.correo'), t('csv.telefono'), t('csv.origen'), t('csv.responsable'), t('csv.score'), t('csv.etiquetas'), t('csv.creado'), t('csv.ultimoContacto')]);
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leads.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const alAccion = (a: AccionLead, id: string) => {
    if (a === 'ver') setDetalleId(id);
    else if (a === 'asignar') setAsignarIds([id]);
    else if (a === 'descartar') setDescartarIds([id]);
    // Etiquetar vive en la ficha del cliente hasta que exista la ruta de etiquetas del CRM.
    else if (a === 'etiquetar') router.push(`/app/clientes/${id}/editar`);
    else setAccion({ id, accion: a === 'llamar' ? 'llamar' : 'whatsapp', clave: Date.now() });
  };
  const accionLead = porId(accion?.id ?? null).api;

  const seleccionados = [...seleccion];
  const chips = <LeadsFiltrosChips filtros={d.filtros} onFiltros={d.setFiltros} usuarios={cat.usuarios} />;

  return (
    <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:gap-4 lg:p-6">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={estado === 'sinPermiso' ? t('subtituloSinPermiso') : t('subtitulo', { n: total })}
        icono={UserRoundPlus}
        migas={[{ etiqueta: t('migas.crm'), href: '/app/crm' }, { etiqueta: t('titulo') }]}
        cargando={d.cargando}
        acciones={
          estado !== 'sinPermiso' && (
            <>
              <button type="button" onClick={d.recargar} aria-label={t('recargar')} title={t('recargar')} className={clasesBoton({ variante: 'secundario', className: 'size-10 px-0' })}>
                <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
              </button>
              <Link href="/app/crm/leads/importar" className={clasesBoton({ variante: 'secundario' })}>
                <Upload aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('importar')}
              </Link>
              {permisos.crear && (
                <button type="button" onClick={() => setNuevo(true)} className={clasesBoton()}>
                  <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('nuevo')}
                </button>
              )}
              <RowActionsMenu
                orientacion="horizontal"
                tamano="md"
                titulo={t('titulo')}
                acciones={[{ id: 'descartados', etiqueta: d.filtros.descartados ? t('ocultarDescartados') : t('verDescartados'), icono: XCircle, onSelect: () => d.setFiltros({ ...d.filtros, descartados: !d.filtros.descartados }) }]}
              />
            </>
          )
        }
        movil={{
          titulo: t('titulo'),
          subtitulo: t('subtituloMovil', { n: total }),
          accion: permisos.crear ? (
            <button type="button" onClick={() => setNuevo(true)} aria-label={t('nuevo')} className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover">
              <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </button>
          ) : undefined,
        }}
      />

      {estado === 'sinPermiso' ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} accion={{ etiqueta: t('sinPermiso.volver'), href: '/app/crm' }} />
        </div>
      ) : (
        <>
          <CaptureBanner
            cantidad={d.resumen?.sin_colocar ?? 0}
            puedeCrearEmbudo={puede(cat.permisos, 'crm.pipelines.manage')}
            onVerLeads={() => d.setFiltros({ ...filtrosLeadsVacios(), sinColocar: true })}
            onCrearEmbudo={() => router.push('/app/crm/pipeline')}
          />
          {estado !== 'vacio' && <LeadsKpis resumen={d.resumen} cargando={!d.resumen && !d.errorResumen} />}
          {estado !== 'vacio' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <SearchInput value={d.filtros.q} onChange={(q) => d.setFiltros({ ...d.filtros, q })} placeholder={t('buscar')} etiqueta={t('buscar')} cargando={d.cargando} className="min-w-0 flex-1" />
                <LeadsFiltros filtros={d.filtros} onFiltros={d.setFiltros} usuarios={cat.usuarios} />
              </div>
              {hayFiltrosLeads(d.filtros) && chips}
            </div>
          )}

          {estado === 'error' ? (
            <div className="rounded-xl border border-line bg-surface">
              <EmptyState variante="error" titulo={t('error.titulo')} descripcion={te(claveError(d.error))} onReintentar={d.recargar} />
            </div>
          ) : estado === 'vacio' ? (
            <div className="rounded-xl border border-line bg-surface">
              <EmptyState
                variante="empty"
                icono={UserRoundPlus}
                titulo={t('vacio.titulo')}
                descripcion={t('vacio.descripcion')}
                accion={permisos.crear ? { etiqueta: t('nuevo'), onClick: () => setNuevo(true) } : undefined}
                accionSecundaria={{ etiqueta: t('vacio.conectar'), href: '/app/organizacion/branding' }}
              />
            </div>
          ) : estado === 'sinResultados' ? (
            <div className="rounded-xl border border-line bg-surface">
              <EmptyState variante="search" termino={d.filtros.q || undefined} onLimpiarFiltros={() => d.setFiltros(filtrosLeadsVacios())} />
            </div>
          ) : escritorio ? (
            <LeadsTabla
              filas={filas}
              cargando={d.cargando}
              seleccion={seleccion}
              onSeleccion={(id, v) => setSeleccion((s) => alternar(s, id, v))}
              onSeleccionPagina={(v) => setSeleccion((s) => filas.reduce((acc, f) => alternar(acc, f.id, v), s))}
              onCalificar={setCalificarId}
              onAccion={alAccion}
              permisos={permisos}
              pagina={d.pagina}
              tamano={d.tamano}
              total={total}
              onPagina={d.setPagina}
              onTamano={d.setTamano}
            />
          ) : (
            <LeadsListaMovil
              filas={filas}
              total={total}
              cargando={d.cargando}
              seleccion={seleccion}
              modoSeleccion={modoSeleccion}
              onModoSeleccion={() => setModoSeleccion(true)}
              onSeleccion={(id, v) => setSeleccion((s) => alternar(s, id, v))}
              onAbrir={setDetalleId}
              onAccion={alAccion}
              onCalificar={setCalificarId}
              permisos={permisos}
              onCargarMas={() => d.setPagina(d.pagina + 1)}
            />
          )}
        </>
      )}

      {seleccionados.length > 0 && (
        <BulkActionBar
          seleccionados={seleccionados.length}
          sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
          onLimpiar={limpiarSeleccion}
          acciones={[
            ...(permisos.asignar ? [{ id: 'asignar', etiqueta: t('masivo.asignar'), icono: UserPlus, onClick: () => setAsignarIds(seleccionados) }] : []),
            { id: 'etiquetar', etiqueta: t('masivo.etiquetar'), icono: Tags, onClick: () => undefined, deshabilitada: true, motivo: t('masivo.etiquetarMotivo') },
            ...(permisos.convertir
              ? [{ id: 'calificar', etiqueta: t('masivo.calificar'), icono: TrendingUp, onClick: () => (seleccionados.length === 1 ? setCalificarId(seleccionados[0]) : setLoteIds(seleccionados)), deshabilitada: seleccionados.length > MAX_LOTE_CALIFICAR, motivo: t('masivo.calificarMotivo', { max: MAX_LOTE_CALIFICAR }) }]
              : []),
            { id: 'exportar', etiqueta: t('masivo.exportar'), icono: Download, onClick: () => exportar(seleccionados) },
            ...(permisos.editar ? [{ id: 'descartar', etiqueta: t('masivo.descartar'), icono: XCircle, destructiva: true, onClick: () => setDescartarIds(seleccionados) }] : []),
          ]}
        />
      )}

      {detalle.fila && detalle.api && (
        <LeadDetalleHoja
          lead={detalle.fila}
          api={detalle.api}
          onCerrar={() => setDetalleId(null)}
          onCalificar={setCalificarId}
          onAsignar={(id) => setAsignarIds([id])}
          onDescartar={(id) => setDescartarIds([id])}
          permisos={permisos}
        />
      )}
      <CalificarLead
        lead={aCalificar}
        onCerrar={() => setCalificarId(null)}
        onDescartar={(l) => setDescartarIds([l.id])}
        catalogos={cat}
        moneda={moneda}
        puedeDescartar={permisos.editar}
        onCalificado={(opp) => {
          setCalificarId(null);
          setDetalleId(null);
          limpiarSeleccion();
          if (opp) router.push(`/app/crm/oportunidades/${opp}`);
        }}
      />
      <CalificarLeadsLote
        ids={loteIds}
        leads={filas.filter((f) => loteIds?.includes(f.id))}
        onCerrar={() => setLoteIds(null)}
        catalogos={cat}
        moneda={moneda}
        onCalificados={limpiarSeleccion}
        onVerPipeline={() => router.push('/app/crm/pipeline')}
      />
      <AsignarResponsableDialog
        abierto={!!asignarIds}
        onAbiertoChange={(x) => !x && (setAsignarIds(null), setErrorDialogo(null))}
        cantidad={asignarIds?.length ?? 0}
        usuarios={cat.usuarios}
        inicial={asignarIds?.length === 1 ? porId(asignarIds[0]).api?.owner_id : null}
        onAsignar={(o) => void asignar(o)}
        ocupado={ocupado}
        error={errorDialogo}
      />
      <DialogoMotivo
        abierto={!!descartarIds}
        onAbiertoChange={(x) => !x && (setDescartarIds(null), setErrorDialogo(null))}
        titulo={t('descartar.titulo', { n: descartarIds?.length ?? 0 })}
        descripcion={t('descartar.descripcion')}
        textoConfirmar={t('descartar.confirmar')}
        motivosRapidos={[t('descartar.motivos.noInteresado'), t('descartar.motivos.sinPresupuesto'), t('descartar.motivos.duplicado'), t('descartar.motivos.datosFalsos')]}
        minimo={3}
        maximo={500}
        onConfirmar={descartar}
        cargando={ocupado}
        error={errorDialogo}
        icono={XCircle}
      />
      <NewLeadDialog open={nuevo} onOpenChange={setNuevo} branchId={branchId} onCreated={() => emitirCambioCrm({ entidad: 'lead', accion: 'crear' })} />
      {accion && accionLead && (
        <AccionesRapidasCrm
          variante="drawer"
          sinBarra
          clienteId={accionLead.id}
          cliente={{ id: accionLead.id, full_name: accionLead.full_name, email: accionLead.email, phone: accionLead.phone, do_not_call: accionLead.do_not_call }}
          abrirAccion={{ accion: accion.accion, clave: accion.clave }}
          onCerrado={() => setAccion(null)}
        />
      )}
    </div>
  );
}
