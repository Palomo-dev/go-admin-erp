'use client';

/**
 * /app/crm/plantillas — pestañas por canal. Email (F7) y WhatsApp (F16:
 * `@/components/crm/whatsapp/WhatsAppTemplatesTab`, cargado con next/dynamic
 * para no arrastrar su bundle en la pestaña de email). Pestaña activa en
 * `?tab=` (email | whatsapp).
 */

import { useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Mail, MessageCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TabErrorBoundary } from './TabErrorBoundary';
import { TemplateList } from './TemplateList';

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
const TABS: { id: Tab; label: string; icon: typeof Mail }[] = [
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
];

export function PlantillasPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const active = useMemo<Tab>(() => {
    const p = searchParams?.get('tab');
    return p === 'whatsapp' ? 'whatsapp' : 'email';
  }, [searchParams]);

  const setTab = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('tab', value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, router, pathname]);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Plantillas</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Correos y mensajes reutilizables con variables del CRM.</p>
      </div>
      <Tabs value={active} onValueChange={setTab} className="space-y-4">
        <TabsList aria-label="Canal de plantillas">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="gap-1.5">
              <t.icon className="h-4 w-4" aria-hidden="true" /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="email" className="focus-visible:outline-none">
          <TabErrorBoundary label="Email"><TemplateList /></TabErrorBoundary>
        </TabsContent>
        <TabsContent value="whatsapp" className="focus-visible:outline-none">
          {/* Doble red: el `.catch()` del dynamic cubre el fallo de import y el
              límite de error cubre un throw en tiempo de render (tester r2 #11). */}
          <TabErrorBoundary label="WhatsApp" fallback={<WhatsAppTabUnavailable />}><WhatsAppTemplatesTab /></TabErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
