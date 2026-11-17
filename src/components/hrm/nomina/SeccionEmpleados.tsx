'use client';

/**
 * Preliquidación › Empleados, alertas y bloqueos (Figma 20.17.1, 17.4–17.9).
 *
 * - Aviso con lo que impide enviar a revisión (bloqueos de la base: novedades por
 *   aprobar, días no listos…), con enlace a Novedades.
 * - «Diferencias contra el período anterior»: lo que el motor marcó para revisar
 *   (variación sobre el umbral, embargo limitado al tope, ingreso en el período).
 * - Tabla por persona con días, devengado, deducciones, neto, costo y variación.
 *   Una colilla con un bloqueo del motor no muestra neto: no se paga así.
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Eye, FileUser, Scale, TrendingDown, TrendingUp, UserPlus, Users, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  AvisoTonal,
  DataTable,
  FilterChips,
  FilterPanel,
  ListCard,
  ListToolbar,
  Pagination,
  SearchInput,
  StatusBadge,
  Tarjeta,
  calcularRango,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { CeldaPersona } from '../ausencias/piezasAusencias';
import { rutaColilla, rutaEmpleadoPeriodo, type ColillaPeriodo, type DetallePeriodo, type PersonaNomina, type RevisionPeriodo, type VersionPeriodo } from './apiNomina';
import { claveBloqueo, contarAlertas, normalizar, variacionNeto } from './nominaLogica';
import { useDinero } from './piezasNomina';

type Filtro = 'bloqueos' | 'alertas' | 'variacion';

interface FilaEmpleado {
  c: ColillaPeriodo;
  nombre: string | null;
  cargo: string | null;
  area: string | null;
  dias: number | null;
  variacion: number | null;
  bloqueos: number;
  avisos: number;
}

export const RUTA_NOVEDADES = '/app/hrm/novedades';

/** Badge «+38 %», «−23 %», «0 %» o «Ingresó» (Figma 17.1, «Frente al anterior»). */
export function VariacionBadge({ v }: { v: number | null }) {
  const t = useTranslations('hrmNomina.empleados');
  if (v === null) return <StatusBadge estado="ingreso" tono="informacion" apariencia="contorno" etiqueta={t('ingreso')} />;
  const pct = Math.round(v * 100);
  const texto = `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)} %`;
  return <StatusBadge estado="variacion" tono={Math.abs(v) > 0.1 ? 'advertencia' : 'neutro'} apariencia="suave" etiqueta={texto} />;
}

