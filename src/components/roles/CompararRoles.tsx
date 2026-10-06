'use client';

/**
 * Pestaña «Comparar» (Figma «13. Equipo › Roles y permisos», flujo E): hasta
 * tres roles lado a lado por módulo, con «Solo diferencias». Solo lectura.
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Minus, Plus, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/kit/EmptyState';
import { clasesBoton } from '@/components/kit/botonClases';
import { compararRoles, diferenciaContraPrimero, MAX_ROLES_COMPARAR } from '@/lib/roles/comparar';
import type { RespuestaRoles } from '@/lib/roles/tipos';
import { cn } from '@/utils/Utils';
import { useEtiquetasRoles } from './useEtiquetasRoles';

export interface CompararRolesProps {
  datos: RespuestaRoles;
  /** Ids elegidos (vienen de «Comparar con otro» en la lista). */
  elegidos: number[];
  onElegidosChange: (ids: number[]) => void;
}

export function CompararRoles({ datos, elegidos, onElegidosChange }: CompararRolesProps) {
  const t = useTranslations('roles.comparar');
  const tr = useTranslations('roles');
  const { etiquetaModulo } = useEtiquetasRoles();
  const [soloDiferencias, setSoloDiferencias] = useState(false);

  const roles = useMemo(
    () => elegidos.map((id) => datos.roles.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r),
    [elegidos, datos.roles],
  );
  const grupos = useMemo(
    () => compararRoles(roles, datos.catalogo, { soloDiferencias, etiquetaModulo }),
    [roles, datos.catalogo, soloDiferencias, etiquetaModulo],
  );
  const extra = diferenciaContraPrimero(roles);

  const cambiar = (i: number, id: number) => {
    const s = [...elegidos];
    s[i] = id;
    onElegidosChange([...new Set(s)]);
  };
  const quitar = (i: number) => onElegidosChange(elegidos.filter((_, k) => k !== i));
  const slots = Math.min(MAX_ROLES_COMPARAR, Math.max(2, elegidos.length));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-fg">{t('titulo')}</h2>
        <p className="text-sm text-fg-secondary">{t('descripcion', { max: MAX_ROLES_COMPARAR })}</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {Array.from({ length: slots }, (_, i) => (
          <div key={i} className="flex items-center gap-1">
            <Select value={elegidos[i] ? String(elegidos[i]) : ''} onValueChange={(v) => cambiar(i, Number(v))}>
              <SelectTrigger aria-label={t('rol', { n: i + 1 })} className="flex-1">
                <SelectValue placeholder={t('elegir')} />
              </SelectTrigger>
              <SelectContent>
                {datos.roles.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)} disabled={elegidos.includes(r.id) && elegidos[i] !== r.id}>
                    {r.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {elegidos[i] !== undefined && (
              <button type="button" onClick={() => quitar(i)} aria-label={t('quitar')} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'px-2' })}>
                <X aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="inline-flex min-h-10 items-center gap-2 text-sm text-fg-secondary">
          <Checkbox checked={soloDiferencias} onCheckedChange={(v) => setSoloDiferencias(v === true)} className="size-[18px] rounded border-line-strong" />
          {t('soloDiferencias')}
        </label>
        {elegidos.length < MAX_ROLES_COMPARAR && elegidos.length >= 2 && (
          <button
            type="button"
            onClick={() => {
              const libre = datos.roles.find((r) => !elegidos.includes(r.id));
              if (libre) onElegidosChange([...elegidos, libre.id]);
            }}
            className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
          >
            <Plus aria-hidden="true" className="size-4" />
            {t('anadir')}
          </button>
        )}
      </div>

      {roles.length < 2 ? (
        <EmptyState titulo={t('vacio')} compacto />
      ) : grupos.length === 0 ? (
        <EmptyState titulo={t('sinDiferencias')} compacto />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-subtle text-left text-xs text-fg-secondary">
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('permiso')}
                </th>
                {roles.map((r, i) => (
                  <th key={r.id} scope="col" className="w-36 px-3 py-2 text-center font-medium">
                    <span className="block text-fg">{r.nombre}</span>
                    <span className="block font-normal">
                      {i === 0 ? tr('conteoPermisos', { n: r.permisoIds.length, total: datos.catalogo.length }) : t('masQue', { n: extra[i], rol: roles[0].nombre })}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            {grupos.map((g) => (
              <tbody key={g.modulo}>
                <tr>
                  <th scope="rowgroup" colSpan={roles.length + 1} className="bg-canvas px-3 py-1.5 text-left text-xs font-semibold text-fg-secondary">
                    {etiquetaModulo(g.modulo)}
                  </th>
                </tr>
                {g.filas.map((f) => (
                  <tr key={f.permiso.id} className={cn('border-t border-line', f.diferente && 'bg-brand-tint')}>
                    <th scope="row" className="px-3 py-2 text-left font-normal text-fg">
                      <span className="flex flex-wrap items-center gap-2">
                        {f.permiso.nombre}
                        <code className="hidden font-mono text-xs text-fg-muted sm:inline">{f.permiso.codigo}</code>
                        {f.permiso.sensible && (
                          <Badge tono="advertencia" apariencia="suave" tamano="sm">
                            {tr('sensibilidad.corto')}
                          </Badge>
                        )}
                      </span>
                    </th>
                    {f.tiene.map((v, i) => (
                      <td key={roles[i].id} className="px-3 py-2 text-center">
                        {v ? (
                          <Check aria-label={t('tiene')} className="mx-auto size-4 text-brand" />
                        ) : (
                          <Minus aria-label={t('noTiene')} className="mx-auto size-4 text-fg-muted" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </div>
  );
}
