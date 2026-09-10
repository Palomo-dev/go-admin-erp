'use client';

/**
 * Shell con pestañas de Configuración › CRM (`/app/configuracion?modulo=crm`).
 *
 * - General: el panel existente (canales, etiquetas, llaves API, verticales…).
 * - Proveedores e IA: registry por organización (F0).
 * - Créditos y sistema: saldos, consumo, precios y cola (F0).
 * - Email: dominios + DNS + verificar, remitentes, política y firma (F7).
 * Las pestañas Telefonía / WhatsApp las añaden F3 / F16 cuando tengan
 * contenido funcional (sin placeholders, tester-F00 #16).
 *
 * Pestaña activa en `?tab=` (general | proveedores | email | creditos).
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Coins, Mail, MessageCircle, Phone, Settings2, Sparkles } from 'lucide-react';
import { CRMConfigPanel } from './CRMConfigPanel';
import { ProveedoresTab } from '@/components/configuracion/crm/ProveedoresTab';
import { CreditosTab } from '@/components/configuracion/crm/CreditosTab';
import { TelefoniaTab } from '@/components/configuracion/crm/TelefoniaTab';
import { EmailTab } from '@/components/configuracion/crm/EmailTab'; // F7
import { WhatsAppTab } from '@/components/configuracion/crm/WhatsAppTab'; // F16

export type CrmConfigTab = 'general' | 'telefonia' | 'proveedores' | 'email' | 'whatsapp' | 'creditos';

const TABS: { id: CrmConfigTab; label: string; icon: typeof Settings2 }[] = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'telefonia', label: 'Telefonía', icon: Phone },
  { id: 'proveedores', label: 'Proveedores e IA', icon: Sparkles },
  { id: 'email', label: 'Email', icon: Mail }, // F7
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle }, // F16
  { id: 'creditos', label: 'Créditos y sistema', icon: Coins },
];

export function CrmConfigTabs({ initialTab }: { initialTab?: CrmConfigTab }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const active = useMemo<CrmConfigTab>(() => {
    const param = searchParams?.get('tab');
    if (param && TABS.some((t) => t.id === param)) return param as CrmConfigTab;
    return initialTab ?? 'general';
  }, [searchParams, initialTab]);

  const setTab = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set('tab', value);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  return (
    <Tabs value={active} onValueChange={setTab} className="space-y-6">
      <TabsList aria-label="Secciones de configuración del CRM" className="flex h-auto w-full flex-wrap justify-start gap-1">
        {TABS.map((t) => (
          <TabsTrigger key={t.id} value={t.id} className="gap-1.5">
            <t.icon className="h-4 w-4" aria-hidden="true" />
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="general" className="focus-visible:outline-none">
        <CRMConfigPanel />
      </TabsContent>
      <TabsContent value="telefonia" className="focus-visible:outline-none">
        <TelefoniaTab />
      </TabsContent>
      <TabsContent value="proveedores" className="focus-visible:outline-none">
        <ProveedoresTab />
      </TabsContent>
      <TabsContent value="email" className="focus-visible:outline-none">
        <EmailTab />
      </TabsContent>
      <TabsContent value="creditos" className="focus-visible:outline-none">
        <CreditosTab />
      </TabsContent>
      <TabsContent value="whatsapp" className="focus-visible:outline-none">
        <WhatsAppTab />
      </TabsContent>
    </Tabs>
  );
}
