'use client';

import { useCallback, type ReactNode } from 'react';
import { Landmark } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SelectorEntidad } from './SelectorEntidad';

/**
 * Lista con búsqueda por código o nombre sobre `SelectorEntidad`: popover en
 * escritorio, hoja en móvil. Quien la usa decide de dónde salen las cuentas:
 * deben ser solo de movimiento.
 */
export interface OpcionCuenta {
  account_code: string;
  name: string;
}

export interface SelectorCuentaProps {
  valor: OpcionCuenta | null;
  onCambiar: (cuenta: OpcionCuenta) => void;
  buscar: (texto: string, desde: number) => Promise<{ items: readonly OpcionCuenta[]; total: number }>;
  etiqueta: string;
  /** Sin él, se ve el campo del kit con la cuenta elegida. */
  disparador?: ReactNode;
  deshabilitado?: boolean;
  id?: string;
}

export function SelectorCuenta({ valor, onCambiar, buscar, etiqueta, disparador, deshabilitado, id }: SelectorCuentaProps) {
  const t = useTranslations('cuentasAutomaticas');
  const consultar = useCallback((texto: string, _senal: AbortSignal, _filtros: readonly string[], desde: number) => buscar(texto, desde), [buscar]);
  return (
    <SelectorEntidad<OpcionCuenta>
      id={id}
      valor={valor}
      etiqueta={etiqueta}
      layout="campo"
      icono={Landmark}
      disparador={disparador}
      deshabilitado={deshabilitado}
      debounceMs={120}
      aOpcion={(c) => ({ id: c.account_code, titulo: `${c.account_code} · ${c.name}` })}
      buscar={consultar}
      onCambiar={onCambiar}
      textos={{
        placeholder: t('selector.placeholder'),
        buscar: t('selector.buscar'),
        titulo: etiqueta,
        vacio: t('selector.vacio'),
        sinResultados: t('selector.sinResultados'),
      }}
    />
  );
}
