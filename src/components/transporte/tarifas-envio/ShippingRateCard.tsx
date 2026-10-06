'use client';

/**
 * Tarjeta de una tarifa de envío. La comparten Transporte › Tarifas de envío y
 * Sitio web › Ventas en línea (a través de `TarifasEnvio`): cambiarla aquí la
 * cambia en las dos pantallas.
 *
 * Solo tokens semánticos (sin gray-*, hex ni `dark:` sueltos). `valid_from` y
 * `valid_until` son columnas `date`: se pintan con `formatPlainDate` y se
 * comparan con el día de hoy en la zona de la organización (`todayInTz`),
 * nunca con `new Date(...)`, que corría el día.
 */
import { Copy, Edit, Globe, MapPin, Package, Percent, Scale, Trash2, Truck, CalendarDays } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { RowActionsMenu, StatusBadge } from '@/components/kit';
import type { ShippingRateWithCarrier } from '@/lib/services/shippingRatesService';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { formatPlainDate, todayInTz } from '@/lib/utils/dateDisplay';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { cn } from '@/utils/Utils';

interface ShippingRateCardProps {
  rate: ShippingRateWithCarrier;
  onEdit: (rate: ShippingRateWithCarrier) => void;
  onDuplicate: (rate: ShippingRateWithCarrier) => void;
  onDelete: (rate: ShippingRateWithCarrier) => void;
  onToggleActive: (rate: ShippingRateWithCarrier, isActive: boolean) => void;
  /** Solo lectura: sin interruptor ni menú (persona sin permiso de edición). */
  soloLectura?: boolean;
}

const SERVICE_LEVEL_LABELS: Record<string, string> = {
  express: 'Express',
  standard: 'Estándar',
  economy: 'Económico',
  overnight: 'Día siguiente',
  same_day: 'Mismo día',
};

const CALCULATION_METHOD_LABELS: Record<string, string> = {
  weight: 'Por peso',
  volume: 'Por volumen',
  dimensional: 'Peso dimensional',
  flat: 'Tarifa fija',
};

const FECHA_CORTA: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };

/** Día `YYYY-MM-DD` de una columna `date` (sin convertir zona). */
function diaPlano(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(valor);
  return m ? m[1] : null;
}

