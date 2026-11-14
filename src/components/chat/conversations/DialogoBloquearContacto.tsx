'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ConfirmDialog } from '@/components/kit';
import { nombreClienteConversacion } from './CabeceraHilo';
import type { ConversacionControl } from './useConversacion';

/**
 * Confirmación destructiva de «Bloquear contacto» (Figma
 * 93-chat-pendientes-01). La usan el menú «⋯ Más acciones» y la hoja de
 * acciones del celular: una sola pieza para los dos lugares.
 */
export function DialogoBloquearContacto({ c, abierto, onAbiertoChange }: { c: ConversacionControl; abierto: boolean; onAbiertoChange: (v: boolean) => void }) {
  const tb = useTranslations('chatBandejaPendientes.bloqueo');
  const [bloqueando, setBloqueando] = React.useState(false);
  const nombre = nombreClienteConversacion(c.detalle, tb('contacto'));
  return (
    <ConfirmDialog
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      tono="peligro"
      titulo={tb('confirmarTitulo', { nombre })}
      descripcion={tb('confirmarDescripcion')}
      textoConfirmar={tb('confirmar')}
      textoCancelar={tb('cancelar')}
      cargando={bloqueando}
      onConfirmar={async () => {
        setBloqueando(true);
        try {
          if (await c.bloquearContacto()) onAbiertoChange(false);
        } finally {
          setBloqueando(false);
        }
      }}
    />
  );
}
