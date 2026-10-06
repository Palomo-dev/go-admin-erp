'use client';

/**
 * Ajustes del sitio web (`website_settings`) para las páginas del módulo
 * «Sitio web» (/app/sitio-web/**): cargar, crear si falta, guardar por
 * sección, subir imágenes, publicar/despublicar y restablecer a plantilla.
 *
 * Extraído TAL CUAL de la página vieja /app/organizacion/branding (7 pestañas
 * en una sola pantalla), que pasó a ser el módulo base «Sitio web» con una
 * subpágina por tarea (Figma 01b, 2026-10-05). No hay una segunda
 * implementación: la vieja ruta redirige aquí (next.config.js).
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { websiteSettingsService, type WebsiteSettings } from '@/lib/services/websiteSettingsService';
import { useUrlSitio } from './useUrlSitio';

export type TipoImagenSitio = 'favicon' | 'og_image' | 'hero' | 'gallery';

export interface AjustesSitio {
  organizationId: number | undefined;
  organizationName: string | undefined;
  organizationTypeId: number | null;
  subdominio: string | null;
  /** Host público (dominio propio principal verificado o `<subdominio>.goadmin.io`). */
  hostSitio: string | null;
  /** `https://<hostSitio>`, o `null`. */
  urlSitio: string | null;
  settings: WebsiteSettings | null;
  cargando: boolean;
  guardando: boolean;
  recargar: () => Promise<void>;
  guardar: (data: Partial<WebsiteSettings>) => Promise<void>;
  subirImagen: (file: File, type: TipoImagenSitio) => Promise<string>;
  publicar: () => Promise<void>;
  despublicar: () => Promise<void>;
  restablecerPlantilla: (templateId: string) => Promise<void>;
}

/**
 * Qué método del servicio guarda una sección, según los campos que trae.
 * Mismo criterio que tenía la página vieja; si no se reconoce, va por tema.
 */
export function seccionDeGuardado(data: Partial<WebsiteSettings>): 'theme' | 'seo' | 'content' | 'advanced' {
  if ('template_id' in data || 'theme_mode' in data || 'primary_color' in data) return 'theme';
  if ('meta_title' in data || 'meta_description' in data || 'favicon_url' in data) return 'seo';
  if ('social_links' in data || 'business_hours' in data || 'gallery_images' in data) return 'content';
  if ('custom_css' in data || 'custom_scripts' in data || 'analytics_id' in data) return 'advanced';
  return 'theme';
}

export function useAjustesSitio(): AjustesSitio {
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const { toast } = useToast();
  const t = useTranslations('org.branding');

  const [settings, setSettings] = useState<WebsiteSettings | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  // Subdominio y dominio propio: una sola consulta y una sola regla (useUrlSitio).
  const sitio = useUrlSitio(organizationId);
  const recargarUrl = sitio.recargar;

  const cargarAjustes = useCallback(async () => {
    if (!organizationId) return;
    try {
      let data = await websiteSettingsService.getSettings(organizationId);
      // Si no existe, se crea la configuración inicial (igual que antes).
      if (!data) {
        data = await websiteSettingsService.createSettings(organizationId);
        toast({ title: t('configCreated'), description: t('configCreatedDesc') });
      }
      setSettings(data);
    } catch (error) {
      console.error('Error cargando los ajustes del sitio:', error);
      toast({ title: t('errorTitulo'), description: t('errorLoadingConfig'), variant: 'destructive' });
    } finally {
      setCargando(false);
    }
  }, [organizationId, toast, t]);

  useEffect(() => {
    void cargarAjustes();
  }, [cargarAjustes]);

  const recargar = useCallback(async () => {
    await Promise.all([cargarAjustes(), recargarUrl()]);
  }, [cargarAjustes, recargarUrl]);

  const guardar = useCallback(
    async (data: Partial<WebsiteSettings>) => {
      if (!organizationId || !settings) return;
      setGuardando(true);
      try {
        // Partial<WebsiteSettings> admite null; los métodos del servicio
        // esperan undefined. Es el mismo cast de la página vieja, ya tipado.
        const s = websiteSettingsService;
        const seccion = seccionDeGuardado(data);
        const actualizados =
          seccion === 'seo'
            ? await s.updateSEO(organizationId, data as unknown as Parameters<typeof s.updateSEO>[1])
            : seccion === 'content'
              ? await s.updateContent(organizationId, data as unknown as Parameters<typeof s.updateContent>[1])
              : seccion === 'advanced'
                ? await s.updateAdvanced(organizationId, data as unknown as Parameters<typeof s.updateAdvanced>[1])
                : await s.updateTheme(organizationId, data as unknown as Parameters<typeof s.updateTheme>[1]);
        setSettings(actualizados);
        toast({ title: t('saved'), description: t('savedDesc') });
      } catch (error) {
        console.error('Error guardando los ajustes del sitio:', error);
        toast({ title: t('errorTitulo'), description: t('errorSaving'), variant: 'destructive' });
      } finally {
        setGuardando(false);
      }
    },
    [organizationId, settings, toast, t]
  );

  const subirImagen = useCallback(
    async (file: File, type: TipoImagenSitio) => {
      if (!organizationId) throw new Error('No organization ID');
      return websiteSettingsService.uploadImage(organizationId, file, type);
    },
    [organizationId]
  );

  const cambiarPublicacion = useCallback(
    async (publicado: boolean) => {
      if (!organizationId) return;
      setGuardando(true);
      try {
        const actualizados = await websiteSettingsService.togglePublish(organizationId, publicado);
        setSettings(actualizados);
        toast(
          publicado
            ? { title: t('sitePublished'), description: t('sitePublishedDesc') }
            : { title: t('siteUnpublished'), description: t('siteUnpublishedDesc') }
        );
      } catch (error) {
        console.error('Error cambiando la publicación del sitio:', error);
        toast({
          title: t('errorTitulo'),
          description: publicado ? t('errorPublishing') : t('errorUnpublishing'),
          variant: 'destructive',
        });
      } finally {
        setGuardando(false);
      }
    },
    [organizationId, toast, t]
  );

  const publicar = useCallback(() => cambiarPublicacion(true), [cambiarPublicacion]);
  const despublicar = useCallback(() => cambiarPublicacion(false), [cambiarPublicacion]);

  const restablecerPlantilla = useCallback(
    async (templateId: string) => {
      if (!organizationId) return;
      try {
        const actualizados = await websiteSettingsService.resetToTemplate(organizationId, templateId);
        setSettings(actualizados);
        toast({ title: t('templateReset'), description: t('templateResetDesc') });
      } catch (error) {
        console.error('Error restableciendo la plantilla:', error);
        toast({ title: t('errorTitulo'), description: t('errorResettingTemplate'), variant: 'destructive' });
      }
    },
    [organizationId, toast, t]
  );

  return {
    organizationId,
    organizationName: organization?.name,
    organizationTypeId: organization?.type_id ?? null,
    subdominio: sitio.subdominio,
    hostSitio: sitio.host,
    urlSitio: sitio.url,
    settings,
    cargando,
    guardando,
    recargar,
    guardar,
    subirImagen,
    publicar,
    despublicar,
    restablecerPlantilla,
  };
}
