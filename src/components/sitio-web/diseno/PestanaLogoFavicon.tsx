'use client';

/**
 * Diseño › «Logo y favicon» (Figma A/06a, pestaña): el MISMO componente y el
 * MISMO dato que Configuración › Datos del negocio (B/12-01): `CampoLogoFavicon`
 * sobre `documento.identidad.logoUrl` y `faviconUrl` del borrador V2. Cada
 * cambio se guarda en el borrador con `useSitioV2().guardar` (compare-and-swap).
 */
import { toast } from 'sonner';
import { CampoLogoFavicon, type CampoIdentidadImagen } from '../ui/CampoLogoFavicon';
import type { SitioV2 } from '../useSitioV2';
import { valorPropio, vaciar, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { valorCampo } from '@/lib/website/v2/valorCampo';
import { CajaIcono } from '../ui/CajaIcono';
import { ICONO_TAREA_SITIO } from '../ui/iconosSitio';
import { useTextosDiseno } from './textos';
import { useAvisoFalloSitio } from './useAvisoFalloSitio';

/** Fija o vacía el logo o el favicon del sitio en el documento (inmutable). */
export function fijarImagenIdentidad(documento: DocumentoSitio, campo: CampoIdentidadImagen, url: string | null): DocumentoSitio {
  const clave = campo === 'logo' ? 'logoUrl' : 'faviconUrl';
  return { ...documento, identidad: { ...documento.identidad, [clave]: url ? valorPropio(url) : vaciar<string>() } };
}

export interface PestanaLogoFaviconProps {
  sitio: SitioV2;
  organizationId?: number;
  deshabilitado?: boolean;
}

export function PestanaLogoFavicon({ sitio, organizationId, deshabilitado }: PestanaLogoFaviconProps) {
  const t = useTextosDiseno();
  const identidad = sitio.documento?.identidad;

  const alFallar = useAvisoFalloSitio(sitio);

  const cambiar = async (campo: CampoIdentidadImagen, url: string | null) => {
    const ok = await sitio.guardar((d) => fijarImagenIdentidad(d, campo, url));
    if (ok) {
      toast.success(t('logo.guardado'));
      return;
    }
    // El motivo se lee cuando el estado ya lo refleja: un 409 solo abre el
    // diálogo de conflicto, sin un toast de error vacío al lado.
    alFallar(({ conflicto, mensaje }) => {
      if (!conflicto) toast.error(t('logo.error', { mensaje }).trim());
    });
  };

  return (
    <section className="flex max-w-3xl flex-col gap-4 rounded-xl border border-line bg-surface p-4 lg:p-6">
      <header className="flex items-start gap-3">
        <CajaIcono icono={ICONO_TAREA_SITIO.logo} />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-base font-semibold leading-6 text-fg">{t('logo.titulo')}</h2>
          <p className="text-[13px] leading-[18px] text-fg-secondary">{t('logo.descripcion')}</p>
        </div>
      </header>
      <CampoLogoFavicon
        logoUrl={valorCampo(identidad?.logoUrl)}
        faviconUrl={valorCampo(identidad?.faviconUrl)}
        onCambiar={(campo, url) => void cambiar(campo, url)}
        organizationId={organizationId}
        permitirQuitar
        deshabilitado={deshabilitado || sitio.guardando}
      />
    </section>
  );
}
