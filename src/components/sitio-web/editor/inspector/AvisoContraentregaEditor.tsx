'use client';

/**
 * Aviso de contraentrega de la tienda (Figma «16 Sitio web» › «Final del pedido y aviso de
 * contraentrega»: editor E1 3071:82659 apagado y E2 3071:83099 encendido; aviso discreto
 * 3073:83426, ficha 3073:83567 y variantes 3073:83624; aprobado el 2026-11-24).
 *
 * Un solo dato, `header_carrito.avisoContraentrega` ({ carrito, ficha }, apagado por defecto), con
 * dos puntos de acceso:
 * - Encabezado › Carrito: grupo «Aviso de contraentrega» con las dos casillas
 *   ({@link GrupoAvisoContraentrega}).
 * - Ficha del producto › Acciones de compra: interruptor de la ficha
 *   ({@link InterruptorAvisoFicha}), junto al botón de compra.
 *
 * No guarda: cada cambio va a `cambiar` (el `cambiarAjustes` del editor) y el lienzo lo pinta en
 * vivo (`goadmin:settings`). En la tienda solo sale si la sede ofrece contraentrega con condiciones
 * (Ventas en línea › Pago contra entrega).
 */
import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, Banknote } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { RAIZ_SITIO_WEB } from '@/components/sitio-web/rutasSitioWeb';
import { opcionesCarrito } from '@/lib/website/v2/cabeceraTienda';
import { FilaInterruptor, InsigniaNuevo, TituloBloque } from './PartesZonaGlobal';
import { cambioAvisoContraentrega, type LugarAvisoContraentrega } from './cabeceraTiendaLogica';

type Ajustes = Record<string, unknown>;
type Cambiar = (cambio: Ajustes) => void;

/** Ventas en línea: ahí están las condiciones de contraentrega de cada sede. */
export const RUTA_CONDICIONES_CONTRAENTREGA = `${RAIZ_SITIO_WEB}/ventas`;

/** Textos: `sitioWeb.editor.avisoContraentrega.*` (es/en/fr/pt). */
function useT() {
  return useTranslations('sitioWeb.editor.avisoContraentrega');
}

const Ayuda = ({ children }: { children: React.ReactNode }) => <p className="text-[11px] leading-[14px] text-fg-muted">{children}</p>;

function EnlaceCondiciones() {
  const t = useT();
  return (
    <a
      href={RUTA_CONDICIONES_CONTRAENTREGA}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 self-start text-xs font-medium text-brand hover:underline"
      data-enlace-condiciones-contraentrega=""
    >
      {t('enlaceCondiciones')}
      <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
    </a>
  );
}

/** La línea tal como la pinta la tienda: gris, 12 px, con el billete y sin recuadro. */
function LineaVistaPrevia({ texto }: { texto: string }) {
  return (
    <p className="flex items-start gap-1.5 text-xs leading-4 text-fg-secondary">
      <Banknote aria-hidden="true" className="mt-px size-3.5 shrink-0" strokeWidth={1.5} />
      <span>{texto}</span>
    </p>
  );
}

/** Vista previa en vivo de lo encendido (Figma E2 › «Resultado»). Apagado todo, no sale. */
function VistaPreviaAviso({ lugares }: { lugares: readonly LugarAvisoContraentrega[] }) {
  const t = useT();
  if (lugares.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-subtle px-3 py-2.5" data-vista-previa-aviso="">
      <p className="text-[11px] font-medium leading-[14px] text-fg-muted">{t('vistaPrevia.etiqueta')}</p>
      {lugares.map((lugar) => (
        <div key={lugar} className="flex flex-col gap-1">
          <p className="text-[11px] leading-[14px] text-fg-secondary">{t(`vistaPrevia.donde.${lugar}`)}</p>
          <LineaVistaPrevia texto={t(`vistaPrevia.linea.${lugar}`)} />
        </div>
      ))}
    </div>
  );
}

function Casilla({ lugar, valor, onCambiar }: { lugar: LugarAvisoContraentrega; valor: boolean; onCambiar: (v: boolean) => void }) {
  const t = useT();
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <Checkbox id={id} checked={valor} onCheckedChange={(v) => onCambiar(v === true)} className="mt-0.5" data-casilla-aviso={lugar} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={id} className="text-[13px] leading-[18px] text-fg">
          {t(`casilla.${lugar}.titulo`)}
        </label>
        <Ayuda>{t(`casilla.${lugar}.ayuda`)}</Ayuda>
      </div>
    </div>
  );
}

/**
 * Encabezado › Carrito, debajo de «Envío gratis» (Figma E1/E2): «Mostrar el aviso» con las
 * casillas «En el carrito» y «En la ficha del producto», apagadas por defecto.
 */
export function GrupoAvisoContraentrega({ ajustes, cambiar, enBorrador }: { ajustes: Ajustes; cambiar: Cambiar; enBorrador: boolean }) {
  const t = useT();
  const aviso = opcionesCarrito(ajustes).avisoContraentrega;
  const lugares = (['carrito', 'ficha'] as const).filter((l) => aviso[l]);
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-3" data-grupo-aviso-contraentrega="">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <TituloBloque>{t('titulo')}</TituloBloque>
          <InsigniaNuevo />
        </div>
        <Ayuda>{t('ayuda')}</Ayuda>
      </div>
      <p className="text-[13px] font-medium leading-[18px] text-fg">{t('mostrar')}</p>
      <Casilla lugar="carrito" valor={aviso.carrito} onCambiar={(v) => cambiar(cambioAvisoContraentrega(ajustes, 'carrito', v))} />
      <Casilla lugar="ficha" valor={aviso.ficha} onCambiar={(v) => cambiar(cambioAvisoContraentrega(ajustes, 'ficha', v))} />
      <VistaPreviaAviso lugares={lugares} />
      <EnlaceCondiciones />
      {!enBorrador && <Ayuda>{t('soloBorrador')}</Ayuda>}
    </section>
  );
}

/**
 * Ficha del producto › Acciones de compra: el mismo dato que la casilla «En la ficha del
 * producto» de Encabezado › Carrito. Encenderlo aquí lo enciende allá (y al revés).
 */
export function InterruptorAvisoFicha({ ajustes, cambiar, enBorrador }: { ajustes: Ajustes; cambiar: Cambiar; enBorrador: boolean }) {
  const t = useT();
  const encendido = opcionesCarrito(ajustes).avisoContraentrega.ficha;
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-3" data-interruptor-aviso-ficha="">
      <FilaInterruptor
        titulo={t('ficha.titulo')}
        ayuda={t('ficha.ayuda')}
        valor={encendido}
        nuevo
        onCambiar={(v) => cambiar(cambioAvisoContraentrega(ajustes, 'ficha', v))}
      />
      <VistaPreviaAviso lugares={encendido ? ['ficha'] : []} />
      <Ayuda>{t('ficha.mismoDato')}</Ayuda>
      <EnlaceCondiciones />
      {!enBorrador && <Ayuda>{t('soloBorrador')}</Ayuda>}
    </section>
  );
}
