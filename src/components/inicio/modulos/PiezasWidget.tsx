'use client';

/**
 * Piezas de los paneles de Ventas, Logística y Transporte en «Módulos» del
 * inicio (Figma `03` › Inicio, 2915:45356; aprobado el 2026-11-23), sobre el
 * kit aprobado: `KpiModulo` (StatCard del kit), `AtencionItem`,
 * `BarraDesglose` y `ModuloEstado` (vacío «Sin datos»). Todo llega armado del
 * servidor: aquí no hay cálculo ni consulta, solo presentación.
 *
 * Mini-gráfica de una cifra: basta con que el armado llene `KpiWidget.serie` (la pinta
 * `MiniaturaSerie`, la misma de «Tienda web»); la variación sale de `delta` con su unidad
 * (`unidadDelta`), su dirección buena (`deltaMejor`) y contra qué compara (`comparadoCon`).
 *
 * Textos del namespace `inicioWidgets`; colores por tokens.
 */
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Banknote,
  Clock,
  FileText,
  MapPin,
  Route,
  ShieldAlert,
  Sparkles,
  Timer,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { StatCard } from '@/components/kit/StatCard';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { clasesBoton } from '@/components/kit/botonClases';
import { cn } from '@/utils/Utils';
import { formatMoneda } from '@/lib/utils/moneda';
import type { CifraModulo, TextoModulo, TonoModulo } from '@/lib/dashboard/resumenModulos';
import type { AccionWidget, AtencionWidget, DesgloseWidget, IconoAtencion, KpiWidget } from '@/lib/dashboard/widgetsInicio';
import { formatoEntero, formatoVariacion } from '../useLecturaInicio';
import { MiniaturaSerie } from '../MiniaturaSerie';

type Params = Record<string, string | number>;

/** Formato de cifras de los widgets (texto: namespace `inicioWidgets`). */
export function useCifraWidget(): (c: CifraModulo) => string {
  const t = useTranslations('inicioWidgets');
  const locale = useLocale();
  return (c) =>
    c.tipo === 'moneda'
      ? formatMoneda(c.valor, c.moneda, { decimals: 0 })
      : c.tipo === 'numero'
        ? formatoEntero(c.valor, locale)
        : t(c.texto.clave, c.texto.params);
}

/** Traduce un `TextoModulo` del namespace `inicioWidgets`, con parámetros ya preparados. */
export function useTextoWidget(): (x: TextoModulo, params?: Params) => string {
  const t = useTranslations('inicioWidgets');
  return (x, params) => t(x.clave, { ...(x.params ?? {}), ...(params ?? {}) });
}

/** Texto de la variación según su unidad: «+8,0 %», «+5 pp» o «+2». */
export function textoDelta(k: Pick<KpiWidget, 'delta' | 'unidadDelta'>, locale: string): string {
  const v = k.delta ?? 0;
  if (!k.unidadDelta || k.unidadDelta === 'porcentaje') return formatoVariacion(v, locale);
  const signo = v > 0 ? '+' : v < 0 ? '−' : '';
  const abs = formatoEntero(Math.abs(Math.round(v)), locale);
  return k.unidadDelta === 'puntos' ? `${signo}${abs} pp` : `${signo}${abs}`;
}

/** Tono del badge de la variación: verde si va en la dirección buena, rojo si no, neutro en 0. */
export function tonoDelta(k: Pick<KpiWidget, 'delta' | 'deltaMejor'>): 'exito' | 'peligro' | 'neutro' {
  const v = k.delta ?? 0;
  if (v === 0) return 'neutro';
  return (v > 0) === ((k.deltaMejor ?? 'sube') === 'sube') ? 'exito' : 'peligro';
}

const TONO_STAT: Record<TonoModulo, 'neutro' | 'exito' | 'advertencia' | 'peligro' | 'informacion'> = {
  neutro: 'neutro',
  exito: 'exito',
  advertencia: 'advertencia',
  peligro: 'peligro',
  informacion: 'informacion',
};