export function SeccionEmpleados({
  periodo,
  personas,
  revision,
  vigente,
  onAjustar,
  onPreliquidar,
}: {
  periodo: DetallePeriodo;
  personas: Map<string, PersonaNomina>;
  revision: RevisionPeriodo | null;
  vigente: VersionPeriodo | null;
  onAjustar?: (vinculo: string) => void;
  onPreliquidar?: () => void;
}) {
  const t = useTranslations('hrmNomina.empleados');
  const tb = useTranslations('hrmNomina.alertas');
  const router = useRouter();
  const dinero = useDinero();
  const [texto, setTexto] = useState('');
  const [filtros, setFiltros] = useState<Filtro[]>([]);
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);
  const id = periodo.periodo.id;

  const todas = useMemo<FilaEmpleado[]>(
    () =>
      periodo.colillas.map((c) => {
        const p = personas.get(c.vinculo_id);
        const a = contarAlertas(c.alertas);
        const dias = c.bases && typeof c.bases.dias_trabajados === 'number' ? (c.bases.dias_trabajados as number) : null;
        return { c, nombre: c.nombre ?? p?.nombre ?? null, cargo: p?.cargo ?? null, area: p?.area ?? null, dias, variacion: variacionNeto(c.alertas), bloqueos: a.bloqueos, avisos: a.avisos };
      }),
    [periodo, personas]
  );
  const filas = useMemo(() => {
    const q = normalizar(texto);
    return todas.filter(
      (x) =>
        (!q || normalizar([x.nombre, x.cargo, x.area].filter(Boolean).join(' ')).includes(q)) &&
        (!filtros.includes('bloqueos') || x.bloqueos > 0) &&
        (!filtros.includes('alertas') || x.avisos > 0) &&
        (!filtros.includes('variacion') || (x.variacion !== null && Math.abs(x.variacion) > 0.1))
    );
  }, [todas, texto, filtros]);
  const rango = calcularRango(pagina, tamano, filas.length);
  const visibles = filas.slice(rango.desde ? rango.desde - 1 : 0, rango.hasta);

  // Lo que el motor marcó para revisar (máximo 4 a la vista).
  const porRevisar = useMemo(() => {
    const out: Array<{ x: FilaEmpleado; icono: LucideIcon; titulo: string; detalle: string }> = [];
    for (const x of todas) {
      const al = x.c.alertas ?? [];
      const lim = al.find((a) => a.codigo === 'embargo_limitado');
      if (x.variacion === null && al.some((a) => a.codigo === 'sin_periodo_anterior')) {
        out.push({ x, icono: UserPlus, titulo: t('revisar.ingreso', { nombre: x.nombre ?? '—' }), detalle: t('revisar.ingresoDetalle', { dias: x.dias ?? '—' }) });
      } else if (x.variacion !== null && al.some((a) => a.codigo === 'variacion_contra_anterior')) {
        const pct = Math.abs(Math.round(x.variacion * 100));
        out.push({
          x,
          icono: x.variacion >= 0 ? TrendingUp : TrendingDown,
          titulo: x.variacion >= 0 ? t('revisar.subio', { nombre: x.nombre ?? '—', pct }) : t('revisar.bajo', { nombre: x.nombre ?? '—', pct }),
          detalle: t('revisar.variacionDetalle'),
        });
      }
      if (lim) {
        const d = lim.detalle ?? {};
        out.push({
          x,
          icono: Scale,
          titulo: t('revisar.embargo', { nombre: x.nombre ?? '—', valor: dinero(Number(d.aplicado ?? 0)) }),
          detalle: t('revisar.embargoDetalle', { pedido: dinero(Number(d.pedido ?? 0)) }),
        });
      }
    }
    return out;
  }, [todas, t, dinero]);

  const bloqueosBase = (revision?.bloqueos ?? []).filter((b) => b.codigo !== 'revision_pendiente' && b.codigo !== 'sin_preliquidacion');

  const accionesDe = (x: FilaEmpleado): AccionFila[] => [
    { id: 'detalle', etiqueta: t('menu.detalle'), icono: Eye, onSelect: () => router.push(rutaEmpleadoPeriodo(id, x.c.vinculo_id)) },
    { id: 'colilla', etiqueta: t('menu.colilla'), icono: FileUser, onSelect: () => router.push(rutaColilla(id, x.c.vinculo_id)) },
    { id: 'ajuste', etiqueta: t('menu.ajuste'), icono: Wrench, onSelect: () => onAjustar?.(x.c.vinculo_id), oculta: !onAjustar },
  ];

  const neto = (x: FilaEmpleado) =>
    x.bloqueos > 0 ? (
      <StatusBadge estado="bloqueada" tono="peligro" icono={AlertTriangle} etiqueta={t('bloqueada')} />
    ) : (
      <span className="font-semibold">{dinero(x.c.neto)}</span>
    );

  const columnas: ColumnaTabla<FilaEmpleado>[] = [
    { id: 'persona', encabezado: t('columnas.empleado'), celda: (x) => <CeldaPersona fila={x} /> },
    { id: 'dias', encabezado: t('columnas.dias'), alinear: 'derecha', ocultarDebajo: 'md', celda: (x) => <span className="tabular-nums">{x.dias ?? '—'}</span> },
    { id: 'devengado', encabezado: t('columnas.devengado'), variante: 'importe', ocultarDebajo: 'lg', celda: (x) => dinero(x.c.devengado) },
    { id: 'deducciones', encabezado: t('columnas.deducciones'), variante: 'importe', ocultarDebajo: 'lg', celda: (x) => dinero(x.c.deducciones) },
    { id: 'neto', encabezado: t('columnas.neto'), alinear: 'derecha', celda: neto },
    { id: 'costo', encabezado: t('columnas.costo'), variante: 'importe', ocultarDebajo: 'xl', celda: (x) => dinero(x.c.costo_empleador) },
    { id: 'variacion', encabezado: t('columnas.variacion'), ocultarDebajo: 'md', celda: (x) => <VariacionBadge v={x.variacion} /> },
  ];

  if (!vigente) {
    return (
      <Tarjeta>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Users aria-hidden className="size-8 text-fg-muted" strokeWidth={1.5} />
          <p className="font-medium text-fg">{t('sinCalculo.titulo')}</p>
          <p className="max-w-md text-sm text-fg-secondary">{t('sinCalculo.descripcion')}</p>
          {onPreliquidar ? (
            <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'md' })} onClick={onPreliquidar}>
              {t('sinCalculo.accion')}
            </button>
          ) : null}
        </div>
      </Tarjeta>
    );
  }

  const nombreFiltro: Record<Filtro, string> = { bloqueos: t('filtros.bloqueos'), alertas: t('filtros.alertas'), variacion: t('filtros.variacion') };

  return (
    <>
      {bloqueosBase.length > 0 ? (
        <AvisoTonal
          tono="peligro"
          rol="alert"
          titulo={t('bloqueosTitulo', { n: bloqueosBase.length })}
          descripcion={bloqueosBase
            .map((b) => {
              const k = claveBloqueo(b.codigo);
              return tb(k, { n: b.cantidad ?? 0 });
            })
            .join(' · ')}
          accion={bloqueosBase.some((b) => b.codigo.startsWith('novedades')) ? { etiqueta: t('irNovedades'), href: RUTA_NOVEDADES } : undefined}
        />
      ) : null}

      {porRevisar.length > 0 ? (
        <Tarjeta titulo={t('revisar.titulo')} accion={<StatusBadge estado="por_revisar" tono="advertencia" apariencia="contorno" etiqueta={t('revisar.n', { n: porRevisar.length })} />} sinRelleno>
          <ul className="divide-y divide-line">
            {porRevisar.slice(0, 4).map((r, i) => {
              const Icono = r.icono;
              return (
                <li key={`${r.x.c.id}-${i}`} className="flex items-center gap-3 px-4 py-3">
                  <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning-subtle text-warning-text">
                    <Icono className="size-4" strokeWidth={1.5} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{r.titulo}</p>
                    <p className="truncate text-[13px] text-fg-secondary">{r.detalle}</p>
                  </div>
                  <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => router.push(rutaEmpleadoPeriodo(id, r.x.c.vinculo_id))}>
                    {t('verDetalle')}
                  </button>
                </li>
              );
            })}
          </ul>
        </Tarjeta>
      ) : null}

      <ListToolbar
        busqueda={<SearchInput value={texto} onChange={(v) => { setTexto(v); setPagina(1); }} placeholder={t('buscar')} etiqueta={t('buscar')} />}
        filtros={
          <FilterPanel conteo={filtros.length} onLimpiar={() => setFiltros([])} textoVerResultados={t('verN', { n: filas.length })}>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-fg">{t('filtros.titulo')}</legend>
              {(['bloqueos', 'alertas', 'variacion'] as const).map((k) => (
                <label key={k} className="flex min-h-9 cursor-pointer items-center gap-3 text-sm text-fg">
                  <Checkbox
                    checked={filtros.includes(k)}
                    onCheckedChange={(v) => {
                      setFiltros((f) => (v === true ? [...f, k] : f.filter((x) => x !== k)));
                      setPagina(1);
                    }}
                  />
                  {nombreFiltro[k]}
                </label>
              ))}
            </fieldset>
          </FilterPanel>
        }
        chips={
          filtros.length ? (
            <FilterChips
              chips={filtros.map((k) => ({ clave: k, etiqueta: nombreFiltro[k] }))}
              onQuitar={(c) => setFiltros((f) => f.filter((x) => x !== c))}
              onLimpiarTodo={() => setFiltros([])}
            />
          ) : undefined
        }
      />

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={visibles}
        obtenerId={(x) => x.c.id}
        estado={filas.length === 0 ? (todas.length === 0 ? 'vacio' : 'sinResultados') : 'listo'}
        tonoFila={(x) => (x.bloqueos > 0 ? 'peligro' : undefined)}
        onFilaClick={(x) => router.push(rutaEmpleadoPeriodo(id, x.c.vinculo_id))}
        etiquetaFila={(x) => x.nombre ?? '—'}
        acciones={accionesDe}
        tarjetaMovil={(x) => (
          <ListCard
            avatar={{ nombre: x.nombre ?? '?' }}
            titulo={x.nombre ?? '—'}
            subtitulo={[x.cargo, x.area].filter(Boolean).join(' · ') || undefined}
            meta={x.dias !== null ? t('nDias', { n: x.dias }) : undefined}
            valor={x.bloqueos > 0 ? undefined : dinero(x.c.neto)}
            estado={x.bloqueos > 0 ? neto(x) : <VariacionBadge v={x.variacion} />}
            onClick={() => router.push(rutaEmpleadoPeriodo(id, x.c.vinculo_id))}
            acciones={accionesDe(x)}
          />
        )}
        vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion'), icono: Users }}
        sinResultados={{ descripcion: t('sinResultados') }}
        onLimpiarFiltros={() => {
          setTexto('');
          setFiltros([]);
        }}
        termino={texto}
        pie={
          filas.length > 0 ? (
            <Pagination
              pagina={rango.pagina}
              tamano={tamano}
              total={filas.length}
              onPaginaChange={setPagina}
              onTamanoChange={(n) => {
                setTamano(n);
                setPagina(1);
              }}
              opcionesTamano={[10, 25, 50]}
              sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
            />
          ) : undefined
        }
      />
    </>
  );
}
