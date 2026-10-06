'use client';

/**
 * /app/sitio-web/paginas — «Páginas» (Figma 01b): páginas del sitio y menús del
 * encabezado y el pie. Viene de Branding › Páginas (BrandingPagesTab); su
 * botón «Editar» abre /app/sitio-web/editor/[pageId].
 */
import { useOrganization } from '@/lib/hooks/useOrganization';
import { BrandingPagesTab } from '@/components/organization/branding';
import { MarcoSitioWeb } from '@/components/sitio-web/MarcoSitioWeb';

export default function PaginasSitioWebPage() {
  const { organization } = useOrganization();

  return (
    <MarcoSitioWeb href="/app/sitio-web/paginas">
      {organization?.id && <BrandingPagesTab organizationId={organization.id} typeId={organization.type_id} />}
    </MarcoSitioWeb>
  );
}
