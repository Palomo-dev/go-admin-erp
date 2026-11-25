'use client';

/**
 * Aviso de contraentrega de la tienda (Figma «16 Sitio web» › «Final del pedido y aviso de
 * contraentrega»: editor E1 3071:82659 apagado y E2 3071:83099 encendido; aviso discreto
 * 3073:83426, ficha 3073:83567 y variantes 3073:83624; aprobado el 2026-11-24).
 *
 * Un solo dato, `header_carrito.avisoContraentrega` ({ carrito, ficha }, apagado por defecto), con
 * un interruptor por lugar (opción A con switches, Figma 3098:83528, aprobada el 2026-11-24):
 * - Encabezado › Carrito: «Aviso de contraentrega en el carrito» ({@link GrupoAvisoContraentrega}).
 * - Ficha › Información del producto › Diseño: «Mostrar aviso de contraentrega», junto a «Mostrar
 *   countdown» ({@link InterruptorAvisoFicha}).
 *
 * No guarda: cada cambio va a `cambiar` (el `cambiarAjustes` del editor) y el lienzo lo pinta en
 * vivo (`goadmin:settings`). En la tienda solo sale si la sede ofrece contraentrega con condiciones
 * (Ventas en línea › Pago contra entrega).
 */
import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, Banknote } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { SettingRow } from '@/components/kit';
import { RAIZ_SITIO_WEB } from '@/components/sitio-web/rutasSitioWeb';
import { opcionesCarrito } from '@/lib/website/v2/cabeceraTienda';
import { FilaInterruptor } from './PartesZonaGlobal';
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

/**
 * Encabezado › Carrito, debajo de «Envío gratis» (Figma 3098:83737, opción A aprobada el
 * 2026-11-24): un solo interruptor «Aviso de contraentrega en el carrito», apagado por defecto.
 * El de la ficha vive en Ficha › Información del producto ({@link InterruptorAvisoFicha}).
 */
export function GrupoAvisoContraentrega({ ajustes, cambiar, enBorrador }: { ajustes: Ajustes; cambiar: Cambiar; enBorrador: boolean }) {
  const t = useT();
  const encendido = opcionesCarrito(ajustes).avisoContraentrega.carrito;
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-3" data-grupo-aviso-contraentrega="">
      <FilaInterruptor
        titulo={t('carrito.titulo')}
        ayuda={t('carrito.ayuda')}
        valor={encendido}
        nuevo
        onCambiar={(v) => cambiar(cambioAvisoContraentrega(ajustes, 'carrito', v))}
      />
      <VistaPreviaAviso lugares={encendido ? ['carrito'] : []} />
      <EnlaceCondiciones />
      {!enBorrador && <Ayuda>{t('soloBorrador')}</Ayuda>}
    </section>
  );
}

/**
 * Ficha › Información del producto, pestaña Diseño, debajo de «Mostrar countdown» y con su mismo
 * aspecto (Figma 3099:83909, opción A aprobada el 2026-11-24). Escribe
 * `header_carrito.avisoContraentrega.ficha`.
 */
export function InterruptorAvisoFicha({ ajustes, cambiar, enBorrador }: { ajustes: Ajustes; cambiar: Cambiar; enBorrador: boolean }) {
  const t = useT();
  const id = useId();
  const encendido = opcionesCarrito(ajustes).avisoContraentrega.ficha;
  return (
    <div className="flex flex-col gap-3" data-interruptor-aviso-ficha="">
      <SettingRow titulo={t('ficha.titulo')} htmlFor={id}>
        <Switch id={id} checked={encendido} onCheckedChange={(v) => cambiar(cambioAvisoContraentrega(ajustes, 'ficha', v))} />
      </SettingRow>
      <VistaPreviaAviso lugares={encendido ? ['ficha'] : []} />
      <EnlaceCondiciones />
      {!enBorrador && <Ayuda>{t('soloBorrador')}</Ayuda>}
    </div>
  );
}
