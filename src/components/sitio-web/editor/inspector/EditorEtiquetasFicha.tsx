'use client';

/**
 * Panel «Etiquetas» del bloque «Información del producto» (`product_info`) de la ficha
 * (Figma «16 Sitio web», sección 3036:78040, panel 3040:78682, aprobado por el dueño el
 * 2026-11-24): las etiquetas de la tarjeta de producto también en la ficha, sobre la foto (A),
 * junto al título (B) o en los dos lugares.
 *
 * No guarda: cada cambio va a `onCambiar` (contenido del bloque) y el lienzo lo pinta en vivo
 * por el puente (`FichaEnVivo` en la tienda; `recargaLienzoDetalle.ts` no recarga por
 * `product_info`). Escribe SOLO las claves de `CLAVES_ETIQUETAS_FICHA`
 * (`@/lib/website/v2/seccionesFicha`, la misma copia que lee la tienda):
 * - Sin `labels_show: true` la ficha queda como hoy. Apagar el interruptor quita solo
 *   `labels_show`: lo demás se conserva para cuando se vuelva a encender. «Volver al aspecto de
 *   hoy» quita todas las claves de etiquetas.
 * - «Etiquetas propias»: sin `labels_custom` la ficha usa las del estilo de tarjeta del sitio. Al
 *   apagar «Usar las del estilo de tarjeta» se guarda una copia de las del sitio (o una lista
 *   vacía, que sigue siendo «propia de la ficha»). La lista se edita con el mismo editor de la
 *   tarjeta (`EtiquetasPropiasTarjeta`).
 * - La fila «Etiquetas propias» de «Cuáles» solo se ordena y se apaga: cada etiqueta propia ya
 *   trae su esquina y sus colores.
 *
 * Textos: `sitioWeb.editor.etiquetasFicha.*` (es/en/fr/pt).
 */
