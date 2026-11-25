'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useBranchOpcional } from '@/lib/context/BranchContext';
import { formatDateTimeInTz, formatPlainDate } from '@/lib/utils/dateDisplay';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { faltanteStock, SERVICIOS_MODELO_NUEVO, subtotal, type LineaEspacio, type LineaProducto, type Lineas } from '../lineasLogica';
import { stockPorProducto, type StockSucursal } from './catalogoOportunidad';
import { rangoCorto } from './ganarDeLineas';
import type { FilaLineaOportunidad, InsigniaLinea } from './LineaOportunidad';

/** Stock por sucursal de las líneas que controlan stock (aviso «Faltan N en …»). */
export function useStockLineas(lineas: Lineas): Map<number, StockSucursal[]> {
  const ids = useMemo(() => lineas.products.filter((x) => x.controla_stock === true).map((x) => x.product_id).sort((a, b) => a - b).join(','), [lineas.products]);
  const [stock, setStock] = useState<Map<number, StockSucursal[]>>(new Map());
  useEffect(() => {
    if (!ids) return;
    const c = new AbortController();
    stockPorProducto(ids.split(',').map(Number), c.signal).then(setStock, () => undefined);
    return () => c.abort();
  }, [ids]);
  return stock;
}

const FECHA_LARGA: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

/**
 * Filas de `LineaOportunidad` para una lista de líneas, en el orden en que se
 * agregaron (productos y servicios, hospedaje y conceptos). Calcula el aviso
 * de stock en la sucursal del encabezado (o la primera con stock) y la
 * alternativa en otra sucursal.
 */
