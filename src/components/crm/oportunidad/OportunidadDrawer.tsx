'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { X } from 'lucide-react';
import { EmptyState } from '@/components/kit/EmptyState';
import { idPanel, idPestana, TabBar } from '@/components/kit/TabBar';
import { useEsEscritorio } from '@/components/kit/useEsEscritorio';
import { OpportunityDrawerHeader } from '@/components/crm/kit/OpportunityDrawerHeader';
import { OpportunityRowMenu } from '@/components/crm/kit/OpportunityRowMenu';
import { estadoAccionesRapidas } from '@/components/crm/kit/quickActionLogica';
import type { OpcionUsuario } from '@/components/crm/kit/camposCrm';
import { nombreUsuario } from '@/components/crm/acciones/catalogosCrmLogica';
import { useOrgDefaultCountry } from '@/components/crm/shared/useOrgDefaultCountry';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { isOnboardingOpportunity } from '@/lib/services/crm/onboardingProgress';
import { useOpportunityData } from '@/components/crm/pipeline/hooks/useOpportunityData';
import { ActividadTab } from '@/components/crm/pipeline/drawer/tabs/ActividadTab';
import { TareasTab } from '@/components/crm/pipeline/drawer/tabs/TareasTab';
import { NotasTab } from '@/components/crm/pipeline/drawer/tabs/NotasTab';
import { DocumentosTab } from '@/components/crm/pipeline/drawer/tabs/DocumentosTab';
import { IATab } from '@/components/crm/pipeline/drawer/tabs/IATab';
import { OnboardingTab } from '@/components/crm/pipeline/drawer/tabs/OnboardingTab';
import { etapasDeOportunidad, permisosFila, type EtapaApi, type PermisosPantalla } from './oportunidadLogica';
import { useOportunidad } from './useOportunidad';
import { useConteosPestanas } from './pestanas/useConteosPestanas';
import { ResumenOportunidad } from './ResumenOportunidad';
import type { useAccionesOportunidad } from './useAccionesOportunidad';

/**
 * Drawer de oportunidad desde el kanban (CRM ola 3B, plan §4.5; Figma
 * 776:30540, 820:* Resumen/Actividad, 822:* Tareas/Notas/Documentos/IA/
 * Onboarding/menú, 823:* estados, 824:* móvil). Cabecera del kit con
 * probabilidad, responsable, días en etapa y `StageBar` clicable (el flujo
 * único de etapa), acciones rápidas y «⋯»; cabecera compacta al desplazar.
 * Las pestañas no se desmontan al cambiar (se montan la primera vez que se
 * abren). Datos del servidor (`GET /api/crm/opportunities/[id]`).
 */
type Pestana = 'resumen' | 'onboarding' | 'actividad' | 'tareas' | 'notas' | 'documentos' | 'ia';

export interface OportunidadDrawerProps {
  id: string | null;
  onCerrar: () => void;
  etapas: readonly EtapaApi[];
  usuarios: readonly OpcionUsuario[];
  usuarioId: string | null;
  permisos: PermisosPantalla;
  acciones: ReturnType<typeof useAccionesOportunidad>;
}

