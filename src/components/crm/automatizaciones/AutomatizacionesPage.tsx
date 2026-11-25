'use client';

/**
 * /app/crm/automatizaciones — listado de reglas (Figma CRM 1373:17 «Listado —
 * listo», 1379:1336 vacío, 1379:1891 cargando, 1379:2446 error).
 *
 * KPIs de 7 días (`/api/crm/automation-runs/resumen`), buscador con chips
 * Todas · Activas · Pausadas · Con error y tabla Regla · Cuando · Acciones ·
 * Última ejecución · Ejecuciones · Activa. La fila abre el constructor
 * (`/app/crm/automatizaciones/[id]`). El navegador nunca escribe
 * `automation_rules`: todo pasa por `/api/crm/automation-rules/**`.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FlaskConical, History, Pencil, Plus, RefreshCw, Trash2, WandSparkles, Zap } from 'lucide-react';
import { PageHeader } from '@/components/kit/PageHeader';
import { KpiStrip } from '@/components/kit/KpiStrip';
import { StatCard } from '@/components/kit/StatCard';
import { SearchInput } from '@/components/kit/SearchInput';
import { ChipsOpcion } from '@/components/kit/ChipsOpcion';
import { DataTable, type ColumnaTabla, type EstadoTabla } from '@/components/kit/DataTable';
import { EmptyState } from '@/components/kit/EmptyState';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import { ConfirmDialog } from '@/components/kit/ConfirmDialog';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import type { AccionFila } from '@/components/kit/acciones';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import {
  FILTROS_REGLAS,
  contarActivas,
  filtrarReglas,
  reglaConError,
  tieneAccionesDeEnvio,
  variacionPorcentual,
  type FiltroReglas,
} from '@/lib/services/crm/automation/automationListaLogica';
import type { ClavePlantillaRegla } from '@/lib/services/crm/automation/ruleTemplates';
import { useAutomationRules, type AutomationRuleView } from './useAutomationRules';
import { useResumenAutomatizaciones } from './useResumenAutomatizaciones';
import { CeldaAcciones, CeldaCuando, useFechaCorta } from './celdasRegla';
import { DialogoPlantillasRegla, TarjetasPlantillaRegla, usePayloadPlantilla } from './PlantillasRegla';

const BASE = '/app/crm/automatizaciones';

export function AutomatizacionesPage() {
  const t = useTranslations('crm.automatizaciones.lista');
  const tBase = useTranslations('crm.automatizaciones');
  const router = useRouter();
  const entero = useFormatoEntero();
  const fechaCorta = useFechaCorta();
  const payloadPlantilla = usePayloadPlantilla();
  const { rules, loading, loaded, error, errorStatus, canManage, reload, save, toggle, remove } = useAutomationRules();
  const { resumen, cargando: cargandoResumen, fallo: falloResumen, recargar: recargarResumen } = useResumenAutomatizaciones();

  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<FiltroReglas>('todas');
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [confirmarEnvio, setConfirmarEnvio] = useState<AutomationRuleView | null>(null);
  const [borrar, setBorrar] = useState<AutomationRuleView | null>(null);
  const [dialogoPlantillas, setDialogoPlantillas] = useState(false);
  const [creando, setCreando] = useState<ClavePlantillaRegla | null>(null);

  const filas = useMemo(() => filtrarReglas(rules, busqueda, filtro, resumen.ultimoEstado), [rules, busqueda, filtro, resumen.ultimoEstado]);
  const sinPermiso = canManage === false || errorStatus === 403 || errorStatus === 401;

  const estado: EstadoTabla = sinPermiso
    ? 'sinPermiso'
    : loading
      ? 'cargando'
      : error && !loaded
        ? 'error'
        : rules.length === 0
          ? 'vacio'
          : filas.length === 0
            ? 'sinResultados'
            : 'listo';

  const recargar = () => {
    void reload();
    void recargarResumen();
  };

  const cambiarActiva = async (rule: AutomationRuleView) => {
    setCambiando(rule.id);
    try {
      await toggle(rule);
      toast({ title: rule.is_active ? t('toast.pausada', { nombre: rule.name }) : t('toast.activada', { nombre: rule.name }) });
    } catch (e) {
      toast({ title: t('toast.noCambio'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setCambiando(null);
    }
  };

  // «El interruptor pide confirmación si la regla tiene acciones de envío» (anotación 1373:1160).
  const alInterruptor = (rule: AutomationRuleView) => {
    if (!rule.is_active && tieneAccionesDeEnvio(rule.actions)) setConfirmarEnvio(rule);
    else void cambiarActiva(rule);
  };

  const usarPlantilla = async (clave: ClavePlantillaRegla) => {
    setCreando(clave);
    try {
      const fila = await save(payloadPlantilla(clave) as unknown as Partial<AutomationRuleView>);
      toast({ title: t('toast.plantillaCreada') });
      setDialogoPlantillas(false);
      router.push(`${BASE}/${fila.id}`);
    } catch (e) {
      toast({ title: t('toast.noPlantilla'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setCreando(null);
    }
  };

  const eliminar = async () => {
    if (!borrar) return;
    try {
      await remove(borrar.id);
      toast({ title: t('toast.eliminada', { nombre: borrar.name }) });
    } catch (e) {
      toast({ title: t('toast.noEliminada'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const subtitulo = (r: AutomationRuleView) => {
    const ultimo = resumen.ultimoEstado[r.id];
    if (ultimo?.status === 'failed') {
      return <span className="text-danger-text">{t('subtituloError', { error: (ultimo.error_message ?? '').slice(0, 80) || t('errorSinDetalle') })}</span>;
    }
    if (r.description) return r.description;
    const partes: string[] = [];
    if (r.trigger_config?.solo_horario_ley2300 === true) partes.push(t('limites.ley2300'));
    if (r.run_once_per_opportunity) partes.push(t('limites.unaVez'));
    if (r.cooldown_hours > 0) partes.push(t('limites.enfriamiento', { horas: r.cooldown_hours }));
    return partes.join(' · ');
  };

  const nombre = (r: AutomationRuleView) => (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-fg">{r.name}</p>
      <p className="truncate text-xs text-fg-secondary">{subtitulo(r)}</p>
    </div>
  );

  const interruptor = (r: AutomationRuleView) => (
    // El clic en el interruptor no abre la fila.
    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="inline-flex">
      <Switch
        id={`rule-active-${r.id}`}
        checked={r.is_active}
        disabled={cambiando === r.id || canManage === false}
        aria-label={t('activaDe', { nombre: r.name })}
        onCheckedChange={() => alInterruptor(r)}
      />
    </span>
  );

  const ultima = (r: AutomationRuleView) =>
    r.last_run_at ? <span className="text-[13px] text-fg">{fechaCorta(r.last_run_at)}</span> : <span className="text-[13px] text-fg-muted">{t('nunca')}</span>;

  const columnas: ColumnaTabla<AutomationRuleView>[] = [
    { id: 'regla', encabezado: t('columnas.regla'), celda: nombre },
    { id: 'cuando', encabezado: t('columnas.cuando'), celda: (r) => <CeldaCuando rule={r} />, ocultarDebajo: 'md' },
    { id: 'acciones', encabezado: t('columnas.acciones'), celda: (r) => <CeldaAcciones actions={r.actions} conError={reglaConError(r.id, resumen.ultimoEstado)} />, ocultarDebajo: 'lg' },
    { id: 'ultima', encabezado: t('columnas.ultima'), celda: ultima, ocultarDebajo: 'xl' },
    { id: 'ejecuciones', encabezado: t('columnas.ejecuciones'), celda: (r) => <span className="text-[13px] tabular-nums text-fg">{entero(r.runs_count ?? 0)}</span>, ancho: 110 },
    { id: 'activa', encabezado: t('columnas.activa'), celda: interruptor, ancho: 80 },
  ];

  const accionesFila = (r: AutomationRuleView): AccionFila[] => [
    { id: 'editar', etiqueta: t('menu.editar'), icono: Pencil, onSelect: () => router.push(`${BASE}/${r.id}`) },
    { id: 'seco', etiqueta: t('menu.probar'), icono: FlaskConical, onSelect: () => router.push(`${BASE}/${r.id}?prueba=1`) },
    { id: 'historial', etiqueta: t('menu.historial'), icono: History, onSelect: () => router.push(`${BASE}/historial?regla=${r.id}`) },
    { id: 'eliminar', etiqueta: t('menu.eliminar'), icono: Trash2, destructiva: true, oculta: canManage === false, onSelect: () => setBorrar(r) },
  ];

  const menuCabecera: AccionFila[] = [
    { id: 'historial', etiqueta: t('menu.historialTodo'), icono: History, onSelect: () => router.push(`${BASE}/historial`) },
    { id: 'actualizar', etiqueta: t('menu.actualizar'), icono: RefreshCw, onSelect: recargar },
  ];

  const nueva = (
    <Link href={`${BASE}/nueva`} className={clasesBoton({ variante: 'primario' })}>
      <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('nueva')}
    </Link>
  );

  const variacion = variacionPorcentual(resumen.ejecuciones, resumen.ejecucionesPrevias);
  const sinCifra = falloResumen ? '—' : undefined;
  const mostrarKpis = !sinPermiso && estado !== 'error' && estado !== 'vacio';
  const mostrarFiltros = !sinPermiso && estado !== 'vacio';

  return (
    <div className="min-h-screen space-y-4 bg-canvas p-4 sm:p-6">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={Zap}
        migas={[{ etiqueta: t('migas.crm'), href: '/app/crm' }, { etiqueta: t('titulo') }]}
        acciones={
          sinPermiso ? undefined : (
            <>
              <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => setDialogoPlantillas(true)}>
                <WandSparkles aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('desdePlantilla')}
              </button>
              {nueva}
              <RowActionsMenu acciones={menuCabecera} orientacion="horizontal" tamano="md" titulo={t('titulo')} />
            </>
          )
        }
        movil={sinPermiso ? {} : { accion: nueva }}
      />

      {/* R-2: si la recarga falla tras una carga buena, la tabla sigue con la última lista conocida y se dice. */}
      {error && loaded && !sinPermiso && (
        <AvisoTonal
          tono="advertencia"
          rol="alert"
          titulo={tBase('automatizacionesPage.noPudoActualizarLista')}
          descripcion={loaded ? tBase('automatizacionesPage.muestraUltimaListaConocida') : undefined}
          accion={{ etiqueta: t('reintentar'), onClick: recargar }}
        />
      )}

      {mostrarKpis && (
        <KpiStrip columnas={4} etiqueta={t('kpi.etiqueta')}>
          <StatCard
            etiqueta={t('kpi.activas')}
            cargando={loading}
            valor={t('kpi.activasValor', { activas: entero(contarActivas(rules)), total: entero(rules.length) })}
          />
          <StatCard
            etiqueta={t('kpi.ejecuciones')}
            cargando={cargandoResumen}
            valor={sinCifra ?? entero(resumen.ejecuciones)}
            detalle={falloResumen ? undefined : variacion === null ? t('kpi.sinComparar') : t('kpi.variacion', { pct: `${variacion > 0 ? '+' : ''}${variacion}` })}
          />
          <StatCard
            etiqueta={t('kpi.omitidas')}
            cargando={cargandoResumen}
            valor={sinCifra ?? entero(resumen.omitidas)}
            detalle={t('kpi.omitidasDetalle')}
          />
          <StatCard
            etiqueta={t('kpi.conError')}
            cargando={cargandoResumen}
            valor={sinCifra ?? entero(resumen.errores)}
            detalle={resumen.errores > 0 ? t('kpi.revisaHistorial') : t('kpi.sinErrores')}
            tono={resumen.errores > 0 ? 'peligro' : 'neutro'}
            tendencia={resumen.errores > 0 ? 'baja' : undefined}
            href={resumen.errores > 0 ? `${BASE}/historial?resultado=conError` : undefined}
          />
        </KpiStrip>
      )}

      {mostrarFiltros && (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput className="w-full lg:flex-1" value={busqueda} onChange={setBusqueda} onValueChange={setBusqueda} etiqueta={t('buscar')} placeholder={t('buscar')} />
          <ChipsOpcion<FiltroReglas>
            etiqueta={t('filtros.etiqueta')}
            valor={filtro}
            onValorChange={setFiltro}
            opciones={FILTROS_REGLAS.map((f) => ({ valor: f, etiqueta: t(`filtros.${f}`) }))}
          />
        </div>
      )}

      {estado === 'vacio' ? (
        <section className="flex flex-col items-center gap-6 rounded-xl border border-line bg-surface px-4 pb-12">
          <EmptyState icono={Zap} titulo={t('vacio.titulo')} descripcion={t('vacio.descripcion')} />
          <TarjetasPlantillaRegla ocupada={creando} deshabilitadas={canManage === false} onUsar={(c) => void usarPlantilla(c)} />
        </section>
      ) : (
        <DataTable
          columnas={columnas}
          filas={estado === 'listo' ? filas : []}
          obtenerId={(r) => r.id}
          etiqueta={t('titulo')}
          estado={estado}
          onFilaClick={(r) => router.push(`${BASE}/${r.id}`)}
          etiquetaFila={(r) => r.name}
          acciones={accionesFila}
          tarjetaMovil={(r) => (
            <div className="space-y-2 p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">{nombre(r)}</div>
                {interruptor(r)}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <CeldaCuando rule={r} />
                <CeldaAcciones actions={r.actions} conError={reglaConError(r.id, resumen.ultimoEstado)} />
              </div>
              <p className={cn('text-xs', r.last_run_at ? 'text-fg-secondary' : 'text-fg-muted')}>
                {t('movil.ultima', { fecha: r.last_run_at ? fechaCorta(r.last_run_at) : t('nunca'), n: entero(r.runs_count ?? 0) })}
              </p>
            </div>
          )}
          termino={busqueda.trim() || undefined}
          sinResultados={{ titulo: t('sinResultados.titulo'), descripcion: t('sinResultados.descripcion') }}
          error={{ titulo: t('error.titulo'), descripcion: t('error.descripcion') }}
          sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
          onReintentar={recargar}
          onLimpiarFiltros={() => {
            setBusqueda('');
            setFiltro('todas');
          }}
          filasEsqueleto={6}
        />
      )}

      <DialogoPlantillasRegla abierto={dialogoPlantillas} onAbiertoChange={setDialogoPlantillas} ocupada={creando} onUsar={(c) => void usarPlantilla(c)} />

      <ConfirmDialog
        abierto={confirmarEnvio !== null}
        onAbiertoChange={(a) => { if (!a) setConfirmarEnvio(null); }}
        titulo={t('confirmarEnvio.titulo')}
        descripcion={t('confirmarEnvio.descripcion', { nombre: confirmarEnvio?.name ?? '' })}
        textoConfirmar={t('confirmarEnvio.activar')}
        tono="advertencia"
        onConfirmar={async () => {
          if (confirmarEnvio) await cambiarActiva(confirmarEnvio);
          setConfirmarEnvio(null);
        }}
      />

      <ConfirmDialog
        abierto={borrar !== null}
        onAbiertoChange={(a) => { if (!a) setBorrar(null); }}
        titulo={t('eliminar.titulo')}
        descripcion={t('eliminar.descripcion', { nombre: borrar?.name ?? '' })}
        textoConfirmar={t('eliminar.confirmar')}
        tono="peligro"
        onConfirmar={async () => {
          await eliminar();
          setBorrar(null);
        }}
      />
    </div>
  );
}