export function useFilasLineas(lineas: Lineas, moneda: ContextoMoneda) {
  const t = useTranslations('crm.oportunidad.lineas');
  const { timezone } = useFormatDate();
  const sucursales = useBranchOpcional();
  const stock = useStockLineas(lineas);
  const nombreSucursal = (id: number | null | undefined) => sucursales?.branches.find((b) => b.id === id)?.name ?? (id ? t('sucursalN', { id }) : '');
  const sucursalHeader = sucursales?.selectedBranchId ?? null;
  const precio = (v: number) => formatMoneda(v, moneda);

  const avisoStock = (l: LineaProducto): FilaLineaOportunidad['aviso'] => {
    if (l.controla_stock !== true) return null;
    const filas = stock.get(l.product_id);
    if (!filas) return null;
    const base = sucursalHeader ?? filas.slice().sort((a, b) => b.cantidad - a.cantidad)[0]?.branch_id ?? null;
    const enBase = filas.find((f) => f.branch_id === base)?.cantidad ?? 0;
    const falta = faltanteStock(l, enBase);
    if (falta <= 0) return null;
    const otra = filas.filter((f) => f.branch_id !== base && f.cantidad > 0).sort((a, b) => b.cantidad - a.cantidad)[0];
    if (!otra && enBase <= 0) return { texto: t('aviso.sinStock'), tono: 'peligro' };
    return {
      texto: otra ? t('aviso.faltanHay', { n: falta, sucursal: nombreSucursal(base), m: otra.cantidad, otra: nombreSucursal(otra.branch_id) }) : t('aviso.faltan', { n: falta, sucursal: nombreSucursal(base) }),
      tono: 'advertencia',
    };
  };

  const resumenServicio = (l: LineaProducto): string | null => {
    const c = (l.service_config ?? {}) as Record<string, unknown>;
    const s = (k: string) => (typeof c[k] === 'string' && c[k] ? String(c[k]) : null);
    switch (l.tipo_servicio) {
      case 'membership':
        return s('start_date') ? t('servicio.membresiaInicia', { plan: s('plan_name') ?? t('servicio.membresia'), fecha: formatPlainDate(s('start_date'), FECHA_LARGA) }) : t('servicio.membresiaAlEmitir', { plan: s('plan_name') ?? t('servicio.membresia') });
      case 'session_pack':
        return t('servicio.paqueteResumen', { n: Number(c.sessions) || 0, dias: Number(c.validity_days) || 0 });
      case 'class':
        return s('class_start') ? t('servicio.claseResumen', { clase: s('class_title') ?? '', fecha: formatDateTimeInTz(s('class_start'), timezone) }) : null;
      case 'course':
        return s('start_date') && s('end_date') ? t('servicio.cursoResumen', { rango: rangoCorto(s('start_date') as string, s('end_date') as string) }) : null;
      case 'appointment':
        return s('start_at') ? t('servicio.citaResumen', { profesional: s('professional_name') ?? '', fecha: formatDateTimeInTz(s('start_at'), timezone) }) : null;
      default:
        return null;
    }
  };

  const detalleServicio = (l: LineaProducto) => {
    const c = (l.service_config ?? {}) as Record<string, unknown>;
    if (l.tipo_servicio === 'membership' && typeof c.plan_name === 'string') return t('detalle.servicioPlan', { plan: c.plan_name });
    return t('detalle.servicio');
  };

  const insigniasProducto = (l: LineaProducto): InsigniaLinea[] => {
    if (l.es_servicio) {
      const tipo = l.tipo_servicio ?? 'standard';
      return [{ texto: t('insignia.servicio', { tipo: t(`tipoServicio.${tipo}`) }), tono: 'informacion' }, ...(SERVICIOS_MODELO_NUEVO.includes(tipo) ? [{ texto: t('insignia.modeloNuevo'), tono: 'advertencia' as const }] : [])];
    }
    return [
      ...(l.variante ? [{ texto: t('insignia.variante'), tono: 'informacion' as const }] : []),
      ...(l.controla_stock === true ? [{ texto: t('insignia.controlaStock'), tono: 'neutro' as const }] : l.controla_stock === false ? [{ texto: t('insignia.noControlaStock'), tono: 'neutro' as const }] : []),
    ];
  };

  const insigniasEspacio = (l: LineaEspacio): InsigniaLinea[] => {
    const base: InsigniaLinea[] = [{ texto: t('insignia.hospedaje'), tono: 'informacion' }];
    if (typeof l.disponibles !== 'number') return base;
    if (l.disponibles <= 0) return [...base, { texto: t('insignia.noDisponible'), tono: 'peligro' }];
    if (l.disponibles === 1 && l.total_tipo) return [...base, { texto: t('insignia.queda', { total: l.total_tipo }), tono: 'advertencia' }];
    return [...base, { texto: t('insignia.disponibles', { n: l.disponibles }), tono: 'exito' }];
  };

  const huespedes = (l: LineaEspacio) => [l.adults ? t('huespedes.adultos', { n: l.adults }) : null, l.children ? t('huespedes.ninos', { n: l.children }) : null].filter(Boolean).join(', ');

  return useMemo<{ clase: 'products' | 'spaces' | 'custom'; i: number; fila: FilaLineaOportunidad }[]>(
    () => [
      ...lineas.products.map((l, i) => ({
        clase: 'products' as const,
        i,
        fila: {
          clave: l.id ?? `p${i}`,
          clase: l.es_servicio ? ('servicio' as const) : ('producto' as const),
          nombre: l.nombre ?? t('producto'),
          detalle: l.es_servicio ? detalleServicio(l) : [l.variante ? t('detalle.variante', { variante: l.variante }) : null, l.sku].filter(Boolean).join(' · ') || null,
          insignias: insigniasProducto(l),
          chips: (l.modifiers ?? []).map((m) => (m.extra_price > 0 ? t('chipModificador', { nombre: m.name, precio: precio(m.extra_price) }) : m.name)),
          aviso: avisoStock(l),
          resumen: l.es_servicio ? resumenServicio(l) : null,
          total: subtotal(l.quantity, l.unit_price),
          cantidadPorPrecio: t('detalleCantidad', { n: l.quantity, precio: precio(l.unit_price) }),
        },
      })),
      ...lineas.spaces.map((l, i) => ({
        clase: 'spaces' as const,
        i,
        fila: {
          clave: l.id ?? `s${i}`,
          clase: 'hospedaje' as const,
          nombre: l.nombre ?? t('espacio'),
          detalle: [t('detalle.hospedaje'), l.branch_id ? nombreSucursal(l.branch_id) : null, l.rate_plan].filter(Boolean).join(' · '),
          insignias: insigniasEspacio(l),
          chips: [],
          resumen:
            l.checkin_date && l.checkout_date
              ? [l.space_id ? null : t('huespedes.asignarAlGanar'), rangoCorto(l.checkin_date, l.checkout_date), t('huespedes.noches', { n: l.nights }), huespedes(l) || null].filter(Boolean).join(' · ')
              : null,
          total: subtotal(l.nights, l.unit_price),
          cantidadPorPrecio: t('detalleCantidad', { n: l.nights, precio: precio(l.unit_price) }),
        },
      })),
      ...lineas.custom.map((l, i) => ({
        clase: 'custom' as const,
        i,
        fila: {
          clave: l.id ?? `c${i}`,
          clase: 'concepto' as const,
          nombre: l.concept || t('concepto'),
          detalle: t('detalle.concepto'),
          insignias: [{ texto: t('insignia.concepto'), tono: 'neutro' as const }],
          chips: [],
          total: subtotal(l.quantity, l.unit_price),
          cantidadPorPrecio: t('detalleCantidad', { n: l.quantity, precio: precio(l.unit_price) }),
        },
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lineas, stock, moneda, sucursalHeader, sucursales?.branches, timezone, t],
  );
}
