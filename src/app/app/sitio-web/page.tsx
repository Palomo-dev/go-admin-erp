'use client';

/**
 * /app/sitio-web — «Resumen» del módulo Sitio web (Figma 01a/01b): estado de
 * publicación, URL real, lista de verificación e información del sitio, con
 * «Ver sitio» y «Abrir editor» en la cabecera. Viene de Branding › Publicación.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ExternalLink, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandingPublishTab } from '@/components/organization/branding';
import { MarcoSitioWeb, EstadoAjustes } from '@/components/sitio-web/MarcoSitioWeb';
import { useAjustesSitio } from '@/components/sitio-web/useAjustesSitio';
import { RAIZ_SITIO_WEB, rutaEditorSitio } from '@/components/sitio-web/rutasSitioWeb';
import { websitePageBuilderService } from '@/lib/services/websitePageBuilderService';

export default function ResumenSitioWebPage() {
  const t = useTranslations('sitioWeb');
  const tb = useTranslations('org.branding');
  const a = useAjustesSitio();
  const [paginaInicio, setPaginaInicio] = useState<string | null>(null);

  // Página «home» del sitio para «Abrir editor» (mismo criterio que Diseño).
  useEffect(() => {
    if (!a.organizationId) return;
    websitePageBuilderService
      .getPages(a.organizationId)
      .then((paginas) => setPaginaInicio(paginas.find((p) => p.slug === 'home')?.id ?? null))
      .catch((error) => console.error('Error cargando las páginas del sitio:', error));
  }, [a.organizationId]);

  const url = a.subdominio ? `https://${a.subdominio}.goadmin.io` : null;

  return (
    <MarcoSitioWeb
      href={RAIZ_SITIO_WEB}
      subtitulo={url ? `${t('tuSitio')} · ${a.subdominio}.goadmin.io` : tb('description')}
      acciones={
        <>
          {url && (
            <Button variant="outline" className="h-10" asChild>
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 size-4" aria-hidden="true" />
                {t('verSitio')}
              </a>
            </Button>
          )}
          {paginaInicio && (
            <Button className="h-10" asChild>
              <Link href={rutaEditorSitio(paginaInicio)}>
                <Pencil className="mr-2 size-4" aria-hidden="true" />
                {t('abrirEditor')}
              </Link>
            </Button>
          )}
        </>
      }
    >
      <EstadoAjustes cargando={a.cargando} hayAjustes={!!a.settings} onReintentar={() => void a.recargar()}>
        {a.settings && (
          <BrandingPublishTab
            vista="resumen"
            settings={a.settings}
            organizationName={a.organizationName || tb('myOrganization')}
            subdomain={a.subdominio || undefined}
            onPublish={a.publicar}
            onUnpublish={a.despublicar}
            onResetToTemplate={a.restablecerPlantilla}
            isPublishing={a.guardando}
          />
        )}
      </EstadoAjustes>
    </MarcoSitioWeb>
  );
}
