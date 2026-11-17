'use client';

/**
 * Detalle de un período de nómina: preliquidación (Figma 20.17), revisión y cierre
 * (20.19), pago (20.22) y colillas del período (20.23.3), en secciones de la URL
 * (`?seccion=`). Las acciones de la cabecera dependen del estado y de los permisos
 * que dio el servidor (`accionesPeriodo`); la base vuelve a validar cada una.
 *
 * - Preliquidar y recalcular corren el motor en el servidor (ruta `preliquidar`):
 *   nunca en el navegador y siempre con el usuario de la sesión.
 * - Cerrar y pagar piden confirmación destructiva (decisión 4).
 * - Después del cierre no se recalcula: se corrige con un ajuste con motivo (decisión 5).
 * - Con la nómina apagada, cerrar, pagar y ajustar se ven deshabilitados y se dice por qué (20.25).
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Lock, RefreshCw, Send, Trash2, Undo2, Wrench } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  AvisoTonal,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  RowActionsMenu,
  StatCard,
  TabBar,
  clasesBoton,
  useOpcionUrl,
  type AccionFila,
} from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import {
  RUTA_NOMINA,
  cerrarPeriodo,
  codigoDeError,
  eliminarPeriodo,
  enviarRevision,
  preliquidar,
  usePeriodo,
  usePersonasNomina,
  useRevision,
} from './apiNomina';
import { accionesPeriodo, contarAlertas, estaCerrado, estadoPeriodo, type AccionPeriodo, type EstadoAccion } from './nominaLogica';
import { AvisoSoloPreliquidacion, EstadoPeriodoBadge, InsigniaSoloPreliquidacion, useDinero, useErrorNomina, useFechas, useNombrePeriodo } from './piezasNomina';
import { MIGA_RRHH } from './NominaPage';
import { DialogoNominaApagada } from './DialogoNominaApagada';
import { DialogoAjuste } from './DialogoAjuste';
import { SeccionEmpleados } from './SeccionEmpleados';
import { SeccionRevision } from './SeccionRevision';
import { SeccionPago } from './SeccionPago';
import { SeccionColillas } from './SeccionColillas';

const SECCIONES = ['empleados', 'revision', 'pago', 'colillas'] as const;
type Seccion = (typeof SECCIONES)[number];

export function PeriodoPage({ id }: { id: string }) {
  const t = useTranslations('hrmNomina.periodo');
  const tn = useTranslations('hrmNomina');
  const tm = useTranslations('hrmNomina.motivos');
  const router = useRouter();
  const f = useFechas();
  const { formatDateTime } = useFormatDate();
  const dinero = useDinero();
  const nombrar = useNombrePeriodo();
  const mensajeError = useErrorNomina();
  const [seccion, setSeccion] = useOpcionUrl<Seccion>('seccion', SECCIONES, 'empleados', 'replace');
  const { carga, recargar } = usePeriodo(id);
  const { carga: cargaRevision, recargar: recargarRevision } = useRevision(id);
  const { carga: cargaPersonas } = usePersonasNomina();
  const [ocupado, setOcupado] = useState<AccionPeriodo | null>(null);
  const [confirmar, setConfirmar] = useState<'cerrar' | 'eliminar' | null>(null);
  const [ajuste, setAjuste] = useState<{ vinculo: string | null } | null>(null);
  const [apagada, setApagada] = useState(false);

  const datos = carga.estado === 'listo' ? carga.datos : null;
  const revision = cargaRevision.estado === 'listo' ? cargaRevision.datos : null;
  const personas = useMemo(
    () => new Map((cargaPersonas.estado === 'listo' ? cargaPersonas.datos.personas : []).map((x) => [x.vinculo_id, x])),
    [cargaPersonas]
  );
  const p = datos?.periodo;
  const estado = estadoPeriodo(p?.status);
  const habilitada = datos?.nomina_habilitada ?? revision?.habilitada ?? false;
  const vigente = useMemo(() => {
    const v = (datos?.versiones ?? []).filter((x) => x.tipo === 'calculo' && x.estado === 'completed' && !x.reemplazada_por);
    return v.sort((a, b) => b.numero - a.numero)[0] ?? null;
  }, [datos]);
  const bloqueosMotor = contarAlertas(vigente?.alertas).bloqueos;
  const bloqueosCierre = (revision?.bloqueos ?? []).filter((b) => b.codigo !== 'revision_pendiente').length;
  const acciones = accionesPeriodo({
    estado,
    permisos: revision?.permisos ?? { ver: true, procesar: false, cerrar: false, pagar: false, salario: false },
    habilitada,
    bloqueos: revision ? bloqueosCierre : bloqueosMotor,
    conCalculo: !!vigente,
    revisionAprobada: !revision?.aprobacion || revision.aprobacion.estado === 'aprobada',
  });

  const recargarTodo = () => {
    void recargar();
    void recargarRevision();
  };

  const correr = async (accion: AccionPeriodo, fn: () => Promise<unknown>, ok: string) => {
    setOcupado(accion);
    try {
      await fn();
      toast.success(ok);
      recargarTodo();
    } catch (e) {
      toast.error(mensajeError(codigoDeError(e)));
    } finally {
      setOcupado(null);
    }
  };

  const calcular = (accion: 'preliquidar' | 'recalcular' | 'devolver') =>
    correr(
      accion,
      async () => {
        const r = await preliquidar(id);
        if (r.reutilizado) toast.info(t('sinCambios'));
      },
      accion === 'devolver' ? t('devuelto') : t('calculado')
    );

  const motivo = (a: EstadoAccion) => (a.motivo ? tm(a.motivo) : undefined);

  const boton = (a: AccionPeriodo, etiqueta: string, icono: typeof RefreshCw, variante: 'primario' | 'secundario', onClick: () => void) => {
    const e = acciones[a];
    if (!e.visible) return null;
    const Icono = icono;
    return (
      <button
        key={a}
        type="button"
        className={clasesBoton({ variante, tamano: 'md' })}
        disabled={!e.habilitada || ocupado !== null}
        aria-disabled={!e.habilitada || undefined}
        title={motivo(e)}
        onClick={onClick}
      >
        <Icono aria-hidden className={ocupado === a ? 'size-4 animate-spin' : 'size-4'} strokeWidth={1.5} />
        {etiqueta}
      </button>
    );
  };

  const menu: AccionFila[] = [
    { id: 'ajustar', etiqueta: t('acciones.ajustar'), icono: Wrench, onSelect: () => setAjuste({ vinculo: null }), oculta: !acciones.ajustar.visible, deshabilitada: !acciones.ajustar.habilitada, motivo: motivo(acciones.ajustar) },
    {
      id: 'eliminar',
      etiqueta: t('acciones.eliminar'),
      icono: Trash2,
      destructiva: true,
      separadorAntes: true,
      onSelect: () => setConfirmar('eliminar'),
      oculta: !acciones.eliminar.visible,
      deshabilitada: !acciones.eliminar.habilitada,
      motivo: motivo(acciones.eliminar),
    },
  ];

  const menuMovil: AccionFila[] = [
    { id: 'preliquidar', etiqueta: t('acciones.preliquidar'), icono: RefreshCw, onSelect: () => void calcular('preliquidar'), oculta: !acciones.preliquidar.visible },
    { id: 'recalcular', etiqueta: t('acciones.recalcular'), icono: RefreshCw, onSelect: () => void calcular('recalcular'), oculta: !acciones.recalcular.visible },
    {
      id: 'enviar',
      etiqueta: t('acciones.enviarRevision'),
      icono: Send,
      onSelect: () => void correr('enviar_revision', () => enviarRevision(id), t('enviado')),
      oculta: !acciones.enviar_revision.visible,
      deshabilitada: !acciones.enviar_revision.habilitada,
      motivo: motivo(acciones.enviar_revision),
    },
    { id: 'devolver', etiqueta: t('acciones.devolver'), icono: Undo2, onSelect: () => void calcular('devolver'), oculta: !acciones.devolver.visible },
    {
      id: 'cerrar',
      etiqueta: t('acciones.cerrar'),
      icono: Lock,
      onSelect: () => setConfirmar('cerrar'),
      oculta: !acciones.cerrar.visible,
      deshabilitada: !acciones.cerrar.habilitada,
      motivo: motivo(acciones.cerrar),
    },
    ...menu,
  ];

  const titulo = p ? nombrar({ nombre: p.name, tipo: p.kind, desde: p.period_start, hasta: p.period_end }) : t('titulo');
  const subtitulo = p
    ? [
        f.rangoCorto(p.period_start, p.period_end),
        p.payment_date ? t('pago', { fecha: f.sinAnio(p.payment_date) }) : null,
        vigente ? t('version', { n: vigente.numero, fecha: vigente.ejecutada ? formatDateTime(vigente.ejecutada) : '—' }) : t('sinCalculo'),
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;
  const subtituloMovil = [tn(`estados.${estado}`), vigente ? t('versionCorta', { n: vigente.numero }) : null].filter(Boolean).join(' · ');
  // En celular la acción principal va abajo, con su motivo si está deshabilitada (Figma 20.17 móvil).
  const principal = (['preliquidar', 'enviar_revision', 'cerrar'] as const).find((a) => acciones[a].visible) ?? null;
  const etiquetaPrincipal: Record<'preliquidar' | 'enviar_revision' | 'cerrar', string> = {
    preliquidar: t('acciones.preliquidar'),
    enviar_revision: t('acciones.enviarRevision'),
    cerrar: t('acciones.cerrar'),
  };
  const accionPrincipal = () => {
    if (principal === 'preliquidar') void calcular('preliquidar');
    else if (principal === 'enviar_revision') void correr('enviar_revision', () => enviarRevision(id), t('enviado'));
    else if (principal === 'cerrar') setConfirmar('cerrar');
  };
  const migas = [
    { etiqueta: tn('migas.rrhh'), href: MIGA_RRHH },
    { etiqueta: tn('titulo'), href: RUTA_NOMINA },
    { etiqueta: tn('migas.periodos') },
  ];

  if (carga.estado !== 'listo') {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
        <PageHeader variante="form" titulo={t('titulo')} volverA={RUTA_NOMINA} migas={migas} cargando={carga.estado === 'cargando'} />
        {carga.estado === 'cargando' ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <StatCard key={i} etiqueta="" valor="" cargando />
            ))}
          </div>
        ) : carga.estado === 'sinPermiso' ? (
          <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} accion={{ etiqueta: t('volver'), href: RUTA_NOMINA }} />
        ) : carga.estado === 'noExiste' ? (
          <EmptyState variante="empty" titulo={t('noExiste')} accion={{ etiqueta: t('volver'), href: RUTA_NOMINA }} />
        ) : (
          <EmptyState variante="error" onReintentar={() => void recargar()} />
        )}
      </div>
    );
  }

  const det = carga.datos;
  const cerrado = estaCerrado(estado);
  const secciones = [
    { valor: 'empleados' as const, etiqueta: t('secciones.empleados') },
    { valor: 'revision' as const, etiqueta: t('secciones.revision') },
    ...(cerrado ? [{ valor: 'pago' as const, etiqueta: t('secciones.pago') }] : []),
    ...(vigente ? [{ valor: 'colillas' as const, etiqueta: t('secciones.colillas') }] : []),
  ];
  const actual: Seccion = secciones.some((s) => s.valor === seccion) ? seccion : 'empleados';

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        variante="form"
        titulo={titulo}
        subtitulo={subtitulo}
        volverA={RUTA_NOMINA}
        migas={migas}
        badge={
          <span className="flex items-center gap-1">
            <EstadoPeriodoBadge estado={estado} tamano="md" />
            {!habilitada && estado !== 'abierto' ? <InsigniaSoloPreliquidacion /> : null}
          </span>
        }
        acciones={
          <>
            {boton('preliquidar', t('acciones.preliquidar'), RefreshCw, 'primario', () => void calcular('preliquidar'))}
            {boton('recalcular', t('acciones.recalcular'), RefreshCw, 'secundario', () => void calcular('recalcular'))}
            {boton('enviar_revision', t('acciones.enviarRevision'), Send, 'primario', () => void correr('enviar_revision', () => enviarRevision(id), t('enviado')))}
            {boton('devolver', t('acciones.devolver'), Undo2, 'secundario', () => void calcular('devolver'))}
            {boton('cerrar', t('acciones.cerrar'), Lock, 'primario', () => setConfirmar('cerrar'))}
            {menu.some((m) => !m.oculta) ? (
              <RowActionsMenu acciones={menu} orientacion="horizontal" tamano="md" titulo={titulo} />
            ) : null}
          </>
        }
        movil={{ subtitulo: subtituloMovil, menu: menuMovil }}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard etiqueta={t('kpi.devengado')} valor={vigente ? dinero(p?.total_gross) : '—'} detalle={vigente ? t('kpi.empleados', { n: p?.total_employees ?? 0 }) : t('kpi.sinCalculo')} tamano="sm" />
        <StatCard etiqueta={t('kpi.deducciones')} valor={vigente ? dinero(p?.total_deductions) : '—'} detalle={t('kpi.deduccionesDetalle')} tamano="sm" />
        <StatCard etiqueta={habilitada ? t('kpi.neto') : t('kpi.netoPreliquidado')} valor={vigente ? dinero(p?.total_net) : '—'} tamano="sm" />
        <StatCard etiqueta={t('kpi.costo')} valor={vigente ? dinero(p?.total_employer_cost) : '—'} detalle={t('kpi.costoDetalle')} tamano="sm" />
      </div>

      {!habilitada ? <AvisoSoloPreliquidacion compacto onVerQueFalta={() => setApagada(true)} /> : null}
      {cerrado ? (
        <AvisoTonal
          tono="neutro"
          icono={Lock}
          titulo={t('cerradoAviso.titulo')}
          descripcion={t('cerradoAviso.descripcion')}
          accion={acciones.ajustar.visible && acciones.ajustar.habilitada ? { etiqueta: t('acciones.ajustar'), onClick: () => setAjuste({ vinculo: null }) } : undefined}
        />
      ) : null}

      <TabBar id="periodo" etiqueta={t('secciones.etiqueta')} valor={actual} onValorChange={setSeccion} pestanas={secciones} />

      {actual === 'empleados' ? (
        <SeccionEmpleados
          periodo={det}
          personas={personas}
          revision={revision}
          vigente={vigente}
          onAjustar={acciones.ajustar.visible && acciones.ajustar.habilitada ? (v) => setAjuste({ vinculo: v }) : undefined}
          onPreliquidar={acciones.preliquidar.visible ? () => void calcular('preliquidar') : undefined}
        />
      ) : actual === 'revision' ? (
        <SeccionRevision periodo={det} revision={revision} cargaRevision={cargaRevision.estado} onReintentar={() => void recargarRevision()} onRecargar={recargarTodo} />
      ) : actual === 'pago' ? (
        <SeccionPago periodo={det} acciones={acciones} personas={personas} onRecargar={recargarTodo} />
      ) : (
        <SeccionColillas periodo={det} personas={personas} />
      )}

      {principal ? (
        <div className="flex flex-col gap-2 lg:hidden">
          <button
            type="button"
            className={clasesBoton({ variante: 'primario', tamano: 'md', className: 'w-full' })}
            disabled={!acciones[principal].habilitada || ocupado !== null}
            onClick={accionPrincipal}
          >
            {etiquetaPrincipal[principal]}
          </button>
          {acciones[principal].motivo ? <p className="text-center text-[13px] text-fg-secondary">{motivo(acciones[principal])}</p> : null}
        </div>
      ) : null}

      <ConfirmDialog
        abierto={confirmar === 'cerrar'}
        onAbiertoChange={(v) => !v && setConfirmar(null)}
        tono="peligro"
        icono={Lock}
        titulo={t('confirmarCierre.titulo', { nombre: titulo })}
        descripcion={t('confirmarCierre.descripcion', { neto: dinero(p?.total_net), n: p?.total_employees ?? 0 })}
        textoConfirmar={t('confirmarCierre.confirmar')}
        cargando={ocupado === 'cerrar'}
        onConfirmar={async () => {
          await correr('cerrar', () => cerrarPeriodo(id), t('cerradoOk'));
          setConfirmar(null);
        }}
      >
        <ul className="list-disc space-y-1 pl-5 text-[13px] leading-[18px] text-fg-secondary">
          <li>{t('confirmarCierre.c1')}</li>
          <li>{t('confirmarCierre.c2')}</li>
          <li>{t('confirmarCierre.c3')}</li>
        </ul>
      </ConfirmDialog>

      <ConfirmDialog
        abierto={confirmar === 'eliminar'}
        onAbiertoChange={(v) => !v && setConfirmar(null)}
        tono="peligro"
        icono={Trash2}
        titulo={tn('periodos.eliminar.titulo')}
        descripcion={tn('periodos.eliminar.descripcion', { nombre: titulo })}
        textoConfirmar={tn('periodos.eliminar.confirmar')}
        cargando={ocupado === 'eliminar'}
        onConfirmar={async () => {
          setOcupado('eliminar');
          try {
            await eliminarPeriodo(id);
            toast.success(tn('periodos.eliminar.hecho'));
            router.push(RUTA_NOMINA);
          } catch (e) {
            toast.error(mensajeError(codigoDeError(e)));
          } finally {
            setOcupado(null);
            setConfirmar(null);
          }
        }}
      />

      <DialogoAjuste
        abierto={ajuste !== null}
        vinculoInicial={ajuste?.vinculo ?? null}
        onAbiertoChange={(v) => !v && setAjuste(null)}
        periodoId={id}
        colillas={datos?.colillas ?? []}
        onHecho={recargarTodo}
      />
      <DialogoNominaApagada abierto={apagada} onAbiertoChange={setApagada} />
    </div>
  );
}
