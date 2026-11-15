'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { ReservaFormDialog, type ValoresInicialesReserva } from '@/components/pos/reservas-mesas/ReservaFormDialog';
import { useApoyoReservaForm } from '@/components/pos/reservas-mesas/useApoyoReservaForm';
import { reservasMesasService, type CreateReservationInput } from '@/components/pos/reservas-mesas/reservasMesasService';
import { useMensajeErrorReserva } from '@/components/pos/reservas-mesas/useMensajeErrorReserva';
import { horaCorta } from '@/components/pos/reservas-mesas/reservasVista';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { fechaInicialReserva, personasInicialesReserva, type EventoPrivadoLead } from '@/lib/crm/eventoPrivadoLead';

/**
 * «Crear reserva de grupo en <sede>» (Figma 1951:941568): abre el MISMO
 * `ReservaFormDialog` de POS › Reservas de mesas, con la sede de la solicitud,
 * el lead como cliente, la fecha del evento y los invitados ya cargados. La
 * reserva se crea con `reservasMesasService.createReservation` (RPC
 * `create_restaurant_reservation`, que valida la pertenencia a la organización
 * y que la sede sea suya).
 */
export interface ReservaGrupoLeadDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  sede: { id: number; nombre: string };
  lead: { id: string; nombre: string; correo: string | null; telefono: string | null };
  evento: EventoPrivadoLead;
}

export function ReservaGrupoLeadDialog({ abierto, onAbiertoChange, sede, lead, evento }: ReservaGrupoLeadDialogProps) {
  const t = useTranslations('crm.pantallaLeads.detalle.evento');
  const tp = useTranslations('posReservasMesas.pagina');
  const te = useTranslations('posReservasMesas.errores');
  const router = useRouter();
  const mensajeError = useMensajeErrorReserva();
  const { organization } = useOrganization();
  const { getToday } = useFormatDate();
  const apoyo = useApoyoReservaForm(organization?.id, sede.id, abierto);
  const hoy = abierto ? getToday() : '';

  const inicial = useMemo<ValoresInicialesReserva>(
    () => ({
      cliente: { id: lead.id, nombre: lead.nombre, correo: lead.correo, telefono: lead.telefono },
      fecha: fechaInicialReserva(evento.fecha, hoy),
      personas: personasInicialesReserva(evento.invitados),
      notas: [evento.tipo ? t('notaReserva', { tipo: evento.tipo }) : t('titulo'), evento.mensaje].filter(Boolean).join('\n'),
    }),
    [lead.id, lead.nombre, lead.correo, lead.telefono, evento.fecha, evento.invitados, evento.tipo, evento.mensaje, hoy, t],
  );

  const guardar = async (datos: unknown, extra: { recordar: boolean }) => {
    try {
      const r = await reservasMesasService.createReservation(datos as CreateReservationInput, sede.id);
      if (!extra.recordar) await reservasMesasService.omitirRecordatorio(r.id).catch(() => undefined);
      toast({
        title: tp('toasts.creada'),
        description: tp('toasts.creadaDetalle', {
          nombre: r.customer_name,
          fecha: formatPlainDate(r.reservation_date, { day: 'numeric', month: 'long' }),
          hora: horaCorta(r.reservation_time),
          mesa: r.restaurant_table?.name ?? tp('toasts.sinMesa'),
        }),
        action: (
          <ToastAction altText={t('verReserva')} onClick={() => router.push(`/app/pos/reservas-mesas?reserva=${r.id}`)}>
            {t('verReserva')}
          </ToastAction>
        ),
      });
    } catch (error) {
      toast({ title: te('titulo'), description: mensajeError(error, te('crear')), variant: 'destructive' });
      throw error;
    }
  };

  return (
    <ReservaFormDialog
      open={abierto}
      onOpenChange={onAbiertoChange}
      sede={sede.nombre}
      horasRecordatorio={apoyo.ajustesSede?.send_customer_email ? apoyo.ajustesSede.reminder_hours_before : null}
      onSubmit={guardar}
      mesasLibres={apoyo.mesasLibres}
      mesasSede={apoyo.mesasSede}
      buscarClientes={apoyo.buscarClientes}
      buscarPorTelefono={apoyo.buscarPorTelefono}
      crearCliente={apoyo.crearCliente}
      inicial={inicial}
    />
  );
}
