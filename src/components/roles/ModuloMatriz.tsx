'use client';

/**
 * ModuloMatriz (Figma «Roles y permisos — componentes»): fila de un módulo con
 * chevron, casilla «todo el módulo» (marcada · parcial · vacía), conteo, cambio
 * neto sin guardar («+1» / «−1») y una casilla por acción; abierta, la lista de
 * FilaPermiso. En móvil oculta las columnas de acción y FilaPermiso el código.
 */
import { useId, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  ACCIONES,
  alternarGrupo,
  alternarUno,
  contarMarcados,
  estadoCasilla,
  idsDe,
  type ModuloAgrupado,
  type PermisoCatalogo,
} from '@/lib/roles/matrizPermisos';
import { deltaDe, deltaModulo } from '@/lib/roles/cambios';
import { cn } from '@/utils/Utils';
import { CeldaPermiso } from './CeldaPermiso';
import { FilaPermiso } from './FilaPermiso';
import { REJILLA_MATRIZ } from './MatrizEncabezado';

export interface ModuloMatrizProps {
  modulo: ModuloAgrupado;
  etiqueta: string;
  /** Permisos que pasan la búsqueda/filtros (las filas abiertas). Por defecto, todos. */
  visibles?: readonly PermisoCatalogo[];
  seleccion: ReadonlySet<number>;
  original: ReadonlySet<number>;
  /** Lo que ya da el rol (editor de cargo). */
  bloqueados?: ReadonlySet<number>;
  abierto: boolean;
  onAlternarAbierto: () => void;
  /** Sin él, la matriz es de solo lectura. */
  onCambiar?: (siguiente: Set<number>) => void;
}

const VACIO: ReadonlySet<number> = new Set();

export function ModuloMatriz({
  modulo,
  etiqueta,
  visibles,
  seleccion,
  original,
  bloqueados = VACIO,
  abierto,
  onAlternarAbierto,
  onCambiar,
}: ModuloMatrizProps) {
  const t = useTranslations('roles.matriz');
  const tr = useTranslations('roles');
  const idLista = useId();
  const ids = useMemo(() => idsDe(modulo), [modulo]);
  const efectivo = useMemo(() => (bloqueados.size ? new Set([...seleccion, ...bloqueados]) : seleccion), [seleccion, bloqueados]);
  const marcados = contarMarcados(ids, efectivo);
  const delta = deltaModulo(ids, original, seleccion);
  const filas = visibles ?? modulo.permisos;
  const sensiblePorAccion = useMemo(() => {
    const s = new Set<string>();
    for (const p of modulo.permisos) if (p.sensible) s.add(p.accion);
    return s;
  }, [modulo]);
  const soloLectura = !onCambiar;

  return (
    <div className="border-b border-line last:border-b-0" data-modulo={modulo.modulo}>
      <div className={cn(REJILLA_MATRIZ, 'gap-y-1 px-3 py-2', abierto && 'bg-brand-tint')}>
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onAlternarAbierto}
            aria-expanded={abierto}
            aria-controls={idLista}
            aria-label={abierto ? t('contraer', { modulo: etiqueta }) : t('expandir', { modulo: etiqueta })}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-fg-secondary hover:bg-hover"
          >
            {abierto ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}
          </button>
          <CeldaPermiso
            estado={estadoCasilla(ids, efectivo)}
            etiqueta={t('moduloEntero', { modulo: etiqueta })}
            onAlternar={soloLectura ? undefined : () => onCambiar(alternarGrupo(seleccion, ids, bloqueados))}
          />
          <button type="button" onClick={onAlternarAbierto} className="flex min-w-0 flex-col text-left" tabIndex={-1}>
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-medium text-fg">{etiqueta}</span>
              {delta !== 0 && (
                <Badge tono={delta > 0 ? 'exito' : 'peligro'} apariencia="contorno" tamano="sm">
                  {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}
                </Badge>
              )}
              {/* En escritorio lo dice el punto de cada celda; en móvil no hay celdas. */}
              {modulo.sensible && (
                <Badge tono="advertencia" apariencia="suave" tamano="sm" className="lg:hidden">
                  {tr('sensibilidad.corto')}
                </Badge>
              )}
            </span>
            <span className="text-xs text-fg-muted">
              <span className="lg:hidden">{t('deTotal', { n: marcados, total: ids.length })}</span>
              <span className="hidden lg:inline">{t('todoElModulo', { n: marcados, total: ids.length })}</span>
            </span>
          </button>
        </div>
        {ACCIONES.map((a) => {
          const idsAccion = modulo.porAccion[a];
          return (
            <div key={a} className="hidden justify-center lg:flex">
              <CeldaPermiso
                estado={estadoCasilla(idsAccion, efectivo)}
                etiqueta={t('columnaModulo', { accion: t(`acciones.${a}`), modulo: etiqueta })}
                sensible={sensiblePorAccion.has(a)}
                onAlternar={soloLectura ? undefined : () => onCambiar(alternarGrupo(seleccion, idsAccion, bloqueados))}
              />
            </div>
          );
        })}
        <div className="hidden text-right text-xs tabular-nums text-fg-secondary lg:block">
          {t('deTotal', { n: marcados, total: ids.length })}
        </div>
      </div>
      {abierto && (
        <div id={idLista} role="group" aria-label={etiqueta} className="bg-surface pb-1 lg:pl-10">
          {filas.map((p) => (
            <FilaPermiso
              key={p.id}
              permiso={p}
              marcado={seleccion.has(p.id)}
              yaLoDaElRol={bloqueados.has(p.id)}
              delta={deltaDe(p.id, original, seleccion)}
              onAlternar={soloLectura ? undefined : () => onCambiar(alternarUno(seleccion, p.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
