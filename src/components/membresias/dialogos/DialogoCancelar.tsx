'use client';

/**
 * Cancelar membresía (Figma C4 985:617547) sobre `DialogoMotivo` del kit: motivo obligatorio
 * (mínimo 3 caracteres, igual que `fn_membresia_cancelar`), consecuencias a la vista y chips de
 * motivo rápido. No devuelve dinero: eso es la devolución o la nota crédito de la venta.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ban } from 'lucide-react';
import { toast } from 'sonner';
import { DialogoMotivo } from '@/components/kit';
import { apiMembresias } from '@/lib/services/membresias/clienteMembresias';
import type { DetalleMembresia } from '@/lib/services/membresias/tipos';
import { useFormatoMembresias } from '../comun/useFormatoMembresias';
import { useMensajeError } from '../comun/useMensajeError';

export interface DialogoCancelarProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  detalle: DetalleMembresia;
  onHecho: () => void;
}

export function DialogoCancelar({ abierto, onAbiertoChange, detalle, onHecho }: DialogoCancelarProps) {
  const t = useTranslations('membresias.cancelar');
  const tEstados = useTranslations('membresias.estados');
  const mensajeError = useMensajeError();
  const { membresia: m, zona } = detalle;
  const f = useFormatoMembresias(zona);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cambiar = (v: boolean) => {
    if (!v) setError(null);
    onAbiertoChange(v);
  };

  const confirmar = async (motivo: string) => {
    setEnviando(true);
    setError(null);
    try {
      await apiMembresias.cancelar(m.id, motivo);
      toast.success(t('toast'));
      onAbiertoChange(false);
      onHecho();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <DialogoMotivo
      abierto={abierto}
      onAbiertoChange={cambiar}
      titulo={t('titulo', { codigo: m.codigo ?? `#${m.id}` })}
      descripcion={t('descripcion', {
        cliente: m.cliente.nombre,
        plan: m.plan.nombre,
        estado: tEstados(m.estadoVisual, { dias: m.dias ?? 0 }).toLowerCase(),
        fecha: f.fecha(m.hasta),
      })}
      icono={Ban}
      textoConfirmar={t('confirmar')}
      onConfirmar={confirmar}
      tituloConsecuencias={t('tituloConsecuencias')}
      consecuencias={[t('consecuencias.acceso'), t('consecuencias.dinero'), t('consecuencias.historial')]}
      motivosRapidos={[t('rapidos.mudanza'), t('rapidos.salud'), t('rapidos.inconforme'), t('rapidos.otro')]}
      etiquetaMotivo={t('motivo')}
      placeholder={t('motivoPlaceholder')}
      minimo={3}
      cargando={enviando}
      error={error}
    />
  );
}
