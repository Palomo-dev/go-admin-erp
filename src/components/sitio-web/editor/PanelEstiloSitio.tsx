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
import { SelectKit, CasillaKit, ColorKit } from './inspector/controlesKit';
import { useMemo } from 'react';
import { X } from 'lucide-react';
import type { WebsiteSettings } from '@/lib/services/websiteSettingsService';
import { vaciar, valorPropio, type DocumentoSitio, type TarjetaProductoDocumento } from '@/lib/website/contrato/documentoSitio';
import { EstiloDelSitioPanel } from '@/components/sitio-web/diseno/EstiloDelSitioPanel';
import { PanelCarrusel, PanelPaginacion } from './inspector/PanelesListaCarrusel';
import { paginacionTemaDisponible, sanitizarCarrusel, sanitizarPaginacion } from '@/lib/website/v2/paginacionCarrusel';
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
  secundarioDe,
  aplicarPresetDiseno,
  cascaronTemaDisponible,
  tokensDisenoDisponibles,
  tokensExtendidosDisponibles,
  type EstiloEditable,
} from '@/lib/website/v2/tokensEstilo';
import { PRESETS_DISENO } from '@/lib/website/v2/presetsDiseno';
import { valorCampo } from '@/lib/website/v2/valorCampo';
import { tarjetaProductoTemaDisponible } from '@/lib/website/tarjetaProducto';
import { urgenciaDocumentoDisponible } from '@/lib/website/conversion';
import { InspectorTarjetaProducto } from './inspector/InspectorTarjetaProducto';
import { normalizarHex } from '@/lib/utils/contrasteColor';
import { useTextosEditor } from './textos';
import { PanelUrgencia } from './inspector/PanelUrgencia';
import { FontField } from '@/components/sitio-web/ui/FontField';
import { FONTS } from '@/lib/services/websiteSettingsService';
import { familiaCss } from '@/components/sitio-web/diseno/catalogo';
import { fuenteEncabezadoAlCampo, fuenteEncabezadoAlGuardar, type FuentesTema } from '@/lib/website/v2/fuenteTema';

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
    secundario: (() => {
      const guardado = normalizarHex(typeof r.secondary_color === 'string' ? r.secondary_color : null);
      const modo = r.theme_mode === 'dark' ? 'dark' : r.theme_mode === 'light' ? 'light' : base.modo;
      const derivado = secundarioDe({ modo, fondo: hex(r.background_color, base.fondo), texto: hex(r.text_color, base.texto) });
      return guardado && guardado.toLowerCase() !== derivado.toLowerCase() ? guardado : null;
    })(),
    fuenteTitulos: typeof r.font_heading === 'string' && r.font_heading ? r.font_heading : base.fuenteTitulos,
    fuenteCuerpo: typeof r.font_body === 'string' && r.font_body ? r.font_body : base.fuenteCuerpo,
    radio: base.radio,
    estiloBoton: base.estiloBoton,
    movimiento: base.movimiento,
  };
}

