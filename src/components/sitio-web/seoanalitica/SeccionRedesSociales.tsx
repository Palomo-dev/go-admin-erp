'use client';

/**
 * «Redes sociales» (Figma B/08-01, nota-ux 3): ÚNICO lugar donde se editan;
 * alimentan el pie del sitio y el `sameAs` que lee Google. Se escriben en
 * forma corta («@tumarca», «+57 300 555 0100») y se guardan como URL en
 * `contenido.redesSociales` del borrador (`normalizarRed`).
 * Los catálogos de Meta y TikTok no se duplican: se enlaza a Inventario
 * (nota-ux 6).
 */
import { FormField, FormSection, RelatedLinkCard } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils/Utils';
import { REDES_SEO, type RedSeo } from './seoLogica';
import { useTextosSeoAnalitica } from './textos';
import { ICONO_ACCION_SEO, ICONO_CANAL, ICONO_SECCION_SEO } from './iconosSeoAnalitica';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';
import type { SeoSitio } from './useSeoSitio';

const PISTA: Record<RedSeo, string> = {
  instagram: '@tumarca',
  facebook: 'facebook.com/tumarca',
  tiktok: '@tumarca',
  whatsapp: '+57 300 555 0100',
};

/** Productos de Inventario: allí vive el diálogo de catálogos de Meta y TikTok. */
const RUTA_CATALOGOS = '/app/inventario/productos';

export function SeccionRedesSociales({ s, sinCabecera }: { s: SeoSitio; sinCabecera?: boolean }) {
  const t = useTextosSeoAnalitica();
  const contenido = (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {REDES_SEO.map((red) => {
          // El icono del canal dentro del campo (16 px): el mismo de la vista
          // previa y de «De dónde llegan» en Analítica.
          const Icono = ICONO_CANAL[red];
          return (
            <FormField key={red} etiqueta={t(`seo.redes.${red}`)} error={s.errores.redes[red] ? t('seo.redes.invalido') : null}>
              {(campo) => (
                <div className="relative">
                  <Icono
                    aria-hidden="true"
                    data-testid={`icono-red-${red}`}
                    className={`${CLASE_TAMANO_ICONO.base} pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted`}
                    strokeWidth={TRAZO_ICONO}
                  />
                  <Input
                    id={campo.id}
                    aria-describedby={campo['aria-describedby']}
                    aria-invalid={campo['aria-invalid']}
                    value={s.formulario.redes[red]}
                    onChange={(e) => s.cambiarRed(red, e.target.value)}
                    placeholder={PISTA[red]}
                    inputMode={red === 'whatsapp' ? 'tel' : 'text'}
                    autoComplete="off"
                    className={cn('pl-9', campo['aria-invalid'] && 'border-danger')}
                  />
                </div>
              )}
            </FormField>
          );
        })}
      </div>
      <RelatedLinkCard icono={ICONO_ACCION_SEO.catalogos} etiqueta={t('seo.redes.catalogos')} valor={t('seo.redes.catalogosValor')} href={RUTA_CATALOGOS} textoAccion={t('seo.redes.catalogosAccion')} />
    </div>
  );
  if (sinCabecera) return contenido;
  return (
    <FormSection titulo={t('seo.redes.seccion')} descripcion={t('seo.redes.descripcionSeccion')} icono={ICONO_SECCION_SEO.redes}>
      {contenido}
    </FormSection>
  );
}
