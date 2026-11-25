'use client';

/**
 * Imprimir guías y hoja de ruta desde Logística.
 *
 * La guía es el rótulo estándar de Figma «21 Logística» (sección 3223:15627, aprobado el
 * 2026-11-25): los envíos se leen en un solo lote (`enviosParaGuias`), lo que solo sabe el
 * servidor (QR de seguimiento firmado, anticipo pagado) llega de `/api/logistica/envios/rotulos`
 * y todo se resuelve con `rotuloEnvio.ts`, las mismas funciones que alimentan la vista previa del
 * diálogo. Tres salidas de la MISMA plantilla:
 *
 * - Térmica 80 mm con la impresora de la sede en línea: cada rótulo viaja a `print_jobs` con su
 *   imagen (`rasterRotulo.tsx`) al ancho de cada impresora; el agente la imprime tal cual.
 * - Sin impresora en línea, o con 10 × 15 o A4: `/imprimir/guias`, el PDF a tamaño real.
 * - Si la estación falla, se abre el PDF.
 *
 * La ventana del PDF se abre dentro de la activación del clic (antes de esperas largas) para que
 * el navegador no la bloquee.
 */
import { useCallback } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { normalizePaperWidth, type ShipmentLabelPayload } from '@printing';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { printRouteSheet, type ParadaHojaRuta, type ShipmentGuideOrgInfo } from '@/components/transporte/envios/shipmentLabelPrinter';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { enviosParaGuias } from '@/lib/services/logistica/despachoService';
import { marcarFragil } from '@/lib/services/logistica/enviosService';
import { PrintJobsService } from '@/lib/services/printJobsService';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { formatMoneda } from '@/lib/utils/moneda';
import { limpiarIndicaciones } from '@/lib/logistica/indicacionesEntrega';
import {
  datosRotuloDeEnvio,
  payloadAgenteDeRotulo,
  rotulosParaImprimir,
  textosRotulo,
  type DatosRotulo,
  type FormatoRotulo,
  type TraducirRotulo,
} from '@/lib/logistica/rotuloEnvio';
import type { FilaDespacho } from '@/lib/logistica/despacho';
import { datosServidorRotulos } from './logisticaApi';
import { formatoInicialRotulo, guardarTrabajoRotulos, hayTermicaEnLinea, type EstacionRotulos } from './rotulo/trabajoRotulos';

/** Un rótulo listo para salir: el envío (para el registro de `print_jobs`) y sus textos. */
export interface RotuloListo {
  id: string;
  textos: ShipmentLabelPayload;
}

export interface OpcionesImprimirGuias {
  copias?: number;
  formato?: FormatoRotulo;
  /** Los rótulos que ya mostró la vista previa: se imprimen esos, sin volver a leer. */
  rotulos?: readonly RotuloListo[];
}

