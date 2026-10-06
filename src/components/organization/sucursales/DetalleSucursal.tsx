'use client';

/**
 * Ficha de una sucursal (clic en la fila de Organización › Sucursales). Panel
 * del kit (hoja inferior en móvil) con los datos, el gerente, el equipo
 * asignado y el sitio web. Las acciones son las mismas del «⋯» de la fila.
 */
import { useEffect, useState } from 'react';
import { Building2, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase/config';
import { AvatarIniciales, FilaDato, ListaDatos, PanelAdaptable, RowActionsMenu, StatusBadge, clasesBoton, type AccionFila } from '@/components/kit';
import { resumenHorario, type EstadoSitioSede, type HorarioDia } from '@/lib/organizacion/sucursales';
import { esHorarioPorDefecto } from '@/lib/organizacion/horarioSede';
import { nombreGerente, type SucursalFila } from './tipos';

interface MiembroSede {
  id: number;
  nombre: string;
  email: string;
  avatar: string | null;
}

interface FilaMiembroSede {
  organization_members: {
    id: number;
    profiles: { first_name: string | null; last_name: string | null; email: string | null; avatar_url: string | null } | null;
  } | null;
}

const TONO_SITIO: Record<EstadoSitioSede, 'exito' | 'informacion' | 'neutro'> = { publicado: 'exito', heredado: 'informacion', sinSitio: 'neutro' };

export function DetalleSucursal({
  sede,
  estadoSitio,
  urlPublica,
  acciones,
  onCerrar,
  onEditar,
}: {
  sede: SucursalFila | null;
  estadoSitio: EstadoSitioSede;
  urlPublica: string | null;
  acciones: readonly AccionFila[];
  onCerrar: () => void;
  onEditar: () => void;
}) {
  const t = useTranslations('org.acceso.sucursales');
  const td = useTranslations('org.acceso.sucursales.detalle');
  const [miembros, setMiembros] = useState<MiembroSede[] | null>(null);

  useEffect(() => {
    if (!sede) return;
    let vivo = true;
    setMiembros(null);
    supabase
      .from('member_branches')
      .select('organization_members ( id, profiles ( first_name, last_name, email, avatar_url ) )')
      .eq('branch_id', sede.id)
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) return setMiembros([]);
        setMiembros(
          ((data ?? []) as unknown as FilaMiembroSede[])
            .filter((f) => f.organization_members)
            .map((f) => {
              const p = f.organization_members!.profiles;
              return {
                id: f.organization_members!.id,
                nombre: `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim(),
                email: p?.email ?? '',
                avatar: p?.avatar_url ?? null,
              };
            }),
        );
      });
    return () => {
      vivo = false;
    };
  }, [sede]);

  const dias = td.raw('dias') as string[];
  const horario = sede ? resumenHorario(sede.opening_hours as unknown as Record<string, HorarioDia> | undefined, dias) : [];
  const gerente = sede ? nombreGerente(sede) : null;
  const otras = acciones.filter((a) => a.id !== 'editar');

  return (
    <PanelAdaptable
      abierto={sede !== null}
      onAbiertoChange={(a) => !a && onCerrar()}
      titulo={sede?.name ?? ''}
      descripcion={sede?.branch_code}
      icono={Building2}
      ancho={672}
      pie={
        <>
          <RowActionsMenu acciones={otras} titulo={sede?.name} orientacion="horizontal" tamano="md" lado="top" />
          <button type="button" className={clasesBoton()} onClick={onEditar}>
            {t('acciones.editar')}
          </button>
        </>
      }
    >
      {sede && (
        <>
          <div className="flex flex-wrap gap-2">
            {sede.is_main && <StatusBadge estado="principal" tono="marca" etiqueta={t('principal')} />}
            <StatusBadge estado={sede.is_active === false ? 'inactiva' : 'activa'} etiqueta={sede.is_active === false ? t('estados.inactiva') : t('estados.activa')} />
            <StatusBadge estado={estadoSitio} tono={TONO_SITIO[estadoSitio]} etiqueta={t(`sitio.${estadoSitio}`)} />
          </div>

          <section aria-labelledby="detalle-ubicacion" className="flex flex-col gap-2">
            <h3 id="detalle-ubicacion" className="text-sm font-semibold text-fg">{td('ubicacion')}</h3>
            <ListaDatos>
              <FilaDato etiqueta={td('direccion')} valor={sede.address || '—'} />
              <FilaDato etiqueta={td('ciudad')} valor={[sede.city, sede.state].filter(Boolean).join(', ') || '—'} />
              <FilaDato etiqueta={td('telefono')} valor={sede.phone || '—'} />
              <FilaDato etiqueta={td('correo')} valor={sede.email || '—'} />
            </ListaDatos>
          </section>

          <section aria-labelledby="detalle-horario" className="flex flex-col gap-2">
            <h3 id="detalle-horario" className="text-sm font-semibold text-fg">{td('horario')}</h3>
            {esHorarioPorDefecto(sede.opening_hours) && (
              <p className="text-xs text-warning-text">{td('horarioSinRevisar')}</p>
            )}
            {horario.length > 0 ? (
              <ul className="text-sm text-fg">
                {horario.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-secondary">{td('sinHorario')}</p>
            )}
          </section>

          <section aria-labelledby="detalle-equipo" className="flex flex-col gap-2">
            <h3 id="detalle-equipo" className="text-sm font-semibold text-fg">
              {td('equipo', { n: miembros?.length ?? 0 })}
            </h3>
            <p className="text-sm text-fg">
              {td('gerente')}: {gerente ?? <span className="text-warning-text">{t('sinResponsable')}</span>}
            </p>
            {miembros === null ? (
              <p className="text-sm text-fg-secondary">{td('cargandoEquipo')}</p>
            ) : miembros.length === 0 ? (
              <p className="text-sm text-fg-secondary">{td('sinEquipo')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {miembros.map((m) => (
                  <li key={m.id} className="flex items-center gap-3">
                    <AvatarIniciales nombre={m.nombre || m.email} src={m.avatar} tamano="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-fg">{m.nombre || m.email}</p>
                      <p className="truncate text-xs text-fg-secondary">{m.email}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="detalle-sitio" className="flex flex-col gap-2">
            <h3 id="detalle-sitio" className="text-sm font-semibold text-fg">{td('sitio')}</h3>
            <p className="text-sm text-fg-secondary">{t(`leyenda.${estadoSitio}`)}</p>
            {urlPublica && (
              <a href={urlPublica} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-sm text-link hover:underline">
                {urlPublica}
                <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
              </a>
            )}
          </section>
        </>
      )}
    </PanelAdaptable>
  );
}
