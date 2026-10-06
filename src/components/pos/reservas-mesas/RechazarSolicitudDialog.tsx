'use client';

/**
 * «Rechazar la solicitud de …» (Figma 1804:143375, panel derecho del paso 4):
 * motivo que se guarda y se le cuenta al cliente (rápidos + «Otro»), una hora
 * alternativa opcional (horas con mesa de ese día, de
 * `get_restaurant_availability`) y la vista previa «Así le llega».
 *
 * «Proponer otra hora» abre este mismo diálogo con el motivo «Sin mesas a esa
 * hora» ya elegido: la reserva se cancela con el motivo y el cliente recibe la
 * hora alternativa para volver a reservar.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ban, Check } from 'lucide-react';
import { Dialogo, FormField } from '@/components/kit';
import { cn } from '@/utils/Utils';
import type { RestaurantReservation } from './reservasMesasService';
import { horaCorta, nombreCorto } from './reservasVista';

export type MotivoRechazo = 'sinMesas' | 'grupoGrande' | 'eventoPrivado' | 'otro';
const MOTIVOS: readonly MotivoRechazo[] = ['sinMesas', 'grupoGrande', 'eventoPrivado', 'otro'];

interface Props {
  reserva: RestaurantReservation | null;
  sede: string | null;
  /** Horas con mesa ese día para el mismo grupo («19:00»). */
  horasLibres: readonly string[];
  /** Abre con «Sin mesas a esa hora» elegido (botón «Proponer otra hora»). */
  proponiendoHora?: boolean;
  /** Es hoy (el texto dice «hoy»). */
  esHoy: boolean;
  cargando?: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  onConfirmar: (reserva: RestaurantReservation, motivo: string, otraHora: string | null) => Promise<void>;
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        activo ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line-strong bg-surface text-fg-secondary hover:bg-hover hover:text-fg',
      )}
    >
      {activo && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function RechazarSolicitudDialog({ reserva, sede, horasLibres, proponiendoHora, esHoy, cargando, onAbiertoChange, onConfirmar }: Props) {
  const t = useTranslations('posReservasMesas.rechazo');
  const [motivo, setMotivo] = useState<MotivoRechazo>('sinMesas');
  const [otro, setOtro] = useState('');
  const [hora, setHora] = useState<string | null>(null);

  useEffect(() => {
    if (!reserva) return;
    setMotivo('sinMesas');
    setOtro('');
    setHora(proponiendoHora && horasLibres.length > 0 ? horasLibres[0] : null);
  }, [reserva, proponiendoHora, horasLibres]);

  const textoMotivo = motivo === 'otro' ? otro.trim() : t(`motivos.${motivo}`);
  const vista = useMemo(() => {
    if (!reserva) return '';
    const base = t('vista.base', {
      nombre: nombreCorto(reserva.customer_name).split(' ')[0],
      cuando: esHoy ? t('vista.hoy') : t('vista.eseDia'),
      hora: horaCorta(reserva.reservation_time),
      n: reserva.party_size,
      sede: sede ?? '',
    });
    return hora ? `${base} ${t('vista.otraHora', { hora: horaCorta(hora) })}` : `${base} ${t('vista.motivo', { motivo: textoMotivo })}`;
  }, [reserva, esHoy, sede, hora, textoMotivo, t]);

  if (!reserva) return null;
  const invalido = motivo === 'otro' && otro.trim().length < 3;

  return (
    <Dialogo
      abierto
      onAbiertoChange={(a) => !cargando && onAbiertoChange(a)}
      titulo={t('titulo', { nombre: reserva.customer_name.split(' ')[0] })}
      icono={Ban}
      ancho={520}
      primario={{
        etiqueta: t('confirmar'),
        destructiva: true,
        cargando,
        deshabilitada: invalido,
        motivo: invalido ? t('escribeMotivo') : undefined,
        onClick: () => void onConfirmar(reserva, textoMotivo, hora),
      }}
    >
      <FormField etiqueta={t('motivo')}>
        <div role="group" className="flex flex-wrap gap-2">
          {MOTIVOS.map((m) => (
            <Chip key={m} activo={motivo === m} onClick={() => setMotivo(m)}>
              {t(`motivos.${m}`)}
            </Chip>
          ))}
        </div>
      </FormField>
      {motivo === 'otro' && (
        <textarea
          rows={2}
          value={otro}
          maxLength={300}
          onChange={(e) => setOtro(e.target.value)}
          aria-label={t('otroMotivo')}
          placeholder={t('otroMotivo')}
          className="w-full resize-y rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20"
        />
      )}
      <FormField etiqueta={t('otraHora')}>
        {horasLibres.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{t('sinHoras')}</p>
        ) : (
          <div role="group" className="flex flex-wrap gap-2">
            {horasLibres.map((h) => (
              <Chip key={h} activo={hora === h} onClick={() => setHora(hora === h ? null : h)}>
                {horaCorta(h)}
              </Chip>
            ))}
          </div>
        )}
      </FormField>
      <div className="rounded-lg bg-subtle px-3 py-2.5 text-[13px] leading-[18px]">
        <p className="text-xs text-fg-secondary">{t('asiLeLlega')}</p>
        <p className="mt-1 text-fg">«{vista}»</p>
      </div>
    </Dialogo>
  );
}
