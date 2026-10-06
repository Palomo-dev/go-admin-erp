'use client';

/**
 * /app/crm/plantillas — pestañas por canal. Email (F7) y WhatsApp (F16:
 * `@/components/crm/whatsapp/WhatsAppTemplatesTab`, cargado con next/dynamic
 * para no arrastrar su bundle en la pestaña de email). Cada canal es una
 * SECCIÓN → `TabBar` del kit con `?pestana=` (regla de pestañas 2026-10-06);
 * los enlaces viejos con `?tab=whatsapp` siguen abriendo WhatsApp.
 */

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';
import { PageHeader } from '@/components/kit/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { idPanel, idPestana, TabBar } from '@/components/kit/TabBar';
import { useParametrosUrl } from '@/components/kit/useParametroUrl';
import { TabErrorBoundary } from './TabErrorBoundary';
import { TemplateList } from './TemplateList';
import { SincronizarMeta } from './SincronizarMeta';

/**
 * Fallback real de error (tester r1 #11): `loading` de next/dynamic es el
 * estado de carga, no el de error. Si F16 renombra el export o el chunk no
 * carga, la pestaña degrada con un aviso en vez de tumbar toda la página.
 */
function WhatsAppTabUnavailable() {
  return (
    <div
      role="alert"
      className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <p className="font-medium">No se pudieron cargar las plantillas de WhatsApp</p>
      <p className="mt-1">
        Vuelve a intentarlo recargando la página. Si el problema continúa, revisa la configuración del canal de WhatsApp
        en Configuración → CRM → WhatsApp.
      </p>
    </div>
  );
}

const WhatsAppTemplatesTab = dynamic(
  () =>
    import('@/components/crm/whatsapp/WhatsAppTemplatesTab')
      .then((m) => m.WhatsAppTemplatesTab ?? WhatsAppTabUnavailable)
      .catch((err) => {
        console.error('[plantillas] WhatsAppTemplatesTab no disponible', err);
        return WhatsAppTabUnavailable;
      }),
  { ssr: false, loading: () => <Skeleton className="h-40 w-full" /> },
);

type Tab = 'email' | 'whatsapp';
const TABS: { id: Tab; label: string }[] = [
  { id: 'email', label: 'Email' },
  { id: 'whatsapp', label: 'WhatsApp' },
];

/** `?pestana=` (regla nueva) o `?tab=` (enlaces de antes); por defecto, Email. */
export function canalPlantillasDeUrl(pestana: string | null, tab: string | null): Tab {
  return (pestana ?? tab) === 'whatsapp' ? 'whatsapp' : 'email';
}

export function PlantillasPage() {
  const url = useParametrosUrl();
  const active = canalPlantillasDeUrl(url.leer('pestana'), url.leer('tab'));
  const setTab = (value: Tab) => url.fijar({ pestana: value === 'email' ? null : value, tab: null });
  const t = useTranslations('crm.plantillas');

  return (
    <div className="space-y-4 p-4">
      {/* «Sincronizar con Meta» va en la cabecera de la pestaña WhatsApp; en móvil
          (el PageHeader no se dibuja bajo lg) se repite bajo las pestañas. */}
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={FileText}
        acciones={active === 'whatsapp' ? <SincronizarMeta /> : undefined}
      />
      <TabBar id="plantillas" etiqueta="Canal de plantillas" valor={active} onValorChange={setTab} pestanas={TABS.map((t) => ({ valor: t.id, etiqueta: t.label }))} />
      {active === 'whatsapp' && (
        <div className="flex justify-end lg:hidden">
          <SincronizarMeta />
        </div>
      )}
      <div role="tabpanel" id={idPanel('plantillas', active)} aria-labelledby={idPestana('plantillas', active)}>
        {active === 'email' ? (
          <TabErrorBoundary label="Email"><TemplateList /></TabErrorBoundary>
        ) : (
          // Doble red: el `.catch()` del dynamic cubre el fallo de import y el
          // límite de error cubre un throw en tiempo de render (tester r2 #11).
          <TabErrorBoundary label="WhatsApp" fallback={<WhatsAppTabUnavailable />}><WhatsAppTemplatesTab /></TabErrorBoundary>
        )}
      </div>
    </div>
  );
}
