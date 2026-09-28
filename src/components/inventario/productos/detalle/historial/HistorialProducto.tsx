'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileText, History, X } from 'lucide-react';
import { DateRangeButton, EmptyState, Pagination, type RangoFechas } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import { supabase } from '@/lib/supabase/config';
import { productoService, TIPOS_HISTORIAL, type EventoHistorial, type TipoHistorial } from '@/lib/services/productoService';
import { addPlainDays } from '@/lib/utils/dateCore';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { cn } from '@/utils/Utils';
import { useProductoDetalle } from '../ContextoProducto';
import { cambiosAuditoria } from './cambiosAuditoria';
import { ICONO_TIPO, ItemHistorial, type ContextoItem } from './ItemHistorial';

const TAMANOS = [20, 50, 100] as const;

/**
 * Historial del producto (Figma `Producto — Notas · Historial`, A.13 de
 * PARIDAD-DETALLE-PRODUCTO-FIDELIDAD, ampliado): una LÍNEA DE TIEMPO UNIFICADA
 * de `fn_producto_historial` (auditoría, precios, costos, kardex, compras,
 * ventas, notas, seriales y garantías, también de las variantes), con filtro
 * por tipo y por rango de días de la organización, paginación en el servidor
 * y agrupada por día en la zona horaria de la organización.
 */
