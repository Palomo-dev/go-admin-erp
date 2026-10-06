'use client';

/**
 * Matriz de permisos por módulo × acción — UNA sola para el rol y el cargo
 * (regla 7; antes había dos: `admin/PermissionsMatrix` y la de RR. HH.).
 * Buscador, «Solo concedidos», «Solo sensibles», cabecera y un ModuloMatriz por
 * módulo. Al buscar se abren los módulos con coincidencias.
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SearchX } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchInput } from '@/components/kit/SearchInput';
import { EmptyState } from '@/components/kit/EmptyState';
import { agruparPorModulo, filtrarModulos, type PermisoCatalogo } from '@/lib/roles/matrizPermisos';
import { cn } from '@/utils/Utils';
import { MatrizEncabezado } from './MatrizEncabezado';
import { ModuloMatriz } from './ModuloMatriz';
import { useEtiquetasRoles } from './useEtiquetasRoles';

export interface MatrizPermisosProps {
  catalogo: readonly PermisoCatalogo[];
  seleccion: ReadonlySet<number>;
  /** Lo guardado (para «+ Añadido» / «− Quitado»). Por defecto, la selección. */
  original?: ReadonlySet<number>;
  bloqueados?: ReadonlySet<number>;
  /** Sin él, la matriz es de solo lectura. */
  onCambiar?: (siguiente: Set<number>) => void;
  /** Módulos abiertos al montar. */
  abiertosIniciales?: readonly string[];
  className?: string;
}

export function MatrizPermisos({ catalogo, seleccion, original, bloqueados, onCambiar, abiertosIniciales, className }: MatrizPermisosProps) {
  const t = useTranslations('roles.matriz');
  const { etiquetaModulo } = useEtiquetasRoles();
  const [termino, setTermino] = useState('');
  const [soloConcedidos, setSoloConcedidos] = useState(false);
  const [soloSensibles, setSoloSensibles] = useState(false);
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set(abiertosIniciales ?? []));

  const modulos = useMemo(() => agruparPorModulo(catalogo, etiquetaModulo), [catalogo, etiquetaModulo]);
  const concedidos = useMemo(() => (bloqueados?.size ? new Set([...seleccion, ...bloqueados]) : seleccion), [seleccion, bloqueados]);
  const filtrados = useMemo(
    () => filtrarModulos(modulos, concedidos, { termino, soloConcedidos, soloSensibles }, etiquetaModulo),
    [modulos, concedidos, termino, soloConcedidos, soloSensibles, etiquetaModulo],
  );
  const hayFiltro = termino.trim() !== '' || soloConcedidos || soloSensibles;
  const completoDe = useMemo(() => new Map(modulos.map((m) => [m.modulo, m])), [modulos]);

  const alternar = (modulo: string) =>
    setAbiertos((prev) => {
      const s = new Set(prev);
      if (s.has(modulo)) s.delete(modulo);
      else s.add(modulo);
      return s;
    });

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={termino}
          onChange={setTermino}
          onValueChange={setTermino}
          placeholder={t('buscar')}
          etiqueta={t('buscar')}
          className="sm:flex-1"
        />
        <div className="flex items-center gap-4">
          <label className="inline-flex min-h-10 items-center gap-2 text-sm text-fg-secondary">
            <Checkbox checked={soloConcedidos} onCheckedChange={(v) => setSoloConcedidos(v === true)} className="size-[18px] rounded border-line-strong" />
            {t('soloConcedidos')}
          </label>
          <button
            type="button"
            aria-pressed={soloSensibles}
            onClick={() => setSoloSensibles((v) => !v)}
            className={cn(
              'inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium',
              soloSensibles ? 'border-line-warning bg-warning-subtle text-warning-text' : 'border-line text-fg-secondary hover:bg-hover',
            )}
          >
            {t('soloSensibles')}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <MatrizEncabezado />
        {filtrados.length === 0 ? (
          <EmptyState
            variante="search"
            icono={SearchX}
            titulo={t('sinResultados')}
            termino={termino || undefined}
            onLimpiarFiltros={() => {
              setTermino('');
              setSoloConcedidos(false);
              setSoloSensibles(false);
            }}
            compacto
          />
        ) : (
          filtrados.map((m) => (
            <ModuloMatriz
              key={m.modulo}
              modulo={completoDe.get(m.modulo) ?? m}
              visibles={m.permisos}
              etiqueta={etiquetaModulo(m.modulo)}
              seleccion={seleccion}
              original={original ?? seleccion}
              bloqueados={bloqueados}
              abierto={abiertos.has(m.modulo) || (hayFiltro && termino.trim() !== '')}
              onAlternarAbierto={() => alternar(m.modulo)}
              onCambiar={onCambiar}
            />
          ))
        )}
      </div>
      <p className="text-xs text-fg-muted">{t('nota')}</p>
    </div>
  );
}
