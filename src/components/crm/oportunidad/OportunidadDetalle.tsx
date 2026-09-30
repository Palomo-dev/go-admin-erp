'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link2, Pencil, Trophy, XCircle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/kit/PageHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { idPanel, idPestana, TabBar } from '@/components/kit/TabBar';
import { clasesBoton } from '@/components/kit/botonClases';
import { useEsEscritorio } from '@/components/kit/useEsEscritorio';
import { StageBar } from '@/components/crm/kit/StageBar';
import { OpportunityRowMenu } from '@/components/crm/kit/OpportunityRowMenu';
import { CustomerIdentityCard } from '@/components/crm/kit/CustomerIdentityCard';
import { CustomerLinkPicker } from '@/components/crm/kit/CustomerLinkPicker';
import { TONO_PRIORIDAD, temperaturaValida } from '@/components/crm/kit/opportunityCardLogica';
import { estadoOportunidad, TONO_ESTADO } from '@/components/crm/kit/drawerHeaderLogica';
import { AccionesRapidasCrm } from '@/components/crm/acciones/AccionesRapidasCrm';
import { buscarClientesCrm } from '@/components/crm/acciones/buscarClientes';
import { claveError } from '@/components/crm/acciones/apiCrm';
import { useCatalogosCrm } from '@/components/crm/acciones/useCatalogosCrm';
import { useOpportunityData } from '@/components/crm/pipeline/hooks/useOpportunityData';
import { ActividadTab } from '@/components/crm/pipeline/drawer/tabs/ActividadTab';
import { TareasTab } from '@/components/crm/pipeline/drawer/tabs/TareasTab';
import { NotasTab } from '@/components/crm/pipeline/drawer/tabs/NotasTab';
import { DocumentosTab } from '@/components/crm/pipeline/drawer/tabs/DocumentosTab';
import { IATab } from '@/components/crm/pipeline/drawer/tabs/IATab';
import { AnalyticsTab } from '@/components/crm/oportunidades/detail/AnalyticsTab';
import { ClosingTab } from '@/components/crm/oportunidades/detail/ClosingTab';
import { vincularCliente } from './apiOportunidades';
import { etapasDeOportunidad, permisosFila, permisosPantalla } from './oportunidadLogica';
import { cantidadLineas, lineasDesdeApi } from './lineasLogica';
import { useOportunidad } from './useOportunidad';
import { useAccionesOportunidad } from './useAccionesOportunidad';
import { MetricasOportunidad } from './MetricasOportunidad';
import { LineasResumen } from './LineasResumen';
import { ConexionesOportunidad } from './ConexionesOportunidad';

/**
 * Detalle de oportunidad (CRM ola 3B, plan §4.6; Figma 775:473076 Actividad,
 * 775:473990 Tareas, 775:474532 cargando, 775:474947 no encontrada,
 * 775:475356 sin permiso; móvil 776:*): cabecera con Editar, Marcar
 * perdida/ganada y «⋯», franja de 6 métricas, `StageBar` (flujo único de
 * etapa), acciones rápidas `Variant=detalle`, pestañas y, al lado, el
 * cliente (`CustomerIdentityCard`, «Vincular cliente» si no tiene) y
 * «Conexiones». Datos del servidor; escrituras por `/api/crm/**`.
 */
type Pestana = 'actividad' | 'tareas' | 'notas' | 'documentos' | 'lineas' | 'analisis' | 'cierre' | 'ia';
const PESTANAS: Pestana[] = ['actividad', 'tareas', 'notas', 'documentos', 'lineas', 'analisis', 'cierre', 'ia'];