import { useId, useMemo, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Layers, Truck, TrendingUp, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { ChipsOpcion, SegmentedControl, clasesBoton } from '@/components/kit';
import { AsaArrastre, CLASES_HUECO, Ordenable, ZonaOrdenable } from '@/components/kit/arrastreTabla';
import { Switch } from '@/components/ui/switch';
import {
  CLAVES_ETIQUETAS_FICHA,
  CLAVES_NUEVAS_ETIQUETAS,
  ESQUINAS_ETIQUETA_FICHA,
  FORMAS_ETIQUETA_FICHA,
  RELLENOS_ETIQUETA_FICHA,
  TAMANOS_ETIQUETA_FICHA,
  UBICACIONES_ETIQUETAS_FICHA,
  conClave,
  etiquetasEn,
  itemsEtiquetasParaGuardar,
  leerOpcionesEtiquetasFicha,
  sinClaves,
  type EsquinaEtiquetaFicha,
  type EtiquetaFichaItem,
  type FormaEtiquetaFicha,
  type RellenoEtiquetaFicha,
  type TamanoEtiquetaFicha,
  type TipoEtiquetaFicha,
  type UbicacionEtiquetasFicha,
} from '@/lib/website/v2/seccionesFicha';
import { normalizarTarjeta, type EtiquetaPropiaTarjeta } from '@/lib/website/tarjetaProducto';
import { EtiquetasPropiasTarjeta } from './EtiquetasPropiasTarjeta';
import { ColorTema, EtiquetaGrupo, FilaInterruptor, InsigniaNuevo, TituloBloque } from './PartesZonaGlobal';

/** Color del «Precio por volumen» si el sitio no tiene color primario. */
export const COLOR_VOLUMEN_POR_DEFECTO = '#F97316';

/** Colores por defecto de cada etiqueta (los de la tarjeta, `tarjetaProducto.ts`). `null` = el primario. */
const COLOR_POR_DEFECTO: Readonly<Record<TipoEtiquetaFicha, string | null>> = {
  free_shipping: '#3B82F6',
  discount: '#EF4444',
  promotion: '#EF4444',
  volume: null,
  sales_count: '#374151',
  new: '#10B981',
  sold_out: '#1F2937',
  custom: '#111827',
};

const ICONO_MUESTRA: Partial<Record<TipoEtiquetaFicha, LucideIcon>> = {
  free_shipping: Truck,
  volume: Layers,
  sales_count: TrendingUp,
};

const RADIO_FORMA: Readonly<Record<FormaEtiquetaFicha, string>> = {
  tarjeta: '9999px',
  pill: '9999px',
  rounded: '6px',
  semi: '10px',
  square: '0px',
};

/** Estilo de la muestra: forma, relleno y colores elegidos («De la tarjeta» se ve como sólido y píldora). */
export function estiloMuestraEtiqueta(bg: string, texto: string, forma: FormaEtiquetaFicha, relleno: RellenoEtiquetaFicha): CSSProperties {
  const radio = RADIO_FORMA[forma];
  if (relleno === 'soft') return { backgroundColor: `color-mix(in srgb, ${bg} 16%, white)`, color: bg, borderRadius: radio };
  if (relleno === 'outline') return { backgroundColor: 'transparent', color: bg, border: `1px solid ${bg}`, borderRadius: radio };
  return { backgroundColor: bg, color: texto, borderRadius: radio };
}

type Cambiar = (contenido: Record<string, unknown>) => void;

export interface EditorEtiquetasFichaProps {
  contenido: Record<string, unknown>;
  onCambiar: Cambiar;
  /** `product_card_style` del sitio: copia inicial de las etiquetas propias de la ficha. */
  estiloTarjetaSitio?: unknown;
  /** Color primario del sitio (muestra del «Precio por volumen»). */
  colorPrimario?: string;
  /** Abre Estilo del sitio › Tarjeta de producto. Sin él, el enlace queda como texto. */
  onAbrirEstiloTarjeta?: () => void;
}

function useT() {
  return useTranslations('sitioWeb.editor.etiquetasFicha');
}

const Ayuda = ({ children }: { children: string }) => <p className="text-[11px] leading-[14px] text-fg-muted">{children}</p>;

function mover<T>(lista: readonly T[], de: number, a: number): T[] {
  if (a < 0 || a >= lista.length || de === a) return [...lista];
  const copia = [...lista];
  const [x] = copia.splice(de, 1);
  copia.splice(a, 0, x);
  return copia;
}

export function EditorEtiquetasFicha({ contenido, onCambiar, estiloTarjetaSitio, colorPrimario, onAbrirEstiloTarjeta }: EditorEtiquetasFichaProps) {
  const t = useT();
  const o = useMemo(() => leerOpcionesEtiquetasFicha(contenido), [contenido]);
  const k = CLAVES_ETIQUETAS_FICHA;
  const poner = (clave: string, valor: unknown) => onCambiar(conClave(contenido, clave, valor));
  const idDonde = useId();
  const idTamano = useId();
  const conAlguna = CLAVES_NUEVAS_ETIQUETAS.some((c) => contenido[c] !== undefined);

  return (
    <section aria-label={t('titulo')} data-bloque="etiquetas-ficha" className="flex flex-col gap-3 rounded-lg border border-line bg-subtle p-3">
      <span className="flex items-center gap-1.5">
        <TituloBloque>{t('titulo')}</TituloBloque>
        <InsigniaNuevo />
      </span>
      <FilaInterruptor
        titulo={t('mostrar')}
        ayuda={t('ayudaMostrar')}
        valor={o.mostrar}
        onCambiar={(v) => poner(k.mostrar, v ? true : undefined)}
      />

      {o.mostrar && (
        <>
          <div className="flex flex-col gap-1.5">
            <EtiquetaGrupo id={idDonde}>{t('dondeSeVen')}</EtiquetaGrupo>
            <SegmentedControl<UbicacionEtiquetasFicha>
              aria-labelledby={idDonde}
              tamano="sm"
              anchoCompleto
              valor={o.ubicacion}
              onValorChange={(v) => poner(k.ubicacion, v)}
              opciones={UBICACIONES_ETIQUETAS_FICHA.map((v) => ({ valor: v, etiqueta: t(`ubicaciones.${v}`) }))}
            />
            {etiquetasEn(o.ubicacion, 'foto') && <Ayuda>{t('ayudaUbicacionFoto')}</Ayuda>}
          </div>

          <ListaEtiquetas
            items={o.items}
            ubicacion={o.ubicacion}
            forma={o.forma}
            relleno={o.relleno}
            colorPrimario={colorPrimario ?? COLOR_VOLUMEN_POR_DEFECTO}
            onGuardar={(items) => poner(k.items, itemsEtiquetasParaGuardar(items))}
          />
          <Ayuda>{t('ayudaCuales')}</Ayuda>

          <div className="flex flex-col gap-3 border-t border-line pt-3">
            <EtiquetaGrupo>{t('estilo')}</EtiquetaGrupo>
            <ChipsOpcion<FormaEtiquetaFicha>
              etiqueta={t('forma')}
              opciones={FORMAS_ETIQUETA_FICHA.map((v) => ({ valor: v, etiqueta: t(`formas.${v}`) }))}
              valor={o.forma}
              onValorChange={(v) => poner(k.forma, v === 'tarjeta' ? undefined : v)}
            />
            <ChipsOpcion<RellenoEtiquetaFicha>
              etiqueta={t('relleno')}
              opciones={RELLENOS_ETIQUETA_FICHA.map((v) => ({ valor: v, etiqueta: t(`rellenos.${v}`) }))}
              valor={o.relleno}
              onValorChange={(v) => poner(k.relleno, v === 'tarjeta' ? undefined : v)}
            />
            <div className="flex flex-col gap-1.5">
              <EtiquetaGrupo id={idTamano}>{t('tamano')}</EtiquetaGrupo>
              <SegmentedControl<TamanoEtiquetaFicha>
                aria-labelledby={idTamano}
                tamano="sm"
                anchoCompleto
                valor={o.tamano}
                onValorChange={(v) => poner(k.tamano, v)}
                opciones={TAMANOS_ETIQUETA_FICHA.map((v) => ({ valor: v, etiqueta: t(`tamanos.${v}`) }))}
              />
            </div>
          </div>

          <PropiasFicha
            propias={o.propias}
            estiloTarjetaSitio={estiloTarjetaSitio}
            onCambiar={(lista) => poner(k.propias, lista)}
          />

          {onAbrirEstiloTarjeta ? (
            <button type="button" onClick={onAbrirEstiloTarjeta} className="inline-flex items-center gap-1 self-start text-[13px] font-medium text-brand hover:underline">
              {t('enlaceEstiloTarjeta')}
              <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          ) : (
            <Ayuda>{`${t('enlaceEstiloTarjeta')} ›`}</Ayuda>
          )}
        </>
      )}

      {conAlguna && (
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <button type="button" onClick={() => onCambiar(sinClaves(contenido, CLAVES_NUEVAS_ETIQUETAS))} className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'self-start')}>
            {t('restablecer')}
          </button>
          <Ayuda>{t('ayudaRestablecer')}</Ayuda>
        </div>
      )}
    </section>
  );
}

