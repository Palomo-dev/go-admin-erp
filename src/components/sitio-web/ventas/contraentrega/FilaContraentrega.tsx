'use client';

/**
 * Fila «Pago contra entrega» de la tarjeta «Métodos de pago en la web» (Figma «05 POS y ventas»
 * 01): estado («Con condiciones» / «Sin condiciones»), el resumen en una línea de cada sede con
 * condiciones y el botón «Condiciones», que abre el diálogo. Se suma a las filas de la tarjeta;
 * no reemplaza ninguna (el método sigue viviendo en Finanzas › Métodos de pago).
 */
import { Banknote, SlidersHorizontal } from 'lucide-react';
import { clasesBoton } from '@/components/kit';
import { formatMoneda } from '@/lib/utils/moneda';
import { cn } from '@/utils/Utils';
import { resumenUnaLinea } from '@/lib/contraentrega/condicionesWeb';
import type { RespuestaContraentrega } from '@/lib/website/contraentregaSitio.server';
import { nombresDe } from './DialogoContraentrega';
import { textoPieza, useTextosContraentrega, type TraductorContraentrega } from './textosContraentrega';

const MAX_SEDES_VISIBLES = 2;

export type EstadoFilaContraentrega = 'sin_efectivo' | 'apagada' | 'con_condiciones' | 'sin_condiciones';

/** Estado de la fila: la organización entera (alguna sede con condiciones manda). */
export function estadoFila(datos: RespuestaContraentrega): EstadoFilaContraentrega {
  if (!datos.efectivo.existe) return 'sin_efectivo';
  const todas = Object.values(datos.condiciones);
  if (todas.length === 0) return 'sin_condiciones';
  if (todas.every((c) => !c.ofrecer)) return 'apagada';
  return 'con_condiciones';
}

/** Líneas «Sede: resumen» de las sedes con condiciones (las primeras dos, en el orden de las sedes). */
export function lineasPorSede(datos: RespuestaContraentrega, t: TraductorContraentrega): { lineas: string[]; mas: number } {
  const nombres = nombresDe(datos);
  const fmt = (n: number) => formatMoneda(n, datos.moneda);
  const conCondiciones = datos.sedes.filter((s) => datos.condiciones[String(s.id)]);
  const lineas = conCondiciones.slice(0, MAX_SEDES_VISIBLES).map((s) => {
    const resumen = resumenUnaLinea(datos.condiciones[String(s.id)], nombres, fmt).map((p) => textoPieza(t, p)).join(' · ');
    return datos.sedes.length > 1 ? t('fila.sedeResumen', { sede: s.nombre, resumen }) : resumen;
  });
  return { lineas, mas: Math.max(0, conCondiciones.length - MAX_SEDES_VISIBLES) };
}

export function FilaContraentrega({
  datos,
  cargando,
  fallo,
  onCondiciones,
}: {
  datos: RespuestaContraentrega | null;
  cargando: boolean;
  fallo: boolean;
  onCondiciones: () => void;
}) {
  const t = useTextosContraentrega();
  if (cargando && !datos) return <p className="text-xs text-fg-secondary">{t('fila.cargando')}</p>;
  if (fallo || !datos) return <p className="text-xs text-fg-secondary">{t('fila.errorCarga')}</p>;
  const estado = estadoFila(datos);
  const { lineas, mas } = lineasPorSede(datos, t);
  const etiqueta = {
    sin_efectivo: t('fila.sinEfectivo'),
    apagada: t('fila.apagada'),
    con_condiciones: t('fila.conCondiciones'),
    sin_condiciones: t('fila.sinCondiciones'),
  }[estado];
  return (
    <div className="flex flex-col gap-2" data-fila-contraentrega={estado}>
      <div className="flex items-center justify-between gap-3 text-[13px] leading-5">
        <span className="flex min-w-0 items-center gap-2 text-fg">
          <Banknote aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
          <span className="truncate">{t('fila.titulo')}</span>
        </span>
        <span className={cn('shrink-0 text-right', estado === 'con_condiciones' ? 'font-medium text-warning-text' : 'text-fg-secondary')}>{etiqueta}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-brand-tint px-3 py-2.5">
        <div className="min-w-0 flex-1 text-xs leading-4 text-brand-deep">
          {lineas.length > 0 ? (
            <>
              {lineas.map((l) => (
                <p key={l}>{l}</p>
              ))}
              {mas > 0 && <p>{t('fila.masSedes', { n: mas })}</p>}
            </>
          ) : (
            <p>{t('resumen.sinCondiciones')}</p>
          )}
        </div>
        {datos.permisos.editar && (
          <button type="button" onClick={onCondiciones} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
            <SlidersHorizontal aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('fila.condiciones')}
          </button>
        )}
      </div>
    </div>
  );
}

/** Sede con que abre el diálogo: la primera con condiciones, la principal o la primera. */
export function sedeInicialDe(datos: RespuestaContraentrega | null): number | null {
  if (!datos || datos.sedes.length === 0) return null;
  const conCondiciones = datos.sedes.find((s) => datos.condiciones[String(s.id)]);
  return (conCondiciones ?? datos.sedes.find((s) => s.principal) ?? datos.sedes[0]).id;
}
