'use client';

import { useEffect, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Dialogo } from '../Dialogo';
import { FormField } from '../FormField';
import { useKitT } from '../useIdiomaKit';

/**
 * Texto libre de una línea del documento (nota que sale en el PDF, seriales
 * recibidos uno por renglón). Subido desde la factura de compra para que lo
 * usen venta, compra y orden de compra con el mismo diálogo.
 */
export interface DialogoTextoLineaProps {
  titulo: string;
  ayuda?: string;
  abierto: boolean;
  valorInicial: string;
  onAbiertoChange: (abierto: boolean) => void;
  onGuardar: (texto: string) => void;
  /** Texto del primario; por defecto «Aplicar». */
  textoGuardar?: string;
  maximo?: number;
}

export function DialogoTextoLinea({ titulo, ayuda, abierto, valorInicial, onAbiertoChange, onGuardar, textoGuardar, maximo = 2000 }: DialogoTextoLineaProps) {
  const t = useKitT();
  const [texto, setTexto] = useState(valorInicial);
  useEffect(() => {
    if (abierto) setTexto(valorInicial);
  }, [abierto, valorInicial]);
  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={titulo}
      primario={{ etiqueta: textoGuardar ?? t('documentoEdicion.aplicar'), onClick: () => onGuardar(texto) }}
    >
      <FormField etiqueta={titulo} etiquetaOculta ayuda={ayuda}>
        <Textarea value={texto} rows={5} maxLength={maximo} onChange={(e) => setTexto(e.target.value)} />
      </FormField>
    </Dialogo>
  );
}