// ─── «Cuáles»: una fila por tipo, en el orden guardado ──────────────────────────────────────

function ListaEtiquetas({
  items, ubicacion, forma, relleno, colorPrimario, onGuardar,
}: {
  items: EtiquetaFichaItem[];
  ubicacion: UbicacionEtiquetasFicha;
  forma: FormaEtiquetaFicha;
  relleno: RellenoEtiquetaFicha;
  colorPrimario: string;
  onGuardar: (items: EtiquetaFichaItem[]) => void;
}) {
  const t = useT();
  const [abierta, setAbierta] = useState<TipoEtiquetaFicha | null>(null);
  const ids: string[] = items.map((i) => i.id);
  const nombre = (id: string) => t(`tipos.${id}`);
  const cambiar = (id: TipoEtiquetaFicha, cambio: Partial<EtiquetaFichaItem>) => onGuardar(items.map((i) => (i.id === id ? { ...i, ...cambio } : i)));
  const colorDe = (id: TipoEtiquetaFicha) => COLOR_POR_DEFECTO[id] ?? colorPrimario;

  const muestra = (i: EtiquetaFichaItem) => {
    const Icono = ICONO_MUESTRA[i.id];
    return (
      <span
        aria-hidden="true"
        className="inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap px-2 text-[11px] font-semibold leading-none"
        style={estiloMuestraEtiqueta(i.bg ?? colorDe(i.id), i.text ?? '#FFFFFF', forma, relleno)}
      >
        {Icono && <Icono className="size-3" strokeWidth={2} />}
        {t(`muestras.${i.id}`)}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      <EtiquetaGrupo>{t('cuales')}</EtiquetaGrupo>
      <ZonaOrdenable
        ids={ids}
        nombre={nombre}
        modo="tabla"
        onMover={(id, sobre) => {
          setAbierta(null);
          onGuardar(mover(items, ids.indexOf(String(id)), ids.indexOf(String(sobre))));
        }}
        capa={(id) => <div className="rounded-lg border border-brand bg-surface px-3 py-2 text-[13px] font-medium text-fg shadow-lg">{nombre(id)}</div>}
      >
        <ul aria-label={t('cuales')} className="flex flex-col gap-1.5">
          {items.map((i, n) => {
            const abiertaAqui = abierta === i.id;
            return (
              <Ordenable key={i.id} id={i.id}>
                {(fila) => (
                  <li ref={fila.ref} style={fila.estilo} className={cn('rounded-lg border bg-surface', abiertaAqui ? 'border-brand' : 'border-line', fila.arrastrando && CLASES_HUECO)}>
                    <div className="flex items-center gap-1 py-1 pl-0.5 pr-1.5">
                      <AsaArrastre asa={fila.asa} nombre={nombre(i.id)} />
                      <span className={cn('min-w-0 flex-1 truncate text-[13px] font-medium text-fg', !i.visible && 'text-fg-muted')}>{nombre(i.id)}</span>
                      <span className={cn(!i.visible && 'opacity-40')}>{muestra(i)}</span>
                      <Switch
                        checked={i.visible}
                        onCheckedChange={(v) => cambiar(i.id, { visible: v })}
                        aria-label={t('mostrarTipo', { nombre: nombre(i.id) })}
                        className="ml-1 shrink-0"
                      />
                      <button
                        type="button"
                        onClick={() => setAbierta(abiertaAqui ? null : i.id)}
                        aria-expanded={abiertaAqui}
                        aria-label={t('abrir', { nombre: nombre(i.id) })}
                        className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'w-8 px-0')}
                      >
                        <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform', abiertaAqui && 'rotate-180')} strokeWidth={1.5} />
                      </button>
                    </div>
                    {abiertaAqui && (
                      <div className="flex flex-col gap-3 border-t border-line px-3 py-3">
                        {i.id === 'custom' ? (
                          <Ayuda>{t('ayudaFilaPropias')}</Ayuda>
                        ) : (
                          <>
                            <div className="flex flex-col gap-1.5">
                              <ChipsOpcion<EsquinaEtiquetaFicha>
                                etiqueta={t('esquina')}
                                opciones={ESQUINAS_ETIQUETA_FICHA.map((v) => ({ valor: v, etiqueta: t(`esquinas.${v}`) }))}
                                valor={i.esquina}
                                onValorChange={(v) => cambiar(i.id, { esquina: v })}
                              />
                              <Ayuda>{etiquetasEn(ubicacion, 'foto') ? t('ayudaEsquina') : t('ayudaEsquinaSinFoto')}</Ayuda>
                            </div>
                            <ColorTema etiqueta={t('fondo')} valor={i.bg} colorTema={colorDe(i.id)} etiquetaNulo={t('deLaTarjeta')} onCambiar={(v) => cambiar(i.id, { bg: v })} />
                            <ColorTema etiqueta={t('texto')} valor={i.text} colorTema="#FFFFFF" etiquetaNulo={t('deLaTarjeta')} onCambiar={(v) => cambiar(i.id, { text: v })} />
                          </>
                        )}
                        <div className="flex gap-2">
                          <button type="button" disabled={n === 0} onClick={() => onGuardar(mover(items, n, n - 1))} className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'disabled:opacity-40')}>
                            <ArrowUp aria-hidden="true" className="size-4" strokeWidth={1.5} />
                            {t('subir')}
                          </button>
                          <button type="button" disabled={n === items.length - 1} onClick={() => onGuardar(mover(items, n, n + 1))} className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'disabled:opacity-40')}>
                            <ArrowDown aria-hidden="true" className="size-4" strokeWidth={1.5} />
                            {t('bajar')}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                )}
              </Ordenable>
            );
          })}
        </ul>
      </ZonaOrdenable>
    </div>
  );
}

