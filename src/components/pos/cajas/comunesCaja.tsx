'use client';

/**
 * Piezas pequeñas que comparten las pantallas de caja rediseñadas (detalle,
 * arqueo, movimiento, cierre, «Mi caja»): fecha y hora en la zona de la
 * organización y el idioma activo, símbolo de la moneda base, métodos de pago
 * activos, texto de error traducido y la fila bajo la cabecera («Abierta ·
 * Sucursal · Cajera: … · Abierta hoy 07:58»).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BranchBadge, EmptyState, StatusBadge } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { simboloMoneda } from '@/components/kit/documento/documentoLineasLogica';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { claveTraduccionError } from '@/lib/pos/cajas/alcance';
import { ConfiguracionService } from '@/components/pos/configuracion/configuracionService';
import type { SesionResumen } from '@/lib/pos/cajas/resumenServidor';

/** «21/09/2026 07:45» en la zona de la organización y el idioma de la interfaz. */
export function useFechaHoraCaja(): (valor: string | Date | null | undefined) => string {
  const { timezone } = useFormatDate();
  const locale = useLocaleIntl();
  return useCallback(
    (valor) =>
      formatDateTimeInTz(valor, timezone, { locale, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    [timezone, locale],
  );
}

/** Moneda base de la organización con su símbolo para los campos numéricos. */
export function useMonedaCaja() {
  const moneda = useMonedaOrganizacion();
  const simbolo = useMemo(() => simboloMoneda(moneda), [moneda]);
  const formatear = useCallback((v: number) => moneda.formatear(v), [moneda]);
  return { moneda, simbolo, formatear };
}

/** Códigos de los métodos de pago activos de la organización (sin efectivo). */
export function useMetodosPagoActivos(): string[] {
  const [metodos, setMetodos] = useState<string[]>([]);
  useEffect(() => {
    let vigente = true;
    ConfiguracionService.getPaymentMethods()
      .then((lista) => {
        if (!vigente) return;
        setMetodos(lista.filter((m) => m.is_active && m.payment_method_code !== 'cash').map((m) => m.payment_method_code));
      })
      .catch((e) => console.warn('[cajas] métodos de pago no disponibles', e));
    return () => {
      vigente = false;
    };
  }, []);
  return metodos;
}

/** Mensaje traducido de un código de error de caja (`cajas.errores.*`), con respaldo. */
export function useMensajeErrorCaja(): (codigo: string | null | undefined, respaldo?: string) => string {
  const tError = useTranslations('cajas.errores');
  return useCallback(
    (codigo, respaldo) => {
      const clave = codigo ? claveTraduccionError(codigo) : '';
      if (clave && tError.has(clave)) return tError(clave);
      return respaldo ?? tError('lecturaFallida');
    },
    [tError],
  );
}

/** Enlace a una caja con un identificador que no es un uuid: la caja no existe. */
export function CajaInvalida() {
  const t = useTranslations('cajas.ficha');
  return (
    <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6">
      <div className="rounded-xl border border-line bg-surface">
        <EmptyState
          titulo={t('noExisteTitulo')}
          descripcion={t('noExisteDescripcion')}
          accion={{ etiqueta: t('volverCajas'), href: '/app/pos/cajas' }}
        />
      </div>
    </div>
  );
}

export const UUID_CAJA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fila bajo la cabecera de las pantallas de una caja. */
export function DebajoSesion({ sesion }: { sesion: Pick<SesionResumen, 'status' | 'branch_id' | 'branch_name' | 'opened_by_name' | 'opened_at'> }) {
  const t = useTranslations('cajas.ficha');
  const fechaHora = useFechaHoraCaja();
  return (
    <>
      <StatusBadge estado={sesion.status === 'open' ? 'open' : 'closed'} etiqueta={sesion.status === 'open' ? t('abierta') : t('cerrada')} />
      {sesion.branch_id === null ? (
        <BranchBadge alcance="todas" />
      ) : (
        <BranchBadge alcance="una" nombre={sesion.branch_name ?? t('sucursalNumero', { id: sesion.branch_id })} />
      )}
      <span className="text-xs text-fg-secondary">
        {t('cajeroAbierta', { nombre: sesion.opened_by_name || t('cajeroDesconocido'), fecha: fechaHora(sesion.opened_at) })}
      </span>
    </>
  );
}
