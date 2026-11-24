'use client';

/**
 * Imprimir la planilla de despacho (Figma 2877:4521). La ventana se abre dentro del clic (los
 * navegadores bloquean una ventana abierta después de esperar a la base) y se llena al llegar
 * los pasajeros. Montos en la moneda del viaje o de la organización; fechas en la zona de la
 * sede del viaje.
 */
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { toastError } from '@/components/ui/use-toast';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { formatDateTimeInTz, formatPlainDate, formatTimeInTz } from '@/lib/utils/dateDisplay';
import { pasajerosDeViaje, type ViajeDelDia } from '@/lib/services/transporte/despachosService';
import { abrirVentanaPlanilla, escribirPlanilla, generarPlanillaHTML } from '@/lib/transporte/planillaDespacho';

export function useImprimirPlanilla() {
  const t = useTranslations('transporte.planilla');
  const tCausas = useTranslations('transporte.despachos.causas');
  const tTipos = useTranslations('transporte.tiposVehiculo');
  const { organization } = useOrganization();
  const { resolveFor } = useOrgTimezone();
  const moneda = useMonedaOrganizacion();

  return useCallback(
    async (viaje: ViajeDelDia) => {
      if (!organization?.id || !viaje.planilla) return;
      const ventana = abrirVentanaPlanilla();
      if (!ventana) {
        toastError(t('ventanaBloqueada'));
        return;
      }
      try {
        const pasajeros = await pasajerosDeViaje(supabase, organization.id, viaje.id);
        const tz = resolveFor(viaje.sedeId ?? null).timezone;
        const fmt = (v: number) =>
          viaje.moneda && viaje.moneda !== moneda.code ? new Intl.NumberFormat(moneda.locale, { style: 'currency', currency: viaje.moneda }).format(v) : moneda.formatear(v);
        const total = pasajeros.reduce((s, p) => s + Math.round(p.valor * 100), 0) / 100;
        const v = viaje.vehiculo;
        const documentos = v
          ? (
              [
                ['soat', v.soat],
                ['tecnomecanica', v.tecnomecanica],
                ['poliza', v.poliza],
                ['tarjeta_operacion', v.tarjetaOperacion],
              ] as const
            )
              .filter(([, vence]) => !!vence)
              .map(([c, vence]) => ({ nombre: tCausas(c), vence: formatPlainDate(vence) }))
          : [];
        escribirPlanilla(
          ventana,
          generarPlanillaHTML({
            numero: viaje.planilla,
            organizacion: { nombre: organization.name, nit: organization.nit ?? organization.tax_id ?? null },
            viaje: {
              codigo: viaje.codigo,
              ruta: viaje.ruta ? `${viaje.ruta.codigo} · ${viaje.ruta.nombre}` : '—',
              fecha: formatPlainDate(viaje.fecha),
              salida: formatTimeInTz(viaje.salida, tz),
              llegada: viaje.llegada ? formatTimeInTz(viaje.llegada, tz) : null,
            },
            vehiculo: v ? { placa: v.placa, tipo: tTipos.has(v.tipo) ? tTipos(v.tipo) : v.tipo, documentos } : null,
            conductor: viaje.conductor
              ? { nombre: viaje.conductor.nombre, documento: viaje.conductor.documento, licencia: viaje.conductor.licencia, licenciaVence: viaje.conductor.licenciaVence ? formatPlainDate(viaje.conductor.licenciaVence) : null }
              : null,
            pasajeros: pasajeros.map((p) => ({ nombre: p.nombre, documento: p.documento, puesto: p.puesto, valor: fmt(p.valor) })),
            total: fmt(total),
            despachado: { en: viaje.despachadoEn ? formatDateTimeInTz(viaje.despachadoEn, tz) : '—' },
            excepcion: viaje.excepcion ? { motivo: viaje.excepcion.motivo, por: viaje.excepcion.por, en: viaje.excepcion.en ? formatDateTimeInTz(viaje.excepcion.en, tz) : null } : null,
            textos: {
              titulo: t('titulo'),
              viaje: t('viaje'),
              ruta: t('ruta'),
              fecha: t('fecha'),
              salida: t('salida'),
              llegada: t('llegada'),
              vehiculo: t('vehiculo'),
              conductor: t('conductor'),
              documento: t('documento'),
              licencia: t('licencia'),
              vence: t('vence'),
              pasajeros: t('pasajeros'),
              puesto: t('puesto'),
              nombre: t('nombre'),
              valor: t('valor'),
              total: t('total'),
              sinPasajeros: t('sinPasajeros'),
              excepcion: t('excepcion'),
              autorizo: t('autorizo'),
              despachado: t('despachado'),
              firmaConductor: t('firmaConductor'),
              firmaDespachador: t('firmaDespachador'),
            },
          }),
        );
      } catch {
        ventana.close();
        toastError(t('error'));
      }
    },
    [organization, resolveFor, moneda, t, tCausas, tTipos],
  );
}