export function ShippingRateCard({ rate, onEdit, onDuplicate, onDelete, onToggleActive, soloLectura }: ShippingRateCardProps) {
  // En la moneda del documento; sin ella, la base de la organización.
  const { paraDocumento } = useMonedaOrganizacion();
  const formatCurrency = crearFormateadorMoneda(paraDocumento(rate.currency));
  const { timezone } = useOrgTimezone();
  const hoy = todayInTz(timezone);
  const desde = diaPlano(rate.valid_from);
  const hasta = diaPlano(rate.valid_until);
  const isExpired = !!hasta && hasta < hoy;
  const isUpcoming = !!desde && desde > hoy;

  const precios = [
    { etiqueta: 'Base', valor: rate.base_rate || 0, siempre: true },
    { etiqueta: 'Por kg', valor: rate.rate_per_kg, siempre: false },
    { etiqueta: 'Por m³', valor: rate.rate_per_m3, siempre: false },
    { etiqueta: 'Mínimo', valor: rate.min_charge, siempre: false },
  ].filter((p) => p.siempre || p.valor > 0);

  return (
    <article
      className={cn('flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 transition-opacity', !rate.is_active && 'opacity-60')}
      aria-label={rate.rate_name}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', rate.is_active ? 'bg-brand-tint text-brand' : 'bg-subtle text-fg-muted')}
          >
            <Truck className="size-5" strokeWidth={1.5} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-fg">{rate.rate_name}</h3>
            {rate.rate_code && <p className="text-xs text-fg-secondary">Código: {rate.rate_code}</p>}
          </div>
        </div>
        {!soloLectura && (
          <div className="flex shrink-0 items-center gap-1">
            <Switch
              checked={rate.is_active}
              onCheckedChange={(checked) => onToggleActive(rate, checked)}
              aria-label={rate.is_active ? `Desactivar ${rate.rate_name}` : `Activar ${rate.rate_name}`}
            />
            <RowActionsMenu
              titulo={rate.rate_name}
              acciones={[
                { id: 'editar', etiqueta: 'Editar', icono: Edit, onSelect: () => onEdit(rate) },
                { id: 'duplicar', etiqueta: 'Duplicar', icono: Copy, onSelect: () => onDuplicate(rate) },
                { id: 'eliminar', etiqueta: 'Eliminar', icono: Trash2, onSelect: () => onDelete(rate), destructiva: true },
              ]}
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {rate.transport_carriers && <StatusBadge estado="transportador" etiqueta={rate.transport_carriers.name} icono={Truck} tono="neutro" apariencia="contorno" tamano="sm" />}
        {rate.service_level && (
          <StatusBadge estado="nivel" etiqueta={SERVICE_LEVEL_LABELS[rate.service_level] || rate.service_level} tono="neutro" tamano="sm" />
        )}
        <StatusBadge
          estado="metodo"
          etiqueta={CALCULATION_METHOD_LABELS[rate.calculation_method] || rate.calculation_method}
          icono={Scale}
          tono="neutro"
          apariencia="contorno"
          tamano="sm"
        />
        {rate.show_on_website && <StatusBadge estado="web" etiqueta="Web" icono={Globe} tono="exito" apariencia="contorno" tamano="sm" />}
        {isExpired && <StatusBadge estado="expirada" etiqueta="Expirada" tono="peligro" tamano="sm" />}
        {isUpcoming && <StatusBadge estado="proximamente" etiqueta="Próximamente" tono="advertencia" tamano="sm" />}
      </div>

      {(rate.origin_city || rate.destination_city || rate.origin_zone || rate.destination_zone) && (
        <p className="flex items-center gap-2 text-[13px] text-fg-secondary">
          <MapPin aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
          <span className="truncate">
            {rate.origin_city || rate.origin_zone || 'Cualquier origen'}
            {' → '}
            {rate.destination_city || rate.destination_zone || 'Cualquier destino'}
          </span>
        </p>
      )}

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {precios.map((p) => (
          <div key={p.etiqueta} className="rounded-lg bg-canvas p-2">
            <dt className="text-xs text-fg-secondary">{p.etiqueta}</dt>
            <dd className="text-sm font-semibold tabular-nums text-fg">{formatCurrency(p.valor)}</dd>
          </div>
        ))}
      </dl>

      {(rate.fuel_surcharge_percent > 0 || rate.insurance_percent > 0) && (
        <div className="flex flex-wrap items-center gap-4 text-[13px] text-fg-secondary">
          {rate.fuel_surcharge_percent > 0 && (
            <span className="flex items-center gap-1">
              <Percent aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
              Combustible: {rate.fuel_surcharge_percent}%
            </span>
          )}
          {rate.insurance_percent > 0 && (
            <span className="flex items-center gap-1">
              <Package aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
              Seguro: {rate.insurance_percent}%
            </span>
          )}
        </div>
      )}

      {(rate.min_weight_kg || rate.max_weight_kg) && (
        <p className="flex items-center gap-2 text-[13px] text-fg-secondary">
          <Scale aria-hidden="true" className="size-4" strokeWidth={1.5} />
          Peso: {rate.min_weight_kg || 0} – {rate.max_weight_kg || '∞'} kg
        </p>
      )}

      {(desde || hasta) && (
        <p className="flex items-center gap-2 border-t border-line pt-2 text-xs text-fg-secondary">
          <CalendarDays aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
          <span>
            {desde && `Desde: ${formatPlainDate(desde, FECHA_CORTA)}`}
            {desde && hasta && ' · '}
            {hasta && `Hasta: ${formatPlainDate(hasta, FECHA_CORTA)}`}
          </span>
        </p>
      )}
    </article>
  );
}

export default ShippingRateCard;
