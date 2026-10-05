'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeftRight } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialogo, FormField } from '@/components/kit';
import { reservasMesasService } from '@/components/pos/reservas-mesas/reservasMesasService';
import { horaDeReserva, type ReservaActivaMesa } from './reservasProximas';

interface MesaCandidata {
  id: string;
  name: string;
  zone: string | null;
  capacity: number;
}

interface CambiarMesaReservaDialogProps {
  activa: ReservaActivaMesa | undefined;
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** Mesas que ahora no sirven aunque no tengan reserva: ocupadas o ya reservadas. */
  mesasNoDisponibles: ReadonlySet<string>;
  onConfirmar: (mesaDestinoId: string, mesaDestinoNombre: string) => Promise<void>;
}

/**
 * «Cambiar de mesa» de una reserva. Las candidatas salen de
 * `reservasMesasService.getAvailableTables` (misma sucursal, capacidad y
 * sin reserva que se cruce en esa franja: la lógica de siempre del módulo de
 * reservas) y además se quitan las que en este momento están ocupadas.
 */
export function CambiarMesaReservaDialog({
  activa,
  abierto,
  onAbiertoChange,
  mesasNoDisponibles,
  onConfirmar,
}: CambiarMesaReservaDialogProps) {
  const t = useTranslations('posMesas');
  const [candidatas, setCandidatas] = useState<MesaCandidata[]>([]);
  const [cargando, setCargando] = useState(false);
  const [destino, setDestino] = useState<string>('');
  const [guardando, setGuardando] = useState(false);

  const reserva = activa?.reserva;

  useEffect(() => {
    if (!abierto || !reserva) return;
    let cancelado = false;
    setDestino('');
    setCargando(true);
    reservasMesasService
      .getAvailableTables(
        reserva.reservation_date,
        reserva.reservation_time,
        reserva.party_size,
        reserva.branch_id,
        reserva.id,
        reserva.duration_minutes ?? undefined,
      )
      .then((mesas) => {
        if (cancelado) return;
        setCandidatas(
          mesas.filter((m) => m.id !== reserva.restaurant_table_id && !mesasNoDisponibles.has(m.id)),
        );
      })
      .catch((error) => {
        console.error('Error buscando mesas para la reserva:', error);
        if (!cancelado) setCandidatas([]);
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [abierto, reserva, mesasNoDisponibles]);

  const confirmar = async () => {
    const mesa = candidatas.find((m) => m.id === destino);
    if (!mesa) return;
    setGuardando(true);
    try {
      await onConfirmar(mesa.id, mesa.name);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(a) => !guardando && onAbiertoChange(a)}
      titulo={t('reserva.cambiarTitulo')}
      descripcion={
        activa && reserva
          ? t('reserva.cambiarDescripcion', { n: reserva.party_size, hora: horaDeReserva(activa) })
          : undefined
      }
      icono={ArrowLeftRight}
      ancho={440}
      primario={{
        etiqueta: t('reserva.cambiarConfirmar'),
        onClick: confirmar,
        cargando: guardando,
        deshabilitada: !destino || cargando,
      }}
    >
      {!cargando && candidatas.length === 0 ? (
        <p className="text-sm text-fg-secondary">{t('reserva.sinMesas')}</p>
      ) : (
        <FormField etiqueta={t('reserva.mesaDestino')}>
          {(c) => (
            <Select value={destino} onValueChange={setDestino} disabled={cargando}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={cargando ? t('reserva.cargandoMesas') : t('reserva.elegirMesa')} />
              </SelectTrigger>
              <SelectContent>
                {candidatas.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {t('reserva.opcionMesa', { mesa: m.name, zona: m.zone ?? t('zona.sinZona'), n: m.capacity })}
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
