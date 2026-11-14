'use client';

import * as React from 'react';
import Link from 'next/link';
import { Link2, Pencil } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { AvatarIniciales, Skeleton, StatusBadge, clasesBoton } from '@/components/kit';
import { PhoneInput } from '@/components/kit/PhoneInput';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useOrgCurrency, formatMonedaSinDecimales } from '@/lib/hooks/useOrgCurrency';
import {
  edicionDesdeFicha,
  errorEdicion,
  guardarContactoCliente,
  leerFichaClienteChat,
  type EdicionContacto,
  type FichaClienteChat,
} from '@/lib/services/chat/fichaClienteChat';
import { estaEnLinea } from '@/components/chat/inbox/bandejaLogica';
import { tiempoRelativo } from '@/components/chat/channels/canalesLogica';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { telefonoOpcionalValido } from '@/lib/utils/telefono';
import { cn } from '@/utils/Utils';
import { EtiquetasConversacion } from './EtiquetasConversacion';
import { TONO_ESTADO } from '../CabeceraHilo';
import type { ConversacionControl } from '../useConversacion';

function Fila({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_1fr] gap-3 py-1 text-sm">
      <dt className="text-fg-muted">{etiqueta}</dt>
      <dd className="min-w-0 break-words text-fg">{valor || '—'}</dd>
    </div>
  );
}

