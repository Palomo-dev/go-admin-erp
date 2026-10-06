'use client';

/**
 * «Solicitud de reserva» (Figma 1703:923, nota 07; paso 4 de 1801:169066):
 * el equipo abre una reserva pendiente (de la web o de otro canal), ve sus
 * datos —incluido el depósito—, elige mesa y la confirma avisando al cliente,
 * o la rechaza / propone otra hora (el rechazo con motivo va en
 * `RechazarSolicitudDialog`).
 *
 * Mesas candidatas: `reservasMesasService.getAvailableTables` (misma sede,
 * capacidad y sin otra reserva que se cruce, con el buffer de la sede): la
 * misma regla que «Asignar mesa» y la edición.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Check, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { formatMoneda } from '@/lib/utils/moneda';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { nombrePasarela, resumenDeposito } from '@/lib/services/restaurante/depositoReserva';
import { reservasMesasService, type RestaurantReservation } from './reservasMesasService';
import { claveOrigen, horaCorta } from './reservasVista';

export interface MesaCandidata {
  id: string;
  name: string;
  zone: string | null;
  capacity: number;
}

interface Props {
  reserva: RestaurantReservation | null;
  /** Nombre de la sede de la reserva. */
  sede: string | null;
  /** Grupo grande de la sede (las reservas de más personas llegan como solicitud). */
  grupoGrande: number | null;
  ahora: Date;
  onAbiertoChange: (abierto: boolean) => void;
  onConfirmar: (reserva: RestaurantReservation, mesaId: string | null) => Promise<void>;
  onRechazar: (reserva: RestaurantReservation) => void;
  onProponerHora: (reserva: RestaurantReservation) => void;
  /** Para el arnés: candidatas fijas en vez de consultarlas. */
  candidatasFijas?: MesaCandidata[];
}

function Fila({ etiqueta, children, tono }: { etiqueta: string; children: React.ReactNode; tono?: 'exito' | 'aviso' }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-[13px] leading-[18px]">
      <dt className="shrink-0 text-fg-secondary">{etiqueta}</dt>
      <dd className={cn('min-w-0 text-right', tono === 'exito' ? 'text-success-text' : tono === 'aviso' ? 'text-warning-text' : 'text-fg')}>{children}</dd>
    </div>
  );
}

