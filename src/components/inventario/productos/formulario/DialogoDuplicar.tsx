'use client';

import { useState } from 'react';
import { Copy, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialogo } from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import type { DatosFormularioProducto } from '@/lib/services/productoService';
import { DUPLICAR_TODO, type OpcionesDuplicar } from '../logica/formularioProducto';

/**
 * «Qué copiar» antes de abrir el formulario de duplicar (las 6 opciones de
 * antes + modificadores, proveedores y categorías, que se perdían). El stock
 * siempre arranca en 0 y el código de barras no se copia.
 */
export interface DialogoDuplicarProps {
  abierto: boolean;
  datos: DatosFormularioProducto;
  onConfirmar: (opciones: OpcionesDuplicar) => void;
  onCancelar: () => void;
}

const ORDEN: readonly (keyof OpcionesDuplicar)[] = [
  'variantes',
  'precios',
  'costos',
  'impuestos',
  'imagenes',
  'etiquetas',
  'modificadores',
  'proveedores',
  'categorias',
];

export function DialogoDuplicar({ abierto, datos, onConfirmar, onCancelar }: DialogoDuplicarProps) {
  const t = useTranslations('productoForm.duplicar');
  const [opciones, setOpciones] = useState<OpcionesDuplicar>(DUPLICAR_TODO);

  const conteo: Record<keyof OpcionesDuplicar, number | null> = {
    variantes: datos.variantes.length,
    precios: datos.precio ? 1 : 0,
    costos: datos.costo ? 1 : 0,
    impuestos: datos.impuestos.length,
    imagenes: datos.imagenes.length,
    etiquetas: datos.etiquetas.length,
    modificadores: datos.modificadores.length,
    proveedores: datos.proveedores.length,
    categorias: datos.categorias_adicionales.length,
  };
  const etiqueta: Record<keyof OpcionesDuplicar, string> = {
    variantes: t('opciones.variantes', { count: conteo.variantes ?? 0 }),
    precios: t('opciones.precios'),
    costos: t('opciones.costos'),
    impuestos: t('opciones.impuestos', { count: conteo.impuestos ?? 0 }),
    imagenes: t('opciones.imagenes', { count: conteo.imagenes ?? 0 }),
    etiquetas: t('opciones.etiquetas', { count: conteo.etiquetas ?? 0 }),
    modificadores: t('opciones.modificadores', { count: conteo.modificadores ?? 0 }),
    proveedores: t('opciones.proveedores', { count: conteo.proveedores ?? 0 }),
    categorias: t('opciones.categorias', { count: conteo.categorias ?? 0 }),
  };

  const todas = ORDEN.every((k) => opciones[k]);

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !v && onCancelar()}
      titulo={t('titulo')}
      descripcion={t('descripcion', { nombre: String(datos.producto.name), sku: String(datos.producto.sku) })}
      icono={Copy}
      ancho={520}
      primario={{ etiqueta: t('continuar'), onClick: () => onConfirmar(opciones) }}
      secundarios={[
        {
          etiqueta: todas ? t('ninguna') : t('todas'),
          onClick: () =>
            setOpciones(Object.fromEntries(ORDEN.map((k) => [k, !todas])) as unknown as OpcionesDuplicar),
        },
      ]}
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium text-fg">{t('queCopiar')}</legend>
        {ORDEN.map((k) => {
          const vacio = conteo[k] === 0;
          const id = `duplicar-${k}`;
          return (
            <div key={k} className="flex items-center gap-3">
              <Checkbox
                id={id}
                checked={opciones[k] && !vacio}
                disabled={vacio}
                onCheckedChange={(v) => setOpciones((o) => ({ ...o, [k]: v === true }))}
              />
              <label htmlFor={id} className={vacio ? 'text-sm text-fg-muted' : 'text-sm text-fg'}>
                {etiqueta[k]}
                {vacio && <span className="ml-1 text-xs">({t('noTiene')})</span>}
              </label>
            </div>
          );
        })}
      </fieldset>
      <p className="mt-4 flex items-start gap-2 rounded-lg bg-info-subtle p-3 text-sm text-info-text">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
        {t('nota')}
      </p>
    </Dialogo>
  );
}
