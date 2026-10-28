'use client';

/**
 * «Celular» dentro de Diseño del panel Encabezado (Figma v2, piezas del kit): menú del celular,
 * logo, orden de logo e íconos y menú inferior tipo app (opcional, apagado). Una opción por
 * función: lo que hoy se ve es el valor por defecto. Lógica en `celularLogica.ts`.
 */
import { useId } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { ChipsOpcion, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { useTextosEditor } from '../textos';
import { EtiquetaGrupo, FilaInterruptor, TituloBloque } from './PartesZonaGlobal';
import {
  ICONOS_ITEM,
  LOGOS_CELULAR,
  MAX_ITEMS,
  MENUS_CELULAR,
  MIN_ITEMS,
  ORDENES_CELULAR,
  TIPOS_ITEM,
  cambioItemsMenuInferior,
  cambioLogoCelular,
  cambioMenuCelular,
  cambioMenuInferiorActivo,
  cambioOrdenCelular,
  itemConTipo,
  itemNuevo,
  logoCelular,
  menuCelular,
  menuInferior,
  ordenCelular,
  type ItemMenuInferior,
} from './celularLogica';

export function CelularEncabezado({ ajustes: a, cambiar }: { ajustes: Record<string, unknown>; cambiar: (c: Record<string, unknown>) => void }) {
  const t = useTextosEditor();
  const idMenu = useId();
  const idLogo = useId();
  const idOrden = useId();
  const aplicar = (c: Record<string, unknown>) => {
    if (Object.keys(c).length) cambiar(c);
  };
  const inferior = menuInferior(a);
  const ponerItems = (items: ItemMenuInferior[]) => cambiar(cambioItemsMenuInferior(a, items));
  return (
    <div className="flex flex-col gap-3" data-bloque="celular">
      <TituloBloque>{t('zonaGlobal.movilEncabezado.titulo')}</TituloBloque>
      <div className="flex flex-col gap-2">
        <EtiquetaGrupo id={idMenu}>{t('zonaGlobal.movilEncabezado.menu')}</EtiquetaGrupo>
        <ChipsOpcion
          aria-labelledby={idMenu}
          opciones={MENUS_CELULAR.map((v) => ({ valor: v, etiqueta: t(`zonaGlobal.movilEncabezado.menuOpcion.${v}`) }))}
          valor={menuCelular(a)}
          onValorChange={(v) => aplicar(cambioMenuCelular(a, v))}
        />
      </div>
      <div className="flex flex-col gap-2">
        <EtiquetaGrupo id={idLogo}>{t('zonaGlobal.movilEncabezado.logo')}</EtiquetaGrupo>
        <ChipsOpcion
          aria-labelledby={idLogo}
          opciones={LOGOS_CELULAR.map((v) => ({ valor: v, etiqueta: t(`zonaGlobal.movilEncabezado.logoOpcion.${v}`) }))}
          valor={logoCelular(a)}
          onValorChange={(v) => aplicar(cambioLogoCelular(a, v))}
        />
      </div>
      <div className="flex flex-col gap-2">
        <EtiquetaGrupo id={idOrden}>{t('zonaGlobal.movilEncabezado.orden')}</EtiquetaGrupo>
        <ChipsOpcion
          aria-labelledby={idOrden}
          opciones={ORDENES_CELULAR.map((v) => ({ valor: v, etiqueta: t(`zonaGlobal.movilEncabezado.ordenOpcion.${v}`) }))}
          valor={ordenCelular(a)}
          onValorChange={(v) => aplicar(cambioOrdenCelular(a, v))}
        />
      </div>
      <FilaInterruptor
        titulo={t('zonaGlobal.movilEncabezado.inferior')}
        ayuda={t('zonaGlobal.movilEncabezado.inferiorAyuda')}
        valor={inferior.activo}
        onCambiar={(v) => cambiar(cambioMenuInferiorActivo(a, v))}
      />
      {inferior.activo && (
        <ul className="flex flex-col gap-2" aria-label={t('zonaGlobal.movilEncabezado.items')}>
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
                <Plus aria-hidden="true" className="size-4" /> {t('zonaGlobal.movilEncabezado.agregar')}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
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