// ─── Etiquetas propias de la ficha ──────────────────────────────────────────────────────────

/** Lista normalizada de etiquetas propias (forma de `labels_custom` del estilo de tarjeta). */
export function etiquetasPropiasDe(crudo: unknown): EtiquetaPropiaTarjeta[] {
  if (!Array.isArray(crudo)) return [];
  return normalizarTarjeta({ labels_custom: crudo })?.labels_custom ?? [];
}

function PropiasFicha({
  propias, estiloTarjetaSitio, onCambiar,
}: {
  propias: unknown[] | null;
  estiloTarjetaSitio: unknown;
  /** `undefined` = usar las del sitio (se quita la clave). */
  onCambiar: (lista: EtiquetaPropiaTarjeta[] | undefined) => void;
}) {
  const t = useT();
  const usarDelSitio = propias === null;
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <EtiquetaGrupo>{t('propias')}</EtiquetaGrupo>
      <FilaInterruptor
        titulo={t('usarDelEstilo')}
        ayuda={t('ayudaUsarDelEstilo')}
        valor={usarDelSitio}
        // Apagar arranca con una copia de las del sitio; lista vacía = propias de la ficha, ninguna.
        onCambiar={(v) => onCambiar(v ? undefined : etiquetasPropiasDe(normalizarTarjeta(estiloTarjetaSitio)?.labels_custom))}
      />
      {!usarDelSitio && <EtiquetasPropiasTarjeta lista={etiquetasPropiasDe(propias)} onCambiar={(lista) => onCambiar(lista)} />}
    </div>
  );
}