export function HistorialProducto() {
  const t = useTranslations('productoDetalle.historial');
  const tc = useTranslations('productoDetalle.comun');
  const { producto, organizacionId, moneda, fechas, mensajeError } = useProductoDetalle();
  const locale = useLocaleIntl();

  const [tipos, setTipos] = useState<TipoHistorial[]>([]);
  const [rango, setRango] = useState<RangoFechas | null>(null);
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState<number>(20);
  const [eventos, setEventos] = useState<EventoHistorial[]>([]);
  const [total, setTotal] = useState(0);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [error, setError] = useState<string | null>(null);
  const [categorias, setCategorias] = useState<Map<number, string>>(new Map());
  const [ahora, setAhora] = useState(() => Date.now());
  const turno = useRef(0);

  const { toInstant, toDate, getToday } = fechas;
  const hoy = getToday();

  const cargar = useCallback(async () => {
    const mio = ++turno.current;
    setEstado('cargando');
    try {
      const r = await productoService.historial(organizacionId, producto.id, {
        tipos: tipos.length > 0 ? tipos : null,
        desde: rango ? toInstant(rango.desde) : null,
        hasta: rango ? toInstant(addPlainDays(rango.hasta, 1)) : null,
        limite: tamano,
        offset: (pagina - 1) * tamano,
      });
      if (mio !== turno.current) return;
      setEventos(r.eventos);
      setTotal(r.total);
      setAhora(Date.now());
      setEstado('listo');
      setError(null);

      // Nombres de las categorías que aparecen en los cambios de auditoría.
      const ids = new Set<number>();
      for (const e of r.eventos) {
        if (e.tipo !== 'auditoria') continue;
        for (const c of cambiosAuditoria(e.detalle.cambios)) {
          if (c.campo !== 'category_id') continue;
          for (const v of [c.antes, c.despues]) if (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))) ids.add(Number(v));
        }
      }
      if (ids.size > 0) {
        const { data } = await supabase.from('categories').select('id, name').eq('organization_id', organizacionId).in('id', Array.from(ids));
        if (mio === turno.current && data) {
          setCategorias(new Map((data as { id: number; name: string }[]).map((c) => [c.id, c.name])));
        }
      }
    } catch (e) {
      if (mio !== turno.current) return;
      setError(mensajeError(e));
      setEstado('error');
    }
  }, [organizacionId, producto.id, tipos, rango, tamano, pagina, toInstant, mensajeError]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const alternarTipo = (tipo: TipoHistorial) => {
    setPagina(1);
    setTipos((prev) => (prev.includes(tipo) ? prev.filter((x) => x !== tipo) : [...prev, tipo]));
  };

  const grupos = useMemo(() => {
    const mapa = new Map<string, EventoHistorial[]>();
    for (const e of eventos) {
      const dia = toDate(new Date(e.fecha));
      const lista = mapa.get(dia);
      if (lista) lista.push(e);
      else mapa.set(dia, [e]);
    }
    return Array.from(mapa.entries());
  }, [eventos, toDate]);

  const ctx: ContextoItem = useMemo(
    () => ({ productoId: producto.id, timezone: fechas.timezone, locale, moneda, categorias, ahora }),
    [producto.id, fechas.timezone, locale, moneda, categorias, ahora],
  );

  const etiquetaDia = (dia: string) => {
    if (dia === hoy) return t('dias.hoy');
    if (dia === addPlainDays(hoy, -1)) return t('dias.ayer');
    const instante = new Date(`${dia}T12:00:00Z`);
    return formatDateInTz(instante, 'UTC', { locale, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const hayFiltros = tipos.length > 0 || rango !== null;
  const creadoDia = producto.created_at ? toDate(new Date(producto.created_at)) : addPlainDays(hoy, -89);
  const valorRango: RangoFechas = rango ?? { desde: creadoDia < hoy ? creadoDia : addPlainDays(hoy, -89), hasta: hoy };

  const chip = (activo: boolean) =>
    cn(
      'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
      activo ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line-strong bg-surface text-fg-secondary hover:bg-hover',
    );

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h3 className="text-base font-semibold text-fg">
            {estado === 'listo' ? t('tituloConteo', { count: total }) : t('titulo')}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <DateRangeButton
              valor={valorRango}
              onValorChange={(r) => {
                setPagina(1);
                setRango(r);
              }}
              hoy={hoy}
              etiqueta={t('filtros.rango')}
            />
            {rango ? (
              <button
                type="button"
                onClick={() => {
                  setPagina(1);
                  setRango(null);
                }}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-link hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <X className="size-4" aria-hidden />
                {t('filtros.todoElHistorial')}
              </button>
            ) : (
              <span className="text-xs text-fg-secondary">{t('filtros.sinRango')}</span>
            )}
          </div>
        </div>

        <div
          role="group"
          aria-label={t('filtros.tipos')}
          className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
        >
          <button type="button" aria-pressed={tipos.length === 0} onClick={() => { setPagina(1); setTipos([]); }} className={chip(tipos.length === 0)}>
            {t('filtros.todos')}
          </button>
          {TIPOS_HISTORIAL.map((tipo) => {
            const Icono = ICONO_TIPO[tipo];
            const activo = tipos.includes(tipo);
            return (
              <button key={tipo} type="button" aria-pressed={activo} onClick={() => alternarTipo(tipo)} className={chip(activo)}>
                <Icono className="size-3.5" aria-hidden />
                {t(`tipos.${tipo}`)}
              </button>
            );
          })}
        </div>

        {estado === 'cargando' && eventos.length === 0 ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label={tc('cargando')}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <div className="flex-1 rounded-lg border border-line p-3">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="mt-2 h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : estado === 'error' ? (
          <EmptyState variante="error" titulo={t('errorTitulo')} descripcion={error ?? tc('errorCargar')} onReintentar={() => void cargar()} />
        ) : eventos.length === 0 ? (
          hayFiltros ? (
            <EmptyState
              variante="search"
              titulo={t('sinResultadosTitulo')}
              descripcion={t('sinResultadosDescripcion')}
              onLimpiarFiltros={() => {
                setPagina(1);
                setTipos([]);
                setRango(null);
              }}
            />
          ) : (
            <EmptyState variante="empty" icono={History} titulo={t('vacioTitulo')} descripcion={t('vacioDescripcion')} />
          )
        ) : (
          <div className={cn('flex flex-col gap-5', estado === 'cargando' && 'opacity-60')} aria-busy={estado === 'cargando'}>
            {grupos.map(([dia, lista]) => (
              <section key={dia} aria-label={etiquetaDia(dia)}>
                <h4 className="mb-2 text-sm font-semibold text-fg first-letter:uppercase">{etiquetaDia(dia)}</h4>
                <ol className="flex flex-col gap-3">
                  {lista.map((e, i) => (
                    <ItemHistorial key={e.clave} evento={e} ctx={ctx} ultimo={i === lista.length - 1} />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}

        {estado !== 'error' && total > 0 && (
          <Pagination
            pagina={pagina}
            tamano={tamano}
            total={total}
            onPaginaChange={setPagina}
            onTamanoChange={(n) => {
              setPagina(1);
              setTamano(n);
            }}
            opcionesTamano={TAMANOS}
            sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
            cargando={estado === 'cargando'}
          />
        )}

        <aside className="rounded-xl border border-line bg-subtle p-4">
          <h4 className="mb-1 flex items-center gap-2 text-sm font-medium text-fg">
            <FileText className="size-4" aria-hidden />
            {t('acerca.titulo')}
          </h4>
          <p className="text-sm text-fg-secondary">{t('acerca.texto')}</p>
        </aside>
      </div>
    </TooltipProvider>
  );
}