function Campo({
  id,
  etiqueta,
  children,
  error,
  obligatorio = false,
  ayuda,
}: {
  id: string;
  etiqueta: string;
  children: React.ReactNode;
  error?: string | null;
  obligatorio?: boolean;
  ayuda?: string | null;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium leading-[18px] text-fg">
        {etiqueta}
        {obligatorio ? (
          <span aria-hidden="true" className="ml-0.5 text-danger">
            *
          </span>
        ) : null}
      </label>
      {children}
      {ayuda && !error ? (
        <p id={`${id}-ayuda`} className="text-xs text-fg-muted">
          {ayuda}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Pestaña «Cliente» (Figma 91-chat-01): ficha corta, etiquetas y enlace a la
 * ficha. Con lo que tenía el Chat anterior: editar el contacto aquí mismo,
 * correo real del visitante web, «en línea / visto hace», cliente vinculado en
 * CRM, historial (mensajes, primer y último contacto, conversaciones
 * recientes) y las notas del cliente.
 */
export function PestanaCliente({ c, organizationId }: { c: ConversacionControl; organizationId: number | null | undefined }) {
  const t = useTranslations('chatBandeja.cliente');
  const te = useTranslations('chatUi.estado');
  const locale = useLocale();
  const { toast } = useToast();
  const { formatDate, timezone } = useFormatDate();
  const moneda = useOrgCurrency();
  const [ficha, setFicha] = React.useState<FichaClienteChat | null>(null);
  const [cargando, setCargando] = React.useState(true);
  const [edicion, setEdicion] = React.useState<EdicionContacto | null>(null);
  const [intento, setIntento] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);
  const customerId = c.detalle?.customer_id;
  const idBase = React.useId();

  const leer = React.useCallback(async () => {
    if (!organizationId || !customerId) return null;
    return leerFichaClienteChat(supabase, organizationId, customerId);
  }, [organizationId, customerId]);

  React.useEffect(() => {
    let vivo = true;
    setEdicion(null);
    if (!organizationId || !customerId) {
      setFicha(null);
      setCargando(!!customerId);
      return;
    }
    setCargando(true);
    leer()
      .then((f) => vivo && setFicha(f))
      .catch(() => vivo && setFicha(null))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [organizationId, customerId, leer]);

  if (cargando || !c.detalle) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const ahora = new Date();
  const nombre = ficha?.nombre ?? c.detalle.customer?.full_name ?? t('cliente');
  const desde = ficha?.creadoEn ? formatDateInTz(ficha.creadoEn, timezone, { locale, month: 'long', year: 'numeric' }) : null;
  const sub = [desde ? t('desde', { fecha: desde }) : null, ficha?.ciudad].filter(Boolean).join(' · ');
  const enLinea = estaEnLinea(ficha?.vistoEn, ahora);
  const visto = ficha?.vistoEn ? tiempoRelativo(ficha.vistoEn, ahora, locale) : null;

  const error = edicion && intento ? errorEdicion(edicion) : null;
  const telefonoMal = !!edicion && intento && !telefonoOpcionalValido(edicion.telefono);

  const guardar = async () => {
    if (!edicion || !ficha || !organizationId) return;
    setIntento(true);
    if (errorEdicion(edicion) || !telefonoOpcionalValido(edicion.telefono)) return;
    setGuardando(true);
    try {
      await guardarContactoCliente(supabase, organizationId, ficha, edicion);
      const nueva = await leer();
      if (nueva) setFicha(nueva);
      setEdicion(null);
      void c.recargar();
      toast({ title: t('edicion.guardado') });
    } catch (e) {
      toast({ title: t('edicion.error'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  const cambiar = (k: keyof EdicionContacto) => (v: string) => setEdicion((e) => (e ? { ...e, [k]: v } : e));

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-start gap-3">
        <span className="relative shrink-0">
          <AvatarIniciales nombre={nombre} src={ficha?.avatarUrl} tamano="md" className="size-12 text-base" />
          {enLinea ? <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-success ring-2 ring-surface" /> : null}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium leading-5 text-fg">{nombre}</p>
          {sub ? <p className="text-[13px] leading-[18px] text-fg-muted">{sub}</p> : null}
          {enLinea ? (
            <p className="text-[13px] leading-[18px] text-success-text">{t('enLinea')}</p>
          ) : visto ? (
            <p className="text-[13px] leading-[18px] text-fg-muted">{t('visto', { cuando: visto })}</p>
          ) : null}
        </div>
        {ficha && !edicion ? (
          <button
            type="button"
            onClick={() => {
              setIntento(false);
              setEdicion(edicionDesdeFicha(ficha));
            }}
            aria-label={t('edicion.editar')}
            title={t('edicion.editar')}
            className="flex size-9 shrink-0 items-center justify-center self-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg"
          >
            <Pencil aria-hidden="true" className="size-5" strokeWidth={1.5} />
          </button>
        ) : null}
      </div>

      <EtiquetasConversacion
        actuales={c.detalle.tags ?? []}
        disponibles={c.etiquetas}
        onAgregar={(id) => void c.agregarEtiqueta(id)}
        onQuitar={(id) => void c.quitarEtiqueta(id)}
        textoAgregar={t('etiqueta')}
      />

      {edicion ? (
        <form
          className="space-y-3 rounded-xl border border-line bg-subtle p-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
          aria-label={t('edicion.titulo')}
        >
          <h3 className="text-[13px] font-semibold text-fg-secondary">{t('edicion.titulo')}</h3>
          <div className="grid grid-cols-2 gap-2">
            <Campo id={`${idBase}-nombres`} etiqueta={t('edicion.nombres')} obligatorio error={error === 'nombre' ? t('edicion.errorNombre') : null}>
              <Input
                id={`${idBase}-nombres`}
                value={edicion.nombres}
                onChange={(e) => cambiar('nombres')(e.target.value)}
                aria-invalid={error === 'nombre' || undefined}
                aria-required
                aria-describedby={error === 'nombre' ? `${idBase}-nombres-error` : undefined}
                autoComplete="off"
              />
            </Campo>
            <Campo id={`${idBase}-apellidos`} etiqueta={t('edicion.apellidos')}>
              <Input id={`${idBase}-apellidos`} value={edicion.apellidos} onChange={(e) => cambiar('apellidos')(e.target.value)} autoComplete="off" />
            </Campo>
          </div>
          <Campo
            id={`${idBase}-correo`}
            etiqueta={t('correo')}
            error={error === 'correo' ? t('edicion.errorCorreo') : null}
            ayuda={ficha?.correoProvisional ? t('edicion.ayudaCorreoWidget') : null}
          >
            <Input
              id={`${idBase}-correo`}
              type="email"
              value={edicion.email}
              onChange={(e) => cambiar('email')(e.target.value)}
              aria-invalid={error === 'correo' || undefined}
              aria-describedby={error === 'correo' ? `${idBase}-correo-error` : ficha?.correoProvisional ? `${idBase}-correo-ayuda` : undefined}
              autoComplete="off"
            />
          </Campo>
          <Campo id={`${idBase}-telefono`} etiqueta={t('telefono')} error={telefonoMal ? t('edicion.errorTelefono') : null}>
            <PhoneInput id={`${idBase}-telefono`} value={edicion.telefono} onChange={cambiar('telefono')} error={telefonoMal || undefined} showValidation={false} />
          </Campo>
          <Campo id={`${idBase}-direccion`} etiqueta={t('direccion')}>
            <Input id={`${idBase}-direccion`} value={edicion.direccion} onChange={(e) => cambiar('direccion')(e.target.value)} autoComplete="off" />
          </Campo>
          <Campo id={`${idBase}-ciudad`} etiqueta={t('edicion.ciudad')}>
            <Input id={`${idBase}-ciudad`} value={edicion.ciudad} onChange={(e) => cambiar('ciudad')(e.target.value)} autoComplete="off" />
          </Campo>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setEdicion(null)} disabled={guardando} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'text-fg' })}>
              {t('edicion.cancelar')}
            </button>
            <button type="submit" disabled={guardando} aria-busy={guardando || undefined} className={clasesBoton({ tamano: 'sm' })}>
              {t('edicion.guardar')}
            </button>
          </div>
        </form>
      ) : (
        <section>
          <h3 className="mb-1 text-[13px] font-semibold text-fg-muted">{t('contacto')}</h3>
          <dl>
            <Fila etiqueta={t('telefono')} valor={ficha?.telefono ?? c.detalle.customer?.phone} />
            <Fila etiqueta={t('correo')} valor={ficha ? ficha.email : c.detalle.customer?.email} />
            <Fila etiqueta={t('documento')} valor={ficha?.documento} />
            <Fila etiqueta={t('direccion')} valor={[ficha?.direccion, ficha?.ciudad].filter(Boolean).join(', ')} />
          </dl>
        </section>
      )}

      {ficha ? (
        <section>
          <h3 className="mb-1 text-[13px] font-semibold text-fg-muted">{t('actividad')}</h3>
          <dl>
            <Fila etiqueta={t('conversaciones')} valor={t('conversacionesValor', { total: ficha.conversaciones, mes: ficha.conversacionesMes })} />
            <Fila etiqueta={t('mensajes')} valor={ficha.mensajes.toLocaleString(locale)} />
            {ficha.primerContacto ? <Fila etiqueta={t('primerContacto')} valor={formatDate(ficha.primerContacto)} /> : null}
            {ficha.ultimoContacto ? <Fila etiqueta={t('ultimoContacto')} valor={tiempoRelativo(ficha.ultimoContacto, ahora, locale)} /> : null}
            <Fila
              etiqueta={t('compras')}
              valor={ficha.compras > 0 ? t('comprasValor', { n: ficha.compras, total: formatMonedaSinDecimales(ficha.totalCompras, moneda, locale) }) : t('sinCompras')}
            />
            {ficha.ultimaCompra ? <Fila etiqueta={t('ultimaCompra')} valor={formatDate(ficha.ultimaCompra)} /> : null}
            {ficha.oportunidad ? <Fila etiqueta={t('oportunidad')} valor={ficha.oportunidad} /> : null}
          </dl>
        </section>
      ) : null}

      {ficha && ficha.recientes.length > 1 ? (
        <section>
          <h3 className="mb-1.5 text-[13px] font-semibold text-fg-secondary">{t('recientes')}</h3>
          <ul className="space-y-1">
            {ficha.recientes.map((r) => {
              const actual = r.id === c.detalle?.id;
              const estado = (r.estado ?? 'open') as keyof typeof TONO_ESTADO;
              return (
                <li key={r.id}>
                  <Link
                    href={`/app/chat/conversaciones/${r.id}`}
                    aria-current={actual ? 'page' : undefined}
                    className={cn('flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-hover', actual && 'bg-brand-tint')}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-fg">{t('mensajesN', { n: r.mensajes })}</span>
                      <span className="block truncate text-xs text-fg-muted">
                        {actual ? t('estaConversacion') : tiempoRelativo(r.ultimoMensaje ?? r.creadaEn, ahora, locale)}
                      </span>
                    </span>
                    <StatusBadge estado={estado} etiqueta={te.has(estado) ? te(estado) : estado} tono={TONO_ESTADO[estado] ?? 'neutro'} apariencia="contorno" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {ficha?.notas ? (
        <section>
          <h3 className="mb-1 text-[13px] font-semibold text-fg-secondary">{t('notasCliente')}</h3>
          <p className="whitespace-pre-wrap text-[13px] leading-5 text-fg-secondary">{ficha.notas}</p>
        </section>
      ) : null}

      {ficha?.vinculado ? (
        <section className="space-y-1 rounded-xl border border-line-brand bg-brand-tint p-3">
          <p className="flex items-center gap-1.5 text-[15px] font-medium text-brand-deep">
            <Link2 aria-hidden="true" className="size-4" />
            {t('vinculado')}
          </p>
          <p className="text-[13px] leading-[18px] text-fg">{[ficha.vinculado.nombre, ficha.vinculado.email].filter(Boolean).join(' · ')}</p>
        </section>
      ) : null}

      <Link href={`/app/clientes/${ficha?.vinculado?.id ?? c.detalle.customer_id}`} className={clasesBoton({ variante: 'secundario', tamano: 'sm', anchoCompleto: true })}>
        <Link2 aria-hidden="true" className="size-4" />
        {t('verFicha')}
      </Link>
    </div>
  );
}