export function OportunidadDrawer(p: OportunidadDrawerProps) {
  const t = useTranslations('crm.oportunidad.drawer');
  const router = useRouter();
  const escritorio = useEsEscritorio();
  const moneda = useMonedaOrganizacion();
  const pais = useOrgDefaultCountry() ?? undefined;
  const { data: op, estado, recargar } = useOportunidad(p.id);
  const { conteos, fijar } = useConteosPestanas(p.id);
  const legado = useOpportunityData(p.id);
  const [pestana, setPestana] = useState<Pestana>('resumen');
  const [visitadas, setVisitadas] = useState<Set<Pestana>>(new Set(['resumen']));
  const [compacta, setCompacta] = useState(false);
  useEffect(() => {
    setPestana('resumen');
    setVisitadas(new Set(['resumen']));
    setCompacta(false);
  }, [p.id]);

  const ir = (x: Pestana) => {
    setPestana(x);
    setVisitadas((v) => new Set(v).add(x));
  };
  const etapas = op ? etapasDeOportunidad(p.etapas, op.pipeline_id) : [];
  const permisos = op ? permisosFila(p.permisos, p.usuarioId, op) : {};
  const conOnboarding = isOnboardingOpportunity(op ? { metadata: op.metadata, pipeline: op.pipeline ?? null } : null);
  const pestanas: Pestana[] = ['resumen', ...(conOnboarding ? (['onboarding'] as const) : []), 'actividad', 'tareas', 'notas', 'documentos', 'ia'];
  const legadoListo = legado.opportunity && op && legado.opportunity.id === op.id;
  const tabProps = legadoListo ? { opportunity: legado.opportunity!, customer: legado.customer, data: legado } : null;
  const panel = (x: Pestana, contenido: React.ReactNode) => (
    <div key={x} role="tabpanel" id={idPanel('drawer-oportunidad', x)} aria-labelledby={idPestana('drawer-oportunidad', x)} hidden={pestana !== x}>
      {visitadas.has(x) ? contenido : null}
    </div>
  );

  return (
    <Sheet open={!!p.id} onOpenChange={(a) => !a && p.onCerrar()}>
      <SheetContent side="right" hideCloseButton className="flex h-dvh w-full flex-col gap-0 border-line bg-canvas p-0 text-fg sm:max-w-3xl">
        {estado === 'cargando' || (!op && estado === 'listo') ? (
          <div className="flex flex-col gap-4 p-5" aria-busy="true">
            <SheetTitle className="sr-only">{t('cargando')}</SheetTitle>
            <SheetDescription className="sr-only">{t('cargando')}</SheetDescription>
            {[40, 16, 64, 200].map((h, i) => <div key={i} className="animate-pulse rounded-lg bg-subtle" style={{ height: h }} />)}
          </div>
        ) : estado !== 'listo' || !op ? (
          <div className="flex h-full flex-col">
            {/* Figma 823:245319: un solo estado para «no encontrada o sin acceso», con Reintentar. */}
            <div className="flex h-14 items-center justify-between border-b border-line bg-surface px-4">
              <SheetTitle className="text-base font-semibold text-fg">{t('titulo')}</SheetTitle>
              <button type="button" onClick={p.onCerrar} aria-label={t('cerrar')} className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><X aria-hidden="true" className="size-4" /></button>
            </div>
            <SheetDescription className="sr-only">{t('errorTitulo')}</SheetDescription>
            <EmptyState variante="error" className="flex-1" titulo={t('errorTitulo')} descripcion={t('errorDetalle')} onReintentar={recargar} />
          </div>
        ) : (
          <>
            <SheetTitle className="sr-only">{op.name}</SheetTitle>
            <SheetDescription className="sr-only">{t('descripcion')}</SheetDescription>
            <div className="border-b border-line bg-surface px-5 pb-0 pt-4">
              <OpportunityDrawerHeader
                oportunidad={{ ...op, clienteNombre: op.cliente?.full_name ?? op.cliente_nombre ?? null, responsable: nombreUsuario(p.usuarios, op.salesperson_id) ? { nombre: nombreUsuario(p.usuarios, op.salesperson_id)! } : null, entroEtapaEn: op.entro_etapa_en }}
                moneda={moneda.paraDocumento(op.currency)}
                etapas={etapas}
                layout={compacta ? 'movilCompacta' : escritorio ? 'escritorio' : 'movil'}
                permisos={{ editar: permisos.editar, cerrar: permisos.cerrar }}
                estadosAcciones={estadoAccionesRapidas({ cliente: op.cliente ?? null, tieneDestino: true, paisPorDefecto: pais })}
                onAccion={(a) => p.acciones.alAccionRapida(op, a)}
                onElegirEtapa={(e) => p.acciones.flujo.solicitar(op, e.id)}
                onAbrirEtapas={() => p.acciones.flujo.mover(op)}
                onGanar={() => p.acciones.flujo.ganar(op)}
                onPerder={() => p.acciones.flujo.perder(op)}
                onReabrir={() => p.acciones.flujo.reabrir(op)}
                onEditar={() => router.push(`/app/crm/oportunidades/${op.id}/editar`)}
                onAbrirCliente={op.customer_id ? () => router.push(`/app/clientes/${op.customer_id}`) : undefined}
                onAbrirDetalle={() => router.push(`/app/crm/oportunidades/${op.id}`)}
                onCerrar={p.onCerrar}
                menu={<OpportunityRowMenu titulo={op.name} status={op.status} permisos={permisos} orientacion="horizontal" onAccion={(a) => (a === 'ver' ? router.push(`/app/crm/oportunidades/${op.id}`) : p.acciones.alMenu(op, a))} />}
              />
              <TabBar id="drawer-oportunidad" etiqueta={t('pestanasAria')} valor={pestana} onValorChange={ir} className="mt-3" pestanas={pestanas.map((x) => ({ valor: x, etiqueta: t(`pestanas.${x}`), contador: x === 'tareas' || x === 'notas' || x === 'documentos' ? conteos[x] ?? undefined : undefined }))} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5" onScroll={(e) => setCompacta(e.currentTarget.scrollTop > 120)}>
              {panel('resumen', <ResumenOportunidad op={op} puedeEditar={!!permisos.editar} onCambio={() => undefined} />)}
              {!tabProps && pestana !== 'resumen' ? <div className="h-40 animate-pulse rounded-xl bg-subtle" aria-busy="true" /> : tabProps && (
                <>
                  {conOnboarding && panel('onboarding', <OnboardingTab {...tabProps} active={visitadas.has('onboarding')} />)}
                  {panel('actividad', <ActividadTab {...tabProps} active={visitadas.has('actividad')} />)}
                  {panel('tareas', <TareasTab {...tabProps} active={visitadas.has('tareas')} onCountChange={fijar('tareas')} />)}
                  {panel('notas', <NotasTab {...tabProps} active={visitadas.has('notas')} onCountChange={fijar('notas')} />)}
                  {panel('documentos', <DocumentosTab {...tabProps} active={visitadas.has('documentos')} onCountChange={fijar('documentos')} />)}
                  {panel('ia', <IATab {...tabProps} active={visitadas.has('ia')} />)}
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
