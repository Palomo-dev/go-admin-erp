'use client';

/**
 * Panel «Pie de página» del editor del sitio (Figma 2064:102, tres paneles; aprobado el
 * 2026-10-06): Contenido (menús del pie, qué mostrar, texto), Diseño (composición, columnas,
 * celular y barra fija abajo) y Estilo (fondo). Cada cambio va a `onCambiar` (el `cambiarAjustes`
 * del editor) y se ve en vivo en el lienzo.
 */
import { useId, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { ChipsOpcion, TabBar, clasesBoton, idPanel, idPestana } from '@/components/kit';
import { ColorField } from '@/components/sitio-web/ui/ColorField';
import { ACCIONES_BARRA_MOVIL } from '@/lib/website/v2/mapeoAjustes';
import type { ShellPorDefecto } from '@/lib/website/v2/plantillaCompleta';
import { useTextosEditor } from '../textos';
import { BandaGlobal, CabeceraZona, CampoTexto, EtiquetaGrupo, FilaInterruptor, InsigniaNuevo, MiniaturaPie, TarjetaComposicion, TarjetaPlantilla, TituloBloque } from './PartesZonaGlobal';
import type { PestanaZona } from './InspectorEncabezado';
import { cambiosRestablecer, leerBarraMovil, opcionBooleana, valorBarraMovil, valorOpcion, type AccionBarraMovil, type ModoBarraMovil } from './zonaGlobalLogica';

export interface MenuPie {
  id: string;
  nombre: string;
}

export interface InspectorPieProps {
  ajustes: Record<string, unknown>;
  onCambiar: (cambios: Record<string, unknown>) => void;
  /** Menús del pie en su orden (V2). `null`: sitio legacy (se editan en la hoja de menús). */
  menusPie: readonly MenuPie[] | null;
  porDefecto: ShellPorDefecto;
  enBorrador: boolean;
  giro: string | null;
  coloresTema: { fondo: string; texto: string; acento: string };
  onEditarMenus: () => void;
  onAnadirMenu?: () => void;
  onQuitarMenu?: (id: string) => void;
  onCerrar: () => void;
  pestanaInicial?: PestanaZona;
}

const COMPOSICIONES = ['default', 'three_columns', 'centered', 'minimal', 'split'] as const;

export function InspectorPie(p: InspectorPieProps) {
  const t = useTextosEditor();
  const [pestana, setPestana] = useState<PestanaZona>(p.pestanaInicial ?? 'contenido');
  const titulo = t('zonaGlobal.titulo.footer');
  const idTabs = 'inspector-pie';
  return (
    <aside aria-label={t('inspector.etiqueta', { nombre: titulo })} className="flex h-full min-h-0 w-full flex-col bg-surface text-fg">
      <CabeceraZona titulo={titulo} onRestablecer={() => p.onCambiar(cambiosRestablecer('footer', p.porDefecto.footer))} onCerrar={p.onCerrar} />
      <TabBar
        id={idTabs}
        etiqueta={t('zonaGlobal.pestanas', { zona: titulo.toLowerCase() })}
        pestanas={[
          { valor: 'contenido', etiqueta: t('zonaGlobal.pestana.contenido') },
          { valor: 'diseno', etiqueta: t('zonaGlobal.pestana.diseno') },
          { valor: 'estilo', etiqueta: t('zonaGlobal.pestana.estilo') },
        ]}
        valor={pestana}
        onValorChange={setPestana}
        className="mt-2 px-2"
      />
      <div role="tabpanel" id={idPanel(idTabs, pestana)} aria-labelledby={idPestana(idTabs, pestana)} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
        <BandaGlobal />
        {pestana === 'contenido' && <Contenido {...p} />}
        {pestana === 'diseno' && (
          <>
            <TarjetaPlantilla nombre={p.porDefecto.nombre} enBorrador={p.enBorrador} />
            <Diseno {...p} />
          </>
        )}
        {pestana === 'estilo' && <Estilo {...p} />}
      </div>
    </aside>
  );
}

// ─── Contenido ─────────────────────────────────────────────────────────────────────────────────

function Contenido(p: InspectorPieProps) {
  const t = useTextosEditor();
  const a = p.ajustes;
  const cambiar = p.onCambiar;
  const b = (k: string) => opcionBooleana(a, k);
  const txt = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : '');
  const anio = new Date().getFullYear();
  return (
    <>
      <section className="flex flex-col gap-2">
        <TituloBloque>{t('zonaGlobal.pie.menus')}</TituloBloque>
        {p.menusPie === null ? (
          <button type="button" onClick={p.onEditarMenus} className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'self-start')}>
            {t('zonaGlobal.pie.editarMenus')}
          </button>
        ) : (
          <>
            {p.menusPie.length === 0 && <p className="text-[13px] leading-[18px] text-fg-secondary">{t('zonaGlobal.pie.sinMenus')}</p>}
            <ul className="flex flex-col gap-2">
              {p.menusPie.map((m, i) => (
                <li key={m.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface py-2 pl-3 pr-1">
                  <span className="min-w-0 flex-1 truncate text-[13px] leading-[18px] text-fg">
                    {m.nombre} <span className="text-xs text-fg-muted">{t('zonaGlobal.pie.columna', { n: i + 1 })}</span>
                  </span>
                  <button type="button" onClick={p.onEditarMenus} aria-label={t('zonaGlobal.pie.editarMenu', { menu: m.nombre })} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
                    {t('zonaGlobal.pie.editar')}
                  </button>
                  {p.onQuitarMenu && (
                    <button
                      type="button"
                      onClick={() => p.onQuitarMenu?.(m.id)}
                      aria-label={t('zonaGlobal.pie.quitarMenu', { menu: m.nombre })}
                      className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'w-8 px-0')}
                    >
                      <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {p.onAnadirMenu && (
              <button type="button" onClick={p.onAnadirMenu} className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'self-start')}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('zonaGlobal.pie.anadirMenu')}
              </button>
            )}
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <TituloBloque>{t('zonaGlobal.pie.queMostrar')}</TituloBloque>
        <FilaInterruptor titulo={t('zonaGlobal.pie.contacto')} ayuda={t('zonaGlobal.pie.contactoAyuda')} valor={b('footer_show_contact')} onCambiar={(v) => cambiar({ footer_show_contact: v })} />
        <FilaInterruptor titulo={t('zonaGlobal.pie.horario')} ayuda={t('zonaGlobal.pie.horarioAyuda')} valor={b('footer_show_hours')} onCambiar={(v) => cambiar({ footer_show_hours: v })} />
        <FilaInterruptor titulo={t('zonaGlobal.pie.redes')} valor={b('footer_show_social')} onCambiar={(v) => cambiar({ footer_show_social: v })} />
        <FilaInterruptor titulo={t('zonaGlobal.pie.whatsapp')} ayuda={t('zonaGlobal.pie.whatsappAyuda')} nuevo valor={b('footer_show_whatsapp')} onCambiar={(v) => cambiar({ footer_show_whatsapp: v })} />
        <FilaInterruptor titulo={t('zonaGlobal.pie.mapa')} ayuda={t('zonaGlobal.pie.mapaAyuda')} nuevo valor={b('footer_show_map')} onCambiar={(v) => cambiar({ footer_show_map: v })} />
        <FilaInterruptor titulo={t('zonaGlobal.pie.pagos')} ayuda={t('zonaGlobal.pie.pagosAyuda')} nuevo valor={b('footer_show_payment_methods')} onCambiar={(v) => cambiar({ footer_show_payment_methods: v })} />
        <FilaInterruptor titulo={t('zonaGlobal.pie.categorias')} valor={b('footer_show_categories')} onCambiar={(v) => cambiar({ footer_show_categories: v })} />
        <FilaInterruptor titulo={t('zonaGlobal.pie.boletin')} valor={b('footer_show_newsletter')} onCambiar={(v) => cambiar({ footer_show_newsletter: v })} />
        {b('footer_show_newsletter') && (
          <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
            <CampoTexto etiqueta={t('zonaGlobal.pie.boletinTitulo')} valor={txt('footer_newsletter_title')} onCambiar={(v) => cambiar({ footer_newsletter_title: v })} />
            <CampoTexto etiqueta={t('zonaGlobal.pie.boletinPlaceholder')} valor={txt('footer_newsletter_placeholder')} onCambiar={(v) => cambiar({ footer_newsletter_placeholder: v })} />
            <CampoTexto etiqueta={t('zonaGlobal.pie.boletinBoton')} valor={txt('footer_newsletter_button_text')} onCambiar={(v) => cambiar({ footer_newsletter_button_text: v })} />
          </div>
        )}
        <FilaInterruptor titulo={t('zonaGlobal.pie.hechoCon')} valor={b('show_powered_by')} onCambiar={(v) => cambiar({ show_powered_by: v })} />
      </section>

      <section className="flex flex-col gap-2">
        <TituloBloque>{t('zonaGlobal.pie.texto')}</TituloBloque>
        <CampoTexto etiqueta={t('zonaGlobal.pie.textoEtiqueta')} valor={txt('footer_text')} placeholder={t('zonaGlobal.pie.textoPlaceholder', { anio })} onCambiar={(v) => cambiar({ footer_text: v })} />
      </section>
    </>
  );
}

// ─── Diseño ────────────────────────────────────────────────────────────────────────────────────

function Diseno(p: InspectorPieProps) {
  const t = useTextosEditor();
  const a = p.ajustes;
  const cambiar = p.onCambiar;
  const idComp = useId();
  const idCol = useId();
  const idCel = useId();
  const idModo = useId();
  const idAcc = useId();
  const composicion = valorOpcion<string>(a, 'footer_style');
  const barra = leerBarraMovil(a);
  const activa = barra.modo !== 'ninguna';
  const cambiarBarra = (modo: ModoBarraMovil, acciones: readonly AccionBarraMovil[] = barra.acciones) =>
    cambiar({ mobile_bottom_bar: valorBarraMovil(modo, acciones, p.giro) });

  return (
    <>
      <div className="flex flex-col gap-3">
        <EtiquetaGrupo id={idComp}>{t('zonaGlobal.pie.diseno')}</EtiquetaGrupo>
        <div role="radiogroup" aria-labelledby={idComp} className="grid grid-cols-2 gap-1.5">
          {COMPOSICIONES.map((c) => (
            <TarjetaComposicion key={c} etiqueta={t(`zonaGlobal.pie.composicion.${c}`)} seleccionada={composicion === c} onElegir={() => cambiar({ footer_style: c })}>
              <MiniaturaPie composicion={c} />
            </TarjetaComposicion>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <EtiquetaGrupo id={idCol}>{t('zonaGlobal.pie.columnas')}</EtiquetaGrupo>
        <ChipsOpcion
          aria-labelledby={idCol}
          opciones={['2', '3', '4'].map((n) => ({ valor: n, etiqueta: n }))}
          valor={String(valorOpcion(a, 'footer_columns') ?? 4)}
          onValorChange={(v) => cambiar({ footer_columns: Number(v) })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <EtiquetaGrupo id={idCel}>{t('zonaGlobal.pie.celular')}</EtiquetaGrupo>
        <ChipsOpcion
          aria-labelledby={idCel}
          opciones={[
            { valor: 'accordion', etiqueta: t('zonaGlobal.pie.acordeon') },
            { valor: 'stacked', etiqueta: t('zonaGlobal.pie.apilado') },
            { valor: 'hidden', etiqueta: t('zonaGlobal.pie.oculto') },
          ]}
          valor={valorOpcion<string>(a, 'mobile_footer_style') ?? 'accordion'}
          onValorChange={(v) => cambiar({ mobile_footer_style: v })}
        />
      </div>
      <FilaInterruptor titulo={t('zonaGlobal.pie.redesCelular')} valor={opcionBooleana(a, 'mobile_footer_show_social')} onCambiar={(v) => cambiar({ mobile_footer_show_social: v })} />
      <FilaInterruptor titulo={t('zonaGlobal.pie.horarioCelular')} valor={opcionBooleana(a, 'mobile_footer_show_hours')} onCambiar={(v) => cambiar({ mobile_footer_show_hours: v })} />

      <section className="flex flex-col gap-3">
        <FilaInterruptor
          titulo={t('zonaGlobal.pie.barraMovil')}
          ayuda={t('zonaGlobal.pie.barraMovilAyuda')}
          nuevo
          valor={activa}
          onCambiar={(v) => cambiarBarra(v ? (p.giro === 'restaurante' ? 'auto' : 'lista') : 'ninguna')}
        />
        {activa && (
          <>
            <div className="flex flex-col gap-2">
              <EtiquetaGrupo id={idModo}>{t('zonaGlobal.pie.barraModo')}</EtiquetaGrupo>
              <ChipsOpcion
                aria-labelledby={idModo}
                opciones={[
                  { valor: 'auto', etiqueta: t('zonaGlobal.pie.barraAuto') },
                  { valor: 'lista', etiqueta: t('zonaGlobal.pie.barraElegir') },
                ]}
                valor={barra.modo === 'lista' ? 'lista' : 'auto'}
                onValorChange={(v) => cambiarBarra(v as ModoBarraMovil)}
              />
              {barra.modo === 'auto' && <p className="text-[11px] leading-[14px] text-fg-muted">{t('zonaGlobal.pie.barraAutoAyuda')}</p>}
            </div>
            {barra.modo === 'lista' && (
              <div className="flex flex-col gap-2">
                <EtiquetaGrupo id={idAcc}>{t('zonaGlobal.pie.barraAcciones')}</EtiquetaGrupo>
                <ChipsOpcion
                  multiple
                  aria-labelledby={idAcc}
                  opciones={ACCIONES_BARRA_MOVIL.map((acc) => ({
                    valor: acc,
                    etiqueta: t(`zonaGlobal.pie.accion.${acc}`),
                    deshabilitada: !barra.acciones.includes(acc) && barra.acciones.length >= 4,
                  }))}
                  valor={barra.acciones}
                  onValorChange={(lista) => lista.length > 0 && cambiarBarra('lista', lista)}
                />
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}

// ─── Estilo ────────────────────────────────────────────────────────────────────────────────────

function Estilo(p: InspectorPieProps) {
  const t = useTextosEditor();
  const a = p.ajustes;
  const cambiar = p.onCambiar;
  const id = useId();
  const fondo = valorOpcion<string>(a, 'footer_background') ?? 'dark';
  const propio = typeof a.footer_custom_bg_color === 'string' && a.footer_custom_bg_color ? (a.footer_custom_bg_color as string) : p.coloresTema.texto;
  return (
    <>
      <div className="flex flex-col gap-2">
        <EtiquetaGrupo id={id}>{t('zonaGlobal.pie.fondo')}</EtiquetaGrupo>
        <ChipsOpcion
          aria-labelledby={id}
          opciones={[
            { valor: 'tema', etiqueta: t('zonaGlobal.pie.fondoTema') },
            { valor: 'dark', etiqueta: t('zonaGlobal.pie.fondoOscuro') },
            { valor: 'light', etiqueta: t('zonaGlobal.pie.fondoClaro') },
            { valor: 'primary', etiqueta: t('zonaGlobal.pie.fondoMarca') },
            { valor: 'custom', etiqueta: t('zonaGlobal.pie.fondoPropio') },
          ]}
          valor={fondo}
          onValorChange={(v) => cambiar(v === 'custom' ? { footer_background: v, footer_custom_bg_color: propio } : { footer_background: v })}
        />
        <p className="flex items-start gap-1.5 text-[11px] leading-[14px] text-fg-muted">
          <InsigniaNuevo />
          {t('zonaGlobal.pie.fondoTemaAyuda')}
        </p>
        {fondo === 'custom' && <ColorField etiqueta={t('zonaGlobal.pie.colorFondo')} valor={propio} onCambiar={(v) => cambiar({ footer_custom_bg_color: v })} />}
      </div>
      <button
        type="button"
        onClick={() => cambiar(cambiosRestablecer('footer', p.porDefecto.footer))}
        className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'self-start')}
      >
        {t('zonaGlobal.restablecer')}
      </button>
    </>
  );
}