/** Cuatro cifras del panel (`KpiModulo`): la tarjeta entera abre la lista ya filtrada. */
export function KpisWidget({ kpis }: { kpis: readonly KpiWidget[] }) {
  const texto = useTextoWidget();
  const cifra = useCifraWidget();
  const locale = useLocale();
  if (kpis.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((k) => (
        <StatCard
          key={k.id}
          tamano="sm"
          etiqueta={texto(k.etiqueta)}
          valor={
            <span className="inline-flex flex-wrap items-center gap-2" data-kpi={k.id}>
              <span>{k.sinCifra || !k.cifra ? '—' : cifra(k.cifra)}</span>
              {k.delta !== undefined && k.delta !== null && (
                <StatusBadge
                  estado="variacion"
                  etiqueta={textoDelta(k, locale)}
                  tono={!k.unidadDelta || k.unidadDelta === 'porcentaje' ? (k.delta >= 0 ? 'exito' : 'peligro') : tonoDelta(k)}
                  apariencia="suave"
                />
              )}
              {k.delta !== undefined && k.delta !== null && k.comparadoCon && (
                <span className="text-xs font-normal leading-4 text-fg-secondary" data-comparado-con>
                  {texto(k.comparadoCon)}
                </span>
              )}
            </span>
          }
          detalle={k.detalle ? texto(k.detalle) : undefined}
          tono={TONO_STAT[k.tono ?? 'neutro']}
          pie={k.serie && k.serie.length >= 2 ? <MiniaturaSerie valores={k.serie} className="h-6" /> : undefined}
          href={k.href ?? undefined}
        />
      ))}
    </div>
  );
}

const ICONOS: Record<IconoAtencion, LucideIcon> = {
  reloj: Clock,
  alerta: AlertTriangle,
  ubicacion: MapPin,
  billetera: Wallet,
  dinero: Banknote,
  ruta: Route,
  documento: FileText,
  escudo: ShieldAlert,
  llave: Wrench,
  retraso: Timer,
};

const FONDO_ICONO: Record<TonoModulo, string> = {
  peligro: 'bg-danger-subtle text-danger-text',
  advertencia: 'bg-warning-subtle text-warning-text',
  informacion: 'bg-info-subtle text-info-text',
  exito: 'bg-success-subtle text-success-text',
  neutro: 'bg-subtle text-fg-secondary',
};

export interface AtencionListaProps {
  items: readonly AtencionWidget[];
  /** Texto cuando no hay nada que atender («al día»). */
  vacio: string;
  /** Prepara los parámetros de un renglón (horas en la zona, nombres de causas…). */
  parametros?: (a: AtencionWidget) => Params | undefined;
  /** Aviso cuando alguna fuente falló. */
  parcial?: boolean;
  id: string;
}

/** «Requiere atención» (`AtencionItem`): qué · detalle · importe · acción que lo resuelve. */
export function AtencionLista({ items, vacio, parametros, parcial, id }: AtencionListaProps) {
  const t = useTranslations('inicioWidgets');
  const texto = useTextoWidget();
  const cifra = useCifraWidget();
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 id={id} className="text-sm font-semibold leading-5 text-fg">
          {t('comun.requiereAtencion')}
        </h3>
        <StatusBadge estado="atencion" etiqueta={String(items.length)} tono="neutro" apariencia="suave" />
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm leading-5 text-fg-secondary">{vacio}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((a) => {
            const Icono = ICONOS[a.icono];
            const extra = parametros?.(a);
            const titulo = texto(a.titulo, extra);
            return (
              <li key={a.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5" data-atencion={a.id}>
                <span aria-hidden="true" className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', FONDO_ICONO[a.tono])}>
                  <Icono className="size-4" strokeWidth={1.5} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-5 text-fg first-letter:uppercase">{titulo}</p>
                  {a.detalle && <p className="truncate text-xs leading-4 text-fg-secondary">{texto(a.detalle, extra)}</p>}
                </div>
                {a.importe && <span className="shrink-0 text-sm font-semibold text-fg tabular-nums max-sm:hidden">{cifra(a.importe)}</span>}
                <Link href={a.href} className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'shrink-0' })}>
                  {texto(a.accion)}
                  <span className="sr-only">: {titulo}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {parcial && (
        <p role="status" className="text-xs leading-4 text-warning-text">
          {t('comun.parcial')}
        </p>
      )}
    </section>
  );
}

