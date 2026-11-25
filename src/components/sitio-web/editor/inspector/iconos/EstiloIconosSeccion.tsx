'use client';

/**
 * «Estilo de los íconos» (Figma «16 Sitio web» 2852:71245, propuesta 8 aprobada el 2026-11-23):
 * la MISMA sección en Encabezado › Íconos y en Menú inferior, con vista previa en vivo.
 *
 * Aplicar (solo el menú: igual para todos o propio por botón), Estilo (Línea, Relleno, Duotono,
 * Línea gruesa), Grosor (solo en Línea), Tamaño, Sombra, Fondo del ícono con su color y, en el
 * menú, los colores activo e inactivo. «Volver a como se ve hoy» borra la clave; «Igual que la
 * cabecera» (o «… que el menú inferior») copia el otro de un clic. Lo que se deja como hoy no se
 * escribe (lo limpia `leerEstiloGlifos`).
 */
import { useId } from 'react';
import { Copy, Heart, Home, LayoutGrid, ShoppingCart, Undo2, User, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { clasesBoton } from '@/components/kit';
import {
  ESTILOS_GLIFO,
  FORMAS_FONDO_GLIFO,
  GROSORES_GLIFO,
  SOMBRAS_GLIFO,
  TAMANO_GLIFO_MAX,
  TAMANO_GLIFO_MIN,
  estiloDePeso,
  grosorDePeso,
  pesoDeGrosor,
  type AlcanceGlifo,
  type EstiloGlifo,
  type EstiloGlifos,
  type FormaFondoGlifo,
  type GrosorGlifo,
  type PesoGlifo,
  type RefGlifo,
  type SombraGlifo,
} from '@/lib/website/v2/glifosTienda';
import { ColorTema, InsigniaNuevo, TarjetaComposicion } from '../PartesZonaGlobal';
import { FilaDeslizador, FilaSegmento } from '../PildoraYBoton';
import { IconoVista } from './GlifoEditor';
import { useTSelector } from './SelectorIconos';
import { estiloConCambio } from './selectorIconosLogica';

/** Un ícono de la vista previa: su dibujo de siempre y, si lo tiene, el del catálogo nuevo. */
export interface MuestraGlifo {
  clave: string;
  etiqueta: string;
  Lucide: LucideIcon;
  nombre: string;
  glifo?: RefGlifo | null;
}

/** Muestras por defecto (las del Figma): Inicio, Categorías, Favoritos, Carrito y Cuenta. */
export const MUESTRAS_MENU_POR_DEFECTO: readonly Omit<MuestraGlifo, 'etiqueta'>[] = [
  { clave: 'inicio', Lucide: Home, nombre: 'home' },
  { clave: 'categorias', Lucide: LayoutGrid, nombre: 'grid' },
  { clave: 'favoritos', Lucide: Heart, nombre: 'heart' },
  { clave: 'carrito', Lucide: ShoppingCart, nombre: 'cart' },
  { clave: 'cuenta', Lucide: User, nombre: 'user' },
];

/** Peso que guarda una tarjeta «Estilo»: Línea vuelve a lo de hoy salvo el grosor fino ya elegido. */
function pesoDeTarjeta(e: EstiloGlifo, actual: PesoGlifo | undefined): PesoGlifo | undefined {
  if (e === 'relleno') return 'fill';
  if (e === 'duotono') return 'duotone';
  if (e === 'gruesa') return 'bold';
  return actual === 'thin' || actual === 'light' ? actual : undefined;
}

export function EstiloIconosSeccion({
  ambito,
  estilo,
  onCambiar,
  copiar,
  colores,
  muestrasCabecera,
  muestrasMenu,
}: {
  ambito: 'cabecera' | 'menu';
  estilo: EstiloGlifos | null;
  onCambiar: (e: EstiloGlifos | null) => void;
  /** El estilo del otro lugar para «Igual que…» (`undefined` = sin el botón). */
  copiar?: { estilo: EstiloGlifos | null };
  colores: { fondo: string; texto: string; acento: string };
  muestrasCabecera: readonly MuestraGlifo[];
  muestrasMenu: readonly MuestraGlifo[];
}) {
  const t = useTSelector();
  const idEstilo = useId();
  const poner = (parte: Partial<EstiloGlifos>) => onCambiar(estiloConCambio(estilo, parte));
  const peso = estilo?.weight;
  const tarjeta = estiloDePeso(peso);
  const grosor = grosorDePeso(peso);
  const bg = estilo?.bg ?? null;
  const esMenu = ambito === 'menu';

  return (
    <section className="flex flex-col gap-3 border-t border-line pt-3" data-estilo-iconos={ambito}>
      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold leading-[18px] text-fg">
          {t('estiloTitulo')}
          <InsigniaNuevo />
        </h3>
        <p className="text-[11px] leading-[14px] text-fg-muted">{esMenu ? t('estiloAyudaMenu') : t('estiloAyudaCabecera')}</p>
      </div>

      <VistaPrevia estilo={estilo} colores={colores} muestrasCabecera={muestrasCabecera} muestrasMenu={muestrasMenu} />

      {esMenu && (
        <FilaSegmento<AlcanceGlifo>
          etiqueta={t('aplicar')}
          opciones={[
            { valor: 'all', etiqueta: t('alcance.all') },
            { valor: 'item', etiqueta: t('alcance.item') },
          ]}
          valor={estilo?.scope ?? 'all'}
          onCambiar={(v) => poner({ scope: v === 'item' ? 'item' : undefined })}
        />
      )}

      <div className="flex flex-col gap-2">
        <span id={idEstilo} className="text-xs font-semibold leading-4 text-fg-secondary">{t('estiloDibujo')}</span>
        <div role="radiogroup" aria-labelledby={idEstilo} className="grid grid-cols-4 gap-1.5">
          {ESTILOS_GLIFO.map((e) => (
            <TarjetaComposicion key={e} compacta etiqueta={t(`estiloCard.${e}`)} seleccionada={tarjeta === e} onElegir={() => poner({ weight: pesoDeTarjeta(e, peso) })}>
              <span className="flex h-full items-center justify-center gap-1 text-fg">
                {MUESTRAS_MENU_POR_DEFECTO.filter((m) => m.clave !== 'categorias' && m.clave !== 'cuenta').map((m) => (
                  <IconoVista key={m.clave} Lucide={m.Lucide} nombre={m.nombre} estilo={{ weight: pesoDeTarjeta(e, undefined) ?? 'regular' }} className="size-3.5" />
                ))}
              </span>
            </TarjetaComposicion>
          ))}
        </div>
      </div>

      <FilaSegmento<GrosorGlifo>
        etiqueta={t('grosor')}
        opciones={GROSORES_GLIFO.map((g) => ({ valor: g, etiqueta: t(`grosorOpcion.${g}`) }))}
        valor={grosor ?? 'normal'}
        deshabilitado={grosor === null}
        onCambiar={(g) => poner({ weight: g === 'normal' ? undefined : pesoDeGrosor(g) })}
      />
      {grosor === null && <p className="-mt-1.5 text-[11px] leading-[14px] text-fg-muted">{t('grosorSoloLinea')}</p>}

      <FilaDeslizador
        etiqueta={t('tamano')}
        valor={estilo?.size ?? 22}
        texto={estilo?.size ? `${estilo.size} px` : t('tamanoHoy')}
        min={TAMANO_GLIFO_MIN}
        max={TAMANO_GLIFO_MAX}
        onCambiar={(n) => poner({ size: n })}
        accion={
          estilo?.size ? (
            <button type="button" onClick={() => poner({ size: undefined })} className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'self-start')}>
              {t('tamanoVolver')}
            </button>
          ) : undefined
        }
      />

      <h4 className="text-xs font-semibold leading-4 text-fg-secondary">{t('efectos')}</h4>
      <FilaSegmento<SombraGlifo>
        etiqueta={t('sombra')}
        opciones={SOMBRAS_GLIFO.map((s) => ({ valor: s, etiqueta: t(`sombraOpcion.${s}`) }))}
        valor={estilo?.shadow ?? 'none'}
        onCambiar={(s) => poner({ shadow: s === 'none' ? undefined : s })}
      />
      <FilaSegmento<FormaFondoGlifo>
        etiqueta={t('fondo')}
        opciones={FORMAS_FONDO_GLIFO.map((f) => ({ valor: f, etiqueta: t(`fondoOpcion.${f}`) }))}
        valor={bg?.shape ?? 'none'}
        onCambiar={(f) => poner({ bg: f === 'none' ? undefined : { shape: f, ...(bg?.color ? { color: bg.color } : {}) } })}
      />
      {/* La lupa dentro de una barra de búsqueda solo toma el dibujo: el fondo es de los íconos sueltos. */}
      {!esMenu && <p className="-mt-1.5 text-[11px] leading-[14px] text-fg-muted">{t('fondoAyudaCabecera')}</p>}
      {bg && (
        <ColorTema
          etiqueta={t('colorFondo')}
          etiquetaNulo={esMenu ? t('colorFondoNuloMenu') : t('colorFondoNulo')}
          valor={bg.color ?? null}
          colorTema={colores.acento}
          onCambiar={(c) => poner({ bg: { shape: bg.shape, ...(c ? { color: c } : {}) } })}
        />
      )}
      {esMenu && (
        <>
          <ColorTema etiqueta={t('colorActivo')} etiquetaNulo={t('comoElMenu')} valor={estilo?.active ?? null} colorTema={colores.acento} onCambiar={(c) => poner({ active: c ?? undefined })} />
          <ColorTema etiqueta={t('colorInactivo')} etiquetaNulo={t('comoElMenu')} valor={estilo?.inactive ?? null} colorTema={colores.texto} onCambiar={(c) => poner({ inactive: c ?? undefined })} />
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {estilo && (
          <button type="button" onClick={() => onCambiar(null)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
            <Undo2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('volverHoy')}
          </button>
        )}
        {copiar && (
          <button type="button" onClick={() => onCambiar(copiar.estilo ? { ...copiar.estilo, ...(esMenu ? {} : { scope: undefined, active: undefined, inactive: undefined }) } : null)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
            <Copy aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {esMenu ? t('igualCabecera') : t('igualMenu')}
          </button>
        )}
      </div>
    </section>
  );
}

/** Cabecera y menú de muestra con el estilo en edición (lo mismo que pinta la tienda). */
function VistaPrevia({
  estilo,
  colores,
  muestrasCabecera,
  muestrasMenu,
}: {
  estilo: EstiloGlifos | null;
  colores: { fondo: string; texto: string; acento: string };
  muestrasCabecera: readonly MuestraGlifo[];
  muestrasMenu: readonly MuestraGlifo[];
}) {
  const t = useTSelector();
  const inactivo = estilo?.inactive ?? colores.texto;
  const activo = estilo?.active ?? colores.acento;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-subtle p-2.5" aria-label={t('vistaPrevia')} role="img">
      <span className="text-[11px] font-medium text-fg-muted">{t('vistaPrevia')}</span>
      <div className="flex items-center gap-2 rounded-md px-3 py-2" style={{ backgroundColor: colores.fondo, color: colores.texto, border: '1px solid color-mix(in srgb, currentColor 12%, transparent)' }}>
        <span className="size-3.5 rounded-sm" style={{ backgroundColor: colores.acento }} />
        <span className="flex-1 truncate text-[11px] font-bold uppercase">{t('muestra.tienda')}</span>
        {muestrasCabecera.map((m) => (
          <IconoVista key={m.clave} Lucide={m.Lucide} nombre={m.nombre} glifo={m.glifo} estilo={estilo ? { ...estilo, size: undefined } : null} className="size-4" />
        ))}
      </div>
      <div className="grid rounded-md px-1 py-1.5" style={{ gridTemplateColumns: `repeat(${muestrasMenu.length}, minmax(0, 1fr))`, backgroundColor: colores.fondo, border: '1px solid color-mix(in srgb, currentColor 12%, transparent)' }}>
        {muestrasMenu.map((m, i) => (
          <span key={m.clave} className="flex flex-col items-center gap-0.5" style={{ color: i === 0 ? activo : inactivo }}>
            <IconoVista Lucide={m.Lucide} nombre={m.nombre} glifo={m.glifo} estilo={estilo ? { ...estilo, size: undefined } : null} className="size-[18px]" fondo={i === 0 ? activo : null} />
            <span className="max-w-full truncate text-[9px] font-medium">{m.etiqueta}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
