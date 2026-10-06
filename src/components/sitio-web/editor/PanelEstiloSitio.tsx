'use client';

/**
 * Panel lateral «Estilo del sitio» del editor (Figma A/05f): «Afecta a todas las páginas, al
 * encabezado y al pie» + ✕, y dentro EL MISMO `EstiloDelSitioPanel` de Diseño › Estilo (A/06a):
 * un solo componente y una sola lectura/escritura del tema (`tokensEstilo`).
 *
 * - V2: `useEstiloSitio` (el mismo hook de Diseño) sobre la copia en edición del editor; cada
 *   cambio entra al borrador con el autoguardado del editor y el lienzo lo pinta en vivo.
 * - Legacy: el estilo se lee de `website_settings` y cada cambio va a sus columnas (acento →
 *   `primary_color`, fuentes → `font_heading`/`font_body`…); redondeo, botones y movimiento no
 *   tienen columna y se muestran deshabilitados con su motivo.
 */
import { useMemo } from 'react';
import { X } from 'lucide-react';
import type { WebsiteSettings } from '@/lib/services/websiteSettingsService';
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { EstiloDelSitioPanel } from '@/components/sitio-web/diseno/EstiloDelSitioPanel';
import { useEstiloSitio } from '@/components/sitio-web/diseno/useEstiloSitio';
import { useColoresLogo } from '@/components/sitio-web/diseno/useColoresLogo';
import { CATALOGO_SITIO } from '@/components/sitio-web/diseno/catalogo';
import type { SitioV2 } from '@/components/sitio-web/useSitioV2';
import {
  estiloEnUso,
  estilosDelGiro,
  giroCatalogoDeTipo,
  plantillaEnUso,
  type EstiloCatalogo,
} from '@/lib/website/contrato/catalogoPlantillas';
import {
  ajustesVivosDeEstilo,
  tokensExtendidosDisponibles,
  type EstiloEditable,
} from '@/lib/website/v2/tokensEstilo';
import { valorCampo } from '@/lib/website/v2/valorCampo';
import { normalizarHex } from '@/lib/utils/contrasteColor';
import { useTextosEditor } from './textos';

export interface PanelEstiloSitioProps {
  enV2: boolean;
  sitio: SitioV2;
  documento: DocumentoSitio | null;
  onCambiarDocumento: (cambiar: (d: DocumentoSitio) => DocumentoSitio) => void;
  settings: WebsiteSettings | null;
  onCambiarAjustes: (cambios: Partial<WebsiteSettings>) => void;
  giroTypeId: number | null;
  onCerrar: () => void;
  deshabilitado?: boolean;
}

function estiloLegacy(s: WebsiteSettings | null, base: EstiloCatalogo | null): EstiloEditable | null {
  if (!s || !base) return null;
  const r = s as unknown as Record<string, unknown>;
  const hex = (c: unknown, porDefecto: string) => normalizarHex(typeof c === 'string' ? c : null) ?? porDefecto;
  return {
    preset: null,
    modo: r.theme_mode === 'dark' ? 'dark' : r.theme_mode === 'light' ? 'light' : base.modo,
    fondo: hex(r.background_color, base.fondo),
    texto: hex(r.text_color, base.texto),
    acento: hex(r.primary_color, base.acento),
    fuenteTitulos: typeof r.font_heading === 'string' && r.font_heading ? r.font_heading : base.fuenteTitulos,
    fuenteCuerpo: typeof r.font_body === 'string' && r.font_body ? r.font_body : base.fuenteCuerpo,
    radio: base.radio,
    estiloBoton: base.estiloBoton,
    movimiento: base.movimiento,
  };
}

export function PanelEstiloSitio(p: PanelEstiloSitioProps) {
  const t = useTextosEditor();
  const giro = giroCatalogoDeTipo(p.giroTypeId);
  const presets = useMemo(() => estilosDelGiro(CATALOGO_SITIO, giro), [giro]);
  const extendidos = p.enV2 && tokensExtendidosDisponibles();
  const enUso = useMemo(
    () =>
      plantillaEnUso(CATALOGO_SITIO, {
        preset: valorCampo(p.documento?.tema.preset),
        plantillaBase: valorCampo(p.documento?.tema.plantillaBase) ?? (p.settings as unknown as Record<string, unknown> | null)?.template_id as string | null,
        fuenteTitulos: valorCampo(p.documento?.tema.tipografia.titulos) ?? p.settings?.font_heading ?? null,
      }),
    [p.documento, p.settings],
  );
  const base = enUso?.estilo ?? presets[0] ?? CATALOGO_SITIO.plantillas[0]?.estilo ?? null;

  // V2: el mismo hook de Diseño, sobre la copia en edición del editor (no guarda por su cuenta).
  const sitioEditor: SitioV2 = useMemo(
    () => ({
      ...p.sitio,
      documento: p.documento,
      guardar: async (cambiar: (d: DocumentoSitio) => DocumentoSitio) => {
        p.onCambiarDocumento(cambiar);
        return true;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.sitio, p.documento, p.onCambiarDocumento],
  );
  const estiloV2 = useEstiloSitio(sitioEditor, base, extendidos);

  const legacy = estiloLegacy(p.settings, base);
  const estilo = p.enV2 ? estiloV2.estilo : legacy;
  const seleccionado = estilo ? estiloEnUso(presets, estilo, enUso) : null;
  const coloresLogo = useColoresLogo(valorCampo(p.documento?.identidad.logoUrl));

  const cambiarLegacy = (parcial: Partial<EstiloEditable>) => {
    if (!legacy) return;
    const siguiente = { ...legacy, ...parcial };
    p.onCambiarAjustes({
      ...(ajustesVivosDeEstilo(siguiente) as Partial<WebsiteSettings>),
      font_heading: siguiente.fuenteTitulos,
      font_body: siguiente.fuenteCuerpo,
    } as Partial<WebsiteSettings>);
  };

  return (
    <aside aria-label={t('estiloSitio.titulo')} className="relative flex min-h-0 flex-col bg-surface">
      {/* El título y la descripción los pone el mismo panel de Diseño; aquí solo se cierra. */}
      <button
        type="button"
        onClick={p.onCerrar}
        aria-label={t('estiloSitio.cerrar')}
        className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {estilo ? (
          <EstiloDelSitioPanel
            estilo={estilo}
            presets={presets}
            seleccionado={seleccionado}
            onElegirPreset={(preset) =>
              p.enV2
                ? estiloV2.aplicarPreset(preset)
                : cambiarLegacy({
                    modo: preset.modo,
                    fondo: preset.fondo,
                    texto: preset.texto,
                    acento: preset.acento,
                    fuenteTitulos: preset.fuenteTitulos,
                    fuenteCuerpo: preset.fuenteCuerpo,
                  })
            }
            onCambiar={p.enV2 ? estiloV2.cambiar : cambiarLegacy}
            giro={giro}
            coloresLogo={coloresLogo}
            extendidos={extendidos}
            deshabilitado={p.deshabilitado}
            className="border-0 p-1"
          />
        ) : (
          <p className="px-1 text-[13px] leading-[18px] text-fg-secondary">{t('estiloSitio.sinDatos')}</p>
        )}
      </div>
    </aside>
  );
}
