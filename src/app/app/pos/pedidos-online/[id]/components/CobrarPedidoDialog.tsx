'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { RegistrarPagoDialog } from '@/components/kit/documento';
import type { MetodoPagoOpcion } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { METODOS_COBRO_EN_CAJA, metodoDeCobroEnCaja } from '@/lib/pos/pedidosWeb/metodosCaja';
import type { WebOrder } from '@/lib/services/webOrdersService';

interface CobrarPedidoDialogProps {
  order: WebOrder;
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** Al cobrar, también se entrega («Cobrar y entregar»). */
  entregar: boolean;
  /** Caja abierta de la sede (id de `cash_sessions`); null sin caja. */
  cajaId: number | null;
  /** La base cobra en caja (E4). Sin ella el cobro usa el respaldo sin caja. */
  cobroEnCaja: boolean;
  cargando: boolean;
  onConfirmar: (valor: { metodo: string; referencia: string | null }) => void | Promise<void>;
}

/**
 * «Cobrar y entregar W-####» (Figma 1982:946157): el diálogo único de
 * registrar pago del kit en modo `cobroTotal` (método, importe fijo, recibido
 * y cambio). No cobra por su cuenta: entrega método y referencia al detalle,
 * que cobra con `webOrderConfirmationService.cobrarEnCaja`.
 */
export function CobrarPedidoDialog({
  order,
  abierto,
  onAbiertoChange,
  entregar,
  cajaId,
  cobroEnCaja,
  cargando,
  onConfirmar,
}: CobrarPedidoDialogProps) {
  const t = useTranslations('pedidoWeb');
  const router = useRouter();
  const moneda = useMonedaOrganizacion();
  const { getToday } = useFormatDate(order.branch_id);
  const sede = order.branch?.name ?? '';

  // Solo los métodos que la RPC acepta en caja (verificados por MCP en metodosCaja).
  const metodos: MetodoPagoOpcion[] = useMemo(
    () => METODOS_COBRO_EN_CAJA.map((codigo) => ({ codigo, nombre: t(`cobro.metodos.${codigo}`) })),
    [t],
  );

  const descripcion = !cobroEnCaja
    ? t('cobro.dialogo.descripcionSinCaja')
    : t(entregar ? 'cobro.dialogo.descripcionEntregar' : 'cobro.dialogo.descripcion', { caja: cajaId ?? '', sede });

  const sinCaja = cobroEnCaja && cajaId === null;

  return (
    <RegistrarPagoDialog
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t(entregar ? 'cobro.dialogo.tituloEntregar' : 'cobro.dialogo.titulo', { numero: order.order_number })}
      descripcion={descripcion}
      saldo={Number(order.total) || 0}
      moneda={moneda}
      metodos={metodos}
      hoy={getToday()}
      valorInicial={{ metodo: metodoDeCobroEnCaja(order.payment_method), monto: Number(order.total) || 0 }}
      cobroTotal
      codigosEfectivo={['cash']}
      avisoCaja={
        sinCaja
          ? { mensaje: t('cobro.sinCajaAcciones'), accion: { etiqueta: t('cobro.abrirCaja'), onClick: () => router.push('/app/pos/cajas') } }
          : null
      }
      textoConfirmar={entregar ? t('cobro.cobrarYEntregar') : t('cobro.cobrar')}
      cargando={cargando}
      onConfirmar={(valor) => onConfirmar({ metodo: valor.metodo ?? 'cash', referencia: valor.referencia || null })}
    />
  );
}
