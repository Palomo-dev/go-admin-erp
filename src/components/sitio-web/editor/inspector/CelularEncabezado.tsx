'use client';

/**
 * «Celular» dentro de Diseño del panel Encabezado (Figma v2, piezas del kit): menú del celular,
 * logo, orden de logo e íconos y menú inferior tipo app (opcional, apagado). Una opción por
 * función: lo que hoy se ve es el valor por defecto. Lógica en `celularLogica.ts`.
 */
import { useId } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { CampoNumero, ChipsOpcion, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { useTextosEditor } from '../textos';
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
  ICONOS_ITEM,
  LOGOS_CELULAR,
  MAX_ITEMS,
  MIN_ITEMS,
  ORDENES_CELULAR,
  TIPOS_ITEM,
  cambioItemsMenuInferior,
  cambioLogoCelular,
  cambioMenuInferiorActivo,
  cambioOrdenCelular,
  itemConTipo,
  itemNuevo,
  logoCelular,
  menuInferior,
  ordenCelular,
  type ItemMenuInferior,
} from './celularLogica';

export function CelularEncabezado({ ajustes: a, cambiar, coloresTema }: { ajustes: Record<string, unknown>; cambiar: (c: Record<string, unknown>) => void; coloresTema?: { fondo: string; texto: string } }) {
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
  const aplicar = (c: Record<string, unknown>) => {
    if (Object.keys(c).length) cambiar(c);
  };
  const tarjeta = tarjetaMenu(a);
  const conPanel = tarjeta !== 'tabs' && tarjeta !== 'none';
  const panel = panelMenu(a);
  const ponerPanel = (k: ClavePanel, v: unknown) => cambiar(cambioPanel(a, k, v));
  const color = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const inferior = menuInferior(a);
  const ponerItems = (items: ItemMenuInferior[]) => cambiar(cambioItemsMenuInferior(a, items));
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
      {conPanel && (
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
      )}

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
      <div className="flex flex-col gap-2">
        <EtiquetaGrupo id={idGlifo}>{tm('glifo')}</EtiquetaGrupo>
        <ChipsOpcion
          aria-labelledby={idGlifo}
          opciones={GLIFOS_MENU.map((v) => ({ valor: v, etiqueta: tm(`glifoOpcion.${v}`) }))}
          valor={glifoMenu(a)}
          onValorChange={(v) => aplicar(cambioGlifoMenu(a, v))}
        />
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

      <FilaInterruptor titulo={tm('inferior')} ayuda={tm('inferiorAyuda')} valor={inferior.activo} onCambiar={(v) => cambiar(cambioMenuInferiorActivo(a, v))} />
      {inferior.activo && (
        <ul className="flex flex-col gap-2" aria-label={tm('items')}>
          {inferior.items.map((it, i) => (
            <ItemInferior
              key={it.id}
              item={it}
              primero={i === 0}
              ultimo={i === inferior.items.length - 1}
              puedeQuitar={inferior.items.length > MIN_ITEMS}
              onCambiar={(nuevo) => ponerItems(inferior.items.map((x, j) => (j === i ? nuevo : x)))}
              onMover={(d) => {
                const l = [...inferior.items];
                const [x] = l.splice(i, 1);
                l.splice(i + d, 0, x);
                ponerItems(l);
              }}
              onQuitar={() => ponerItems(inferior.items.filter((_, j) => j !== i))}
            />
          ))}
          {inferior.items.length < MAX_ITEMS && (
            <li>
              <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => ponerItems([...inferior.items, itemNuevo(inferior.items)])}>
                <Plus aria-hidden="true" className="size-4" /> {tm('agregar')}
              </button>
            </li>
          )}
        </ul>
      )}
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

function ItemInferior(p: {
  item: ItemMenuInferior;
  primero: boolean;
  ultimo: boolean;
  puedeQuitar: boolean;
  onCambiar: (it: ItemMenuInferior) => void;
  onMover: (d: -1 | 1) => void;
  onQuitar: () => void;
}) {
  const t = useTextosEditor();
  const idTipo = useId();
  const idIcono = useId();
  const idTexto = useId();
  const idEnlace = useId();
  const it = p.item;
  const conEnlace = it.action === 'link';
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-2.5" data-item={it.id}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-fg">{it.label}</span>
        <div className="flex items-center gap-1">
          <button type="button" aria-label={t('zonaGlobal.movilEncabezado.subir')} disabled={p.primero} onClick={() => p.onMover(-1)} className="rounded p-1 text-fg-secondary hover:bg-subtle disabled:opacity-40">
            <ArrowUp aria-hidden="true" className="size-4" />
          </button>
          <button type="button" aria-label={t('zonaGlobal.movilEncabezado.bajar')} disabled={p.ultimo} onClick={() => p.onMover(1)} className="rounded p-1 text-fg-secondary hover:bg-subtle disabled:opacity-40">
            <ArrowDown aria-hidden="true" className="size-4" />
          </button>
          <button type="button" aria-label={t('zonaGlobal.movilEncabezado.quitar')} disabled={!p.puedeQuitar} onClick={p.onQuitar} className="rounded p-1 text-fg-secondary hover:bg-subtle disabled:opacity-40">
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>
      <EtiquetaGrupo id={idTipo}>{t('zonaGlobal.movilEncabezado.tipo')}</EtiquetaGrupo>
      <ChipsOpcion
        aria-labelledby={idTipo}
        opciones={TIPOS_ITEM.map((v) => ({ valor: v, etiqueta: t(`zonaGlobal.movilEncabezado.tipoOpcion.${v}`) }))}
        valor={it.kind}
        onValorChange={(v) => p.onCambiar(itemConTipo(it, v))}
      />
      <label htmlFor={idTexto} className="text-xs font-semibold text-fg-secondary">{t('zonaGlobal.movilEncabezado.texto')}</label>
      <Input id={idTexto} value={it.label} maxLength={24} onChange={(e) => p.onCambiar({ ...it, label: e.target.value })} />
      <FilaInterruptor titulo={t('zonaGlobal.movilEncabezado.mostrarTexto')} valor={it.show_label} onCambiar={(v) => p.onCambiar({ ...it, show_label: v })} />
      <EtiquetaGrupo id={idIcono}>{t('zonaGlobal.movilEncabezado.icono')}</EtiquetaGrupo>
      <ChipsOpcion
        aria-labelledby={idIcono}
        opciones={ICONOS_ITEM.map((v) => ({ valor: v, etiqueta: t(`zonaGlobal.movilEncabezado.iconoOpcion.${v}`) }))}
        valor={it.icon}
        onValorChange={(v) => p.onCambiar({ ...it, icon: v })}
      />
      {conEnlace && (
        <>
          <label htmlFor={idEnlace} className="text-xs font-semibold text-fg-secondary">{t('zonaGlobal.movilEncabezado.enlace')}</label>
          <Input id={idEnlace} value={it.href ?? ''} maxLength={300} placeholder="/" onChange={(e) => p.onCambiar({ ...it, href: e.target.value })} />
        </>
      )}
    </li>
  );
}
