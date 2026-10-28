'use client';

/**
 * «Celular» dentro de Diseño del panel Encabezado (Figma v2, piezas del kit): menú del celular,
 * logo, orden de logo e íconos y menú inferior tipo app (opcional, apagado). Una opción por
 * función: lo que hoy se ve es el valor por defecto. Lógica en `celularLogica.ts`.
 */
import { useId } from 'react';
import { CampoNumero, ChipsOpcion, clasesBoton } from '@/components/kit';
import { useTextosEditor } from '../textos';
import { MenuInferiorPanel } from './MenuInferiorPanel';
import { ColorTema, EtiquetaGrupo, FilaInterruptor, TarjetaComposicion, TituloBloque } from './PartesZonaGlobal';
import {
  ANIMACIONES,
  FONDOS_PANEL,
  GLIFOS_MENU,
  LISTAS_CATEGORIA,
  TARJETAS_MENU,
  bordeIconos,
  buscadorPantallaCompleta,
  cambioBordeIconos,
  cambioBuscadorPantallaCompleta,
  cambioGlifoMenu,
  cambioLadoCajon,
  cambioPanel,
  cambioTarjetaMenu,
  glifoMenu,
  ladoCajon,
  muestraBuscadorPantallaCompleta,
  panelMenu,
  tarjetaMenu,
  type ClavePanel,
  type TarjetaMenu,
  LOGOS_CELULAR,
  ORDENES_CELULAR,
  cambioLogoCelular,
  cambioOrdenCelular,
  logoCelular,
  ordenCelular,
  BREAKPOINTS_CELULAR,
  ICONOS_VISIBLES,
  breakpointCelular,
  cambioBreakpointCelular,
  cambioColorIconosCelular,
  cambioIconoVisible,
  cambioMedidaCelular,
  colorIconosCelular,
  iconoVisible,
  medidaCelular,
  ajustesDistintosCelular,
  cambioIgualarCelular,
} from './celularLogica';

