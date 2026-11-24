'use client';

/**
 * Imprimir guías y hoja de ruta desde Logística. NO es un generador nuevo: usa
 * `shipmentLabelPrinter.ts` (src/components/transporte/envios), el mismo de Envíos, con su
 * corte automático por el agente de impresión cuando la sede lo tiene.
 *
 * Los datos de las guías se leen en un solo lote (`enviosParaGuias`). La ventana se abre dentro
 * de la activación del clic (los navegadores la dan por ~5 s), así que la lectura previa no
 * dispara el bloqueo de ventanas emergentes.
 */
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import {
  printRouteSheet,
  printShipmentGuidesWithCut,
  type ParadaHojaRuta,
  type ShipmentGuideOrgInfo,
} from '@/components/transporte/envios/shipmentLabelPrinter';
import type { ShipmentWithDetails } from '@/lib/services/shipmentsService';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { enviosParaGuias } from '@/lib/services/logistica/despachoService';
import type { FilaDespacho } from '@/lib/logistica/despacho';

export function useImpresionLogistica() {
  const t = useTranslations('logistica.despacho.impresion');
  const { organization } = useOrganization();
  const { selectedBranchId, branchFilter, branches } = useBranch();
  const { timezone, formatTime, formatPlain, getToday } = useFormatDate();
  const moneda = useMonedaOrganizacion();

  const orgInfo: ShipmentGuideOrgInfo | null = organization
    ? { name: organization.name, nit: organization.nit, tax_id: organization.tax_id, address: organization.address, phone: organization.phone }
    : null;

  const imprimirGuias = useCallback(
    async (
      envios: readonly Pick<FilaDespacho, 'id' | 'branchId'>[],
      domiciliario?: { nombre: string; telefono?: string | null } | null,
      opciones?: { copias?: number },
    ) => {
      if (!organization?.id || envios.length === 0) return;
      try {
        const leidos = await enviosParaGuias(supabase, organization.id, envios.map((e) => e.id));
        // «Copias por envío» (Figma 2965:10078): cada guía se repite seguida, en el mismo lote.
        const copias = Math.min(Math.max(Math.floor(opciones?.copias ?? 1), 1), 10);
        const datos = leidos.flatMap((d) => Array.from({ length: copias }, () => d));
        const sede = envios[0].branchId ?? branchFilter ?? selectedBranchId ?? undefined;
        const r = await printShipmentGuidesWithCut(
          datos.map(({ envio, items }) => ({
            shipment: envio as unknown as ShipmentWithDetails,
            options: {
              orgInfo,
              timezone,
              moneda,
              items: items.map((i) => ({ id: i.id, description: i.description ?? undefined, sku: i.sku ?? undefined, qty: i.qty, unit_value: i.unit_value ?? undefined, total_value: i.total_value ?? undefined })),
              driver: domiciliario ? { name: domiciliario.nombre, phone: domiciliario.telefono ?? undefined } : null,
            },
          })),
          sede ?? undefined,
        );
        if (r.method === 'agent') toastSuccess(t('guiasEnviadas', { count: r.enqueued }));
      } catch {
        toastError(t('errorGuias'));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [organization?.id, branchFilter, selectedBranchId, timezone, moneda.code],
  );

  const imprimirHojaRuta = useCallback(
    (paradas: readonly FilaDespacho[], domiciliario?: string | null) => {
      const sede = branches.find((b) => b.id === (branchFilter ?? selectedBranchId))?.name ?? null;
      const ok = printRouteSheet(
        paradas.map<ParadaHojaRuta>((f) => ({
          numero: f.numero,
          pedido: f.pedido,
          cliente: f.cliente,
          telefono: f.telefono,
          direccion: f.direccion,
          barrio: f.barrio,
          ciudad: f.ciudad,
          instrucciones: f.instrucciones,
          promesa: f.promesa ? formatTime(f.promesa) : f.fechaEsperada ? formatPlain(f.fechaEsperada) : null,
          contraentrega: f.contraentrega,
        })),
        {
          titulo: t('hojaTitulo'),
          subtitulo: [sede, formatPlain(getToday()), domiciliario].filter(Boolean).join(' · '),
          orgInfo,
          moneda,
          textos: {
            parada: t('columnas.parada'),
            pedido: t('columnas.pedido'),
            cliente: t('columnas.cliente'),
            direccion: t('columnas.direccion'),
            promesa: t('columnas.promesa'),
            cobrar: t('columnas.cobrar'),
            firma: t('columnas.firma'),
            total: t('columnas.total'),
            pagado: t('columnas.pagado'),
          },
        },
      );
      if (!ok && paradas.length > 0) toastError(t('ventanaBloqueada'));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [branches, branchFilter, selectedBranchId, timezone, moneda.code, organization?.id],
  );

  return { imprimirGuias, imprimirHojaRuta };
}
