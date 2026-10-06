'use client';

/**
 * Pestaña «Cargos» (Figma «13. Equipo › Roles y permisos», flujo G «Cargos:
 * rol + cargo = lo que puede hacer»). Lista de cargos con lo que SUMA cada uno
 * y una hoja con sus permisos y el aviso de contratos de RR. HH. que no dan
 * permisos (problema 11). Las personas se cuentan por
 * `organization_members.job_position_id`, el vínculo que da permisos.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Briefcase, Pencil, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/kit/EmptyState';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import { SearchInput } from '@/components/kit/SearchInput';
import { clasesBoton } from '@/components/kit/botonClases';
import { clienteRoles } from '@/lib/services/roles/clienteRoles';
import { normalizarTexto } from '@/lib/roles/matrizPermisos';
import type { CargoResumen } from '@/lib/roles/tipos';
import { cn } from '@/utils/Utils';
import { useCargaRoles } from './useCargaRoles';
import { useEtiquetasRoles } from './useEtiquetasRoles';

const REJILLA = 'grid grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-4';

export function ListaCargos({ clave }: { clave: string }) {
  const t = useTranslations('roles.cargos');
  const tr = useTranslations('roles');
  const { etiquetaModulo } = useEtiquetasRoles();
  const { estado, datos, recargar } = useCargaRoles(() => clienteRoles.cargos(), clave);
  const [termino, setTermino] = useState('');
  const [abierto, setAbierto] = useState<CargoResumen | null>(null);

  const visibles = useMemo(() => {
    const q = normalizarTexto(termino);
    return (datos?.cargos ?? []).filter((c) => !q || normalizarTexto(`${c.nombre} ${c.codigo ?? ''} ${c.departamento ?? ''}`).includes(q));
  }, [datos, termino]);
  const nombrePermiso = useMemo(() => new Map((datos?.catalogo ?? []).map((p) => [p.id, p])), [datos]);

  if (estado === 'cargando') {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label={tr('estados.cargando')}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-subtle" />
        ))}
      </div>
    );
  }
  if (estado === 'sinPermiso') return <EmptyState variante="forbidden" titulo={tr('estados.sinPermisoTitulo')} descripcion={tr('estados.sinPermisoDesc')} />;
  if (estado !== 'listo' || !datos) return <EmptyState variante="error" titulo={tr('estados.errorTitulo')} descripcion={tr('estados.errorDesc')} onReintentar={() => void recargar()} />;

  const puedeEditar = datos.capacidades.editarCargos;

  return (
    <div className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line-info bg-info-subtle p-3 text-sm text-info-text">
        {t('regla')}
        <Link href="/app/hrm/cargos" className="font-medium underline underline-offset-2">
          {t('irRRHH')}
        </Link>
      </p>
      <SearchInput value={termino} onChange={setTermino} onValueChange={setTermino} placeholder={t('titulo')} etiqueta={t('titulo')} atajo={false} />
      {datos.cargos.length === 0 ? (
        <EmptyState titulo={t('vacioTitulo')} descripcion={t('vacioDesc')} accion={{ etiqueta: t('irRRHH'), href: '/app/hrm/cargos', icono: Briefcase }} />
      ) : visibles.length === 0 ? (
        <EmptyState variante="search" titulo={tr('estados.sinResultados')} termino={termino} onLimpiarFiltros={() => setTermino('')} />
      ) : (
        <section aria-label={t('titulo')} className="overflow-hidden rounded-xl border border-line bg-surface">
          <div aria-hidden="true" className={cn(REJILLA, 'hidden border-b border-line bg-subtle px-4 py-2 text-xs font-medium text-fg-secondary lg:grid')}>
            <span>{t('columnas.cargo')}</span>
            <span>{t('columnas.departamento')}</span>
            <span>{t('columnas.suma')}</span>
            <span>{t('columnas.personas')}</span>
          </div>
          {visibles.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setAbierto(c)}
              className={cn(
                'flex w-full flex-col gap-2 border-b border-line px-4 py-3 text-left last:border-b-0 hover:bg-hover lg:grid',
                REJILLA.replace('grid ', 'lg:grid '),
                abierto?.id === c.id && 'bg-brand-tint',
              )}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
                  <Briefcase aria-hidden="true" className="size-4" strokeWidth={1.75} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-fg">{c.nombre}</span>
                  {!c.activo && <span className="text-xs text-fg-muted">{t('inactivo')}</span>}
                </span>
              </span>
              <span className="truncate text-sm text-fg-secondary">{c.departamento ?? '—'}</span>
              <span>
                {c.permisoIds.length > 0 ? (
                  <Badge tono="marca" apariencia="suave" tamano="sm">
                    {t('suma', { n: c.permisoIds.length })}
                  </Badge>
                ) : (
                  <span className="text-sm text-fg-muted">{t('sinSuma')}</span>
                )}
              </span>
              <span className="flex items-center gap-2 text-sm text-fg-secondary">
                {tr('personas', { n: c.personas })}
                {c.contratosSinVinculo > 0 && <TriangleAlert aria-label={t('avisoContratos', { n: c.contratosSinVinculo })} className="size-4 text-warning" />}
              </span>
            </button>
          ))}
        </section>
      )}

      <HojaDetalle
        abierto={abierto !== null}
        onAbiertoChange={(v) => !v && setAbierto(null)}
        titulo={abierto?.nombre ?? ''}
        subtitulo={[abierto?.departamento, abierto ? tr('personas', { n: abierto.personas }) : null].filter(Boolean).join(' · ')}
        pie={
          abierto && puedeEditar ? (
            <Link href={`/app/roles/cargos/${abierto.id}`} className={clasesBoton({ variante: 'primario', tamano: 'md', anchoCompleto: true })}>
              <Pencil aria-hidden="true" className="size-4" />
              {t('editarPermisos')}
            </Link>
          ) : undefined
        }
      >
        {abierto && (
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-fg">{t('permisosQueSuma', { n: abierto.permisoIds.length })}</h3>
            {abierto.permisoIds.length === 0 ? (
              <p className="text-sm text-fg-secondary">{t('nadaQueSuma')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {abierto.permisoIds.map((id) => {
                  const p = nombrePermiso.get(id);
                  if (!p) return null;
                  return (
                    <li key={id} className="flex items-center justify-between gap-2 rounded-lg bg-subtle px-3 py-2">
                      <span className="flex min-w-0 flex-col">
                        <span className="text-sm text-fg">{p.nombre}</span>
                        <span className="text-xs text-fg-muted">{etiquetaModulo(p.modulo)}</span>
                      </span>
                      {p.sensible && (
                        <Badge tono="advertencia" apariencia="suave" tamano="sm">
                          {tr(`sensibilidad.${p.sensible}`)}
                        </Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {abierto.contratosSinVinculo > 0 && (
              <p className="flex items-start gap-2 rounded-lg border border-line-warning bg-warning-subtle p-3 text-sm text-warning-text">
                <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {t('avisoContratos', { n: abierto.contratosSinVinculo })}
              </p>
            )}
          </div>
        )}
      </HojaDetalle>
    </div>
  );
}
