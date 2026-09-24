'use client';

import type { ReactNode } from 'react';
import { Users } from 'lucide-react';
import { SelectorEntidad, type SelectorEntidadProps } from './SelectorEntidad';
import { opcionCliente, type ClientePicker } from './selectorEntidadLogica';
import { useKitT } from './useIdiomaKit';

export { opcionCliente, type ClientePicker };

/**
 * Selector de cliente (Figma `CustomerPicker`, 10 variantes `849:558484…`):
 * POS («Cambiar · F2»), nueva venta, factura de venta, filtro «Cliente» de
 * ventas, facturas y CxC, mesas y PMS. Busca en el servidor con la función
 * que pasa la pantalla (su servicio, con la organización de la sesión); el
 * kit no consulta nada.
 */
export interface CustomerPickerProps
  extends Omit<SelectorEntidadProps<ClientePicker>, 'valor' | 'aOpcion' | 'icono' | 'etiqueta' | 'grupoExtra'> {
  cliente: ClientePicker | null | undefined;
  etiqueta?: string;
  /** Grupo opcional al final («Espacios ocupados» del PMS). */
  grupoExtra?: ReactNode;
}

export function CustomerPicker({ cliente, etiqueta, textos, layout = 'fila', ...resto }: CustomerPickerProps) {
  const t = useKitT();
  return (
    <SelectorEntidad<ClientePicker>
      {...resto}
      layout={layout}
      valor={cliente}
      aOpcion={opcionCliente}
      icono={Users}
      etiqueta={etiqueta ?? t('picker.cliente.etiqueta')}
      textos={{
        placeholder: t('picker.cliente.placeholder'),
        buscar: t('picker.cliente.buscar'),
        vacio: t('picker.cliente.vacio'),
        crear: (texto) => t('picker.cliente.crear', { texto }),
        ...textos,
      }}
    />
  );
}
