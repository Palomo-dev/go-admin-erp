'use client';

/**
 * Bloque gris «INTENTOS DE PAGO» (o «INTENTOS DEL ANTICIPO»): hora en la zona de la organización,
 * punto de color y título, con la línea gris de pasarela, medio y referencia debajo.
 */
import { cn } from '@/utils/Utils';
import { formatTimeInTz } from '@/lib/utils/dateDisplay';
import { esEventoReal, type ConceptoIntento, type EventoIntento, type IntentoPago } from '@/lib/pos/pedidosWeb/intentosPago';
import { useTextosPago } from './useTextosPago';

const PUNTO: Record<EventoIntento, string> = {
  link_created: 'bg-fg-muted',
  pending: 'bg-info',
  approved: 'bg-success',
  declined: 'bg-danger',
  error: 'bg-danger',
  voided: 'bg-danger',
  expired: 'bg-danger',
};

export function HistorialIntentos({
  intentos,
  concepto,
  plazoMinutos,
  timezone,
  formatear,
}: {
  intentos: readonly IntentoPago[];
  concepto: ConceptoIntento;
  plazoMinutos: number | null;
  timezone: string;
  formatear: (n: number) => string;
}) {
  const textos = useTextosPago();
  const { t } = textos;
  if (!intentos.length) return null;
  const intentosReales = intentos.filter((i) => esEventoReal(i.event)).length;
  const titulo = concepto === 'advance' ? t('intentos.tituloAnticipo') : t('intentos.titulo');
  return (
    <section aria-label={titulo} className="rounded-lg bg-subtle px-3 py-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-fg-secondary">{titulo}</p>
      <ol className="mt-2 space-y-2.5">
        {intentos.map((i) => {
          const linea = textos.lineaIntento(i, { concepto, intentosReales, plazoMinutos, formatear });
          return (
            <li key={i.id} className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-x-2.5 text-[13px]">
              <span className="tabular-nums leading-5 text-fg-secondary">{formatTimeInTz(i.created_at, timezone)}</span>
              <span aria-hidden="true" className={cn('mt-1.5 size-2 rounded-full', PUNTO[i.event])} />
              <div className="min-w-0">
                <p className="leading-5 text-fg [overflow-wrap:anywhere]">{textos.tituloIntento(i, concepto)}</p>
                {linea && <p className="text-xs leading-5 text-fg-muted [overflow-wrap:anywhere]">{linea}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
