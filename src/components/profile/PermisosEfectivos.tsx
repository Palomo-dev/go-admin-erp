'use client';

/**
 * «Permisos efectivos» dentro de Perfil › Organización y roles (Figma
 * 346:21440). Pinta lo que devuelve `GET /api/me/permisos`: los permisos que
 * resolvió el SERVIDOR (rol + cargo) para la organización de la sesión,
 * agrupados por módulo. Aquí no se decide nada: ni por el nombre del rol ni
 * con datos del navegador (regla 6).
 *
 * Cada módulo es un `<details>` nativo (teclado y lector de pantalla sin
 * código extra). Lo que la persona NO tiene del mismo módulo se muestra aparte
 * («No incluye»), como la fila «No puede cerrar la caja de otro» del diseño.
 * Los nombres salen de `permissions.description` (hoy solo en español).
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Minus, RefreshCw, ShieldCheck } from 'lucide-react';
import type { RespuestaPermisos } from '@/lib/organizacion/permisosEfectivos';

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'error' }
  | { tipo: 'listo'; datos: RespuestaPermisos };

const MODULOS_CONOCIDOS = new Set([
  'admin', 'branches', 'calendar', 'catalog', 'crm', 'finance', 'hr', 'integrations', 'inventory',
  'memberships', 'notifications', 'operations', 'organizations', 'pms', 'pos', 'reports', 'roles',
  'sales', 'transport', 'users',
]);

export default function PermisosEfectivos({ organizacion }: { organizacion?: string | null }) {
  const t = useTranslations('perfil.permisos');
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });

  const cargar = useCallback(async () => {
    setEstado({ tipo: 'cargando' });
    try {
      const res = await fetch('/api/me/permisos', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      setEstado({ tipo: 'listo', datos: (await res.json()) as RespuestaPermisos });
    } catch {
      setEstado({ tipo: 'error' });
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const etiquetaModulo = (modulo: string) =>
    MODULOS_CONOCIDOS.has(modulo) ? t(`modulos.${modulo}`) : modulo.charAt(0).toUpperCase() + modulo.slice(1);

  return (
    <section aria-labelledby="perfil-permisos" className="flex flex-col gap-3">
      <header>
        <h3 id="perfil-permisos" className="text-base font-semibold text-fg">
          {t('titulo')}
        </h3>
        <p className="text-[13px] leading-[18px] text-fg-secondary">
          {organizacion ? t('descripcionOrg', { organizacion }) : t('descripcion')}
        </p>
      </header>

      {estado.tipo === 'cargando' && (
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          <span className="sr-only">{t('cargando')}</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg bg-subtle" />
          ))}
        </div>
      )}

      {estado.tipo === 'error' && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-subtle px-3 py-2.5">
          <p className="text-sm text-fg">{t('error')}</p>
          <button
            type="button"
            onClick={() => void cargar()}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-fg hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {t('reintentar')}
          </button>
        </div>
      )}

      {estado.tipo === 'listo' && estado.datos.grupos.length === 0 && (
        <p className="rounded-lg border border-line bg-subtle px-3 py-2.5 text-sm text-fg-secondary">{t('vacio')}</p>
      )}

      {estado.tipo === 'listo' && estado.datos.grupos.length > 0 && (
        <>
          {estado.datos.accesoTotal && (
            <p className="flex items-start gap-2 rounded-lg border border-line bg-subtle px-3 py-2.5 text-sm text-fg">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
              {t('accesoTotal')}
            </p>
          )}
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line" data-testid="permisos-grupos">
            {estado.datos.grupos.map((g) => (
              <li key={g.modulo}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand">
                    <span className="font-medium text-fg">{etiquetaModulo(g.modulo)}</span>
                    <span className="text-xs text-fg-secondary">{t('resumen', { n: g.permitidos.length })}</span>
                  </summary>
                  <div className="flex flex-col gap-2 px-3 pb-3">
                    <ul className="flex flex-col gap-1.5">
                      {g.permitidos.map((p) => (
                        <li key={p.codigo} className="flex items-start gap-2 text-sm text-fg">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                          {p.nombre}
                        </li>
                      ))}
                    </ul>
                    {g.noIncluidos.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-medium text-fg-secondary">{t('noIncluye')}</p>
                        <ul className="flex flex-col gap-1.5">
                          {g.noIncluidos.map((p) => (
                            <li key={p.codigo} className="flex items-start gap-2 text-sm text-fg-secondary">
                              <Minus className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                              <span>
                                <span className="sr-only">{t('noIncluyeSr')} </span>
                                {p.nombre}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
          <p className="text-xs text-fg-secondary">{t('nota')}</p>
        </>
      )}
    </section>
  );
}
