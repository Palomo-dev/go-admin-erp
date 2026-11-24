'use client';

/**
 * Catálogo común › Cambiar estado del vehículo (Figma «23 Transporte» 2972:21754). Reemplaza a
 * `VehicleStatusDialog`: los cuatro estados de `vehicles.status` con su explicación, el motivo (va a
 * la bitácora del vehículo) y, si pasa a mantenimiento o inactivo, el aviso de los viajes que tiene
 * programados.
 *
 * Fuera por ahora: el diseño deja esos viajes «Sin vehículo» al guardar. No hay una operación que
 * los desasigne en bloque (y quitar el vehículo de un viaje con puestos vendidos toca el plano de
 * pasajes), así que solo se avisan y se reasignan en Despachos.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Repeat } from 'lucide-react';
import { AvisoTonal, Dialogo, FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { transportService, type Trip, type Vehicle } from '@/lib/services/transportService';
import { ESTADOS_VEHICULO } from '@/lib/transporte/catalogoComun';
import { viajesProgramados } from '@/lib/transporte/fichaCatalogo';
import { cn } from '@/utils/Utils';

export interface CambiarEstadoDialogoProps {
  vehiculo: Vehicle | null;
  guardando: boolean;
  onCerrar: () => void;
  onCambiar: (estado: string, motivo: string | null) => void;
}

export function CambiarEstadoDialogo({ vehiculo, guardando, onCerrar, onCambiar }: CambiarEstadoDialogoProps) {
  const t = useTranslations('catalogoComun.dialogos.estado');
  const tv = useTranslations('catalogoComun.vehiculos');
  const { getToday } = useFormatDate();
  const hoy = getToday();
  const [estado, setEstado] = useState<string>(vehiculo?.status ?? 'available');
  const [motivo, setMotivo] = useState('');
  const [viajes, setViajes] = useState<Trip[]>([]);

  useEffect(() => {
    if (!vehiculo) return;
    let cancelado = false;
    transportService
      .getVehicleTrips(vehiculo.id)
      .then((v) => !cancelado && setViajes(v))
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [vehiculo]);

  const programados = useMemo(() => viajesProgramados(viajes, hoy), [viajes, hoy]);
  const saca = estado === 'maintenance' || estado === 'inactive';

  return (
    <Dialogo
      abierto={!!vehiculo}
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={t('titulo', { placa: vehiculo?.plate ?? '' })}
      descripcion={vehiculo ? t('hoy', { estado: tv(`estados.${vehiculo.status}`) }) : undefined}
      ancho={560}
      primario={{
        etiqueta: t('cambiar'),
        onClick: () => onCambiar(estado, motivo.trim() || null),
        cargando: guardando,
        deshabilitada: !vehiculo || estado === vehiculo.status,
        motivo: t('mismoEstado'),
      }}
    >
      <div className="flex flex-col gap-3">
        <div role="radiogroup" aria-label={t('titulo', { placa: vehiculo?.plate ?? '' })} className="flex flex-col gap-2">
          {ESTADOS_VEHICULO.map((e) => {
            const marcado = estado === e;
            return (
              <button
                key={e}
                type="button"
                role="radio"
                aria-checked={marcado}
                onClick={() => setEstado(e)}
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  marcado ? 'border-brand bg-brand-tint' : 'border-line bg-surface hover:bg-hover',
                )}
              >
                <span aria-hidden="true" className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border', marcado ? 'border-brand' : 'border-line-strong')}>
                  {marcado && <span className="size-2 rounded-full bg-brand" />}
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-medium text-fg">{tv(`estados.${e}`)}</span>
                  <span className="text-[13px] text-fg-secondary">{t(`explicacion.${e}`)}</span>
                </span>
              </button>
            );
          })}
        </div>
        {saca && programados.length > 0 && (
          <AvisoTonal
            tono="advertencia"
            titulo={t('aviso', { count: programados.length, codigos: programados.slice(0, 4).map((v) => v.trip_code).join(', ') + (programados.length > 4 ? '…' : '') })}
            descripcion={t('avisoDescripcion')}
            icono={Repeat}
          />
        )}
        <FormField etiqueta={t('motivo')}>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder={t('motivoPlaceholder')} />
        </FormField>
      </div>
    </Dialogo>
  );
}
