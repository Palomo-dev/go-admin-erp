'use client';

import { useId } from 'react';
import { CheckCircle, Clock, MapPin, Navigation, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * Cuerpo de la sección «Entrega» del cobro (POS-PLAN paso 12, L46): recoger /
 * envío propio / tercero, conductor, dirección con búsqueda de clientes,
 * ciudad, contacto, instrucciones, tarifa y si el envío queda pagado o
 * pendiente. Solo dibuja: el estado, la búsqueda y la tarifa (que suma el
 * flete al total) siguen en `CheckoutDialog`.
 */
export type TipoEntrega = 'pickup' | 'delivery_own' | 'delivery_third_party';
export type PagoEnvio = 'paid' | 'pending';

export interface DireccionEncontrada {
  id: string;
  name: string;
  address: string;
  city?: string;
  phone?: string;
}

export interface EntregaCobroProps {
  tipo: TipoEntrega;
  onTipo: (tipo: TipoEntrega) => void;
  conductores: readonly { id: string; name: string; phone?: string }[];
  conductorId: string;
  onConductor: (id: string) => void;
  /** El cliente del carrito trae dirección (se precargó). */
  direccionDelCliente: boolean;
  direccion: string;
  onDireccion: (texto: string) => void;
  resultados: readonly DireccionEncontrada[];
  mostrarResultados: boolean;
  onFocoDireccion: () => void;
  onSalirDireccion: () => void;
  onElegirDireccion: (d: DireccionEncontrada) => void;
  ciudad: string;
  onCiudad: (v: string) => void;
  telefono: string;
  onTelefono: (v: string) => void;
  contacto: string;
  onContacto: (v: string) => void;
  instrucciones: string;
  onInstrucciones: (v: string) => void;
  tarifas: readonly { id: string; rate_name: string; total_cost: number }[];
  tarifaId: string;
  onTarifa: (id: string) => void;
  pagoEnvio: PagoEnvio;
  onPagoEnvio: (v: PagoEnvio) => void;
  formatear: (n: number) => string;
}

const OPCIONES: readonly { valor: TipoEntrega; icono: typeof Truck; clave: 'recoger' | 'propio' | 'tercero' }[] = [
  { valor: 'pickup', icono: CheckCircle, clave: 'recoger' },
  { valor: 'delivery_own', icono: Truck, clave: 'propio' },
  { valor: 'delivery_third_party', icono: Navigation, clave: 'tercero' },
];

const CLASE_ETIQUETA = 'flex items-center gap-1 text-xs font-medium text-fg-secondary';

function botonOpcion(activo: boolean): string {
  return cn(
    'flex h-auto min-h-10 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
    activo ? 'border-line-brand bg-brand-tint text-brand-deep ring-1 ring-brand' : 'border-line-strong bg-surface text-fg hover:bg-hover',
  );
}

export function EntregaCobro(p: EntregaCobroProps) {
  const t = useTranslations('posCobro.entrega');
  const id = useId();
  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label={t('tipo')} className="grid grid-cols-3 gap-2">
        {OPCIONES.map(({ valor, icono: Icono, clave }) => (
          <button key={valor} type="button" role="radio" aria-checked={p.tipo === valor} onClick={() => p.onTipo(valor)} className={botonOpcion(p.tipo === valor)}>
            <Icono aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
            {t(clave)}
          </button>
        ))}
      </div>

      {p.tipo !== 'pickup' && (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          {p.tipo === 'delivery_own' && p.conductores.length > 0 && (
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-conductor`} className={CLASE_ETIQUETA}>
                {t('conductor')}
              </label>
              <Select value={p.conductorId} onValueChange={p.onConductor}>
                <SelectTrigger id={`${id}-conductor`}>
                  <SelectValue placeholder={t('conductorPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {p.conductores.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.phone ? ` · ${c.phone}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {p.tipo === 'delivery_own' && p.direccionDelCliente && (
            <p className="flex items-center gap-1.5 rounded-lg bg-info-subtle p-2 text-xs text-info-text">
              <MapPin aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.5} />
              {t('direccionCliente')}
            </p>
          )}
          <div className="relative flex flex-col gap-1">
            <label htmlFor={`${id}-direccion`} className={CLASE_ETIQUETA}>
              <MapPin aria-hidden="true" className="size-3" strokeWidth={1.5} />
              {t('direccion')}
            </label>
            <Input
              id={`${id}-direccion`}
              value={p.direccion}
              required
              aria-autocomplete="list"
              aria-expanded={p.mostrarResultados && p.resultados.length > 0}
              aria-controls={`${id}-resultados`}
              onChange={(e) => p.onDireccion(e.target.value)}
              onFocus={p.onFocoDireccion}
              onBlur={p.onSalirDireccion}
              placeholder={t('direccionPlaceholder')}
            />
            {p.mostrarResultados && p.resultados.length > 0 && (
              <ul id={`${id}-resultados`} role="listbox" className="absolute top-full z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-line bg-surface shadow-lg">
                {p.resultados.map((d) => (
                  <li key={d.id} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onMouseDown={() => p.onElegirDireccion(d)}
                      className="w-full border-b border-line px-3 py-2 text-left last:border-0 hover:bg-hover"
                    >
                      <span className="block text-sm font-medium text-fg">{d.name}</span>
                      <span className="flex items-center gap-1 text-xs text-fg-secondary">
                        <MapPin aria-hidden="true" className="size-3 shrink-0" strokeWidth={1.5} />
                        {d.address}
                        {d.city ? `, ${d.city}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-ciudad`} className={CLASE_ETIQUETA}>
                {t('ciudad')}
              </label>
              <Input id={`${id}-ciudad`} value={p.ciudad} onChange={(e) => p.onCiudad(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-telefono`} className={CLASE_ETIQUETA}>
                {t('telefono')}
              </label>
              <Input id={`${id}-telefono`} type="tel" inputMode="tel" value={p.telefono} onChange={(e) => p.onTelefono(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-contacto`} className={CLASE_ETIQUETA}>
              {t('contacto')}
            </label>
            <Input id={`${id}-contacto`} value={p.contacto} onChange={(e) => p.onContacto(e.target.value)} placeholder={t('contactoPlaceholder')} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-instrucciones`} className={CLASE_ETIQUETA}>
              {t('instrucciones')}
            </label>
            <Input id={`${id}-instrucciones`} value={p.instrucciones} onChange={(e) => p.onInstrucciones(e.target.value)} placeholder={t('instruccionesPlaceholder')} />
          </div>
          {p.tarifas.length > 0 && (
            <div className="flex flex-col gap-1 border-t border-line pt-3">
              <label htmlFor={`${id}-tarifa`} className={CLASE_ETIQUETA}>
                <Truck aria-hidden="true" className="size-3" strokeWidth={1.5} />
                {t('tarifa')}
              </label>
              <Select value={p.tarifaId} onValueChange={p.onTarifa}>
                <SelectTrigger id={`${id}-tarifa`}>
                  <SelectValue placeholder={t('tarifaPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {p.tarifas.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {t('tarifaOpcion', { nombre: r.rate_name, costo: p.formatear(r.total_cost) })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1 border-t border-line pt-3">
            <span id={`${id}-pago`} className={CLASE_ETIQUETA}>
              {t('pagoEnvio')}
            </span>
            <div role="radiogroup" aria-labelledby={`${id}-pago`} className="grid grid-cols-2 gap-2">
              <button type="button" role="radio" aria-checked={p.pagoEnvio === 'paid'} onClick={() => p.onPagoEnvio('paid')} className={botonOpcion(p.pagoEnvio === 'paid')}>
                <CheckCircle aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('pagado')}
              </button>
              <button type="button" role="radio" aria-checked={p.pagoEnvio === 'pending'} onClick={() => p.onPagoEnvio('pending')} className={botonOpcion(p.pagoEnvio === 'pending')}>
                <Clock aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('pendiente')}
              </button>
            </div>
            {p.pagoEnvio === 'pending' && <p className="text-xs text-warning-text">{t('avisoPendiente')}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