const PESOS = [['normal', 'Normal'], ['medium', 'Medio'], ['semibold', 'Seminegrita'], ['bold', 'Negrita']] as const;
const TAMANOS_TITULO = [['sm', 'Pequeño'], ['md', 'Mediano'], ['lg', 'Grande'], ['xl', 'Muy grande'], ['2xl', 'Enorme'], ['3xl', 'Gigante'], ['4xl', 'Máximo']] as const;

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
                    secundario: null,
                  })
            }
            onCambiar={p.enV2 ? estiloV2.cambiar : cambiarLegacy}
            giro={giro}
            coloresLogo={coloresLogo}
            extendidos={extendidos}
            deshabilitado={p.deshabilitado}
            className="border-0 p-1"
          />
        ) : null}
        {p.enV2 && p.documento && (
          <section className="mt-4 flex flex-col gap-2 px-1">
            <h3 className="text-[13px] font-medium text-fg">{t('zonaGlobal.acciones.estilosCombinables')}</h3>
            <p className="text-[11px] leading-[14px] text-fg-muted">{t('zonaGlobal.acciones.estilosCombinablesAyuda')}</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS_DISENO.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  disabled={p.deshabilitado || !tokensDisenoDisponibles()}
                  onClick={() => p.onCambiarDocumento((d) => aplicarPresetDiseno(d, preset.id))}
                  className="rounded-full border border-border px-2.5 py-1 text-[12px] text-fg hover:bg-hover disabled:opacity-50"
                >
                  {preset.id === 'actual' ? t('zonaGlobal.acciones.estiloActual') : preset.id.replaceAll('_', ' ')}
                </button>
              ))}
            </div>
          </section>
        )}
        {paginacionTemaDisponible() && p.enV2 && p.documento && (
          <>
            <PanelPaginacion
              valor={sanitizarPaginacion(valorCampo(p.documento.tema.paginacion))}
              onCambiar={(v) => {
                const limpio = sanitizarPaginacion(v);
                p.onCambiarDocumento((d) => {
                  const tema = { ...d.tema };
                  if (limpio) tema.paginacion = valorPropio(limpio);
                  else delete tema.paginacion;
                  return { ...d, tema };
                });
              }}
              color={estilo?.acento ?? '#111827'}
              deshabilitado={p.deshabilitado}
            />
            <PanelCarrusel
              valor={sanitizarCarrusel(valorCampo(p.documento.tema.carrusel))}
              onCambiar={(v) => {
                const limpio = sanitizarCarrusel(v);
                p.onCambiarDocumento((d) => {
                  const tema = { ...d.tema };
                  if (limpio) tema.carrusel = valorPropio(limpio);
                  else delete tema.carrusel;
                  return { ...d, tema };
                });
              }}
              deshabilitado={p.deshabilitado}
            />
          </>
        )}
        {!estilo ? (
          <p className="px-1 text-[13px] leading-[18px] text-fg-secondary">{t('estiloSitio.sinDatos')}</p>
        ) : null}
        {tarjetaProductoTemaDisponible() && p.enV2 && p.documento && (
          <div className="mt-4">
            <InspectorTarjetaProducto
              guardado={valorCampo(p.documento.tema.tarjetaProducto)}
              onCambiar={(estiloTarjeta) =>
                p.onCambiarDocumento((d) => ({
                  ...d,
                  tema: { ...d.tema, tarjetaProducto: valorPropio(estiloTarjeta as TarjetaProductoDocumento) },
                }))
              }
              onQuitar={() =>
                p.onCambiarDocumento((d) => ({
                  ...d,
                  tema: { ...d.tema, tarjetaProducto: vaciar() },
                }))
              }
            />
          </div>
        )}
        {cascaronTemaDisponible() && p.enV2 && p.documento && (
          <EstiloGlobalSecciones documento={p.documento} onCambiarDocumento={p.onCambiarDocumento} deshabilitado={p.deshabilitado} />
        )}
        {urgenciaDocumentoDisponible() && p.enV2 && p.documento && (
          <PanelUrgencia documento={p.documento} onCambiarDocumento={p.onCambiarDocumento} deshabilitado={p.deshabilitado} />
        )}
      </div>
    </aside>
  );
}

const control = 'h-8 w-full rounded-md border border-line bg-surface px-2 text-sm';

