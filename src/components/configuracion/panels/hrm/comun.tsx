'use client';

/**
 * Piezas compartidas de Configuración › Recursos humanos (diseños 10.RH.1–3):
 * llamada a `/api/hrm/configuracion/**`, formatos en el idioma activo y los
 * estados cargando / error / sin acceso que se repiten en las cuatro pestañas.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronLeft } from 'lucide-react';
import { EmptyState } from '@/components/kit';
import { localeIntl } from '@/components/kit/idioma';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/utils/Utils';
import type { Formato } from '@/lib/hrm/configuracion/parametrosCatalogo';
import { useOrgCurrency } from '@/lib/hooks/useOrgCurrency';

export class ErrorHrm extends Error {
  constructor(
    public readonly status: number,
    public readonly codigo: string,
  ) {
    super(codigo);
  }
}

/** JSON de la API de RR. HH. La organización sale de la sesión (cookie), nunca del body. */
export async function pedirHrm<T>(url: string, init?: { metodo?: 'GET' | 'POST' | 'PUT' | 'DELETE'; cuerpo?: unknown }): Promise<T> {
  const r = await fetch(url, {
    method: init?.metodo ?? 'GET',
    headers: init?.cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init?.cuerpo === undefined ? undefined : JSON.stringify(init.cuerpo),
    cache: 'no-store',
  });
  const datos = (await r.json().catch(() => null)) as (T & { code?: string; permitido?: boolean }) | null;
  if (!r.ok) throw new ErrorHrm(r.status, datos?.code ?? 'error_hrm');
  return datos as T;
}

export type Carga<T> = { estado: 'cargando' } | { estado: 'error' } | { estado: 'sinPermiso' } | { estado: 'listo'; datos: T };

/** Carga con reintento; 403 es «sin acceso», no «error». */
export function useCargaHrm<T>(url: string | null): { carga: Carga<T>; recargar: () => Promise<void> } {
  const [carga, setCarga] = useState<Carga<T>>({ estado: 'cargando' });
  const actual = useRef(url);
  actual.current = url;
  const recargar = useCallback(async () => {
    if (!url) return;
    try {
      const datos = await pedirHrm<T>(url);
      if (actual.current === url) setCarga({ estado: 'listo', datos });
    } catch (e) {
      if (actual.current !== url) return;
      setCarga(e instanceof ErrorHrm && e.status === 403 ? { estado: 'sinPermiso' } : { estado: 'error' });
    }
  }, [url]);
  useEffect(() => {
    setCarga((c) => (c.estado === 'listo' ? c : { estado: 'cargando' }));
    void recargar();
  }, [recargar]);
  return { carga, recargar };
}

/**
 * Formatos en el idioma activo. `moneda`: la de los valores de ley (la manda el
 * servidor según el país de los parámetros); sin ella, la de la organización.
 */
export function useFormatoHrm(moneda?: string | null) {
  const locale = localeIntl(useLocale());
  const monedaOrg = useOrgCurrency();
  const codigo = moneda || monedaOrg;
  return useMemo(() => {
    const dinero = new Intl.NumberFormat(locale, { style: 'currency', currency: codigo, maximumFractionDigits: 0 });
    const numero = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
    const pct = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 3 });
    const hora = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
    /** Fecha plana (`date` de la base): no pasa por ninguna zona horaria. */
    const plano = (fecha: string, opciones: Intl.DateTimeFormatOptions) => {
      const [a, m, d] = fecha.split('-').map(Number);
      if (!a || !m || !d) return fecha;
      return new Intl.DateTimeFormat(locale, { ...opciones, timeZone: 'UTC' }).format(new Date(Date.UTC(a, m - 1, d, 12)));
    };
    const formato: Formato & {
      dia: (f: string) => string;
      diaCorto: (f: string) => string;
      diaSemana: (f: string) => string;
      diaLargo: (f: string) => string;
      horaTexto: (hhmm: string) => string;
    } = {
      dinero: (n) => dinero.format(n),
      numero: (n) => numero.format(n),
      pct: (n) => pct.format(n),
      hora: (h) => hora.format(new Date(Date.UTC(2000, 0, 1, Math.floor(h), Math.round((h % 1) * 60)))),
      dia: (f) => plano(f, { day: 'numeric', month: 'short', year: 'numeric' }),
      diaCorto: (f) => plano(f, { day: 'numeric', month: 'short' }),
      diaSemana: (f) => plano(f, { weekday: 'short', day: 'numeric', month: 'short' }),
      diaLargo: (f) => plano(f, { weekday: 'long', day: 'numeric', month: 'long' }),
      horaTexto: (hhmm) => {
        const [h, m] = hhmm.split(':').map(Number);
        return Number.isFinite(h) ? hora.format(new Date(Date.UTC(2000, 0, 1, h, m || 0))) : hhmm;
      },
    };
    return formato;
  }, [locale, codigo]);
}

export function CargandoHrm({ filas = 6 }: { filas?: number }) {
  return (
    <div className="flex flex-col gap-5 py-2" aria-busy="true">
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="size-6 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-1/4" />
            <Skeleton className="h-3 w-full" />
          </div>
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}

export function ErrorCargaHrm({ titulo, descripcion, onReintentar }: { titulo: string; descripcion: string; onReintentar: () => void }) {
  return <EmptyState variante="error" titulo={titulo} descripcion={descripcion} onReintentar={onReintentar} />;
}

export function SinPermisoHrm({ permiso }: { permiso: string }) {
  const t = useTranslations('hrmConfig.comun');
  return <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion', { permiso })} />;
}

/** «‹ Volver a …» de las vistas de detalle dentro de la pestaña. */
export function VolverA({ texto, onClick }: { texto: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 self-start text-sm font-medium text-brand hover:underline">
      <ChevronLeft aria-hidden="true" className="size-4" />
      {texto}
    </button>
  );
}

/** Pie de la pestaña («Solo lectura · …»). */
export function PieHrm({ etiqueta, texto }: { etiqueta: string; texto?: string }) {
  return (
    <p className="flex flex-wrap items-center gap-2 border-t border-line pt-4 text-[13px] text-fg-muted">
      <span className="rounded-full border border-line bg-subtle px-2 py-0.5 text-xs font-medium text-fg-secondary">{etiqueta}</span>
      {texto}
    </p>
  );
}

export interface OpcionSelector {
  valor: string;
  etiqueta: string;
}

/** Desplegable de una opción (los filtros y selects de las cuatro pestañas). */
export function SelectorHrm({
  valor,
  opciones,
  onValor,
  etiqueta,
  marcador,
  deshabilitado,
  id,
  className,
}: {
  valor: string | null;
  opciones: readonly OpcionSelector[];
  onValor: (v: string) => void;
  etiqueta: string;
  marcador?: string;
  deshabilitado?: boolean;
  id?: string;
  className?: string;
}) {
  return (
    <Select value={valor ?? undefined} onValueChange={onValor} disabled={deshabilitado}>
      <SelectTrigger id={id} aria-label={etiqueta} className={cn('h-9 bg-surface text-sm', className)}>
        <SelectValue placeholder={marcador} />
      </SelectTrigger>
      <SelectContent>
        {opciones.map((o) => (
          <SelectItem key={o.valor} value={o.valor}>
            {o.etiqueta}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
