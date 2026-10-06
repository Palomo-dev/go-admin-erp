'use client';

/**
 * Pestaña «Roles» (Figma «13. Equipo › Roles y permisos», «Lista de roles» y
 * móvil): buscador, Todos / Sistema / Propios, tabla en escritorio y tarjetas
 * en móvil. Las acciones de cada fila dependen de `capacidades` (resueltas en
 * el servidor) y una acción no disponible dice por qué.
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, Eye, GitCompareArrows, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { SearchInput } from '@/components/kit/SearchInput';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { EmptyState } from '@/components/kit/EmptyState';
import type { AccionFila } from '@/components/kit/acciones';
import { normalizarTexto } from '@/lib/roles/matrizPermisos';
import { contarSensibles } from '@/lib/roles/cambios';
import type { RespuestaRoles, RolResumen } from '@/lib/roles/tipos';
import { REJILLA_ROLES, RolFila } from './RolFila';

export type FiltroTipoRol = 'todos' | 'sistema' | 'propios';

export interface ListaRolesProps {
  datos: RespuestaRoles;
  onAbrir: (rol: RolResumen) => void;
  onNuevo: () => void;
  onDuplicar: (rol: RolResumen) => void;
  onComparar: (rol: RolResumen) => void;
  onAsignar: (rol: RolResumen) => void;
  onEliminar: (rol: RolResumen) => void;
}

export function ListaRoles({ datos, onAbrir, onNuevo, onDuplicar, onComparar, onAsignar, onEliminar }: ListaRolesProps) {
  const t = useTranslations('roles');
  const [termino, setTermino] = useState('');
  const [filtro, setFiltro] = useState<FiltroTipoRol>('todos');
  const { capacidades: caps, modeloListo, catalogo } = datos;

  const conteo = useMemo(
    () => ({
      todos: datos.roles.length,
      sistema: datos.roles.filter((r) => r.sistema).length,
      propios: datos.roles.filter((r) => !r.sistema).length,
    }),
    [datos.roles],
  );
  const visibles = useMemo(() => {
    const q = normalizarTexto(termino);
    return datos.roles.filter(
      (r) =>
        (filtro === 'todos' || (filtro === 'sistema') === r.sistema) &&
        (!q || normalizarTexto(`${r.nombre} ${r.descripcion ?? ''}`).includes(q)),
    );
  }, [datos.roles, termino, filtro]);

  const motivoEscritura = (permitido: boolean): string | undefined =>
    !permitido ? t('acciones.motivoSinPermiso') : !modeloListo ? t('acciones.motivoMigracion') : undefined;

  const acciones = (r: RolResumen): AccionFila[] => {
    const motivoEditar = r.sistema ? t('acciones.motivoSistema') : motivoEscritura(caps.editar);
    const motivoDuplicar = r.esAdmin ? t('acciones.motivoAdmin') : motivoEscritura(caps.crear);
    const motivoEliminar = r.sistema ? t('acciones.motivoSistema') : motivoEscritura(caps.eliminar);
    const motivoAsignar = motivoEscritura(caps.asignar);
    return [
      { id: 'ver', etiqueta: t('acciones.ver'), icono: Eye, onSelect: () => onAbrir(r) },
      {
        id: 'duplicar',
        etiqueta: t('acciones.duplicar'),
        descripcion: t('acciones.duplicarDesc', { n: r.permisoIds.length }),
        icono: Copy,
        onSelect: () => onDuplicar(r),
        deshabilitada: Boolean(motivoDuplicar),
        motivo: motivoDuplicar,
      },
      { id: 'comparar', etiqueta: t('acciones.comparar'), icono: GitCompareArrows, onSelect: () => onComparar(r) },
      {
        id: 'asignar',
        etiqueta: t('acciones.asignar'),
        icono: UserPlus,
        onSelect: () => onAsignar(r),
        deshabilitada: Boolean(motivoAsignar),
        motivo: motivoAsignar,
      },
      {
        id: 'editar',
        etiqueta: t('acciones.editar'),
        icono: Pencil,
        onSelect: () => onAbrir(r),
        deshabilitada: Boolean(motivoEditar),
        motivo: motivoEditar,
      },
      {
        id: 'eliminar',
        etiqueta: t('acciones.eliminar'),
        icono: Trash2,
        onSelect: () => onEliminar(r),
        destructiva: true,
        deshabilitada: Boolean(motivoEliminar),
        motivo: motivoEliminar,
      },
    ];
  };

  const sinPropios = filtro === 'propios' && conteo.propios === 0 && !termino;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput value={termino} onChange={setTermino} onValueChange={setTermino} placeholder={t('buscarRol')} etiqueta={t('buscarRol')} className="sm:flex-1" />
        <SegmentedControl
          etiqueta={t('filtros.etiqueta')}
          valor={filtro}
          onValorChange={setFiltro}
          anchoCompleto
          className="sm:w-auto"
          opciones={[
            { valor: 'todos', etiqueta: t('filtros.todos'), contador: conteo.todos },
            { valor: 'sistema', etiqueta: t('filtros.sistema'), contador: conteo.sistema },
            { valor: 'propios', etiqueta: t('filtros.propios'), contador: conteo.propios },
          ]}
        />
      </div>

      {sinPropios ? (
        <EmptyState
          titulo={t('estados.vacioTitulo')}
          descripcion={t('estados.vacioDesc')}
          accion={caps.crear && modeloListo ? { etiqueta: t('nuevoRol'), onClick: onNuevo, icono: Plus } : undefined}
        />
      ) : visibles.length === 0 ? (
        <EmptyState
          variante="search"
          titulo={t('estados.sinResultados')}
          termino={termino || undefined}
          onLimpiarFiltros={() => {
            setTermino('');
            setFiltro('todos');
          }}
        />
      ) : (
        <>
          <section className="hidden overflow-hidden rounded-xl border border-line bg-surface lg:block" aria-label={t('titulo')}>
            <div aria-hidden="true" className={`${REJILLA_ROLES} border-b border-line bg-subtle px-4 py-2 text-xs font-medium text-fg-secondary`}>
              <span>{t('columnas.rol')}</span>
              <span>{t('columnas.tipo')}</span>
              <span>{t('columnas.permisos')}</span>
              <span>{t('columnas.personas')}</span>
              <span>{t('columnas.modificado')}</span>
              <span aria-hidden="true" />
            </div>
            {visibles.map((r) => (
              <RolFila
                key={r.id}
                rol={r}
                totalPermisos={catalogo.length}
                sensibles={contarSensibles(r.permisoIds, catalogo)}
                acciones={acciones(r)}
                onAbrir={() => onAbrir(r)}
              />
            ))}
          </section>
          <div className="flex flex-col gap-3 lg:hidden">
            {visibles.map((r) => (
              <RolFila
                key={r.id}
                layout="movil"
                rol={r}
                totalPermisos={catalogo.length}
                sensibles={contarSensibles(r.permisoIds, catalogo)}
                acciones={acciones(r)}
                onAbrir={() => onAbrir(r)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