/** Colores de los tramos, del más fuerte al más suave (tokens de marca). */
const TRAMOS = ['bg-brand-deep', 'bg-brand', 'bg-brand-tint-hover', 'bg-brand-tint'];

/** `BarraDesglose`: una barra con tramos por porcentaje y su leyenda (cifra · %). */
export function BarraDesglose({ desglose }: { desglose: DesgloseWidget }) {
  const texto = useTextoWidget();
  const cifra = useCifraWidget();
  const id = `inicio-desglose-${desglose.id}`;
  const nombre = (e: DesgloseWidget['tramos'][number]['etiqueta']) => ('nombre' in e ? e.nombre : texto(e));
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-xl border border-line bg-canvas p-4" data-desglose={desglose.id}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 id={id} className="text-xs font-medium leading-4 text-fg-secondary">
          {texto(desglose.titulo)}
        </h3>
        <span className="text-base font-semibold leading-6 text-fg tabular-nums">{cifra(desglose.total)}</span>
      </div>
      <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
        {desglose.tramos.map((tr, i) => (
          <span key={tr.id} className={cn('h-full', TRAMOS[i % TRAMOS.length])} style={{ width: `${tr.porcentaje}%` }} />
        ))}
      </div>
      <ul className="flex flex-col gap-1.5">
        {desglose.tramos.map((tr, i) => (
          <li key={tr.id} className="flex items-center gap-2 text-sm leading-5">
            <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', TRAMOS[i % TRAMOS.length])} />
            <span className="min-w-0 flex-1 truncate text-fg">{nombre(tr.etiqueta)}</span>
            <span className="shrink-0 text-fg-secondary tabular-nums">
              {cifra(tr.cifra)} · {tr.porcentaje} %
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Botones del panel («Abrir POS», «Configurar zonas de domicilio»…). */
export function AccionesWidget({ acciones, onDialogo, className }: { acciones: readonly AccionWidget[]; onDialogo?: (d: NonNullable<AccionWidget['dialogo']>) => void; className?: string }) {
  const texto = useTextoWidget();
  if (acciones.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {acciones.map((a) => {
        const clases = clasesBoton({ variante: a.principal ? 'primario' : 'secundario', tamano: 'sm' });
        if (a.dialogo && onDialogo) {
          return (
            <button key={a.id} type="button" className={clases} onClick={() => onDialogo(a.dialogo as NonNullable<AccionWidget['dialogo']>)}>
              {texto(a.etiqueta)}
            </button>
          );
        }
        return a.href ? (
          <Link key={a.id} href={a.href} className={clases}>
            {texto(a.etiqueta)}
          </Link>
        ) : null;
      })}
    </div>
  );
}

/** `ModuloEstado` «Sin datos»: el módulo está activo pero nunca tuvo movimientos. */
export function SinDatosWidget({
  titulo,
  descripcion,
  acciones,
  onDialogo,
}: {
  titulo: string;
  descripcion: string;
  acciones: readonly AccionWidget[];
  onDialogo?: (d: NonNullable<AccionWidget['dialogo']>) => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center" data-estado-widget="sinDatos">
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand">
        <Sparkles className="size-5" strokeWidth={1.5} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-5 text-fg">{titulo}</p>
        <p className="text-sm leading-5 text-fg-secondary">{descripcion}</p>
      </div>
      <AccionesWidget acciones={acciones} onDialogo={onDialogo} />
    </div>
  );
}

