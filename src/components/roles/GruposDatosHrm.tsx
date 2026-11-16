'use client';

/**
 * Grupos de datos de Recursos humanos dentro del módulo «Recursos humanos» de
 * la matriz del rol (diseño 10.RH.4, Figma `2520:76242`):
 *
 * - «Ver empleados de su alcance» y «De quiénes ve datos»: toda la
 *   organización, sus sedes o solo su equipo (directo e indirecto).
 * - Por grupo sensible, «Ver» y «Editar». Con «Solo su equipo», salario,
 *   cuenta bancaria y salud salen «Bloqueado» aunque se marquen.
 * - El aviso de qué ve un jefe con «Solo su equipo».
 *
 * La pantalla solo arma la selección: los permisos se resuelven en el servidor
 * y la base bloquea los grupos aunque alguien guarde otra cosa.
 */
import { useId, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Lock, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { AvisoTonal, SegmentedControl, clasesBoton } from '@/components/kit';
import {
  ALCANCES_HRM,
  GRUPOS_DATOS_HRM,
  aplicarAlcance,
  alternarEditarGrupo,
  alternarVerGrupo,
  leerGruposHrm,
  type AlcanceHrm,
} from '@/lib/roles/gruposDatosHrm';
import type { PermisoCatalogo } from '@/lib/roles/matrizPermisos';
import { CeldaPermiso } from './CeldaPermiso';

export interface GruposDatosHrmProps {
  catalogo: readonly PermisoCatalogo[];
  seleccion: ReadonlySet<number>;
  /** Sin él, solo lectura («Puedes ver este rol, pero no cambiar sus datos sensibles»). */
  onCambiar?: (siguiente: Set<number>) => void;
}

export function GruposDatosHrm({ catalogo, seleccion, onCambiar }: GruposDatosHrmProps) {
  const t = useTranslations('hrmConfig.rol');
  const idTitulo = useId();
  const idVerEmpleados = useId();
  const estado = useMemo(() => leerGruposHrm(catalogo, seleccion), [catalogo, seleccion]);
  if (!estado.disponible) return null;
  const soloLectura = !onCambiar;
  const cambiarAlcance = (a: AlcanceHrm | null) => onCambiar?.(aplicarAlcance(catalogo, seleccion, a));

  if (!estado.alcance) {
    return (
      <div className="flex flex-col gap-3 border-t border-line px-3 py-4 lg:pr-4">
        <label htmlFor={idVerEmpleados} className="flex items-center gap-3 text-sm text-fg">
          <Checkbox
            id={idVerEmpleados}
            checked={false}
            disabled={soloLectura}
            onCheckedChange={() => cambiarAlcance('equipo')}
            className="size-[18px] rounded border-line-strong"
          />
          {t('verEmpleados')}
        </label>
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-brand-tint text-brand">
            <Users className="size-5" />
          </span>
          <p className="text-sm font-medium text-fg">{t('sinAcceso.titulo')}</p>
          <p className="max-w-sm text-[13px] text-fg-muted">{t('sinAcceso.descripcion')}</p>
          {!soloLectura && (
            <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => cambiarAlcance('organizacion')}>
              {t('sinAcceso.conceder')}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby={idTitulo} className="flex flex-col gap-4 border-t border-line px-3 py-4 lg:pr-4">
      {soloLectura && <AvisoTonal tono="neutro" icono={Lock} titulo={t('soloLectura.titulo')} descripcion={t('soloLectura.descripcion')} compacto />}

      <label htmlFor={idVerEmpleados} className="flex items-center gap-3 text-sm text-fg">
        <Checkbox
          id={idVerEmpleados}
          checked
          disabled={soloLectura}
          onCheckedChange={() => cambiarAlcance(null)}
          className="size-[18px] rounded border-line-strong"
        />
        {t('verEmpleados')}
      </label>

      <div className="flex flex-col gap-2">
        <h4 id={idTitulo} className="flex items-center gap-2 text-[13px] font-semibold text-fg">
          {t('alcance.titulo')}
          <Badge tono="informacion" apariencia="contorno" tamano="sm">
            {t('nuevo')}
          </Badge>
        </h4>
        <SegmentedControl
          opciones={ALCANCES_HRM.map((a) => ({ valor: a, etiqueta: t(`alcance.${a}`) }))}
          valor={estado.alcance}
          onValorChange={(a) => cambiarAlcance(a)}
          etiqueta={t('alcance.titulo')}
          deshabilitado={soloLectura}
          tamano="sm"
          className="self-start"
        />
        <p className="text-xs text-fg-muted">{t(`alcance.ayuda.${estado.alcance}`)}</p>
      </div>

      <div className="flex flex-col">
        <div className="flex items-end gap-3 pb-2">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-fg">{t('grupos.titulo')}</p>
            <p className="text-xs text-fg-muted">{t('grupos.ayuda')}</p>
          </div>
          <span className="w-12 text-center text-xs text-fg-muted">{t('grupos.ver')}</span>
          <span className="w-12 text-center text-xs text-fg-muted">{t('grupos.editar')}</span>
        </div>
        {GRUPOS_DATOS_HRM.map((g) => {
          const e = estado.grupos[g];
          const nombre = t(`grupos.nombre.${g}`);
          return (
            <div key={g} className="flex items-center gap-3 py-2" data-grupo={g}>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm text-fg">
                  {nombre}
                  <Badge tono={e.bloqueado ? 'neutro' : 'advertencia'} apariencia="contorno" tamano="sm">
                    {e.bloqueado ? t('grupos.bloqueado') : t('grupos.sensible')}
                  </Badge>
                </p>
                <p className="text-xs text-fg-muted">
                  {t(`grupos.descripcion.${g}`)}
                  {e.bloqueado && ` · ${t('grupos.bloqueadoPorEquipo')}`}
                </p>
              </div>
              <span className="flex w-12 justify-center">
                <CeldaPermiso
                  estado={e.bloqueado ? 'vacio' : e.ver ? 'todo' : 'nada'}
                  etiqueta={t('grupos.verGrupo', { grupo: nombre })}
                  sensible
                  onAlternar={soloLectura ? undefined : () => onCambiar?.(alternarVerGrupo(catalogo, seleccion, g))}
                />
              </span>
              <span className="flex w-12 justify-center">
                <CeldaPermiso
                  estado={e.bloqueado ? 'vacio' : e.editar ? 'todo' : 'nada'}
                  etiqueta={t('grupos.editarGrupo', { grupo: nombre })}
                  sensible
                  onAlternar={soloLectura ? undefined : () => onCambiar?.(alternarEditarGrupo(catalogo, seleccion, g))}
                />
              </span>
            </div>
          );
        })}
      </div>

      {estado.alcance === 'equipo' && (
        <AvisoTonal tono="informacion" titulo={t('avisoEquipo.titulo')} descripcion={t('avisoEquipo.descripcion')} />
      )}
    </section>
  );
}
