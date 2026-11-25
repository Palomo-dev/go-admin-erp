'use client';

/**
 * Piezas compartidas de la app del domiciliario: insignia de estado con palabras del domiciliario,
 * chip de promesa, chip de cobro, botones de llamar / WhatsApp / cómo llegar y barra inferior fija.
 */
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Clock, MessageCircle, Navigation, Phone, WifiOff } from 'lucide-react';
import { StatusBadge } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { telefonoWhatsApp } from '@/lib/services/clientesListadoService';
import { INSIGNIA_ESTADO } from '@/lib/logistica/estadoEnvioUi';
import { canonicoDeEstado } from '@/lib/logistica/estadosEnvio';
import {
  enlaceComoLlegar,
  enlaceLlamar,
  enlaceWhatsApp,
  estadoPromesa,
  porCobrar,
  type EnvioDomiciliario,
} from '@/lib/logistica/misEnvios';
import { cn } from '@/utils/Utils';

/** Estado con las palabras del domiciliario («Por recoger», «Recogido», «En camino»…). */
export function InsigniaEstadoApp({ estado }: { estado: string }) {
  const t = useTranslations('logistica.misEnvios.estados');
  const canonico = canonicoDeEstado(estado) ?? 'created';
  const { tono, apariencia } = INSIGNIA_ESTADO[canonico];
  const clave = ['assigned', 'ready', 'ready_for_pickup', 'picked', 'dispatched', 'in_transit', 'out_for_delivery', 'failed_attempt', 'delivered', 'returned', 'cancelled'].includes(estado)
    ? estado
    : 'otro';
  return <StatusBadge estado={estado} etiqueta={t(clave)} tono={tono} apariencia={apariencia} />;
}

/** «Promesa 1:00 p. m.» + «+18 min» / «faltan 12 min» / «en 42 min». */
export function ChipPromesa({ envio, zona, ahora }: { envio: EnvioDomiciliario; zona: string; ahora: Date }) {
  const t = useTranslations('logistica.misEnvios.promesa');
  const locale = useLocaleIntl();
  const p = estadoPromesa(envio.promesa, ahora);
  if (!envio.promesa || !p) return null;
  const hora = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: zona }).format(new Date(envio.promesa));
  const clases =
    p.tipo === 'tarde' ? 'bg-danger-subtle text-danger-text' : p.tipo === 'pronto' ? 'bg-warning-subtle text-warning-text' : 'bg-subtle text-fg-secondary';
  return (
    <span className="flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
      <span>{t('hora', { hora })}</span>
      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', clases)}>
        <Clock aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        {p.tipo === 'tarde' ? t('tarde', { minutos: p.minutos }) : p.tipo === 'pronto' ? t('faltan', { minutos: p.minutos }) : t('en', { minutos: p.minutos })}
      </span>
    </span>
  );
}

