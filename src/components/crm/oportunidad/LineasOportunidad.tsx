'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BedDouble, Check, Package, Plus, ShoppingBag } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { clasesBoton } from '@/components/kit/botonClases';
import type { OpcionUsuario } from '@/components/crm/kit/camposCrm';
import type { ContextoMoneda } from '@/lib/utils/moneda';
import { agregarProducto, conteoFiltros, FILTROS_LINEAS, totalesLineas, type FiltroLineas, type Lineas } from './lineasLogica';
import { AgregarALaOportunidad, type PestanaAgregar } from './lineas/AgregarALaOportunidad';
import { EditarLineaDialog, type LineaEnEdicion } from './lineas/EditarLineaDialog';
import { LineaOportunidad } from './lineas/LineaOportunidad';
import { TotalesLineas } from './lineas/TotalesLineas';
import { useFilasLineas } from './lineas/useFilasLineas';

/**
 * Líneas de la oportunidad (Figma 1764:134618 «Oportunidad con productos y
 * servicios»): UNA lista ordenada como se agregó, con filtro por tipo, cada
 * fila es `LineaOportunidad` (variante, modificadores, servicio u hospedaje),
 * aviso de stock solo en productos que controlan stock, «Agregar a la
 * oportunidad» (productos y servicios · hospedaje · concepto libre), edición
 * en diálogo y totales con impuestos (`TotalesLineas`).
 *
 * - `variante="pagina"`: sección «Líneas» del formulario en página (16/17).
 * - `variante="dialogo"`: «Qué le vas a vender» dentro del paso 2 de
 *   «Calificar → crear oportunidad» (01/02) y del lote (05), sin filtro.
 *
 * El total es el cálculo único de `lineasLogica`; las líneas se guardan con
 * la oportunidad en la misma transacción (`crm_create/update_opportunity`).
 */
export interface LineasOportunidadProps {
  lineas: Lineas;
  onCambiar: (l: Lineas) => void;
  moneda: ContextoMoneda;
  deshabilitado?: boolean;
  variante?: 'pagina' | 'dialogo';
  /** Nombre de la oportunidad (subtítulo del selector). */
  contexto?: string | null;
  /** Lote: sin hospedaje y con el título «(a cada uno)». */
  lote?: boolean;
  /** Profesionales para las citas. */
  usuarios?: readonly OpcionUsuario[];
}

