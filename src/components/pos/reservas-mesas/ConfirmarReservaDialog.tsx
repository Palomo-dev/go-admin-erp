'use client';

/**
 * «Confirmar y asignar mesa» de una reserva pendiente (Figma 1801:169066,
 * paso 4). Las candidatas salen de `reservasMesasService.getAvailableTables`
 * (misma sede, capacidad y sin reserva que se cruce, con el buffer de la sede):
 * la misma regla que «Cambiar de mesa» y que la edición. Si la reserva ya trae
 * mesa (la asignó el sitio), viene preseleccionada.
 *
 * El rechazo con motivo va en `DialogoMotivo` (kit) desde la página.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialogo, FormField } from '@/components/kit';
import { reservasMesasService, type RestaurantReservation } from './reservasMesasService';

interface MesaCandidata {
  id: string;
  name: string;
  zone: string | null;
  capacity: number;
}

interface Props {
  reserva: RestaurantReservation | null;
  onAbiertoChange: (abierto: boolean) => void;
  onConfirmar: (reserva: RestaurantReservation, mesaId: string | null) => Promise<void>;
}

export function ConfirmarReservaDialog({ reserva, onAbiertoChange, onConfirmar }: Props) {
  const t = useTranslations('posReservasMesas.pendiente');
  const [candidatas, setCandidatas] = useState<MesaCandidata[]>([]);
  const [cargando, setCargando] = useState(false);
  const [mesa, setMesa] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!reserva) return;
    let cancelado = false;
    setMesa(reserva.restaurant_table_id ?? '');
    setCargando(true);
    reservasMesasService
      .getAvailableTables(
        reserva.reservation_date,
        reserva.reservation_time,
        reserva.party_size,
        reserva.branch_id,
        reserva.id,
        reserva.duration_minutes || 90,
      )
      .then((mesas) => {
        if (!cancelado) setCandidatas(mesas);
      })
      .catch((error) => {
        console.error('Error buscando mesas para confirmar la reserva:', error);
        if (!cancelado) setCandidatas([]);
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [reserva]);

  const confirmar = async () => {
    if (!reserva) return;
    setGuardando(true);
    try {
      await onConfirmar(reserva, mesa || null);
    } finally {
      setGuardando(false);
    }
  };

  const sinMesas = !cargando && candidatas.length === 0;

  return (
    <Dialogo
      abierto={!!reserva}
      onAbiertoChange={(a) => !guardando && onAbiertoChange(a)}
      titulo={t('confirmarTitulo', { nombre: reserva?.customer_name ?? '' })}
      descripcion={
        reserva
          ? t('confirmarDescripcion', {
              personas: reserva.party_size,
              hora: reserva.reservation_time.slice(0, 5),
            })
          : undefined
      }
      icono={CheckCircle}
      ancho={440}
      primario={{
        etiqueta: mesa ? t('confirmarConMesa') : t('confirmarSinMesa'),
        onClick: confirmar,
        cargando: guardando,
        // Sin mesa elegida solo se confirma si la sede no tiene ninguna libre a esa hora.
        deshabilitada: cargando || (!mesa && !sinMesas),
      }}
    >
      {sinMesas ? (
        <p className="text-sm text-fg-secondary">{t('sinMesas')}</p>
      ) : (
        <FormField etiqueta={t('mesa')}>
          {(c) => (
            <Select value={mesa} onValueChange={setMesa} disabled={cargando}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={cargando ? t('buscandoMesas') : t('elegirMesa')} />
              </SelectTrigger>
              <SelectContent>
                {candidatas.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {t('opcionMesa', { mesa: m.name, zona: m.zone ?? '—', n: m.capacity })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      )}
    </Dialogo>
  );
}