export function SolicitudReservaDialog({
  reserva,
  sede,
  grupoGrande,
  ahora,
  onAbiertoChange,
  onConfirmar,
  onRechazar,
  onProponerHora,
  candidatasFijas,
}: Props) {
  const t = useTranslations('posReservasMesas.solicitud');
  const tor = useTranslations('posReservasMesas.origenes');
  const monedaOrg = useMonedaOrganizacion();
  const { getToday } = useFormatDate();
  const [candidatas, setCandidatas] = useState<MesaCandidata[]>(candidatasFijas ?? []);
  const [cargando, setCargando] = useState(false);
  const [mesa, setMesa] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!reserva) return;
    setMesa(reserva.restaurant_table_id ?? '');
    // Figma 1703:923: llega con la primera mesa que sirve ya elegida (la más pequeña donde cabe el grupo).
    const elegirPrimera = (m: MesaCandidata[]) => {
      const menor = [...m].sort((a, b) => a.capacity - b.capacity)[0];
      if (!reserva.restaurant_table_id && menor) setMesa(menor.id);
    };
    if (candidatasFijas) {
      setCandidatas(candidatasFijas);
      elegirPrimera(candidatasFijas);
      return;
    }
    let cancelado = false;
    setCargando(true);
    reservasMesasService
      .getAvailableTables(reserva.reservation_date, reserva.reservation_time, reserva.party_size, reserva.branch_id, reserva.id, reserva.duration_minutes || 90)
      .then((m) => {
        if (cancelado) return;
        setCandidatas(m);
        elegirPrimera(m);
      })
      .catch(() => !cancelado && setCandidatas([]))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [reserva, candidatasFijas]);

  if (!reserva) return null;

  const haceMin = Math.max(0, Math.floor((ahora.getTime() - Date.parse(reserva.created_at)) / 60_000));
  const hoy = getToday();
  const dia = reserva.reservation_date === hoy ? t('hoy') : formatPlainDate(reserva.reservation_date, { weekday: 'short', day: 'numeric', month: 'short' });
  const dep = resumenDeposito(reserva, ahora);
  const grande = grupoGrande != null && reserva.party_size > grupoGrande;
  const sinMesas = !cargando && candidatas.length === 0;
  const motivo = grande ? t('motivo.grupoGrande', { n: reserva.party_size }) : sinMesas ? t('motivo.sinMesas') : null;

  const confirmar = async () => {
    setGuardando(true);
    try {
      await onConfirmar(reserva, mesa || null);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(a) => !guardando && onAbiertoChange(a)}>
      <DialogContent className="max-w-[560px] gap-0 p-6 [&>button]:hidden">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-xl font-semibold leading-7 text-fg">
              {t('titulo')}
              <Badge tono={claveOrigen(reserva.source) === 'web' ? 'marca' : 'neutro'} tamano="sm">
                {tor(claveOrigen(reserva.source))}
              </Badge>
              <Badge tono="advertencia" apariencia="contorno" tamano="sm">
                {t('porConfirmar')}
              </Badge>
            </DialogTitle>
            <DialogDescription className="mt-1 text-[13px] leading-[18px] text-fg-secondary">
              {t('llego', { origen: tor(claveOrigen(reserva.source)), min: haceMin, sede: sede ?? '—' })}
            </DialogDescription>
          </div>
          <Button variant="ghost" size="icon" className="-mr-2 -mt-1 h-8 w-8 shrink-0" onClick={() => onAbiertoChange(false)} aria-label={t('cerrar')}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <dl className="mt-5 rounded-lg bg-subtle px-4 py-2.5">
          <Fila etiqueta={t('cliente')}>{reserva.customer_name}</Fila>
          {(reserva.customer_phone || reserva.customer_email) && (
            <Fila etiqueta={t('contacto')}>{[reserva.customer_phone, reserva.customer_email].filter(Boolean).join(' · ')}</Fila>
          )}
          <Fila etiqueta={t('fechaHora')}>
            {t('fechaHoraValor', { dia, hora: horaCorta(reserva.reservation_time), min: reserva.duration_minutes || 90 })}
          </Fila>
          <Fila etiqueta={t('personas')}>{reserva.party_size}</Fila>
          {(reserva.special_requests || reserva.notes) && <Fila etiqueta={t('nota')}>{reserva.special_requests || reserva.notes}</Fila>}
          {dep && (
            <Fila etiqueta={t('deposito')} tono={dep.estado === 'paid' ? 'exito' : dep.estado === 'pending' ? 'aviso' : undefined}>
              {dep.monto != null && formatMoneda(dep.monto, dep.moneda ?? monedaOrg)}
              {' · '}
              {dep.estado === 'paid' ? t('depositoPagado', { pasarela: nombrePasarela('wompi_co') }) : dep.etiqueta.toLowerCase()}
            </Fila>
          )}
        </dl>

        {motivo && (
          <div className="mt-5 flex gap-3 rounded-lg border border-line-warning bg-warning-subtle p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" aria-hidden="true" />
            <div className="text-[13px] leading-[18px]">
              <p className="font-medium text-warning-text">{t('llegoComoSolicitud', { motivo })}</p>
              <p className="mt-1 text-fg-secondary">{t('puedes')}</p>
            </div>
          </div>
        )}

        <FormField etiqueta={t('asignarMesa')} className="mt-5">
          {(c) => (
            <Select value={mesa} onValueChange={setMesa} disabled={cargando || sinMesas}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={cargando ? t('buscandoMesas') : sinMesas ? t('sinMesasLibres') : t('elegirMesa')} />
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

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="outline" className="h-10 px-3" onClick={() => onRechazar(reserva)} disabled={guardando}>
            {t('rechazar')}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="ghost"
              className="h-10 bg-brand-tint px-3 text-brand-deep hover:bg-brand-tint hover:text-brand-deep"
              onClick={() => onProponerHora(reserva)}
              disabled={guardando}
            >
              {t('proponerHora')}
            </Button>
            <Button className="h-10 px-3" onClick={() => void confirmar()} disabled={guardando || cargando || (!mesa && !sinMesas)}>
              <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('confirmar')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