export function LineasOportunidad({ lineas, onCambiar, moneda, deshabilitado, variante = 'pagina', contexto, lote, usuarios = [] }: LineasOportunidadProps) {
  const t = useTranslations('crm.oportunidad.lineas');
  const [filtro, setFiltro] = useState<FiltroLineas>('todas');
  const [agregar, setAgregar] = useState<PestanaAgregar | null>(null);
  const [edicion, setEdicion] = useState<LineaEnEdicion>(null);
  const filas = useFilasLineas(lineas, moneda);
  const conteo = conteoFiltros(lineas);
  const totales = totalesLineas(lineas);
  const pagina = variante === 'pagina';

  const visibles = useMemo(
    () =>
      filas.filter(({ fila }) =>
        filtro === 'todas' ? true : filtro === 'productos' ? fila.clase === 'producto' : filtro === 'servicios' ? fila.clase === 'servicio' : filtro === 'hospedaje' ? fila.clase === 'hospedaje' : fila.clase === 'concepto',
      ),
    [filas, filtro],
  );
  const conAviso = filas.filter((f) => f.fila.aviso);

  const quitar = (clase: 'products' | 'spaces' | 'custom', i: number) => onCambiar({ ...lineas, [clase]: (lineas[clase] as unknown[]).filter((_, j) => j !== i) } as Lineas);
  const editar = (clase: 'products' | 'spaces' | 'custom', i: number) => {
    if (clase === 'products') setEdicion({ clase, i, linea: lineas.products[i] });
    else if (clase === 'spaces') setEdicion({ clase, i, linea: lineas.spaces[i] });
    else setEdicion({ clase, i, linea: lineas.custom[i] });
  };

  const titulo = pagina ? t('titulo') : lote ? t('tituloLote') : t('tituloDialogo');
  const IconoTitulo = pagina ? Package : ShoppingBag;

  return (
    <section aria-labelledby="lineas-oportunidad" className={cn('flex flex-col gap-3', pagina && 'border-t border-line pt-4')}>
      <header className="flex items-start gap-2">
        <IconoTitulo aria-hidden="true" className={cn('mt-0.5 size-4', pagina ? 'text-fg-secondary' : 'text-brand')} strokeWidth={1.5} />
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 id="lineas-oportunidad" className="text-sm font-semibold text-fg">{titulo}</h3>
          {pagina && <p className="text-xs text-fg-secondary">{t('descripcionPagina')}</p>}
        </div>
        {!pagina && <StatusBadge estado="opcional" etiqueta={t('opcional')} tono="neutro" tamano="sm" />}
      </header>

      {lote && <AvisoTonal tono="informacion" titulo={t('loteAviso')} compacto />}

      {pagina && conteo.todas > 0 && (
        <div role="group" aria-label={t('filtrar')} className="flex flex-wrap gap-2">
          {FILTROS_LINEAS.filter((f) => f === 'todas' || conteo[f] > 0).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filtro === f}
              onClick={() => setFiltro(f)}
              className={cn('flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium', filtro === f ? 'border-brand bg-brand-tint text-brand-deep' : 'border-line text-fg-secondary hover:bg-hover')}
            >
              {filtro === f && <Check aria-hidden="true" className="size-3.5" />}
              {t(`filtros.${f}`, { n: conteo[f] })}
            </button>
          ))}
        </div>
      )}

      {pagina && conAviso.length > 0 && (
        <AvisoTonal
          tono="advertencia"
          titulo={t('avisoStock.titulo', { n: conAviso.length })}
          descripcion={t('avisoStock.detalle')}
          accion={{ etiqueta: t('avisoStock.verStock'), onClick: () => editar(conAviso[0].clase, conAviso[0].i) }}
        />
      )}

      {conteo.todas === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-5 text-center text-[13px] text-fg-secondary">{lote ? t('vacioLote') : t('vacio')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibles.map(({ clase, i, fila }) => (
            <LineaOportunidad key={fila.clave} fila={fila} moneda={moneda} compacta={!pagina} deshabilitado={deshabilitado} onEditar={() => editar(clase, i)} onQuitar={() => quitar(clase, i)} />
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col items-start gap-1">
          <button type="button" onClick={() => setAgregar('productos')} disabled={deshabilitado} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
            <Plus aria-hidden="true" className="size-4" />
            {t('agregarProductos')}
          </button>
          {!lote && (
            <button type="button" onClick={() => setAgregar('hospedaje')} disabled={deshabilitado} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
              <BedDouble aria-hidden="true" className="size-4" />
              {t('agregarHospedaje')}
            </button>
          )}
          <button type="button" onClick={() => setEdicion({ clase: 'custom', i: lineas.custom.length, linea: { concept: '', quantity: 1, unit_price: 0 } })} disabled={deshabilitado} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
            <Plus aria-hidden="true" className="size-4" />
            {t('agregarConcepto')}
          </button>
        </div>
        {conteo.todas > 0 && <TotalesLineas totales={totales} moneda={moneda} />}
      </div>

      <AgregarALaOportunidad
        abierto={agregar !== null}
        onAbiertoChange={(x) => !x && setAgregar(null)}
        pestanaInicial={agregar ?? 'productos'}
        contexto={contexto}
        moneda={moneda}
        usuarios={usuarios}
        totalLineas={conteo.todas}
        sinHospedaje={lote}
        onAgregarProducto={(l) => onCambiar(agregarProducto(lineas, l))}
        onAgregarEspacios={(nuevas) => onCambiar({ ...lineas, spaces: [...lineas.spaces, ...nuevas] })}
      />
      <EditarLineaDialog
        edicion={edicion}
        onCerrar={() => setEdicion(null)}
        moneda={moneda}
        usuarios={usuarios}
        onGuardarProducto={(i, l) => onCambiar({ ...lineas, products: lineas.products.map((x, j) => (j === i ? l : x)) })}
        onGuardarEspacio={(i, l) => onCambiar({ ...lineas, spaces: lineas.spaces.map((x, j) => (j === i ? l : x)) })}
        onGuardarConcepto={(i, l) => onCambiar({ ...lineas, custom: i >= lineas.custom.length ? [...lineas.custom, l] : lineas.custom.map((x, j) => (j === i ? l : x)) })}
        onEliminar={(clase, i) => {
          if (clase === 'custom' && i >= lineas.custom.length) return;
          quitar(clase, i);
        }}
      />
    </section>
  );
}
