'use client';

/**
 * Origen de las reseñas en el inspector de «Reseñas de Producto» (Figma «16 Sitio web»
 * 3123-88477: 1A origen de primero en Contenido, 1B aviso en Diseño, 1D switch «Compra verificada»
 * en las de ejemplo).
 *
 * - Tres opciones (y N): «Solo reales» (`real`), «Reales + ejemplos hasta tener N» (`mixed`, o
 *   `auto` si la sección ya lo tenía) y «Solo ejemplos» (`generated`). Se guarda en el contenido de
 *   la sección (`reviews_source`, sin columna nueva). Sin clave en la sección manda el origen de la
 *   tienda (`website_settings.reviews_default_source`: NULL en las tiendas de antes = ejemplos).
 * - N: `min_visible` en mixed y `auto_switch_threshold` en auto (los de siempre).
 * - Switch «Mostrar “Compra verificada” en las de ejemplo» (`examples_verified_badge`), solo si el
 *   origen incluye ejemplos. Encendido por defecto (= hoy): sin clave. Apagado: `false`.
 * Las reseñas de ejemplo no cambian (los providers de la tienda siguen igual).
 * Textos: `sitioWeb.resenas.*` (es/en/fr/pt).
 */
import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Info, Minus, Plus, TriangleAlert } from 'lucide-react';
import { AvisoTonal } from '@/components/kit';
import { cn } from '@/utils/Utils';
import {
  CLAVE_EJEMPLOS_VERIFICADA,
  conClave,
  ejemplosConVerificada,
  esOrigenResenas,
  grupoOrigenResenas,
  origenEfectivoResenas,
  origenIncluyeEjemplos,
  umbralOrigenResenas,
  type GrupoOrigenResenas,
  type OrigenResenas,
} from '@/lib/website/v2/seccionesFicha';
import { FilaInterruptor, InsigniaNuevo, TituloBloque } from './PartesZonaGlobal';

type Cambiar = (contenido: Record<string, unknown>) => void;

const RUTA_AJUSTES = '/api/sitio-web/tienda/ajustes-resenas';

/**
 * Origen de la tienda. Si el editor ya lo trae en los ajustes del sitio (`inicial` definido), ese;
 * si no, se pide una vez a la ruta de ajustes. `null` = ejemplos (tiendas de antes).
 */
