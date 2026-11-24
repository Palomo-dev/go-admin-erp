'use client';

/**
 * «Barra de pago en celular: A · B · C» del diálogo del checkout (Sitio web › Ventas en línea ›
 * Checkout › Editar opciones). Tres tarjetas con una miniatura de cada estilo (Figma «16 Sitio
 * web» 3059:80757, aprobado por el dueño el 2026-11-24) y una línea que la describe. Sin elegir,
 * la tienda pinta C (`BARRA_PAGO_POR_DEFECTO`).
 *
 * Textos en su propio namespace `barraPagoMovil` (messages/*.json, es/en/fr/pt).
 */
import { useTranslations } from 'next-intl';
import { TarjetaSeleccionable } from '@/components/kit';
import { BARRAS_PAGO_MOVIL, BARRA_PAGO_POR_DEFECTO, type BarraPagoMovil } from './estadoVentas';

const LETRA: Record<BarraPagoMovil, 'A' | 'B' | 'C'> = { dos_filas: 'A', dos_lineas: 'B', partido: 'C' };

/** Dibujo mínimo de la barra: gris para el texto, color de marca para el botón. */
function Miniatura({ estilo }: { estilo: BarraPagoMovil }) {
  const linea = (ancho: string, clase = 'bg-gray-300') => <span className={`block h-1 rounded-full ${clase}`} style={{ width: ancho }} />;
  return (
    <span aria-hidden="true" className="flex w-full flex-col gap-1.5 rounded-md border border-line bg-surface p-2" data-miniatura-barra={estilo}>
      {estilo === 'dos_filas' && (
        <>
          <span className="flex items-end justify-between">
            {linea('22%')}
            {linea('30%', 'bg-gray-500 h-1.5')}
            {linea('22%')}
          </span>
          <span className="flex h-4 items-center justify-center rounded bg-brand">{linea('45%', 'bg-white/90')}</span>
        </>
      )}
      {estilo === 'dos_lineas' && (
        <>
          <span className="flex items-center justify-between">
            {linea('34%', 'bg-gray-500 h-1.5')}
            {linea('20%', 'bg-brand')}
          </span>
          <span className="flex h-5 flex-col items-center justify-center gap-0.5 rounded bg-brand">
            {linea('50%', 'bg-white/90')}
            {linea('34%', 'bg-white/60 h-0.5')}
          </span>
        </>
      )}
      {estilo === 'partido' && (
        <>
          <span className="flex items-center justify-between">
            {linea('46%')}
            {linea('16%', 'bg-brand')}
          </span>
          <span className="flex h-4 items-center justify-between rounded bg-brand px-1.5">
            {linea('40%', 'bg-white/90')}
            <span className="flex h-full items-center border-l border-white/50 pl-1.5">{linea('14px', 'bg-white h-1.5')}</span>
          </span>
        </>
      )}
    </span>
  );
}

export function SelectorBarraPago({
  valor,
  onValorChange,
  idEtiqueta,
}: {
  valor: BarraPagoMovil | null | undefined;
  onValorChange: (v: BarraPagoMovil) => void;
  idEtiqueta?: string;
}) {
  const t = useTranslations('barraPagoMovil');
  const actual = valor ?? BARRA_PAGO_POR_DEFECTO;
  return (
    <div role="radiogroup" aria-labelledby={idEtiqueta} className="grid gap-2 sm:grid-cols-3" data-selector-barra-pago="">
      {BARRAS_PAGO_MOVIL.map((e) => (
        <TarjetaSeleccionable
          key={e}
          titulo={`${LETRA[e]} · ${t(`estilos.${e}.titulo`)}${e === BARRA_PAGO_POR_DEFECTO ? ` (${t('porDefecto')})` : ''}`}
          descripcion={
            <span className="flex flex-col gap-2">
              <Miniatura estilo={e} />
              <span>{t(`estilos.${e}.descripcion`)}</span>
            </span>
          }
          seleccionada={actual === e}
          onSeleccionar={() => onValorChange(e)}
          className="justify-start"
        />
      ))}
    </div>
  );
}
