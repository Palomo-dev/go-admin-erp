'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRightLeft, Check } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Dialogo } from '@/components/kit/Dialogo';
import { FormField } from '@/components/kit/FormField';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { productoService } from '@/lib/services/productoService';
import { useProductoDetalle } from '../../ContextoProducto';
import type { EstadoSerial } from '../../../logica/seriales';
import { EstadoSerialBadge, useEtiquetaEstadoSerial } from './piezas';
import type { FilaSerial } from './listadoSeriales';

/**
 * Cambio manual de estado de uno o varios seriales
 * (`fn_producto_serial_cambiar_estado`: valida la transición en el servidor,
 * deja evento de trazabilidad y devuelve los rechazados). Solo ofrece los
 * destinos permitidos (`transicionesSerial` / `transicionesComunes`).
 * Dañado, RMA y Devuelto piden nota: quedan en el historial del serial.
 */

type DestinoRpc = 'in_stock' | 'damaged' | 'rma' | 'returned' | 'sold';
const DESTINOS_RPC: readonly EstadoSerial[] = ['in_stock', 'damaged', 'rma', 'returned', 'sold'];
const CON_NOTA: readonly EstadoSerial[] = ['damaged', 'rma', 'returned'];

function esDestinoRpc(e: EstadoSerial): e is DestinoRpc {
  return DESTINOS_RPC.includes(e);
}

export interface DialogoEstadoSerialProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  seriales: readonly FilaSerial[];
  /** Destinos permitidos para todos los seriales. */
  opciones: readonly EstadoSerial[];
  /** Destino preseleccionado. */
  inicial?: EstadoSerial | null;
  onHecho: () => void;
}

export function DialogoEstadoSerial({ abierto, onAbiertoChange, seriales, opciones, inicial, onHecho }: DialogoEstadoSerialProps) {
  const t = useTranslations('productoDetalle.seriales');
  const tc = useTranslations('productoDetalle.comun');
  const { organizacionId, mensajeError, recargarResumen } = useProductoDetalle();
  const { toast } = useToast();
  const etiquetaEstado = useEtiquetaEstadoSerial();
  const destinos = opciones.filter(esDestinoRpc);

  const [destino, setDestino] = useState<DestinoRpc | null>(null);
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rechazados, setRechazados] = useState<{ id: number; serial: string; estado: string }[] | null>(null);

  useEffect(() => {
    if (!abierto) return;
    const primero = inicial && esDestinoRpc(inicial) && destinos.includes(inicial) ? inicial : destinos.length === 1 ? destinos[0] : null;
    setDestino(primero);
    setNota('');
    setError(null);
    setRechazados(null);
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const notaObligatoria = destino !== null && CON_NOTA.includes(destino);
  const faltaNota = notaObligatoria && !nota.trim();

  const guardar = async () => {
    if (!destino || faltaNota) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await productoService.cambiarEstadoSeriales(
        organizacionId,
        seriales.map((s) => s.id),
        destino,
        nota.trim() || null,
      );
      if (r.actualizados > 0) {
        toast({
          title: t('estadoDialogo.toastOk', { count: r.actualizados }),
          description: t('estadoDialogo.toastOkDetalle', { estado: etiquetaEstado(destino) }),
        });
        onHecho();
        void recargarResumen();
      }
      if (r.rechazados.length > 0) {
        setRechazados(r.rechazados);
      } else {
        onAbiertoChange(false);
      }
    } catch (e) {
      const m = mensajeError(e);
      setError(m);
      toast({ variant: 'destructive', title: t('estadoDialogo.toastError'), description: m });
    } finally {
      setGuardando(false);
    }
  };

  const unico = seriales.length === 1 ? seriales[0] : null;

  if (rechazados) {
    return (
      <Dialogo
        abierto={abierto}
        onAbiertoChange={onAbiertoChange}
        titulo={t('estadoDialogo.rechazadosTitulo')}
        descripcion={t('estadoDialogo.rechazadosDescripcion', { count: rechazados.length })}
        icono={ArrowRightLeft}
        primario={{ etiqueta: tc('cerrar'), onClick: () => onAbiertoChange(false) }}
        ancho={520}
      >
        <ul className="divide-y divide-line rounded-lg border border-line">
          {rechazados.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="font-mono text-fg">{r.serial}</span>
              <EstadoSerialBadge estado={r.estado} tamano="sm" />
            </li>
          ))}
        </ul>
      </Dialogo>
    );
  }

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !guardando && onAbiertoChange(v)}
      titulo={t('estadoDialogo.titulo')}
      descripcion={
        unico ? t('estadoDialogo.descripcionUno', { serial: unico.serial }) : t('estadoDialogo.descripcionVarios', { count: seriales.length })
      }
      icono={ArrowRightLeft}
      ancho={520}
      primario={{
        etiqueta: guardando ? tc('guardando') : t('estadoDialogo.aplicar'),
        onClick: () => void guardar(),
        cargando: guardando,
        deshabilitada: !destino || faltaNota || destinos.length === 0,
        motivo: !destino ? t('estadoDialogo.motivoElegir') : faltaNota ? t('estadoDialogo.motivoNota') : undefined,
      }}
    >
      <div className="space-y-4">
        {unico && (
          <div className="flex items-center gap-2 text-sm text-fg-secondary">
            <span>{t('estadoDialogo.estadoActual')}</span>
            <EstadoSerialBadge estado={unico.status} tamano="sm" />
          </div>
        )}

        {destinos.length === 0 ? (
          <p className="rounded-lg border border-line bg-subtle px-3 py-2 text-sm text-fg-secondary">{t('acciones.sinTransiciones')}</p>
        ) : (
          <fieldset role="radiogroup" className="space-y-2">
            <legend className="mb-2 text-sm font-medium text-fg">{t('estadoDialogo.nuevoEstado')}</legend>
            {destinos.map((d) => {
              const activo = destino === d;
              return (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => setDestino(d)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                    activo ? 'border-brand bg-brand-tint' : 'border-line bg-surface hover:bg-hover',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                      activo ? 'border-brand bg-brand text-fg-on-brand' : 'border-line-strong',
                    )}
                  >
                    {activo && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <EstadoSerialBadge estado={d} tamano="sm" />
                    </span>
                    <span className="mt-1 block text-xs text-fg-secondary">{t(`estadoDialogo.ayudas.${d}`)}</span>
                  </span>
                </button>
              );
            })}
          </fieldset>
        )}

        <FormField
          etiqueta={notaObligatoria ? t('estadoDialogo.nota') : `${t('estadoDialogo.nota')} (${tc('opcional')})`}
          obligatorio={notaObligatoria}
          ayuda={t('estadoDialogo.notaAyuda')}
        >
          <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} maxLength={500} placeholder={t('estadoDialogo.notaPlaceholder')} />
        </FormField>

        {error && (
          <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle px-3 py-2 text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
