'use client';

/**
 * /app/sitio-web/tienda — «Tienda» (Figma 01b): por ahora, la moderación de
 * reseñas de productos que vivía huérfana en /app/organizacion/branding/reviews
 * (fuera de cualquier menú). Catálogo web y destacados quedan pendientes.
 */
import { Loader2 } from 'lucide-react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { ReviewsModerationPanel } from '@/components/organization/reviews/ReviewsModerationPanel';
import { MarcoSitioWeb } from '@/components/sitio-web/MarcoSitioWeb';

export default function TiendaSitioWebPage() {
  const { organization, isLoading } = useOrganization();

  return (
    <MarcoSitioWeb href="/app/sitio-web/tienda">
      {isLoading || !organization ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : (
        <ReviewsModerationPanel organizationId={organization.id} />
      )}
    </MarcoSitioWeb>
  );
}
