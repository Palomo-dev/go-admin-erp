'use client';

/**
 * Nueva reserva (o editar sus notas y origen). La clase se elige entre las
 * programadas desde hoy con cupo; el servicio vuelve a validar el cupo antes
 * de insertar y la UNIQUE(clase, cliente) de la base evita la reserva doble.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CustomerPicker, FormField, PanelAdaptable, type ClientePicker } from '@/components/kit';
import { searchCustomersForReservation, type ClassReservation, type GymClass } from '@/lib/services/gymService';
import { ORIGENES_RESERVA, cuposLibres, type OrigenReserva } from '../logica';
import type { FechasOrg } from '../useFechasOrg';

interface Props {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  reserva: ClassReservation | null;
  clases: readonly GymClass[];
  ocupacion: ReadonlyMap<number, number>;
  claseInicial?: number | null;
  organizationId: number;
  fechas: FechasOrg;
  onGuardar: (datos: { claseId: number; clienteId: string; origen: OrigenReserva; notas: string | null }) => Promise<void>;
}

export function DialogoReserva({ abierto, onAbiertoChange, reserva, clases, ocupacion, claseInicial, organizationId, fechas, onGuardar }: Props) {
  const t = useTranslations('membresias.reservas');
  const [cliente, setCliente] = useState<ClientePicker | null>(null);
  const [claseId, setClaseId] = useState('');
  const [origen, setOrigen] = useState<OrigenReserva>('staff');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [intentado, setIntentado] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setIntentado(false);
    if (reserva) {
      const c = reserva.customers;
      setCliente({
        id: reserva.customer_id,
        nombre: [c?.first_name, c?.last_name].filter(Boolean).join(' ') || c?.email || reserva.customer_id,
        correo: c?.email ?? null,
        telefono: c?.phone ?? null,
      });
      setClaseId(String(reserva.gym_class_id));
      setOrigen((ORIGENES_RESERVA as readonly string[]).includes(reserva.reservation_source ?? '') ? (reserva.reservation_source as OrigenReserva) : 'staff');
      setNotas(reserva.notes ?? '');
    } else {
      setCliente(null);
      setClaseId(claseInicial ? String(claseInicial) : '');
      setOrigen('staff');
      setNotas('');
    }
  }, [abierto, reserva, claseInicial]);

  const disponibles = useMemo(
    () => clases.filter((c) => c.status === 'active' && fechas.dia(c.start_at) >= fechas.hoy),
    [clases, fechas],
  );

  const errorCliente = intentado && !cliente ? t('dialogo.errores.cliente') : null;
  const errorClase = intentado && !claseId ? t('dialogo.errores.clase') : null;

  const guardar = async () => {
    setIntentado(true);
    if (!cliente || !claseId) return;
    setGuardando(true);
    try {
      await onGuardar({ claseId: Number(claseId), clienteId: cliente.id, origen, notas: notas.trim() || null });
      onAbiertoChange(false);
    } catch {
      // La página muestra el motivo (sin cupo, reserva repetida…).
    } finally {
      setGuardando(false);
    }
  };

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={reserva ? t('dialogo.tituloEditar') : t('dialogo.tituloNueva')}
      icono={CalendarCheck}
      ocupado={guardando}
      ancho={560}
      pie={
        <>
          <Button variant="outline" onClick={() => onAbiertoChange(false)} disabled={guardando}>
            {t('dialogo.cancelar')}
          </Button>
          <Button onClick={() => void guardar()} disabled={guardando}>
            {guardando ? t('dialogo.guardando') : reserva ? t('dialogo.guardar') : t('dialogo.crear')}
          </Button>
        </>
      }
    >
      <FormField etiqueta={t('dialogo.clase')} obligatorio error={errorClase}>
        {(campo) => (
          <Select value={claseId} onValueChange={setClaseId} disabled={!!reserva}>
            <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']} aria-invalid={campo['aria-invalid']}>
              <SelectValue placeholder={t('dialogo.clasePlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {(reserva ? clases.filter((c) => c.id === reserva.gym_class_id) : disponibles).map((c) => {
                const libres = cuposLibres(c.capacity, ocupacion.get(c.id) ?? 0);
                return (
                  <SelectItem key={c.id} value={String(c.id)} disabled={!reserva && libres === 0}>
                    {t('dialogo.opcionClase', { titulo: c.title, dia: fechas.fechaCorta(c.start_at), hora: fechas.hora(c.start_at), libres })}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}
      </FormField>
      {!reserva && disponibles.length === 0 && <p className="text-sm text-fg-secondary">{t('dialogo.sinClases')}</p>}

      <FormField etiqueta={t('dialogo.cliente')} obligatorio error={errorCliente}>
        {(campo) => (
          <CustomerPicker
            id={campo.id}
            aria-describedby={campo['aria-describedby']}
            aria-invalid={campo['aria-invalid']}
            layout="campo"
            cliente={cliente}
            deshabilitado={!!reserva}
            buscar={async (texto) => searchCustomersForReservation(texto, organizationId)}
            onCambiar={setCliente}
            onQuitar={reserva ? undefined : () => setCliente(null)}
          />
        )}
      </FormField>

      <FormField etiqueta={t('dialogo.origen')}>
        {(campo) => (
          <Select value={origen} onValueChange={(v) => setOrigen(v as OrigenReserva)}>
            <SelectTrigger id={campo.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORIGENES_RESERVA.map((o) => (
                <SelectItem key={o} value={o}>
                  {t(`origenes.${o}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>

      <FormField etiqueta={t('dialogo.notas')}>
        <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} maxLength={500} placeholder={t('dialogo.notasPlaceholder')} />
      </FormField>
    </PanelAdaptable>
  );
}
