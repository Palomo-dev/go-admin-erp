'use client';

/**
 * Organización › Marca › Información (Figma 08, sección 4): PageHeader del
 * kit, guía «Configura tu organización», datos de la organización (avisos con
 * «Deshacer») y zona horaria. Cargando = esqueleto; sin permiso = estado con
 * salida (`PantallaOrganizacion`), ya no la caja amarilla sin salida (P2-4).
 */
import dynamic from 'next/dynamic';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { OrganizationInfoSkeleton } from '@/components/organization/OrganizationSkeletons';
import { PantallaOrganizacion } from '@/components/organization/acceso/PantallaOrganizacion';
import { GuiaConfiguracion } from '@/components/organization/informacion/GuiaConfiguracion';

const OrganizationInfoTab = dynamic(() => import('@/components/organization/OrganizationInfoTab'), {
  loading: () => <OrganizationInfoSkeleton />,
});
// Fase A: la zona de la organización, en una pantalla de núcleo.
const OrganizationTimezoneCard = dynamic(() => import('@/components/organization/OrganizationTimezoneCard'), {
  loading: () => <div className="h-40 animate-pulse rounded-xl bg-subtle" />,
});

export default function InformacionPage() {
  const t = useTranslations('org.acceso.informacion');
  return (
    <PantallaOrganizacion titulo={t('titulo')} subtitulo={t('subtitulo')} icono={Info} permiso="organizacion" esqueleto={<OrganizationInfoSkeleton />}>
      {({ organizationId, acceso }) => (
        <div className="flex flex-col gap-4 lg:gap-6">
          <GuiaConfiguracion organizationId={organizationId} puedeFacturar={acceso.puede.facturacion} />
          <OrganizationInfoTab orgData={organizationId} />
          <OrganizationTimezoneCard />
        </div>
      )}
    </PantallaOrganizacion>
  );
}
