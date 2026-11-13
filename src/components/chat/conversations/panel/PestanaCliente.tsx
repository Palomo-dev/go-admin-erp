'use client';

import * as React from 'react';
import Link from 'next/link';
import { Link2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { AvatarIniciales, Skeleton, clasesBoton } from '@/components/kit';
import { supabase } from '@/lib/supabase/config';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useOrgCurrency, formatMonedaSinDecimales } from '@/lib/hooks/useOrgCurrency';
import { leerFichaClienteChat, type FichaClienteChat } from '@/lib/services/chat/fichaClienteChat';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { EtiquetasConversacion } from './EtiquetasConversacion';
import type { ConversacionControl } from '../useConversacion';

function Fila({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_1fr] gap-3 py-1 text-sm">
      <dt className="text-fg-muted">{etiqueta}</dt>
      <dd className="min-w-0 break-words text-fg">{valor || '—'}</dd>
    </div>
  );
}

/** Pestaña «Cliente» (Figma 91-chat-01): ficha corta, etiquetas y enlace a la ficha. */
export function PestanaCliente({ c, organizationId }: { c: ConversacionControl; organizationId: number | null | undefined }) {
  const t = useTranslations('chatBandeja.cliente');
  const locale = useLocale();
  const { formatDate, timezone } = useFormatDate();
  const moneda = useOrgCurrency();
  const [ficha, setFicha] = React.useState<FichaClienteChat | null>(null);
  const [cargando, setCargando] = React.useState(true);
  const customerId = c.detalle?.customer_id;

  React.useEffect(() => {
    let vivo = true;
    if (!organizationId || !customerId) {
      setFicha(null);
      setCargando(!!customerId);
      return;
    }
    setCargando(true);
    leerFichaClienteChat(supabase, organizationId, customerId)
      .then((f) => vivo && setFicha(f))
      .catch(() => vivo && setFicha(null))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [organizationId, customerId]);

  if (cargando || !c.detalle) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const nombre = ficha?.nombre ?? c.detalle.customer?.full_name ?? t('cliente');
  const desde = ficha?.creadoEn ? formatDateInTz(ficha.creadoEn, timezone, { locale, month: 'long', year: 'numeric' }) : null;
  const sub = [desde ? t('desde', { fecha: desde }) : null, ficha?.ciudad].filter(Boolean).join(' · ');

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-center gap-3">
        <AvatarIniciales nombre={nombre} src={ficha?.avatarUrl} tamano="md" className="size-12 text-base" />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-fg">{nombre}</p>
          {sub ? <p className="truncate text-sm text-fg-secondary">{sub}</p> : null}
        </div>
      </div>

      <EtiquetasConversacion
        actuales={c.detalle.tags ?? []}
        disponibles={c.etiquetas}
        onAgregar={(id) => void c.agregarEtiqueta(id)}
        onQuitar={(id) => void c.quitarEtiqueta(id)}
        textoAgregar={t('etiqueta')}
      />

      <section>
        <h3 className="mb-1 text-xs font-semibold text-fg-secondary">{t('contacto')}</h3>
        <dl>
          <Fila etiqueta={t('telefono')} valor={ficha?.telefono ?? c.detalle.customer?.phone} />
          <Fila etiqueta={t('correo')} valor={ficha?.email ?? c.detalle.customer?.email} />
          <Fila etiqueta={t('documento')} valor={ficha?.documento} />
          <Fila etiqueta={t('direccion')} valor={[ficha?.direccion, ficha?.ciudad].filter(Boolean).join(', ')} />
        </dl>
      </section>

      {ficha ? (
        <section>
          <h3 className="mb-1 text-xs font-semibold text-fg-secondary">{t('actividad')}</h3>
          <dl>
            <Fila etiqueta={t('conversaciones')} valor={t('conversacionesValor', { total: ficha.conversaciones, mes: ficha.conversacionesMes })} />
            <Fila
              etiqueta={t('compras')}
              valor={ficha.compras > 0 ? t('comprasValor', { n: ficha.compras, total: formatMonedaSinDecimales(ficha.totalCompras, moneda, locale) }) : t('sinCompras')}
            />
            {ficha.ultimaCompra ? <Fila etiqueta={t('ultimaCompra')} valor={formatDate(ficha.ultimaCompra)} /> : null}
            {ficha.oportunidad ? <Fila etiqueta={t('oportunidad')} valor={ficha.oportunidad} /> : null}
          </dl>
        </section>
      ) : null}

      <Link href={`/app/clientes/${c.detalle.customer_id}`} className={clasesBoton({ variante: 'secundario', tamano: 'sm', anchoCompleto: true })}>
        <Link2 aria-hidden="true" className="size-4" />
        {t('verFicha')}
      </Link>
    </div>
  );
}
