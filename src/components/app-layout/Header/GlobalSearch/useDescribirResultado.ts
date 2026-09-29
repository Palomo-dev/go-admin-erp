'use client';

/**
 * Título y subtítulo de una fila de entidad en el idioma, la moneda y la zona
 * horaria de la organización. El servidor manda datos, no frases.
 *
 * Figma CommandRow 46:2156: «María Pérez · CC 1.020.456.789 · maria@…»,
 * «Taladro percutor 600 W · SKU TL-600 · 12 en stock», «Bodega Norte ·
 * Cra 7 # 120-15, Bello».
 */
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useEtiquetaEstado, useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import type { ResultadoEntidad } from '@/lib/busquedaGlobal/definiciones';

export interface FilaDescrita {
  titulo: string;
  subtitulo: string;
}

const unir = (...partes: (string | null | undefined | false)[]): string => partes.filter(Boolean).join(' · ');
const rango = (desde: string, hasta: string): string => (desde || hasta ? `${desde} → ${hasta}`.trim() : '');

export function useDescribirResultado(): (r: ResultadoEntidad) => FilaDescrita {
  const t = useTranslations('header.globalSearch');
  const estado = useEtiquetaEstado();
  const entero = useFormatoEntero();
  const { formatDate } = useFormatDate();
  const moneda = useMonedaOrganizacion();

  return useCallback(
    (r: ResultadoEntidad): FilaDescrita => {
      const d = r.detalle;
      const nombre = r.titulo ?? t('unnamed');
      const est = d.estado ? estado(d.estado) : '';
      const total = d.total !== null && d.total !== undefined ? formatMoneda(d.total, moneda.paraDocumento(d.moneda)) : '';
      switch (r.tipo) {
        case 'customer': {
          const doc = d.documento && /^\d{1,15}$/.test(d.documento) ? entero(Number(d.documento)) : d.documento;
          return { titulo: nombre, subtitulo: unir(doc && [d.tipoDocumento, doc].filter(Boolean).join(' '), d.email) };
        }
        case 'product':
          return {
            titulo: nombre,
            subtitulo: unir(d.sku && t('sku', { sku: d.sku }), d.stock !== null && d.stock !== undefined && t('stock', { n: entero(d.stock) })),
          };
        case 'branch':
          return { titulo: nombre, subtitulo: [d.direccion, d.ciudad].filter(Boolean).join(', ') };
        case 'supplier':
          return { titulo: nombre, subtitulo: unir(d.nit && t('nit', { nit: d.nit }), d.email) };
        case 'category':
          return { titulo: nombre, subtitulo: '' };
        case 'invoice':
          return { titulo: t('invoice', { number: r.titulo ?? t('noNumber') }), subtitulo: unir(d.cliente, total, est) };
        case 'web_order':
          return { titulo: t('order', { number: r.titulo ?? t('noNumber') }), subtitulo: unir(d.cliente, total, est) };
        case 'reservation':
          return {
            titulo: nombre,
            subtitulo: unir(d.espacio, rango(formatPlainDate(d.desdeFecha), formatPlainDate(d.hastaFecha)), est),
          };
        case 'space':
          return { titulo: nombre, subtitulo: unir(d.tipoEspacio, d.zona, est) };
        case 'membership':
          return {
            titulo: nombre,
            subtitulo: unir(d.plan, rango(d.desdeInstante ? formatDate(d.desdeInstante) : '', d.hastaInstante ? formatDate(d.hastaInstante) : ''), est),
          };
        case 'parking_vehicle':
          return { titulo: nombre, subtitulo: unir([d.marca, d.modelo].filter(Boolean).join(' '), d.color) };
        default:
          return { titulo: nombre, subtitulo: '' };
      }
    },
    [t, estado, entero, formatDate, moneda],
  );
}