export function useImpresionLogistica() {
  const t = useTranslations('logistica.despacho.impresion');
  const tRotulo = useTranslations('logistica.rotulo');
  const formato = useFormatter();
  const locale = useLocale();
  const { organization } = useOrganization();
  const { selectedBranchId, branchFilter, branches } = useBranch();
  const { timezone, formatTime, formatPlain, getToday } = useFormatDate();
  const moneda = useMonedaOrganizacion();

  const orgInfo: ShipmentGuideOrgInfo | null = organization
    ? { name: organization.name, nit: organization.nit, tax_id: organization.tax_id, address: organization.address, phone: organization.phone }
    : null;

  /** Datos de los rótulos de unos envíos, en el orden pedido (uno por envío; los paquetes se reparten al imprimir). */
  const prepararRotulos = useCallback(
    async (ids: readonly string[]): Promise<DatosRotulo[]> => {
      if (!organization?.id || ids.length === 0) return [];
      const [envios, servidor] = await Promise.all([enviosParaGuias(supabase, organization.id, ids), datosServidorRotulos(ids)]);
      const ahora = new Date().toISOString();
      return envios.map((e) =>
        datosRotuloDeEnvio(e, {
          formatearMonto: (monto, codigo) => formatMoneda(monto, moneda.paraDocumento(codigo)),
          formatearFecha: (iso) =>
            formatDateTimeInTz(iso, timezone, { locale, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
          ahora,
          servidor,
        }),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [organization?.id, timezone, locale, moneda.code],
  );

  /** Los rótulos que salen en papel (paquetes × copias) con todos sus textos resueltos. */
  const resolverRotulos = useCallback(
    (datos: readonly DatosRotulo[], copias: number): RotuloListo[] =>
      rotulosParaImprimir(datos, copias).map((d) => ({
        id: d.id,
        textos: textosRotulo(d, tRotulo as unknown as TraducirRotulo, (kg) => formato.number(kg, { maximumFractionDigits: 2 })),
      })),
    [tRotulo, formato],
  );

  /** Guarda «Frágil» en el envío (organización de la sesión; la RLS de Logística decide). */
  const guardarFragil = useCallback(
    async (id: string, fragil: boolean): Promise<void> => {
      if (!organization?.id) throw new Error('SIN_ORGANIZACION');
      await marcarFragil(supabase, organization.id, id, fragil);
    },
    [organization?.id],
  );

  const estacionRotulos = useCallback(async (sede: number | null | undefined): Promise<EstacionRotulos> => {
    if (sede == null) return { enLinea: false, impresoras: [] };
    try {
      const [enLinea, impresoras] = await Promise.all([PrintJobsService.isAgentOnline(sede), PrintJobsService.getShipmentLabelPrinters(sede)]);
      return { enLinea, impresoras };
    } catch {
      return { enLinea: false, impresoras: [] };
    }
  }, []);

  const imprimirGuias = useCallback(
    async (
      envios: readonly Pick<FilaDespacho, 'id' | 'branchId'>[],
      // Se conserva la firma de los llamadores: el vehículo y la sede salen del propio envío.
      _domiciliario?: { nombre: string; telefono?: string | null } | null,
      opciones?: OpcionesImprimirGuias,
    ) => {
      if (!organization?.id || envios.length === 0) return;
      const sede = envios[0].branchId ?? branchFilter ?? selectedBranchId ?? null;
      // 10 × 15 y A4 siempre van al PDF: la ventana se abre ya, dentro del clic.
      let ventana: Window | null = opciones?.formato && opciones.formato !== '80mm' ? window.open('', '_blank') : null;
      try {
        const estacion = !opciones?.formato || opciones.formato === '80mm' ? await estacionRotulos(sede) : null;
        const elegido = opciones?.formato ?? formatoInicialRotulo(sede, estacion);
        const termica = elegido === '80mm' && sede != null && hayTermicaEnLinea(estacion);
        // Sin impresora en línea el PDF se abre ahora, todavía dentro de la activación del clic.
        if (!termica && !ventana) ventana = window.open('', '_blank');

        const rotulos = opciones?.rotulos?.length
          ? [...opciones.rotulos]
          : resolverRotulos(await prepararRotulos(envios.map((e) => e.id)), opciones?.copias ?? 1);
        if (rotulos.length === 0) throw new Error('SIN_ENVIOS');

        if (termica && estacion && sede != null) {
          try {
            const anchos = [...new Set(estacion.impresoras.map((p) => normalizePaperWidth(p.paper_width)))];
            const { rasterizarRotulos } = await import('./rotulo/rasterRotulo');
            const imagenes = await rasterizarRotulos(
              rotulos.map((r) => r.textos),
              anchos,
            );
            const r = await PrintJobsService.enqueueShipmentGuides(
              sede,
              rotulos.map((x) => payloadAgenteDeRotulo(x.id, x.textos)),
              { impresoras: estacion.impresoras, rasterPorAncho: (i) => imagenes[i] ?? {} },
            );
            if (r.enqueued > 0 || r.printedLocally > 0) {
              toastSuccess(t('guiasEnviadas', { count: rotulos.length }));
              return;
            }
          } catch (e) {
            console.warn('[logística] la estación no tomó las guías; se abre el PDF:', e);
          }
        }

        const id = guardarTrabajoRotulos(
          elegido,
          rotulos.map((r) => r.textos),
        );
        if (!id) throw new Error('SIN_ALMACENAMIENTO');
        const url = `/imprimir/guias?trabajo=${id}`;
        if (ventana) ventana.location.href = url;
        else if (!window.open(url, '_blank')) toastError(t('ventanaBloqueada'));
      } catch {
        ventana?.close();
        toastError(t('errorGuias'));
      }
    },
    [organization?.id, prepararRotulos, resolverRotulos, estacionRotulos, branchFilter, selectedBranchId, t],
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
          instrucciones: limpiarIndicaciones(f.instrucciones),
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

  return { imprimirGuias, imprimirHojaRuta, prepararRotulos, resolverRotulos, estacionRotulos, guardarFragil };
}
