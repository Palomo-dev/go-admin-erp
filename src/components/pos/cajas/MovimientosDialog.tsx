'use client';

/**
 * Diálogo «Registrar movimiento» (Figma `D-Movimiento` `360:145278`) de «Mi
 * caja» y del POS: envoltura de diálogo del formulario único
 * `MovimientoCajaForm` (la página «Nuevo movimiento» es la otra envoltura).
 *
 * Registra en la caja ACTIVA de quien lo usa (`CajasService.addMovement`): con
 * red en `cash_movements`, sin red (Desktop) en el outbox. API conservada:
 * controlado (`open`/`onOpenChange`, la pantalla pone su botón) o con su propio
 * disparador.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeftRight, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Dialogo } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { CajasService } from './CajasService';
import { useMensajeErrorCaja, useMonedaCaja } from './comunesCaja';
import { useResumenCaja } from './useResumenCaja';
import { EfectoEnCaja, MovimientoCajaForm, datosParaGuardar, useMovimientoCajaForm } from './movimientos/MovimientoCajaForm';
import type { CashMovement, CashSession } from './types';

interface MovimientosDialogProps {
  onMovementAdded: (movement: CashMovement) => void;
  disabled?: boolean;
  /** Modo controlado: la pantalla pone su propio botón y no se dibuja el disparador. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Caja activa (para el efecto en el esperado); sin ella el efecto no se muestra. */
  sesion?: CashSession | null;
}

export function MovimientosDialog({ onMovementAdded, disabled, open: controlledOpen, onOpenChange, sesion }: MovimientosDialogProps) {
  const t = useTranslations('cajas.mov');
  const { simbolo, formatear } = useMonedaCaja();
  const mensajeError = useMensajeErrorCaja();
  const [internalOpen, setInternalOpen] = useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  const form = useMovimientoCajaForm();
  const [guardando, setGuardando] = useState(false);
  const { resumen } = useResumenCaja(sesion ? (sesion.id > 0 ? sesion.uuid : sesion.id) : null, {
    ventas: false,
    sesionLocal: sesion ?? null,
    activo: open && !!sesion,
  });

  const cerrar = (v: boolean) => {
    if (guardando) return;
    setOpen(v);
    if (!v) form.reiniciar();
  };

  const guardar = async () => {
    if (!form.validar()) return;
    setGuardando(true);
    try {
      const datos = datosParaGuardar(form.datos);
      const movimiento = await CajasService.addMovement(datos);
      const pendiente = movimiento.pending_sync ? 'si' : 'no';
      toast.success(t(datos.type === 'in' ? 'ingresoGuardado' : 'egresoGuardado'), {
        description: t('guardadoDescripcionPendiente', { monto: formatear(datos.amount), pendiente }),
      });
      onMovementAdded(movimiento);
      setGuardando(false);
      setOpen(false);
      form.reiniciar();
    } catch (e) {
      const codigo = (e as { codigo?: string })?.codigo;
      toast.error(t('errorGuardar'), { description: mensajeError(codigo, (e as Error)?.message) });
      setGuardando(false);
    }
  };

  return (
    <>
      {!controlled && (
        <Button variant="outline" className="h-10 gap-2" disabled={disabled} onClick={() => setOpen(true)}>
          <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('registrar')}
        </Button>
      )}
      <Dialogo
        abierto={open}
        onAbiertoChange={cerrar}
        titulo={t('registrar')}
        descripcion={t('dialogoDescripcion')}
        icono={ArrowLeftRight}
        ancho={560}
        primario={{
          etiqueta: guardando ? t('guardando') : form.datos.tipo === 'in' ? t('guardarIngreso') : t('guardarEgreso'),
          onClick: () => void guardar(),
          cargando: guardando,
        }}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
        >
          <MovimientoCajaForm datos={form.datos} onCambiar={form.cambiar} errorVisible={form.errorVisible} simbolo={simbolo} deshabilitado={guardando} variante="dialogo" />
          {sesion && (
            <EfectoEnCaja
              compacto
              esperado={resumen?.verImportes ? resumen.esperado.efectivo_esperado : null}
              tipo={form.datos.tipo}
              monto={form.datos.monto}
              formatear={formatear}
            />
          )}
        </form>
      </Dialogo>
    </>
  );
}