function EstiloGlobalSecciones({
  documento,
  onCambiarDocumento,
  deshabilitado,
}: {
  documento: DocumentoSitio
  onCambiarDocumento: (cambiar: (d: DocumentoSitio) => DocumentoSitio) => void
  deshabilitado?: boolean
}) {
  const actual = ((documento.tema as { seccion?: Record<string, unknown> }).seccion ?? {}) as Record<string, unknown>
  const set = (k: string, v: unknown) => {
    onCambiarDocumento((d) => {
      const seccion = { ...((d.tema as { seccion?: Record<string, unknown> }).seccion ?? {}) }
      if (v == null || v === '') delete seccion[k]
      else seccion[k] = v
      return { ...d, tema: { ...d.tema, seccion: Object.keys(seccion).length ? seccion : undefined } }
    })
  }
  const fuentes: FuentesTema = {
    titulos: valorCampo(documento.tema.tipografia?.titulos) ?? null,
    cuerpo: valorCampo(documento.tema.tipografia?.cuerpo) ?? null,
  }
  const aplicar = () => {
    onCambiarDocumento((d) => ({
      ...d,
      paginas: d.paginas.map((p) => ({
        ...p,
        secciones: p.secciones.map((s) => ({
          ...s,
          contenido: (() => {
            const header = { ...(s.contenido.section_header as Record<string, unknown> | undefined), ...actual }
            return Object.keys(header).length
              ? { ...s.contenido, section_header: header }
              : s.contenido
          })(),
        })),
      })),
    }))
  }
  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-line px-1 pt-3">
      <p className="text-sm font-semibold text-fg">Encabezados de sección</p>
      <p className="flex flex-col gap-1 text-[12px] text-fg-secondary">Aplican a toda la tienda. Cada sección puede heredarlos o pisarlos.</p>
      <div role="group" aria-label="Alineación" className="flex flex-col gap-1 text-[12px] text-fg-secondary">Alineación
        <SelectKit className={control} disabled={deshabilitado} value={String(actual.align ?? '')} onChange={(e) => set('align', e.target.value)}>
          <option value="">Como hoy</option>
          <option value="left">Izquierda</option>
          <option value="center">Centro</option>
          <option value="right">Derecha</option>
        </SelectKit>
      </div>
      <div role="group" aria-label="Disposición" className="flex flex-col gap-1 text-[12px] text-fg-secondary">Disposición
        <SelectKit className={control} disabled={deshabilitado} value={String(actual.layout ?? '')} onChange={(e) => set('layout', e.target.value)}>
          <option value="">Como hoy</option>
          <option value="stacked">Título arriba</option>
          <option value="inline">Título y enlace en fila</option>
          <option value="side">Columna lateral</option>
        </SelectKit>
      </div>
      <div role="group" aria-label="Tamaño del título" className="flex flex-col gap-1 text-[12px] text-fg-secondary">Tamaño del título
        <SelectKit className={control} disabled={deshabilitado} value={String(actual.title_size ?? '')} onChange={(e) => set('title_size', e.target.value)}>
          <option value="">Como hoy</option>
          {TAMANOS_TITULO.map(([v, e]) => <option key={v} value={v}>{e}</option>)}
        </SelectKit>
      </div>
      <div role="group" aria-label="Peso" className="flex flex-col gap-1 text-[12px] text-fg-secondary">Peso
        <SelectKit className={control} disabled={deshabilitado} value={String(actual.title_weight ?? '')} onChange={(e) => set('title_weight', e.target.value)}>
          <option value="">Como hoy</option>
          {PESOS.map(([v, e]) => <option key={v} value={v}>{e}</option>)}
        </SelectKit>
      </div>
      <CasillaKit titulo="Mayúsculas" disabled={deshabilitado} checked={actual.title_uppercase === true} onChange={(e) => set('title_uppercase', e.target.checked)} />
      <div role="group" aria-label="Línea decorativa" className="flex flex-col gap-1 text-[12px] text-fg-secondary">Línea decorativa
        <SelectKit className={control} disabled={deshabilitado} value={String(actual.title_line ?? '')} onChange={(e) => set('title_line', e.target.value)}>
          <option value="">Ninguna</option>
          <option value="below">Debajo</option>
          <option value="sides">A los lados</option>
        </SelectKit>
      </div>
      <ColorKit etiqueta="Color del título" disabled={deshabilitado} value={typeof actual.title_color === 'string' && actual.title_color.startsWith('#') ? actual.title_color : '#111827'} onChange={(e) => set('title_color', e.target.value)} />
      <FontField etiqueta="Fuente del título" deshabilitado={deshabilitado} valor={fuenteEncabezadoAlCampo(actual.title_font)} onCambiar={(v) => set('title_font', fuenteEncabezadoAlGuardar(v, fuentes, 'titulos'))} fuentesTema={fuentes} porDefecto="titulos" catalogo={FONTS} familiaCss={familiaCss} />
      <div role="group" aria-label="Tamaño de la descripción" className="flex flex-col gap-1 text-[12px] text-fg-secondary">Tamaño de la descripción
        <SelectKit className={control} disabled={deshabilitado} value={String(actual.description_size ?? '')} onChange={(e) => set('description_size', e.target.value)}>
          <option value="">Como hoy</option>
          <option value="sm">Pequeño</option>
          <option value="md">Mediano</option>
          <option value="lg">Grande</option>
        </SelectKit>
      </div>
      <div role="group" aria-label="Peso de la descripción" className="flex flex-col gap-1 text-[12px] text-fg-secondary">Peso de la descripción
        <SelectKit className={control} disabled={deshabilitado} value={String(actual.description_weight ?? '')} onChange={(e) => set('description_weight', e.target.value)}>
          <option value="">Como hoy</option>
          {PESOS.map(([v, e]) => <option key={v} value={v}>{e}</option>)}
        </SelectKit>
      </div>
      <ColorKit etiqueta="Color de la descripción" disabled={deshabilitado} value={typeof actual.description_color === 'string' && actual.description_color.startsWith('#') ? actual.description_color : '#4b5563'} onChange={(e) => set('description_color', e.target.value)} />
      <FontField etiqueta="Fuente de la descripción" deshabilitado={deshabilitado} valor={fuenteEncabezadoAlCampo(actual.description_font)} onCambiar={(v) => set('description_font', fuenteEncabezadoAlGuardar(v, fuentes, 'cuerpo'))} fuentesTema={fuentes} porDefecto="cuerpo" catalogo={FONTS} familiaCss={familiaCss} />
      <button type="button" className="text-left text-sm font-medium underline" disabled={deshabilitado} onClick={aplicar}>Aplicar a todas las secciones</button>
    </div>
  )
}