export function useOrigenTienda(inicial: unknown): OrigenResenas | null {
  const conocido = inicial !== undefined;
  const [origen, setOrigen] = useState<OrigenResenas | null>(esOrigenResenas(inicial) ? inicial : null);
  useEffect(() => {
    if (conocido) {
      setOrigen(esOrigenResenas(inicial) ? inicial : null);
      return;
    }
    if (typeof fetch !== 'function') return;
    let vivo = true;
    fetch(RUTA_AJUSTES, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { origenTienda?: unknown } | null) => {
        if (vivo && j) setOrigen(esOrigenResenas(j.origenTienda) ? j.origenTienda : null);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [conocido, inicial]);
  return origen;
}

const GRUPOS: readonly GrupoOrigenResenas[] = ['real', 'hasta_n', 'generated'];
const CLAVE_GRUPO: Record<GrupoOrigenResenas, 'real' | 'hastaN' | 'generated'> = { real: 'real', hasta_n: 'hastaN', generated: 'generated' };

function ContadorN({ valor, onCambiar, etiqueta, menos, mas }: { valor: number; onCambiar: (v: number) => void; etiqueta: string; menos: string; mas: string }) {
  const boton = 'flex h-7 w-7 items-center justify-center text-fg-secondary hover:bg-hover disabled:opacity-40';
  return (
    <span role="group" aria-label={etiqueta} className="inline-flex items-center overflow-hidden rounded-md border border-line bg-surface">
      <button type="button" className={boton} aria-label={menos} disabled={valor <= 1} onClick={() => onCambiar(Math.max(1, valor - 1))}>
        <Minus aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
      </button>
      <span className="min-w-8 border-x border-line px-1 text-center text-[13px] font-medium tabular-nums text-fg" aria-live="polite">{valor}</span>
      <button type="button" className={boton} aria-label={mas} disabled={valor >= 100} onClick={() => onCambiar(Math.min(100, valor + 1))}>
        <Plus aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
      </button>
    </span>
  );
}

/** «Origen de las reseñas» + switch de las de ejemplo (pestaña Contenido, de primero). */
export function OrigenResenas({ contenido, onCambiar, origenTienda }: { contenido: Record<string, unknown>; onCambiar: Cambiar; origenTienda: OrigenResenas | null }) {
  const t = useTranslations('sitioWeb.resenas');
  const id = useId();
  const origen = origenEfectivoResenas(contenido, origenTienda);
  const grupo = grupoOrigenResenas(origen);
  const propio = esOrigenResenas(contenido.reviews_source);
  const n = umbralOrigenResenas(contenido, origen);

  const elegir = (g: GrupoOrigenResenas) => {
    if (g === grupo && propio) return;
    const valor: OrigenResenas = g === 'real' ? 'real' : g === 'generated' ? 'generated' : origen === 'auto' ? 'auto' : 'mixed';
    onCambiar(conClave(contenido, 'reviews_source', valor));
  };
  const cambiarN = (v: number) => {
    const base = propio ? contenido : conClave(contenido, 'reviews_source', origen);
    onCambiar(conClave(base, origen === 'auto' ? 'auto_switch_threshold' : 'min_visible', v));
  };

  return (
    <section className="flex flex-col gap-2" aria-labelledby={id}>
      <span className="flex items-center gap-2">
        <span id={id}><TituloBloque>{t('origen.titulo')}</TituloBloque></span>
        <InsigniaNuevo />
      </span>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-col gap-2">
        {GRUPOS.map((g) => {
          const sel = grupo === g;
          const c = CLAVE_GRUPO[g];
          return (
            <div key={g} className={cn('rounded-lg border', sel ? 'border-2 border-brand-action bg-brand-tint' : 'border-line bg-surface')}>
              <button
                type="button"
                role="radio"
                aria-checked={sel}
                onClick={() => elegir(g)}
                className={cn('flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left', !sel && 'hover:bg-hover')}
              >
                <span aria-hidden="true" className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2', sel ? 'border-brand-action' : 'border-line-strong')}>
                  {sel && <span className="size-2 rounded-full bg-brand-action" />}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-fg">
                    {t(`origen.${c}.titulo`)}
                    {g === 'real' && <span className="rounded-full bg-success-subtle px-1.5 py-px text-[10px] font-medium text-success-text">{t('origen.recomendado')}</span>}
                  </span>
                  <span className="text-[11px] leading-[14px] text-fg-muted">{t(`origen.${c}.ayuda`)}</span>
                </span>
              </button>
              {g === 'hasta_n' && sel && (
                <div className="flex flex-wrap items-center gap-2 px-3 pb-2.5 pl-9 text-[12px] text-fg-secondary">
                  {t('origen.hastaN.quitar')}
                  <ContadorN valor={n} onCambiar={cambiarN} etiqueta={t('origen.hastaN.quitar')} menos={t('origen.hastaN.menos')} mas={t('origen.hastaN.mas')} />
                  {t('origen.hastaN.reales')}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {origenIncluyeEjemplos(origen) && (
        <FilaInterruptor
          titulo={t('verificadaEjemplos.titulo')}
          ayuda={t('verificadaEjemplos.ayuda')}
          valor={ejemplosConVerificada(contenido)}
          onCambiar={(v) => onCambiar(conClave(contenido, CLAVE_EJEMPLOS_VERIFICADA, v ? undefined : false))}
        />
      )}
      <p className="flex items-start gap-1.5 rounded-md bg-subtle p-2 text-[11px] leading-[14px] text-fg-muted">
        <Info aria-hidden="true" className="mt-px size-3 shrink-0" strokeWidth={1.5} />
        <span>
          {t('origen.nota')}
          {!propio && <> {t('origen.deLaTienda')}</>}
        </span>
      </p>
    </section>
  );
}

/** Aviso 1B: con ejemplos, en Diseño y Estilo. Con «Solo reales» no sale. */
export function AvisoOrigenEjemplos({ contenido, onCambiar, origenTienda }: { contenido: Record<string, unknown>; onCambiar: Cambiar; origenTienda: OrigenResenas | null }) {
  const t = useTranslations('sitioWeb.resenas');
  const origen = origenEfectivoResenas(contenido, origenTienda);
  if (!origenIncluyeEjemplos(origen)) return null;
  const grupo = grupoOrigenResenas(origen);
  const nombre = t(`origen.nombres.${CLAVE_GRUPO[grupo]}`);
  return (
    <AvisoTonal
      tono="advertencia"
      icono={TriangleAlert}
      titulo={t('aviso.titulo')}
      descripcion={grupo === 'hasta_n' ? t('aviso.textoHastaN', { origen: nombre, n: umbralOrigenResenas(contenido, origen) }) : t('aviso.texto', { origen: nombre })}
      accion={{ etiqueta: t('aviso.cambiar'), onClick: () => onCambiar(conClave(contenido, 'reviews_source', 'real')) }}
    />
  );
}
