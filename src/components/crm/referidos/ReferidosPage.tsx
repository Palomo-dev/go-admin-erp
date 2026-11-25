'use client';

/**
 * /app/crm/referidos — Referidos (Figma «CRM · Red y gestión», 1298:768716 y
 * hermanos): «Programas» y «Registrar referido», 4 KPI, aviso de clientes
 * ganados que esperan que les pidan un referido, pestañas por estado con
 * conteos, buscador + programa, TABLA (tarjetas en móvil) con la siguiente
 * transición válida por fila, paginación «Ir a» y la vista «Recompensas».
 * Estados: cargando, vacío, sin resultados y error (con lista previa se
 * conserva y sale un aviso). Toda escritura va por `/api/crm/referrals/**`
 * (`useReferrals`); el navegador no escribe en la base.
 */

import { useEffect, useMemo, useState } from 'react';
import { Download, Plus, Ticket, UserPlus, XCircle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/kit/PageHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { SearchInput } from '@/components/kit/SearchInput';
import { TabBar } from '@/components/kit/TabBar';
import { ChipsOpcion } from '@/components/kit/ChipsOpcion';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { ConfirmDialog } from '@/components/kit/ConfirmDialog';
import { clasesBoton } from '@/components/kit/botonClases';
import { useEsEscritorio } from '@/components/kit/useEsEscritorio';
import { useOpcionUrl } from '@/components/kit/useParametroUrl';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import type { ReferralRequest, ReferralView } from '@/lib/services/crm/referralsService';
import {
  alternarOrden,
  contarPorEstado,
  csvRecompensas,
  esMonetaria,
  fechaConversion,
  filasRecompensas,
  filtrar,
  filtrarSinEstado,
  FILTROS_VACIOS,
  hayFiltros,
  ORDEN_INICIAL,
  ordenar,
  paginar,
  PESTANAS_ESTADO,
  PROGRAMA_SIN,
  PROGRAMA_TODOS,
  referidosPorPrograma,
  resumenReferidos,
  type FiltrosReferidos,
  type Orden,
  type PestanaEstado,
} from './referidosLogica';
import { ConvertReferralDialog } from './ConvertReferralDialog';
import { ReferidosKpis } from './ReferidosKpis';
import { ReferidosListaMovil } from './ReferidosListaMovil';
import { ReferidosRecompensas, useBeneficiario } from './ReferidosRecompensas';
import { ReferidosTabla } from './ReferidosTabla';
import { ReferralProgramsSheet } from './ReferralProgramsSheet';
import { RegisterReferralDialog } from './RegisterReferralDialog';
import { SolicitudesReferidoPanel } from './SolicitudesReferidoPanel';
import { idPaso, type AccionPaso } from './SiguientePasoBoton';
import { useReferidosFormato } from './useReferidosFormato';
import { useReferrals } from './useReferrals';

const TAMANO = 25;
const VISTAS = ['referidos', 'recompensas'] as const;
type Vista = (typeof VISTAS)[number];

export function ReferidosPage() {
  const { referrals, programs, requests, canManage, loading, loaded, error, reload, register, transition, markPaid, convert, saveProgram, deleteProgram } = useReferrals();
  const { t, idioma, fecha, valor, dinero, hoy, diaDe } = useReferidosFormato();
  const beneficiario = useBeneficiario();
  const escritorio = useEsEscritorio();
  const [vista, setVista] = useOpcionUrl<Vista>('vista', VISTAS, 'referidos');
  const [filtros, setFiltros] = useState<FiltrosReferidos>(FILTROS_VACIOS);
  const [orden, setOrden] = useState<Orden>(ORDEN_INICIAL);
  const [pagina, setPagina] = useState(1);
  const [movilN, setMovilN] = useState(TAMANO);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [preset, setPreset] = useState<{ id: string; name: string } | null>(null);
  const [programsOpen, setProgramsOpen] = useState(false);
  const [crearPrograma, setCrearPrograma] = useState(false);
  const [solicitudesOpen, setSolicitudesOpen] = useState(false);
  const [convertTarget, setConvertTarget] = useState<ReferralView | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ReferralView | null>(null);
  const [payTarget, setPayTarget] = useState<ReferralView | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refocusId, setRefocusId] = useState<string | null>(null);

  const resumen = useMemo(() => resumenReferidos(referrals, hoy(), diaDe), [referrals, hoy, diaDe]);
  const base = useMemo(() => filtrarSinEstado(referrals, filtros), [referrals, filtros]);
  const conteos = useMemo(() => contarPorEstado(base), [base]);
  const lista = useMemo(() => ordenar(filtrar(referrals, filtros), orden, idioma), [referrals, filtros, orden, idioma]);
  const filasPagina = useMemo(() => paginar(lista, pagina, TAMANO), [lista, pagina]);
  const porPrograma = useMemo(() => referidosPorPrograma(referrals), [referrals]);
  const hayProgramaActivo = programs.some((p) => p.is_active);

  useEffect(() => {
    setPagina(1);
    setMovilN(TAMANO);
  }, [filtros, orden]);

  useEffect(() => {
    if (!refocusId) return;
    document.getElementById(refocusId)?.focus();
    setRefocusId(null);
  }, [refocusId]);

  const cambiarFiltros = (f: FiltrosReferidos) => setFiltros(f);
  const abrirRegistro = (p: { id: string; name: string } | null) => {
    setPreset(p);
    setRegisterOpen(true);
  };
  const registrarDe = (r: ReferralRequest) => {
    if (!r.customer) return;
    setSolicitudesOpen(false);
    abrirRegistro({ id: r.customer.id, name: r.customer.full_name ?? r.title });
  };
  const abrirProgramas = (crear: boolean) => {
    setCrearPrograma(crear);
    setProgramsOpen(true);
  };

  const fallo = (titulo: string, err: unknown) => toast({ title: titulo, description: err instanceof Error ? err.message : t('errorDesconocido'), variant: 'destructive' });

  const mover = async (r: ReferralView, a: 'contacted' | 'qualified' | 'rejected') => {
    setBusyId(r.id);
    try {
      await transition(r.id, a);
      toast({ title: t(a === 'contacted' ? 'toast.contactado' : a === 'qualified' ? 'toast.calificado' : 'toast.rechazado', { nombre: r.referred_name }) });
      if (a !== 'rejected') setRefocusId(idPaso(r.id));
    } catch (err) {
      fallo(t('toast.errorEstado'), err);
    } finally {
      setBusyId(null);
    }
  };

  const alPaso = (r: ReferralView, paso: AccionPaso) => {
    if (paso === 'contactar') void mover(r, 'contacted');
    else if (paso === 'calificar') void mover(r, 'qualified');
    else if (paso === 'convertir') setConvertTarget(r);
    else setPayTarget(r);
  };

  const pagar = async () => {
    if (!payTarget) return;
    setBusyId(payTarget.id);
    try {
      await markPaid(payTarget.id);
      toast({ title: t('toast.pagoRegistrado'), description: t('toast.pagoDescripcion', { nombre: payTarget.referred_name }) });
      setPayTarget(null);
    } catch (err) {
      fallo(t('toast.errorPago'), err);
    } finally {
      setBusyId(null);
    }
  };

  const exportar = () => {
    const filas = filasRecompensas(referrals, 'pendientes').concat(filasRecompensas(referrals, 'pagadas'));
    const csv = csvRecompensas(
      filas,
      ['referido', 'beneficiario', 'programa', 'recompensa', 'estado', 'convertido', 'pagada'].map((k) => t(`recompensas.csv.${k}`)),
      (r) => {
        const b = beneficiario(r);
        return [r.referred_name, `${b.principal} ${b.detalle}`.trim(), r.program?.name ?? '', r.program ? valor(r.program) : '', r.reward_paid ? t('recompensas.csv.pagadaSi') : t('recompensas.csv.pendiente'), fecha(fechaConversion(r)), fecha(r.reward_paid_at)];
      },
    );
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = t('recompensas.csv.archivo');
    a.click();
    URL.revokeObjectURL(url);
  };

  /** «Crédito $ 50.000 para Laura y Camilo»: lo que se anota al registrar el pago. */
  const detallePago = (r: ReferralView) => {
    const p = r.program;
    if (!p) return '';
    const referidor = r.referrer?.full_name ?? t('sinNombre');
    const nombres = p.reward_to === 'referred' ? r.referred_name : p.reward_to === 'both' ? t('recompensas.confirmar.y', { a: referidor, b: r.referred_name }) : referidor;
    const v = esMonetaria(p) ? `${t(`tipo.${p.reward_type}`)} ${dinero(p.reward_amount)}` : valor(p);
    return t('recompensas.confirmar.para', { recompensa: v, nombre: nombres });
  };
  const pagoMonetario = esMonetaria(payTarget?.program);

  const estado: 'cargando' | 'error' | 'vacio' | 'sinResultados' | 'listo' =
    loading && !loaded ? 'cargando' : error && !loaded ? 'error' : referrals.length === 0 ? 'vacio' : lista.length === 0 ? 'sinResultados' : 'listo';

  const avisoSolicitudes = requests.length > 0 && (estado === 'listo' || estado === 'sinResultados' || estado === 'vacio') && (
    <AvisoTonal
      tono="informacion"
      icono={UserPlus}
      titulo={t('aviso.titulo', { n: requests.length })}
      descripcion={t('aviso.descripcion')}
      accion={{ etiqueta: t('aviso.ver'), onClick: () => setSolicitudesOpen(true) }}
    />
  );

  const opcionesPrograma = [
    ...programs.map((p) => ({ valor: p.id, etiqueta: p.name })),
    { valor: PROGRAMA_SIN, etiqueta: t('programa.sin') },
  ];
  const etiquetaPestana = (s: PestanaEstado) => (s === 'todos' ? t('pestanas.todos') : t(`estado.${s}`));

  return (
    <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:p-6">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        migas={[{ etiqueta: t('migas.crm'), href: '/app/crm' }, vista === 'recompensas' ? { etiqueta: t('migas.referidos'), href: '/app/crm/referidos' } : { etiqueta: t('migas.referidos') }, ...(vista === 'recompensas' ? [{ etiqueta: t('migas.recompensas') }] : [])]}
        cargando={loading && loaded}
        acciones={
          <>
            {vista === 'recompensas' ? (
              <button type="button" onClick={exportar} className={clasesBoton({ variante: 'secundario' })}>
                <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('exportar')}
              </button>
            ) : (
              <button type="button" onClick={() => abrirProgramas(false)} className={clasesBoton({ variante: 'secundario' })}>
                <Ticket aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('programas')}
              </button>
            )}
            <button type="button" onClick={() => abrirRegistro(null)} className={clasesBoton()}>
              <UserPlus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('registrar')}
            </button>
          </>
        }
        movil={{
          titulo: t('titulo'),
          accion: (
            <button type="button" onClick={() => abrirRegistro(null)} aria-label={t('registrar')} className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover">
              <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </button>
          ),
          menu: [{ id: 'programas', etiqueta: t('programas'), icono: Ticket, onSelect: () => abrirProgramas(false) }],
        }}
      />

      {error && loaded && (
        <AvisoTonal tono="peligro" rol="alert" titulo={t('error.recarga')} descripcion={t('error.recargaDescripcion', { detalle: error })} accion={{ etiqueta: t('error.reintentar'), onClick: () => void reload() }} />
      )}

      {vista === 'recompensas' && estado !== 'cargando' && estado !== 'error' && (
        <TabBar<Vista>
          id="referidos-vista"
          etiqueta={t('vistas.etiqueta')}
          valor={vista}
          onValorChange={setVista}
          pestanas={[
            { valor: 'referidos', etiqueta: t('vistas.referidos'), contador: referrals.length },
            { valor: 'recompensas', etiqueta: t('vistas.recompensas'), contador: resumen.pendientesN },
          ]}
        />
      )}

      {estado === 'error' ? (
        <EmptyState variante="error" titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={() => void reload()} />
      ) : estado === 'vacio' ? (
        <>
          {avisoSolicitudes}
          <EmptyState
            variante="empty"
            icono={UserPlus}
            titulo={t('vacio.titulo')}
            descripcion={hayProgramaActivo ? t('vacio.descripcionConPrograma') : t('vacio.descripcion')}
            accion={{ etiqueta: t('registrar'), icono: Plus, onClick: () => abrirRegistro(null) }}
            accionSecundaria={canManage && !hayProgramaActivo ? { etiqueta: t('vacio.crearPrograma'), icono: Ticket, onClick: () => abrirProgramas(true) } : undefined}
          />
        </>
      ) : vista === 'recompensas' && estado !== 'cargando' ? (
        <ReferidosRecompensas referidos={referrals} resumen={resumen} ocupadoId={busyId} onRegistrar={setPayTarget} />
      ) : (
        <>
          <ReferidosKpis resumen={resumen} cargando={estado === 'cargando'} onVerRecompensas={() => setVista('recompensas')} />
          {avisoSolicitudes}
          {estado === 'cargando' ? (
            <Skeleton className="h-3 w-[420px] max-w-full" />
          ) : escritorio ? (
            <TabBar<PestanaEstado>
              id="referidos-estado"
              etiqueta={t('pestanas.etiqueta')}
              valor={filtros.estado}
              onValorChange={(estado) => cambiarFiltros({ ...filtros, estado })}
              pestanas={PESTANAS_ESTADO.map((s) => ({ valor: s, etiqueta: etiquetaPestana(s), contador: conteos[s] }))}
            />
          ) : (
            <ChipsOpcion<PestanaEstado>
              etiqueta={t('pestanas.etiqueta')}
              className="-mx-4 flex-nowrap overflow-x-auto px-4 [&>button]:shrink-0"
              valor={filtros.estado}
              onValorChange={(estado) => cambiarFiltros({ ...filtros, estado })}
              opciones={PESTANAS_ESTADO.map((s) => ({ valor: s, etiqueta: t('pestanas.chip', { estado: s === 'todos' ? t('pestanas.todos') : t(`estadoPlural.${s}`), n: conteos[s] }) }))}
            />
          )}
          {estado !== 'cargando' && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <SearchInput
                value={filtros.q}
                onChange={(q) => cambiarFiltros({ ...filtros, q })}
                placeholder={escritorio ? t('buscar') : t('buscarMovil')}
                etiqueta={t('buscar')}
                atajo={escritorio ? '/' : false}
                className="min-w-0 flex-1"
              />
              {escritorio && (
                <SelectCrm
                  aria-label={t('programa.filtro')}
                  className="sm:w-[228px]"
                  valor={filtros.programa === PROGRAMA_TODOS ? '' : filtros.programa}
                  onValorChange={(v) => cambiarFiltros({ ...filtros, programa: v || PROGRAMA_TODOS })}
                  opcionVacia={t('programa.todos')}
                  opciones={opcionesPrograma}
                />
              )}
            </div>
          )}

          {estado === 'sinResultados' ? (
            <div className="rounded-xl border border-line bg-surface">
              <EmptyState variante="search" termino={filtros.q || undefined} onLimpiarFiltros={hayFiltros(filtros) ? () => cambiarFiltros(FILTROS_VACIOS) : undefined} />
            </div>
          ) : escritorio || estado === 'cargando' ? (
            escritorio ? (
              <ReferidosTabla
                filas={estado === 'cargando' ? [] : filasPagina}
                cargando={estado === 'cargando'}
                ocupadoId={busyId}
                orden={orden}
                onOrden={(c) => setOrden((o) => alternarOrden(o, c))}
                onPaso={alPaso}
                onRechazar={setRejectTarget}
                pagina={pagina}
                tamano={TAMANO}
                total={lista.length}
                onPagina={setPagina}
              />
            ) : (
              <div className="flex flex-col gap-2" aria-busy="true">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}
              </div>
            )
          ) : (
            <ReferidosListaMovil filas={lista.slice(0, movilN)} total={lista.length} ocupadoId={busyId} onPaso={alPaso} onRechazar={setRejectTarget} onCargarMas={() => setMovilN((n) => n + TAMANO)} />
          )}
        </>
      )}

      <RegisterReferralDialog open={registerOpen} preset={preset} programs={programs} onOpenChange={setRegisterOpen} onRegister={register} />
      <ConvertReferralDialog open={convertTarget !== null} referral={convertTarget} onOpenChange={(o) => { if (!o) setConvertTarget(null); }} onConvert={convert} />
      <ReferralProgramsSheet open={programsOpen} programs={programs} conteos={porPrograma} canManage={canManage} crearAlAbrir={crearPrograma} onOpenChange={setProgramsOpen} onSave={saveProgram} onDelete={deleteProgram} />
      <SolicitudesReferidoPanel abierto={solicitudesOpen} onAbiertoChange={setSolicitudesOpen} solicitudes={requests} onRegistrar={registrarDe} />
      <ConfirmDialog
        abierto={rejectTarget !== null}
        onAbiertoChange={(o) => { if (!o) setRejectTarget(null); }}
        titulo={t('rechazar.titulo')}
        descripcion={t('rechazar.descripcion', { nombre: rejectTarget?.referred_name ?? '' })}
        textoConfirmar={t('rechazar.confirmar')}
        tono="peligro"
        icono={XCircle}
        cargando={busyId !== null && busyId === rejectTarget?.id}
        onConfirmar={async () => {
          if (rejectTarget) await mover(rejectTarget, 'rejected');
          setRejectTarget(null);
        }}
      />
      <ConfirmDialog
        abierto={payTarget !== null}
        onAbiertoChange={(o) => { if (!o) setPayTarget(null); }}
        titulo={t(pagoMonetario ? 'recompensas.confirmar.titulo' : 'recompensas.confirmar.tituloAplicada')}
        descripcion={payTarget ? `${detallePago(payTarget)}. ${t(pagoMonetario ? 'recompensas.confirmar.cola' : 'recompensas.confirmar.colaAplicada')}` : ''}
        textoConfirmar={t(pagoMonetario ? 'recompensas.confirmar.confirmar' : 'recompensas.confirmar.confirmarAplicada')}
        tono="marca"
        cargando={busyId !== null && busyId === payTarget?.id}
        onConfirmar={pagar}
      />
    </div>
  );
}
