'use client';

/**
 * «Google» de SEO y redes (Figma B/08-01): Search Console (código de la
 * etiqueta meta, `website_settings.google_site_verification`), Perfil de
 * Empresa (enlace externo, integración futura), salud del sitio en SOLO
 * LECTURA (sitemap, robots, canónica; nota-ux 4) y «Ocultar de los
 * buscadores» (`search_noindex`, migración pendiente).
 */
import type { LucideIcon } from 'lucide-react';
import { FormField, FormSection, SettingRow, StatusBadge, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ChecklistItem } from '../ui/ChecklistItem';
import { useTextosSeoAnalitica } from './textos';
import { ICONO_ACCION_SEO, ICONO_GOOGLE_SEO, ICONO_SALUD_SEO, ICONO_SECCION_SEO } from './iconosSeoAnalitica';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';
import type { SeoSitio } from './useSeoSitio';
import type { SaludSeo } from './useSaludSeo';

export const URL_SEARCH_CONSOLE = 'https://search.google.com/search-console';
export const URL_PERFIL_EMPRESA = 'https://business.google.com/';

export function urlSearchConsole(host: string | null): string {
  return host ? `${URL_SEARCH_CONSOLE}?resource_id=${encodeURIComponent(`sc-domain:${host}`)}` : URL_SEARCH_CONSOLE;
}

function textoRobots(t: ReturnType<typeof useTextosSeoAnalitica>, salud: SaludSeo['datos']): { listo: boolean; texto: string } {
  const r = salud?.robots;
  if (!r || !r.publicado) return { listo: false, texto: t('seo.google.robotsFalta') };
  if (r.bloqueaTodo) return { listo: false, texto: t('seo.google.robotsBloquea') };
  if (r.rutasBloqueadas.length > 0) return { listo: true, texto: t('seo.google.robotsDisallow', { rutas: r.rutasBloqueadas.slice(0, 3).join(' y ') }) };
  return { listo: true, texto: t('seo.google.robotsOk') };
}

/** Título de fila con su icono de 16 px (el mismo de la fila móvil y del «⋯»). */
function TituloConIcono({ icono: Icono, texto }: { icono: LucideIcon; texto: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Icono aria-hidden="true" className={`${CLASE_TAMANO_ICONO.base} shrink-0 text-fg-secondary`} strokeWidth={TRAZO_ICONO} />
      {texto}
    </span>
  );
}

export function SaludDelSitio({ salud, host }: { salud: SaludSeo; host: string | null }) {
  const t = useTextosSeoAnalitica();
  if (salud.cargando && !salud.datos) {
    return (
      <div className="flex flex-col gap-2 rounded-lg bg-subtle p-3" aria-busy="true">
        <span className="sr-only">{t('seo.google.revisando')}</span>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-6 rounded-md" />
        ))}
      </div>
    );
  }
  const sm = salud.datos?.sitemap;
  const robots = textoRobots(t, salud.datos);
  return (
    <ul className="flex flex-col rounded-lg bg-subtle px-1 py-1" aria-busy={salud.cargando} data-testid="salud-sitio">
      <ChecklistItem
        titulo={t('seo.google.sitemap')}
        icono={ICONO_SALUD_SEO.sitemap}
        estado={sm?.publicado ? 'listo' : 'pendiente'}
        textoListo={sm?.publicado ? t('seo.google.sitemapOk', { n: sm.direcciones }) : undefined}
        detalle={sm?.publicado ? undefined : t('seo.google.sitemapFalta')}
        className="py-2"
      />
      <ChecklistItem
        titulo={t('seo.google.robots')}
        icono={ICONO_SALUD_SEO.robots}
        estado={robots.listo ? 'listo' : 'pendiente'}
        textoListo={robots.listo ? robots.texto : undefined}
        detalle={robots.listo ? undefined : robots.texto}
        className="py-2"
      />
      <ChecklistItem
        titulo={t('seo.google.canonica')}
        icono={ICONO_SALUD_SEO.canonica}
        estado={host ? 'listo' : 'pendiente'}
        textoListo={host ? t('seo.google.canonicaValor', { host }) : undefined}
        detalle={host ? undefined : t('seo.google.canonicaFalta')}
        className="py-2"
      />
    </ul>
  );
}

export function SeccionGoogle({ s, salud, sinCabecera }: { s: SeoSitio; salud: SaludSeo; sinCabecera?: boolean }) {
  const t = useTextosSeoAnalitica();
  const host = s.servidor?.host ?? s.ctx.host;
  const verificado = !!s.base.verificacion;
  const noindexDisponible = s.servidor?.ocultarBuscadores !== null && s.servidor?.ocultarBuscadores !== undefined;
  const enlace = clasesBoton({ variante: 'secundario', tamano: 'sm' });

  const contenido = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
        <SettingRow titulo={<TituloConIcono icono={ICONO_GOOGLE_SEO.searchConsole} texto={t('seo.google.searchConsole')} />} descripcion={verificado ? t('seo.google.verificado') : t('seo.google.sinVerificar')}>
          {verificado && <StatusBadge estado="codigo guardado" tono="neutro" etiqueta={t('seo.google.codigoGuardado')} icono={ICONO_GOOGLE_SEO.codigoGuardado} />}
          <a href={urlSearchConsole(host)} target="_blank" rel="noopener noreferrer" className={enlace}>
            {t('seo.google.abrir')}
            <ICONO_ACCION_SEO.abrirFuera aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          </a>
        </SettingRow>
        <FormField
          etiqueta={t('seo.google.codigo')}
          ayuda={t('seo.google.codigoAyuda')}
          error={s.errores.verificacion ? t('seo.google.codigoInvalido') : null}
        >
          <Input
            value={s.formulario.verificacion}
            onChange={(e) => s.cambiar({ verificacion: e.target.value })}
            placeholder='<meta name="google-site-verification" content="…">'
            autoComplete="off"
            spellCheck={false}
          />
        </FormField>
      </div>
      <div className="rounded-lg border border-line p-3">
        <SettingRow titulo={<TituloConIcono icono={ICONO_GOOGLE_SEO.perfil} texto={t('seo.google.perfil')} />} descripcion={t('seo.google.perfilTexto')}>
          <a href={URL_PERFIL_EMPRESA} target="_blank" rel="noopener noreferrer" className={enlace}>
            {t('seo.google.conectar')}
            <ICONO_ACCION_SEO.abrirFuera aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          </a>
        </SettingRow>
      </div>
      <SaludDelSitio salud={salud} host={host} />
      <div className="rounded-lg border border-line p-3">
        <SettingRow
          titulo={<TituloConIcono icono={ICONO_GOOGLE_SEO.ocultar} texto={t('seo.google.ocultar')} />}
          descripcion={noindexDisponible ? t('seo.google.ocultarTexto') : t('seo.google.ocultarPendiente')}
          htmlFor="seo-ocultar-buscadores"
        >
          <Switch
            id="seo-ocultar-buscadores"
            checked={s.formulario.ocultar}
            disabled={!noindexDisponible}
            onCheckedChange={(v) => s.cambiar({ ocultar: v })}
          />
        </SettingRow>
      </div>
    </div>
  );
  if (sinCabecera) return contenido;
  return (
    <FormSection titulo={t('seo.google.seccion')} icono={ICONO_SECCION_SEO.google}>
      {contenido}
    </FormSection>
  );
}