/** «Cobrar $ 128.900» (contraentrega pendiente) o «Pagado». */
export function ChipCobro({ envio }: { envio: EnvioDomiciliario }) {
  const t = useTranslations('logistica.misEnvios');
  const moneda = useMonedaOrganizacion();
  const monto = porCobrar(envio);
  if (monto > 0) {
    return (
      <span className="inline-flex items-center rounded-full border border-line-warning bg-warning-subtle px-2.5 py-1 text-[13px] font-semibold text-warning-text">
        {t('cobrar', { monto: moneda.formatear(monto) })}
      </span>
    );
  }
  if (Number(envio.cod_amount) > 0) {
    return (
      <span className="inline-flex items-center rounded-full border border-line-success bg-success-subtle px-2.5 py-1 text-[13px] font-medium text-success-text">
        {t('cobrado')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-line-success bg-success-subtle px-2.5 py-1 text-[13px] font-medium text-success-text">
      {t('pagado')}
    </span>
  );
}

function telefonoDe(envio: EnvioDomiciliario & { customer?: { phone?: string | null } | null }): string | null {
  return envio.delivery_contact_phone || envio.customer?.phone || null;
}

export interface EnlacesContacto {
  llamar: string | null;
  whatsapp: string | null;
  comoLlegar: string | null;
}

export function enlacesDe(envio: EnvioDomiciliario & { customer?: { phone?: string | null } | null }, textoWhatsApp?: string): EnlacesContacto {
  const tel = telefonoDe(envio);
  return {
    llamar: enlaceLlamar(tel),
    whatsapp: enlaceWhatsApp(telefonoWhatsApp(tel), textoWhatsApp),
    comoLlegar: enlaceComoLlegar(envio),
  };
}

const CLASE_ICONO = 'flex size-12 shrink-0 items-center justify-center rounded-xl border border-line-strong bg-surface text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

/** Botones cuadrados de 48 px de la tarjeta (llamar y cómo llegar). */
export function BotonesRapidos({ enlaces, nombre }: { enlaces: EnlacesContacto; nombre: string }) {
  const t = useTranslations('logistica.misEnvios.contacto');
  return (
    <div className="flex items-center gap-2">
      {enlaces.llamar && (
        <a href={enlaces.llamar} aria-label={t('llamarA', { nombre })} className={CLASE_ICONO} onClick={(e) => e.stopPropagation()}>
          <Phone aria-hidden="true" className="size-5" strokeWidth={1.5} />
        </a>
      )}
      {enlaces.comoLlegar && (
        <a
          href={enlaces.comoLlegar}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('comoLlegarA', { nombre })}
          className={CLASE_ICONO}
          onClick={(e) => e.stopPropagation()}
        >
          <Navigation aria-hidden="true" className="size-5" strokeWidth={1.5} />
        </a>
      )}
    </div>
  );
}

const CLASE_CONTACTO =
  'flex h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-surface px-2 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

/** Llamar · WhatsApp · Cómo llegar, a lo ancho (detalle de la parada). */
export function BotonesContacto({ enlaces }: { enlaces: EnlacesContacto }) {
  const t = useTranslations('logistica.misEnvios.contacto');
  return (
    <div className="flex gap-2">
      {enlaces.llamar && (
        <a href={enlaces.llamar} className={CLASE_CONTACTO}>
          <Phone aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
          <span className="truncate">{t('llamar')}</span>
        </a>
      )}
      {enlaces.whatsapp && (
        <a href={enlaces.whatsapp} target="_blank" rel="noopener noreferrer" className={CLASE_CONTACTO}>
          <MessageCircle aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
          <span className="truncate">{t('whatsapp')}</span>
        </a>
      )}
      {enlaces.comoLlegar && (
        <a href={enlaces.comoLlegar} target="_blank" rel="noopener noreferrer" className={CLASE_CONTACTO}>
          <Navigation aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
          <span className="truncate">{t('comoLlegar')}</span>
        </a>
      )}
    </div>
  );
}

/** Barra fija al pie con las acciones grandes (por encima de la barra del celular). */
export function BarraInferior({ children, nota }: { children: ReactNode; nota?: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex flex-col gap-2 border-t border-line bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:mx-0 sm:rounded-xl sm:border">
      {children}
      {nota && <p className="text-center text-xs text-fg-muted">{nota}</p>}
    </div>
  );
}

/** Tarjeta blanca de la app (las secciones del detalle). */
export function Bloque({ titulo, children, className, accion }: { titulo?: ReactNode; children: ReactNode; className?: string; accion?: ReactNode }) {
  return (
    <section className={cn('flex flex-col gap-3 rounded-xl border border-line bg-surface p-4', className)}>
      {(titulo || accion) && (
        <div className="flex items-center justify-between gap-2">
          {titulo && <h2 className="text-base font-semibold text-fg">{titulo}</h2>}
          {accion}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Franja «Sin conexión» bajo la cabecera (Figma Envío/AvisoConexion): dice de qué hora es la ruta
 * que se ve y que para entregar hace falta señal.
 */
export function FranjaSinConexion({ actualizadoEn, zona }: { actualizadoEn: Date | null; zona?: string }) {
  const t = useTranslations('logistica.misEnvios.sinConexion');
  const locale = useLocaleIntl();
  const hora = actualizadoEn ? new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: zona }).format(actualizadoEn) : null;
  return (
    <div role="status" className="-mx-4 flex items-start gap-3 bg-fg px-4 py-3 text-sm text-fg-on-brand sm:mx-0 sm:rounded-xl">
      <WifiOff aria-hidden="true" className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} />
      <p>{hora ? t('franja', { hora }) : t('franjaSinHora')}</p>
    </div>
  );
}

/** Aviso de lo que queda en pausa sin señal (entregas, cobros y novedades). */
export function AvisoPausaSinConexion() {
  const t = useTranslations('logistica.misEnvios.sinConexion');
  return (
    <div role="note" className="flex items-start gap-3 rounded-xl border border-line-warning bg-warning-subtle p-4 text-sm text-warning-text">
      <WifiOff aria-hidden="true" className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} />
      <p>{t('pausa')}</p>
    </div>
  );
}