export function CelularEncabezado({ ajustes: a, cambiar, coloresTema, giro }: { ajustes: Record<string, unknown>; cambiar: (c: Record<string, unknown>) => void; coloresTema?: { fondo: string; texto: string }; giro?: string | null }) {
  const t = useTextosEditor();
  const idMenu = useId();
  const idLado = useId();
  const idAncho = useId();
  const idFondo = useId();
  const idCapa = useId();
  const idAnim = useId();
  const idCat = useId();
  const idLogo = useId();
  const idOrden = useId();
  const idGlifo = useId();
  const idEstilo = useId();
  const idBreak = useId();
  const idTamano = useId();
  const idAlto = useId();
  const aplicar = (c: Record<string, unknown>) => {
    if (Object.keys(c).length) cambiar(c);
  };
  const tarjeta = tarjetaMenu(a);
  const conPanel = tarjeta !== 'tabs' && tarjeta !== 'none';
  const panel = panelMenu(a);
  const ponerPanel = (k: ClavePanel, v: unknown) => cambiar(cambioPanel(a, k, v));
  const color = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const tm = (k: string) => t(`zonaGlobal.movilEncabezado.${k}`);
  return (
    <div className="flex flex-col gap-3" data-bloque="celular">
      <TituloBloque>{tm('titulo')}</TituloBloque>

      <div className="flex flex-col gap-2">
        <EtiquetaGrupo id={idMenu}>{tm('menu')}</EtiquetaGrupo>
        <div role="radiogroup" aria-labelledby={idMenu} className="grid grid-cols-2 gap-2">
          {TARJETAS_MENU.map((v) => (
            <TarjetaComposicion key={v} etiqueta={tm(`menuOpcion.${v}`)} seleccionada={tarjeta === v} onElegir={() => aplicar(cambioTarjetaMenu(a, v))}>
              <MiniaturaMenu tipo={v} />
            </TarjetaComposicion>
          ))}
        </div>
      </div>
      {tarjeta === 'cajon' && (
        <div className="flex flex-col gap-2">
          <EtiquetaGrupo id={idLado}>{tm('lado')}</EtiquetaGrupo>
          <ChipsOpcion
            aria-labelledby={idLado}
            opciones={(['derecha', 'izquierda'] as const).map((v) => ({ valor: v, etiqueta: tm(`ladoOpcion.${v}`) }))}
            valor={ladoCajon(a)}
            onValorChange={(v) => aplicar(cambioLadoCajon(a, v))}
          />
          <EtiquetaGrupo id={idAncho}>{tm('ancho')}</EtiquetaGrupo>
          <CampoNumero aria-labelledby={idAncho} valor={Number(panel.width)} decimales={0} minimo={70} maximo={100} sufijo="%" alinear="izquierda" onValorChange={(v) => ponerPanel('width', v == null ? null : Math.min(100, Math.max(70, Math.round(v))))} />
        </div>
      )}
      <fieldset disabled={!conPanel} aria-disabled={!conPanel} className={`flex flex-col gap-3 ${conPanel ? '' : 'opacity-50'}`} data-atenuado={!conPanel || undefined}>
        {!conPanel && <p className="text-[11px] leading-[14px] text-fg-muted">{tm('sinMenuAyuda')}</p>}
        <>
          <div className="flex flex-col gap-2">
            <EtiquetaGrupo id={idFondo}>{tm('fondo')}</EtiquetaGrupo>
            <ChipsOpcion
              aria-labelledby={idFondo}
              opciones={FONDOS_PANEL.map((v) => ({ valor: v, etiqueta: tm(`fondoOpcion.${v}`) }))}
              valor={String(panel.background) as (typeof FONDOS_PANEL)[number]}
              onValorChange={(v) => ponerPanel('background', v)}
            />
          </div>
          {panel.background === 'gradient' ? (
            <>
              <ColorTema etiqueta={tm('degradado1')} valor={color(panel.gradient_1)} colorTema={coloresTema?.fondo ?? '#FFFFFF'} onCambiar={(v) => ponerPanel('gradient_1', v)} />
              <ColorTema etiqueta={tm('degradado2')} valor={color(panel.gradient_2)} colorTema={coloresTema?.fondo ?? '#FFFFFF'} onCambiar={(v) => ponerPanel('gradient_2', v)} />
            </>
          ) : (
            <ColorTema etiqueta={tm('colorMenu')} valor={color(panel.color)} colorTema={coloresTema?.fondo ?? '#FFFFFF'} onCambiar={(v) => ponerPanel('color', v)} />
          )}
          <div className="flex flex-col gap-2">
            <EtiquetaGrupo id={idCapa}>{tm('capa')}</EtiquetaGrupo>
            <CampoNumero aria-labelledby={idCapa} valor={Number(panel.overlay)} decimales={0} minimo={0} maximo={90} sufijo="%" alinear="izquierda" onValorChange={(v) => ponerPanel('overlay', v == null ? null : Math.min(90, Math.max(0, Math.round(v))))} />
          </div>
          <div className="flex flex-col gap-2">
            <EtiquetaGrupo id={idAnim}>{tm('animacion')}</EtiquetaGrupo>
            <ChipsOpcion
              aria-labelledby={idAnim}
              opciones={ANIMACIONES.map((v) => ({ valor: v, etiqueta: tm(`animacionOpcion.${v}`) }))}
              valor={String(panel.animation) as (typeof ANIMACIONES)[number]}
              onValorChange={(v) => ponerPanel('animation', v)}
            />
          </div>
          <FilaInterruptor titulo={tm('panelLogo')} valor={panel.show_logo === true} onCambiar={(v) => ponerPanel('show_logo', v)} />
          <FilaInterruptor titulo={tm('panelBuscador')} valor={panel.show_search === true} onCambiar={(v) => ponerPanel('show_search', v)} />
          <FilaInterruptor titulo={tm('panelRedes')} valor={panel.show_social === true} onCambiar={(v) => ponerPanel('show_social', v)} />
          <FilaInterruptor titulo={tm('panelContacto')} valor={panel.show_contact === true} onCambiar={(v) => ponerPanel('show_contact', v)} />
          <div className="flex flex-col gap-2">
            <EtiquetaGrupo id={idCat}>{tm('categorias')}</EtiquetaGrupo>
            <ChipsOpcion
              aria-labelledby={idCat}
              opciones={LISTAS_CATEGORIA.map((v) => ({ valor: v, etiqueta: tm(`categoriasOpcion.${v}`) }))}
              valor={String(panel.categories) as (typeof LISTAS_CATEGORIA)[number]}
              onValorChange={(v) => ponerPanel('categories', v)}
            />
          </div>
        </>
      </fieldset>

      {muestraBuscadorPantallaCompleta(a) && (
        <FilaInterruptor
          titulo={tm('buscadorCompleto')}
          ayuda={tm('buscadorCompletoAyuda')}
          valor={buscadorPantallaCompleta(a)}
          onCambiar={(v) => cambiar(cambioBuscadorPantallaCompleta(a, v))}
        />
      )}

      <div className="flex flex-col gap-2">
        <EtiquetaGrupo id={idLogo}>{tm('logo')}</EtiquetaGrupo>
        <ChipsOpcion
          aria-labelledby={idLogo}
          opciones={LOGOS_CELULAR.map((v) => ({ valor: v, etiqueta: tm(`logoOpcion.${v}`) }))}
          valor={logoCelular(a)}
          onValorChange={(v) => aplicar(cambioLogoCelular(a, v))}
        />
      </div>
      <div className="flex flex-col gap-2">
        <EtiquetaGrupo id={idOrden}>{tm('orden')}</EtiquetaGrupo>
        <ChipsOpcion
          aria-labelledby={idOrden}
          opciones={ORDENES_CELULAR.map((v) => ({ valor: v, etiqueta: tm(`ordenOpcion.${v}`) }))}
          valor={ordenCelular(a)}
          onValorChange={(v) => aplicar(cambioOrdenCelular(a, v))}
        />
      </div>
      <div className={`flex flex-col gap-2 ${conPanel ? '' : 'opacity-50'}`} aria-disabled={!conPanel}>
        <EtiquetaGrupo id={idGlifo}>{tm('glifo')}</EtiquetaGrupo>
        <ChipsOpcion
          aria-labelledby={idGlifo}
          opciones={GLIFOS_MENU.map((v) => ({ valor: v, etiqueta: tm(`glifoOpcion.${v}`), deshabilitada: !conPanel }))}
          valor={glifoMenu(a)}
          onValorChange={(v) => conPanel && aplicar(cambioGlifoMenu(a, v))}
        />
        {!conPanel && <p className="text-[11px] leading-[14px] text-fg-muted">{tm('sinMenuAyuda')}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <EtiquetaGrupo id={idEstilo}>{tm('estiloIconos')}</EtiquetaGrupo>
        <ChipsOpcion
          aria-labelledby={idEstilo}
          opciones={[
            { valor: 'computador', etiqueta: tm('estiloIconosOpcion.computador') },
            { valor: 'borde', etiqueta: tm('estiloIconosOpcion.borde') },
          ]}
          valor={bordeIconos(a) ? 'borde' : 'computador'}
          onValorChange={(v) => aplicar(cambioBordeIconos(a, v === 'borde'))}
        />
        <p className="text-[11px] leading-[14px] text-fg-muted">{tm('estiloIconosAyuda')}</p>
      </div>

      {ajustesDistintosCelular(a).length > 0 && (
        <div role="status" className="flex flex-col gap-2 rounded-lg border border-border bg-subtle p-2.5" data-aviso="celular-distinto">
          <p className="text-[12px] leading-[16px] text-fg">{tm('distinto')}</p>
          <p className="text-[11px] leading-[14px] text-fg-muted">{ajustesDistintosCelular(a).map((k) => tm(`distintoOpcion.${k}`)).join(' · ')}</p>
          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => aplicar(cambioIgualarCelular(a))}>
            {tm('igualar')}
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-2">
          <EtiquetaGrupo id={idTamano}>{tm('tamanoLogo')}</EtiquetaGrupo>
          <CampoNumero aria-labelledby={idTamano} valor={medidaCelular(a, 'logo_size')} decimales={0} minimo={24} maximo={96} sufijo="px" placeholder={tm('automatico')} alinear="izquierda" onValorChange={(v) => aplicar(cambioMedidaCelular(a, 'logo_size', v))} />
        </div>
        <div className="flex flex-col gap-2">
          <EtiquetaGrupo id={idAlto}>{tm('alto')}</EtiquetaGrupo>
          <CampoNumero aria-labelledby={idAlto} valor={medidaCelular(a, 'header_height')} decimales={0} minimo={48} maximo={120} sufijo="px" placeholder={tm('automatico')} alinear="izquierda" onValorChange={(v) => aplicar(cambioMedidaCelular(a, 'header_height', v))} />
        </div>
      </div>
      <p className="text-[11px] leading-[14px] text-fg-muted">{tm('medidasAyuda')}</p>
      <div className="flex flex-col gap-2">
        <EtiquetaGrupo>{tm('iconos')}</EtiquetaGrupo>
        {ICONOS_VISIBLES.map((k) => (
          <FilaInterruptor key={k} titulo={tm(`iconoVisible.${k}`)} valor={iconoVisible(a, k)} onCambiar={(v) => aplicar(cambioIconoVisible(a, k, v))} />
        ))}
      </div>
      <ColorTema etiqueta={tm('colorIconos')} valor={colorIconosCelular(a)} colorTema={coloresTema?.texto ?? '#111827'} onCambiar={(v) => cambiar(cambioColorIconosCelular(a, v))} />
      <div className="flex flex-col gap-2">
        <EtiquetaGrupo id={idBreak}>{tm('breakpoint')}</EtiquetaGrupo>
        <ChipsOpcion
          aria-labelledby={idBreak}
          opciones={BREAKPOINTS_CELULAR.map((v) => ({ valor: String(v) as `${typeof v}`, etiqueta: `${v} px` }))}
          valor={String(breakpointCelular(a)) as `${(typeof BREAKPOINTS_CELULAR)[number]}`}
          onValorChange={(v) => aplicar(cambioBreakpointCelular(a, Number(v) as (typeof BREAKPOINTS_CELULAR)[number]))}
        />
        <p className="text-[11px] leading-[14px] text-fg-muted">{tm('breakpointAyuda')}</p>
      </div>

      <MenuInferiorPanel ajustes={a} cambiar={cambiar} giro={giro} coloresTema={coloresTema} />
    </div>
  );
}

/** Bocetos de las tarjetas del menú (Figma 1787:903064). */
function MiniaturaMenu({ tipo }: { tipo: TarjetaMenu }) {
  const lineas = (x: string, y: number, n: number) =>
    Array.from({ length: n }, (_, i) => <span key={i} className="absolute h-1 rounded-full bg-line" style={{ left: x, top: y + i * 7, width: '30%' }} />);
  switch (tipo) {
    case 'cajon':
      return (<><span className="absolute inset-y-0 left-0 w-2/5 bg-line/60" /><span className="absolute inset-y-0 right-0 w-3/5 bg-surface" />{lineas('50%', 10, 5)}</>);
    case 'bottom_sheet':
      return (<><span className="absolute inset-0 bg-line/60" /><span className="absolute inset-x-2 bottom-0 h-1/2 rounded-t-md bg-surface" />{lineas('20%', 40, 2)}</>);
    case 'fullscreen':
      return <>{lineas('35%', 10, 6)}</>;
    case 'tabs':
      return (<><span className="absolute inset-x-0 bottom-0 h-3 bg-surface" />{[20, 35, 50, 65, 80].map((x) => <span key={x} className="absolute bottom-1 size-1.5 rounded-full bg-brand" style={{ left: `${x}%` }} />)}</>);
    case 'top_dropdown':
      return (<><span className="absolute inset-0 bg-line/60" /><span className="absolute inset-x-0 top-0 h-1/2 bg-surface" />{lineas('35%', 6, 3)}</>);
    default:
      return <span className="absolute left-1/2 top-1/2 h-px w-1/2 -translate-x-1/2 bg-line" />;
  }
}