export function OportunidadDetalle({ id }: { id: string }) {
  const t = useTranslations('crm.oportunidad.detalle');
  const tt = useTranslations('crm.kit.tarjeta');
  const tc = useTranslations('crm.kit.cabecera');
  const te = useTranslations('crm.accionesRapidas.errores');
  const router = useRouter();
  const escritorio = useEsEscritorio();
  const cat = useCatalogosCrm();
  const permisosP = permisosPantalla(cat.permisos);
  const { data: op, estado, recargar } = useOportunidad(id);
  const legado = useOpportunityData(id);
  const [pestana, setPestana] = useState<Pestana>('actividad');
  const [visitadas, setVisitadas] = useState<Set<Pestana>>(new Set(['actividad']));
  const [tareas, setTareas] = useState<number | null>(null);
  const [picker, setPicker] = useState(false);
  const [token, setToken] = useState(0);
  const etapas = op ? etapasDeOportunidad(cat.etapas.map((e) => ({ ...e, color: null })), op.pipeline_id) : [];
  const acciones = useAccionesOportunidad({ etapas, permisos: permisosP, usuarioId: cat.usuarioId, onVer: () => undefined, onCambio: () => setToken((n) => n + 1), onEliminada: () => router.push('/app/crm/oportunidades') });

  const migas = [{ etiqueta: t('migas.crm'), href: '/app/crm' }, { etiqueta: t('migas.oportunidades'), href: '/app/crm/oportunidades' }, { etiqueta: op?.name ?? '…' }];
  if (estado === 'noEncontrada' || estado === 'sinPermiso' || estado === 'error') {
    const variante = estado === 'sinPermiso' ? 'forbidden' : 'error';
    return (
      <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:p-6">
        <PageHeader titulo={t('titulo')} migas={migas} variante="detail" volverA="/app/crm/oportunidades" />
        <div className="rounded-xl border border-line bg-surface"><EmptyState variante={variante} titulo={t(`${estado}.titulo`)} descripcion={t(`${estado}.descripcion`)} accion={{ etiqueta: t('volver'), href: '/app/crm/oportunidades' }} onReintentar={estado === 'error' ? recargar : undefined} /></div>
      </div>
    );
  }
  if (!op) {
    return (
      <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:p-6" aria-busy="true">
        <PageHeader titulo={t('titulo')} migas={migas} variante="detail" volverA="/app/crm/oportunidades" cargando />
        <div className="h-24 animate-pulse rounded-xl bg-subtle" />
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]"><div className="h-96 animate-pulse rounded-xl bg-subtle" /><div className="h-64 animate-pulse rounded-xl bg-subtle" /></div>
      </div>
    );
  }

  const permisos = permisosFila(permisosP, cat.usuarioId, op);
  const est = estadoOportunidad(op.status);
  const temp = temperaturaValida(op.temperature);
  const ir = (x: Pestana) => { setPestana(x); setVisitadas((v) => new Set(v).add(x)); };
  const tabProps = legado.opportunity && legado.opportunity.id === op.id ? { opportunity: legado.opportunity, customer: legado.customer, data: legado } : null;
  const panel = (x: Pestana, contenido: React.ReactNode) => (
    <div key={x} role="tabpanel" id={idPanel('detalle-oportunidad', x)} aria-labelledby={idPestana('detalle-oportunidad', x)} hidden={pestana !== x}>{visitadas.has(x) ? contenido : null}</div>
  );
  const vincular = async (clienteId: string) => {
    try {
      await vincularCliente(op.id, clienteId);
      toast({ title: t('clienteVinculado') });
      setPicker(false);
    } catch (e) {
      toast({ title: t('errorVincular'), description: te(claveError(e)), variant: 'destructive' });
    }
  };

  return (
    <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:p-6">
      <PageHeader
        titulo={op.name}
        variante="detail"
        migas={migas}
        volverA="/app/crm/oportunidades"
        subtitulo={
          <span className="flex flex-wrap items-center gap-2">
            {op.customer_id ? <button type="button" onClick={() => router.push(`/app/clientes/${op.customer_id}`)} className="text-sm font-medium text-brand-deep hover:underline">{op.cliente?.full_name ?? op.cliente_nombre}</button> : <span className="text-sm text-fg-muted">{tt('sinCliente')}</span>}
            {op.etapa?.name && <Badge tono="marca" apariencia="contorno" tamano="sm">{op.etapa.name}</Badge>}
            {temp && <Badge tono={TONO_PRIORIDAD[temp]} tamano="sm">{tt(`prioridad.${temp}`)}</Badge>}
            {typeof op.score_total === 'number' && <Badge tono="informacion" apariencia="contorno" tamano="sm">{tt('score', { score: op.score_total })}</Badge>}
            <Badge tono={TONO_ESTADO[est]} apariencia="contorno" tamano="sm">{tc(`estado.${est}`)}</Badge>
            {op.es_lead && <Badge tono="neutro" apariencia="contorno" tamano="sm">{tt('lead')}</Badge>}
          </span>
        }
        acciones={
          <>
            {permisos.editar && <button type="button" onClick={() => router.push(`/app/crm/oportunidades/${op.id}/editar`)} className={clasesBoton({ variante: 'secundario' })}><Pencil aria-hidden="true" className="size-4" />{t('editar')}</button>}
            {permisos.cerrar && est === 'open' && <button type="button" onClick={() => acciones.flujo.perder(op)} className={clasesBoton({ variante: 'secundario' })}><XCircle aria-hidden="true" className="size-4" />{t('marcarPerdida')}</button>}
            {permisos.cerrar && est === 'open' && <button type="button" onClick={() => acciones.flujo.ganar(op)} className={clasesBoton()}><Trophy aria-hidden="true" className="size-4" />{t('marcarGanada')}</button>}
            <OpportunityRowMenu titulo={op.name} status={op.status} permisos={permisos} orientacion="horizontal" tamano="md" onAccion={(a) => (a === 'ver' ? undefined : acciones.alMenu(op, a))} />
          </>
        }
      />
      <MetricasOportunidad op={op} usuarios={cat.usuarios} lineas={cantidadLineas(lineasDesdeApi(op))} />
      <StageBar etapas={etapas} actualId={op.stage_id} layout={escritorio ? 'escritorio' : 'movil'} soloLectura={!permisos.editar} onElegir={(e) => acciones.flujo.solicitar(op, e.id)} onGanar={(e) => acciones.flujo.solicitar(op, e.id)} onPerder={(e) => acciones.flujo.solicitar(op, e.id)} onAbrirHoja={() => acciones.flujo.mover(op)} />
      <AccionesRapidasCrm variante="detalle" oportunidadId={op.id} oportunidadNombre={op.name} clienteId={op.customer_id} cliente={op.cliente ?? null} onAccionCompletada={() => setToken((n) => n + 1)} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-3">
          <TabBar id="detalle-oportunidad" etiqueta={t('pestanasAria')} valor={pestana} onValorChange={ir} pestanas={PESTANAS.map((x) => ({ valor: x, etiqueta: t(`pestanas.${x}`), contador: x === 'tareas' && tareas !== null ? tareas : x === 'lineas' ? cantidadLineas(lineasDesdeApi(op)) : undefined }))} />
          <div className="rounded-xl border border-line bg-surface p-4">
            {panel('lineas', <LineasResumen op={op} />)}
            {!tabProps ? <div className="h-40 animate-pulse rounded-lg bg-subtle" aria-busy="true" /> : (
              <>
                {panel('actividad', <ActividadTab {...tabProps} active={visitadas.has('actividad')} compact={false} refreshToken={token} />)}
                {panel('tareas', <TareasTab {...tabProps} active={visitadas.has('tareas')} onCountChange={setTareas} />)}
                {panel('notas', <NotasTab {...tabProps} active={visitadas.has('notas')} />)}
                {panel('documentos', <DocumentosTab {...tabProps} active={visitadas.has('documentos')} />)}
                {panel('analisis', <AnalyticsTab opportunity={tabProps.opportunity} displayAmount={Number(op.amount) || 0} active={visitadas.has('analisis')} />)}
                {panel('cierre', <ClosingTab opportunity={tabProps.opportunity} customer={tabProps.customer} active={visitadas.has('cierre')} onActivity={() => setToken((n) => n + 1)} />)}
                {panel('ia', <IATab {...tabProps} active={visitadas.has('ia')} />)}
              </>
            )}
          </div>
        </div>
        <aside className="flex flex-col gap-4">
          {op.cliente ? (
            <CustomerIdentityCard cliente={op.cliente} onAbrirCliente={(c) => router.push(`/app/clientes/${c}`)} />
          ) : (
            <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-line-strong p-4">
              <p className="text-sm text-fg-secondary">{t('sinCliente')}</p>
              {permisos.editar && <button type="button" onClick={() => setPicker(true)} className={clasesBoton({ variante: 'secundario' })}><Link2 aria-hidden="true" className="size-4" />{t('vincularCliente')}</button>}
            </div>
          )}
          <ConexionesOportunidad op={op} tareasAbiertas={tareas} />
        </aside>
      </div>
      <CustomerLinkPicker abierto={picker} onAbiertoChange={setPicker} buscar={buscarClientesCrm} onSeleccionar={(c) => void vincular(c.id)} />
      {acciones.dialogos}
    </div>
  );
}
