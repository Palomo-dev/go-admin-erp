'use client';

/**
 * Configuración › General.
 *
 * Antes era una SEGUNDA copia de Organización (Información, Miembros,
 * Invitaciones, Sucursales y Mis organizaciones con los componentes viejos), y
 * por aquí seguían vivos el `confirm()` nativo, el «¿es admin?» por `role_id`
 * y el desactivar organizaciones desde el navegador (auditoría 2026-10, P0-9,
 * P1-2 y P2-1). Regla 7: una sola implementación. Aquí quedan los datos de la
 * organización y su zona horaria (Fase A: la zona tiene que poder fijarse
 * aunque la organización no tenga el módulo de calendario; General es
 * `isCore: true`), y accesos a las pantallas de Organización.
 */
import dynamic from 'next/dynamic';
import { Building2, MailPlus, MapPin, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState, RelatedLinkCard } from '@/components/kit';
import { useOrgAdmin } from '@/components/organization/useOrgAdmin';
import { OrganizationInfoSkeleton } from '@/components/organization/OrganizationSkeletons';

const OrganizationInfoTab = dynamic(() => import('@/components/organization/OrganizationInfoTab'), {
  loading: () => <OrganizationInfoSkeleton />,
});
const OrganizationTimezoneCard = dynamic(() => import('@/components/organization/OrganizationTimezoneCard'), {
  loading: () => <div className="h-40 animate-pulse rounded-xl bg-subtle" />,
});

export function GeneralConfigPanel() {
  const t = useTranslations('org.acceso.configuracionGeneral');
  const { orgId, isOrgAdmin, loading, error, refresh } = useOrgAdmin();

  if (loading) return <OrganizationInfoSkeleton />;
  if (error) return <EmptyState variante="error" titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={refresh} />;
  if (!isOrgAdmin || orgId === null) {
    return <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} accion={{ etiqueta: t('sinPermiso.inicio'), href: '/app/inicio' }} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <RelatedLinkCard icono={Users} etiqueta={t('enlaces.miembros')} valor={t('enlaces.valor')} href="/app/organizacion/miembros" textoAccion={t('enlaces.abrir')} />
        <RelatedLinkCard icono={MailPlus} etiqueta={t('enlaces.invitaciones')} valor={t('enlaces.valor')} href="/app/organizacion/invitaciones" textoAccion={t('enlaces.abrir')} />
        <RelatedLinkCard icono={MapPin} etiqueta={t('enlaces.sucursales')} valor={t('enlaces.valor')} href="/app/organizacion/sucursales" textoAccion={t('enlaces.abrir')} />
        <RelatedLinkCard icono={Building2} etiqueta={t('enlaces.misOrganizaciones')} valor={t('enlaces.valor')} href="/app/organizacion/mis-organizaciones" textoAccion={t('enlaces.abrir')} />
      </div>
      <OrganizationInfoTab orgData={orgId} />
      <OrganizationTimezoneCard />
    </div>
  );
}
