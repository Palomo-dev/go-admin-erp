'use client';

/**
 * Piezas compartidas de Nómina (Figma 20.16–20.25), armadas con el kit: insignia
 * del estado del período, nombre del período en el idioma activo, montos en la
 * moneda de la organización, aviso de «solo preliquidación» y las vistas del
 * módulo (Períodos · Prestaciones · Préstamos y embargos).
 */
import { useCallback, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { BookCheck, Lock } from 'lucide-react';
import { AvisoTonal, SegmentedControl, StatusBadge, useOpcionUrl } from '@/components/kit';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useFechas } from '../ausencias/piezasAusencias';
import {
  TONO_ESTADO_PERIODO,
  claveError,
  claveNombrePeriodo,
  estadoPeriodo,
  type EstadoPeriodo,
  type TipoPeriodo,
} from './nominaLogica';

export const VISTAS_NOMINA = ['periodos', 'prestaciones', 'prestamos'] as const;
export type VistaNomina = (typeof VISTAS_NOMINA)[number];

export function useVistaNomina(): [VistaNomina, (v: VistaNomina) => void] {
  return useOpcionUrl<VistaNomina>('vista', VISTAS_NOMINA, 'periodos', 'replace');
}

/** Períodos · Prestaciones · Préstamos y embargos (decisión 1 del dueño). */
export function BarraVistasNomina({ valor, onValor, derecha }: { valor: VistaNomina; onValor: (v: VistaNomina) => void; derecha?: ReactNode }) {
  const t = useTranslations('hrmNomina.vistas');
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SegmentedControl
        etiqueta={t('etiqueta')}
        valor={valor}
        onValorChange={onValor}
        opciones={[
          { valor: 'periodos', etiqueta: t('periodos') },
          { valor: 'prestaciones', etiqueta: t('prestaciones') },
          { valor: 'prestamos', etiqueta: t('prestamos') },
        ]}
      />
      {derecha ? <div className="flex flex-wrap items-center gap-2">{derecha}</div> : null}
    </div>
  );
}

/** Insignia del estado del período (SISTEMA-BADGES.md, adenda «Estados del período de nómina»). */
export function EstadoPeriodoBadge({ estado, tamano = 'sm' }: { estado: string | EstadoPeriodo; tamano?: 'sm' | 'md' }) {
  const t = useTranslations('hrmNomina.estados');
  const e = (['abierto', 'calculando', 'preliquidado', 'en_revision', 'cerrado', 'pagando', 'pagado', 'contabilizado', 'anulado'] as const).includes(
    estado as EstadoPeriodo
  )
    ? (estado as EstadoPeriodo)
    : estadoPeriodo(estado);
  return (
    <StatusBadge
      estado={e}
      etiqueta={t(e)}
      tono={TONO_ESTADO_PERIODO[e]}
      tamano={tamano}
      icono={e === 'cerrado' ? Lock : e === 'contabilizado' ? BookCheck : undefined}
    />
  );
}

/** «Solo preliquidación» junto al estado (Figma 20.25.1). */
export function InsigniaSoloPreliquidacion() {
  const t = useTranslations('hrmNomina.soloPreliquidacion');
  return <StatusBadge estado="solo_preliquidacion" etiqueta={t('insignia')} tono="neutro" apariencia="contorno" icono={Lock} />;
}

/** Montos en la moneda de la organización (nunca una moneda cableada). */
export function useDinero() {
  const { formatear } = useMonedaOrganizacion();
  return useCallback((v: number | string | null | undefined) => (v === null || v === undefined || v === '' ? '—' : formatear(Number(v))), [formatear]);
}

/** «1.ª quincena de noviembre de 2026», «Prima del 2.º semestre de 2026», o el nombre que le pusieron. */
export function useNombrePeriodo() {
  const t = useTranslations('hrmNomina.nombres');
  const f = useFechas();
  return useCallback(
    (p: { nombre?: string | null; tipo: TipoPeriodo | string; desde: string; hasta: string }) => {
      if (p.nombre && p.nombre.trim()) return p.nombre.trim();
      const c = claveNombrePeriodo(p);
      switch (c.clave) {
        case 'quincena':
          return t(c.numero === 1 ? 'quincena1' : 'quincena2', { mes: f.mes(c.mes), anio: String(c.anio) });
        case 'mes':
          return t('mes', { mes: f.mes(c.mes), anio: String(c.anio) });
        case 'prima':
          return t(c.semestre === 1 ? 'prima1' : 'prima2', { anio: String(c.anio) });
        case 'cesantias':
          return t('cesantias', { anio: String(c.anio) });
        default:
          return t('rango', { rango: f.rango(c.desde, c.hasta) });
      }
    },
    [t, f]
  );
}

/** Mensaje de un error de las rutas de nómina, en el idioma activo. */
export function useErrorNomina() {
  const t = useTranslations('hrmNomina.errores');
  return useCallback((codigo: string | null | undefined) => t(claveError(codigo)), [t]);
}

/**
 * Aviso del modo solo preliquidación (Figma 20.25): la bandera `hr_payroll_enabled`
 * está apagada; se puede preliquidar y revisar, no cerrar ni pagar.
 */
export function AvisoSoloPreliquidacion({ onVerQueFalta, compacto }: { onVerQueFalta?: () => void; compacto?: boolean }) {
  const t = useTranslations('hrmNomina.soloPreliquidacion');
  return (
    <AvisoTonal
      tono="advertencia"
      icono={Lock}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      compacto={compacto}
      accion={onVerQueFalta ? { etiqueta: t('verQueFalta'), onClick: onVerQueFalta } : undefined}
    />
  );
}

export { useFechas };
