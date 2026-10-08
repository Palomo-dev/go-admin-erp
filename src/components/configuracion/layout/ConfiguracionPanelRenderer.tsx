'use client';

/**
 * Componente de cada sección del registro (`configSectionsRegistry.ts`). Los
 * componentes son los de siempre de cada módulo: aquí solo se importan
 * (perezosos, para que abrir Configuración no cargue los dieciséis paneles).
 *
 * Solo lectura: si el servidor dice que la persona no puede editar, la
 * sección se pinta dentro de un `<fieldset disabled>` (los controles quedan
 * deshabilitados sin tocar cada panel) con su aviso. Las secciones con ajustes
 * de permisos distintos (`controlaLectura`) deciden ellas: sus rutas ya
 * responden `puedeEditar` o 403.
 */
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowUpRight, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import { AvisoTonal, clasesBoton } from '@/components/kit';
import type { SeccionConfig } from '../config/configSectionsRegistry';

function LoadingSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}

// next/dynamic exige las opciones como literal de objeto en CADA llamada (el compilador las
// analiza en estático): una constante compartida rompe `next build` («options must be an object literal»).

const PANELES: Record<string, React.ComponentType> = {
  'general.general': dynamic(() => import('../panels/general/GeneralConfigPanel').then((m) => m.GeneralConfigPanel), { loading: () => <LoadingSkeleton />, ssr: false }),
  'sitioweb.general': dynamic(() => import('../panels/sitioweb/WebsiteConfigPanel').then((m) => m.WebsiteConfigPanel), { loading: () => <LoadingSkeleton />, ssr: false }),
  'crm.general': dynamic(() => import('../panels/crm/CRMConfigPanel').then((m) => m.CRMConfigPanel), { loading: () => <LoadingSkeleton />, ssr: false }),
  'crm.agente-voz': dynamic(() => import('../panels/crm/AgenteVozSeccion').then((m) => m.AgenteVozSeccion), { loading: () => <LoadingSkeleton />, ssr: false }),
  'crm.telefonia': dynamic(() => import('../crm/TelefoniaTab').then((m) => m.TelefoniaTab), { loading: () => <LoadingSkeleton />, ssr: false }),
  'crm.proveedores': dynamic(() => import('../crm/ProveedoresTab').then((m) => m.ProveedoresTab), { loading: () => <LoadingSkeleton />, ssr: false }),
  'crm.email': dynamic(() => import('../crm/EmailTab').then((m) => m.EmailTab), { loading: () => <LoadingSkeleton />, ssr: false }),
  'crm.whatsapp': dynamic(() => import('../crm/WhatsAppTab').then((m) => m.WhatsAppTab), { loading: () => <LoadingSkeleton />, ssr: false }),
  'crm.creditos': dynamic(() => import('../crm/CreditosTab').then((m) => m.CreditosTab), { loading: () => <LoadingSkeleton />, ssr: false }),
  'hrm.general': dynamic(() => import('../panels/hrm/HRMConfigPanel').then((m) => m.HRMConfigPanel), { loading: () => <LoadingSkeleton />, ssr: false }),
  'pms.general': dynamic(() => import('../panels/pms/PMSConfigPanel').then((m) => m.PMSConfigPanel), { loading: () => <LoadingSkeleton />, ssr: false }),
  'pos.general': dynamic(() => import('../panels/pos/POSConfigPanel').then((m) => m.POSConfigPanel), { loading: () => <LoadingSkeleton />, ssr: false }),
  'chat.general': dynamic(() => import('../panels/chat/ChatConfigPanel').then((m) => m.ChatConfigPanel), { loading: () => <LoadingSkeleton />, ssr: false }),
  'chat.ia': dynamic(() => import('@/components/chat/ia/configuracion/ConfiguracionIAChat').then((m) => m.ConfiguracionIAChat), { loading: () => <LoadingSkeleton />, ssr: false }),
  'integraciones.general': dynamic(() => import('../panels/integraciones/IntegracionesConfigPanel').then((m) => m.IntegracionesConfigPanel), { loading: () => <LoadingSkeleton />, ssr: false }),
  'parking.general': dynamic(() => import('../panels/parking/ParkingConfigPanel').then((m) => m.ParkingConfigPanel), { loading: () => <LoadingSkeleton />, ssr: false }),
  'calendario.general': dynamic(() => import('../panels/calendario/CalendarioConfigPanel').then((m) => m.CalendarioConfigPanel), { loading: () => <LoadingSkeleton />, ssr: false }),
  'timeline.general': dynamic(() => import('../panels/timeline/TimelineConfigPanel').then((m) => m.TimelineConfigPanel), { loading: () => <LoadingSkeleton />, ssr: false }),
  'roles.general': dynamic(() => import('../panels/roles/RolesConfigPanel').then((m) => m.RolesConfigPanel), { loading: () => <LoadingSkeleton />, ssr: false }),
  'facturacion.resumen': dynamic(() => import('../panels/facturacion/FacturacionConfigPanel').then((m) => m.FacturacionConfigPanel), { loading: () => <LoadingSkeleton />, ssr: false }),
  'facturacion.servicio': dynamic(
    () => import('@/components/finanzas/facturacion-electronica/ConfiguracionServicioFE').then((m) => function ServicioFE() { return <m.default incrustado />; }),
    { loading: () => <LoadingSkeleton />, ssr: false },
  ),
  'gym.general': dynamic(() => import('../panels/gym/GymConfigPanel').then((m) => m.GymConfigPanel), { loading: () => <LoadingSkeleton />, ssr: false }),
  'notificaciones.general': dynamic(() => import('../panels/notificaciones/NotificacionesConfigPanel').then((m) => m.NotificacionesConfigPanel), { loading: () => <LoadingSkeleton />, ssr: false }),
  'datos-offline.general': dynamic(() => import('../panels/datos-offline/DatosOfflinePanel').then((m) => m.DatosOfflinePanel), { loading: () => <LoadingSkeleton />, ssr: false }),
};

/** Ids de sección que tienen componente propio (lo usa la prueba del registro). */
export const SECCIONES_CON_PANEL = Object.keys(PANELES);

function SeccionEnlace({ href }: { href: string }) {
  const t = useTranslations('configuracionUnificada.enlace');
  return (
    <div className="flex max-w-3xl flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4 md:px-6 md:py-5">
      <p className="min-w-0 flex-1 text-sm text-fg-secondary">{t('descripcion')}</p>
      <Link href={href} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
        {t('abrir')}
        <ArrowUpRight aria-hidden="true" className="size-4" />
      </Link>
    </div>
  );
}

interface Props {
  seccion: SeccionConfig;
  puedeEditar: boolean;
  /** Algún ajuste de la sección tiene permiso propio y la persona sí lo tiene. */
  algunAjusteEditable: boolean;
}

export function ConfiguracionPanelRenderer({ seccion, puedeEditar, algunAjusteEditable }: Props) {
  const t = useTranslations('configuracionUnificada.soloLectura');
  const Panel = PANELES[seccion.id];
  const contenido = Panel ? <Panel /> : seccion.enlace ? <SeccionEnlace href={seccion.enlace} /> : null;
  const soloLectura = !puedeEditar && !seccion.enlace;
  const aviso = soloLectura && !(seccion.controlaLectura && algunAjusteEditable) ? (
    <AvisoTonal tono="neutro" icono={Lock} titulo={t('titulo')} descripcion={t('descripcion')} />
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      {aviso}
      {soloLectura && !seccion.controlaLectura ? (
        <fieldset disabled className="contents">
          {contenido}
        </fieldset>
      ) : (
        contenido
      )}
    </div>
  );
}
