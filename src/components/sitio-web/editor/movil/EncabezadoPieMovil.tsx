'use client';

/**
 * «Encabezado y pie · Estilo del sitio» en el celular (Figma D/05-27).
 *
 * Boceto del encabezado arriba, «Toca un ajuste para cambiarlo en una hoja inferior» y siete
 * ajustes (Diseño del encabezado, Buscador, Barra superior, Botón de acción, Acciones, Diseño
 * del pie, Menú en el celular), cada uno con su resumen y su hoja inferior (A/05l: «Cancelar» /
 * «Guardar en borrador»). Abajo, fijos, «Vista previa» y «Publicar».
 *
 * No hay lógica propia: los valores por defecto, los bocetos y los paneles son los del
 * inspector de escritorio (`opcionesEncabezado`, `opcionesPie`, `HeaderOptionsPanel`,
 * `FooterOptionsPanel`, `MobileHeaderPanel`) y todo se escribe con `editor.cambiarAjustes`,
 * que en V2 va al borrador y en legacy al lote de «Guardar y publicar».
 */
import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Columns3,
  Eye,
  Info,
  Layers,
  Search,
  Send,
  ShoppingBag,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';
import { FormField, PanelAdaptable, SegmentedControl, SettingRow, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { WebsiteSettings } from '@/lib/services/websiteSettingsService';
import HeaderLayoutSelector from '@/components/organization/branding/editor/HeaderLayoutSelector';
import HeaderOptionsPanel from '@/components/organization/branding/editor/HeaderOptionsPanel';
import FooterLayoutSelector from '@/components/organization/branding/editor/FooterLayoutSelector';
import FooterOptionsPanel from '@/components/organization/branding/editor/FooterOptionsPanel';
import MobileHeaderPanel from '@/components/organization/branding/editor/MobileHeaderPanel';
import {
  BocetoEncabezado,
  opcionesEncabezado,
  opcionesEncabezadoMovil,
} from '@/components/organization/branding/editor/inspector/HeaderInspector';
import { BocetoPie, opcionesPie } from '@/components/organization/branding/editor/inspector/FooterInspector';
import type { EditorSitio } from '../useEditorSitio';
import { useTextosEditor, type TraductorEditor } from '../textos';

export const AJUSTES_ENCABEZADO_PIE = ['diseno', 'buscador', 'barra', 'boton', 'acciones', 'pie', 'celular'] as const;
export type AjusteEncabezadoPie = (typeof AJUSTES_ENCABEZADO_PIE)[number];

const ICONO: Record<AjusteEncabezadoPie, LucideIcon> = {
  diseno: Layers,
  buscador: Search,
  barra: Info,
  boton: ArrowRight,
  acciones: ShoppingBag,
  pie: Columns3,
  celular: Smartphone,
};

/** `t(clave)` o el valor crudo si la clave no existe (estilos que agreguen después). */
function nombre(t: TraductorEditor, clave: string, valor: string): string {
  const r = t(`${clave}.${valor}`);
  return r === `${clave}.${valor}` ? valor : r;
}

/** Resumen de cada ajuste (segunda línea de la fila), con los mismos valores por defecto del inspector. */
export function resumenEncabezadoPie(settings: WebsiteSettings, t: TraductorEditor): Record<AjusteEncabezadoPie, string> {
  const e = opcionesEncabezado(settings);
  const m = opcionesEncabezadoMovil(settings);
  const { opciones: p } = opcionesPie(settings);
  const acciones = [e.show_header_cart && t('encabezadoPie.accion.carrito'), e.show_header_auth && t('encabezadoPie.accion.cuenta')].filter(
    (x): x is string => typeof x === 'string',
  );
  return {
    diseno: `${nombre(t, 'encabezadoPie.estiloEncabezado', e.header_style)} · ${nombre(t, 'encabezadoPie.posicionMenu', e.menu_position)}`,
    buscador: `${nombre(t, 'encabezadoPie.buscadorComputador', e.search_style)} · ${nombre(t, 'encabezadoPie.buscadorCelular', m.mobile_search_style)}`,
    barra: e.show_topbar
      ? e.topbar_announcement
        ? t('encabezadoPie.barraActivaAviso', { aviso: e.topbar_announcement })
        : t('encabezadoPie.barraActiva')
      : t('encabezadoPie.barraApagada'),
    boton: e.header_cta_text
      ? e.header_cta_url
        ? `${e.header_cta_text} → ${e.header_cta_url}`
        : e.header_cta_text
      : t('encabezadoPie.sinBoton'),
    acciones: acciones.length > 0 ? acciones.join(', ') : t('encabezadoPie.sinAcciones'),
    pie: `${nombre(t, 'encabezadoPie.estiloPie', p.footer_style)} · ${t('encabezadoPie.columnas', { n: p.footer_columns })}`,
    celular: `${nombre(t, 'encabezadoPie.menuCelular', m.mobile_menu_style)}${m.mobile_sticky_header ? ` · ${t('encabezadoPie.fijo')}` : ''}`,
  };
}

export interface EncabezadoPieMovilProps {
  editor: EditorSitio;
  onVolver: () => void;
  onPublicar: () => void;
  onVistaPrevia: () => void;
}

export function EncabezadoPieMovil({ editor, onVolver, onPublicar, onVistaPrevia }: EncabezadoPieMovilProps) {
  const t = useTextosEditor();
  const [hoja, setHoja] = useState<AjusteEncabezadoPie | null>(null);
  /** Cambios de la hoja aún sin aplicar: «Cancelar» los descarta (A/05l). */
  const [borrador, setBorrador] = useState<Partial<WebsiteSettings>>({});
  const base = (editor.settings ?? {}) as WebsiteSettings;
  const vista = { ...base, ...borrador } as WebsiteSettings;
  const resumen = resumenEncabezadoPie(base, t);
  const anotar = (cambios: Record<string, unknown>) => setBorrador((b) => ({ ...b, ...(cambios as Partial<WebsiteSettings>) }));
  const sinPermiso = !editor.permisos.editar;

  const abrir = (h: AjusteEncabezadoPie) => {
    setBorrador({});
    setHoja(h);
  };
  const guardar = async () => {
    if (Object.keys(borrador).length > 0) editor.cambiarAjustes(borrador);
    // En V2 va al borrador; en legacy guardar es publicar (como en el computador).
    const ok = editor.enV2 ? await editor.guardarAhora() : await editor.guardarLegacy();
    if (ok) {
      setBorrador({});
      setHoja(null);
    }
  };

  const e = opcionesEncabezado(vista);
  const m = opcionesEncabezadoMovil(vista);
  const { opciones: p } = opcionesPie(vista);

  return (
    <div className="flex h-[100dvh] flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-2">
        <button type="button" onClick={onVolver} aria-label={t('barra.volver')} className="flex size-10 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover">
          <ArrowLeft aria-hidden="true" className="size-5" strokeWidth={1.5} />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold leading-5 text-fg">{t('encabezadoPie.titulo')}</h1>
          <p className="truncate text-xs leading-4 text-fg-secondary">{t('encabezadoPie.subtitulo')}</p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-24 pt-4">
        <div className="overflow-hidden rounded-xl border border-line bg-surface" aria-hidden="true">
          <BocetoEncabezado settings={base} isMobile />
        </div>
        <p className="text-[13px] font-medium leading-[18px] text-fg-secondary">{t('encabezadoPie.ayuda')}</p>
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
          {AJUSTES_ENCABEZADO_PIE.map((a) => {
            const Icono = ICONO[a];
            return (
              <li key={a}>
                <button
                  type="button"
                  onClick={() => abrir(a)}
                  disabled={sinPermiso}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover disabled:opacity-50"
                >
                  <Icono aria-hidden="true" className="size-5 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{t(`encabezadoPie.ajuste.${a}`)}</span>
                    <span className="block truncate text-[13px] leading-[18px] text-fg-secondary">{resumen[a]}</span>
                  </span>
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t border-line bg-surface p-4">
        <button type="button" onClick={onVistaPrevia} className={clasesBoton({ variante: 'secundario', tamano: 'md', anchoCompleto: true })}>
          <Eye aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('barra.vistaPrevia')}
        </button>
        <button
          type="button"
          onClick={onPublicar}
          disabled={!editor.permisos.publicar}
          title={editor.permisos.publicar ? undefined : t('barra.sinPermisoPublicar')}
          className={clasesBoton({ variante: 'primario', tamano: 'md', anchoCompleto: true })}
        >
          <Send aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {editor.enV2 ? t('barra.publicar') : t('barra.guardarPublicar')}
        </button>
      </div>

      <PanelAdaptable
        abierto={hoja !== null}
        onAbiertoChange={(a) => !a && setHoja(null)}
        titulo={hoja ? t(`encabezadoPie.ajuste.${hoja}`) : ''}
        icono={hoja ? ICONO[hoja] : undefined}
        ocupado={editor.isSaving}
        pie={
          <div className="flex w-full gap-2">
            <button type="button" onClick={() => setHoja(null)} className={clasesBoton({ variante: 'secundario', tamano: 'md', anchoCompleto: true })}>
              {t('acciones.cancelar')}
            </button>
            <button type="button" onClick={() => void guardar()} disabled={editor.isSaving} className={clasesBoton({ variante: 'primario', tamano: 'md', anchoCompleto: true })}>
              {editor.enV2 ? t('movil.guardarBorrador') : t('barra.guardarPublicar')}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {hoja === 'diseno' && (
            <>
              <HeaderLayoutSelector currentLayout={e.header_style} onSelect={(layout) => anotar({ header_style: layout })} />
              <BocetoEncabezado settings={vista} isMobile />
              <HeaderOptionsPanel grupo="diseno" settings={e} onUpdate={anotar} availableMenus={editor.availableMenus} />
            </>
          )}
          {hoja === 'buscador' && (
            <>
              <FormField etiqueta={t('encabezadoPie.buscadorEnComputador')}>
                <SegmentedControl
                  anchoCompleto
                  valor={e.search_style}
                  onValorChange={(v) => anotar({ search_style: v })}
                  opciones={(['bar', 'icon', 'hidden'] as const).map((v) => ({ valor: v, etiqueta: nombre(t, 'encabezadoPie.buscadorComputador', v) }))}
                />
              </FormField>
              <FormField etiqueta={t('encabezadoPie.buscadorEnCelular')}>
                <SegmentedControl
                  anchoCompleto
                  valor={m.mobile_search_style}
                  onValorChange={(v) => anotar({ mobile_search_style: v })}
                  opciones={(['bar', 'icon', 'hidden'] as const).map((v) => ({ valor: v, etiqueta: nombre(t, 'encabezadoPie.buscadorCelular', v) }))}
                />
              </FormField>
            </>
          )}
          {hoja === 'barra' && (
            <>
              <SettingRow titulo={t('encabezadoPie.mostrarBarra')} htmlFor="ep-barra">
                <Switch id="ep-barra" checked={e.show_topbar} onCheckedChange={(v) => anotar({ show_topbar: v })} />
              </SettingRow>
              <FormField etiqueta={t('movil.aviso')} ayuda={t('movil.avisoAyuda')}>
                <Input
                  value={e.topbar_announcement ?? ''}
                  maxLength={160}
                  onChange={(ev) => anotar({ topbar_announcement: ev.target.value || null })}
                  placeholder={t('movil.avisoPlaceholder')}
                  className="h-10 rounded-lg"
                />
              </FormField>
              <SettingRow titulo={t('encabezadoPie.barraTelefono')} htmlFor="ep-tel">
                <Switch id="ep-tel" checked={e.topbar_show_phone} onCheckedChange={(v) => anotar({ topbar_show_phone: v })} />
              </SettingRow>
              <SettingRow titulo={t('encabezadoPie.barraCorreo')} htmlFor="ep-correo">
                <Switch id="ep-correo" checked={e.topbar_show_email} onCheckedChange={(v) => anotar({ topbar_show_email: v })} />
              </SettingRow>
            </>
          )}
          {hoja === 'boton' && (
            <>
              <FormField etiqueta={t('encabezadoPie.botonTexto')} ayuda={t('encabezadoPie.botonAyuda')}>
                <Input value={e.header_cta_text ?? ''} maxLength={40} onChange={(ev) => anotar({ header_cta_text: ev.target.value || null })} className="h-10 rounded-lg" />
              </FormField>
              <FormField etiqueta={t('encabezadoPie.botonEnlace')}>
                <Input value={e.header_cta_url ?? ''} maxLength={300} onChange={(ev) => anotar({ header_cta_url: ev.target.value || null })} placeholder="/reservas" className="h-10 rounded-lg" />
              </FormField>
            </>
          )}
          {hoja === 'acciones' && (
            <>
              <SettingRow titulo={t('encabezadoPie.accion.carrito')} htmlFor="ep-carrito">
                <Switch id="ep-carrito" checked={e.show_header_cart} onCheckedChange={(v) => anotar({ show_header_cart: v })} />
              </SettingRow>
              <SettingRow titulo={t('encabezadoPie.accion.cuenta')} htmlFor="ep-cuenta">
                <Switch id="ep-cuenta" checked={e.show_header_auth} onCheckedChange={(v) => anotar({ show_header_auth: v })} />
              </SettingRow>
            </>
          )}
          {hoja === 'pie' && (
            <>
              <FooterLayoutSelector currentLayout={p.footer_style} onSelect={(layout) => anotar({ footer_style: layout })} />
              <BocetoPie settings={vista} isMobile />
              <FooterOptionsPanel grupo="diseno" settings={p} onUpdate={anotar} />
            </>
          )}
          {hoja === 'celular' && <MobileHeaderPanel settings={m} onUpdate={anotar} />}
        </div>
      </PanelAdaptable>
    </div>
  );
}
