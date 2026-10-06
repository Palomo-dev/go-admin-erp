'use client';

/**
 * «Asignar a personas» (Figma «13. Equipo › Roles y permisos», flujo principal,
 * paso «asignar»). Todo o nada en el servidor (`fn_rol_asignar_miembros`): si
 * una persona no se puede cambiar, no cambia ninguna y se dice cuál. Antes se
 * guardaba en un bucle y, si fallaba a la mitad, no se sabía qué había quedado
 * (análisis §3.3, problema 27).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { UserPlus } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialogo } from '@/components/kit/Dialogo';
import { SearchInput } from '@/components/kit/SearchInput';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { clienteRoles, ErrorPeticionRoles } from '@/lib/services/roles/clienteRoles';
import { normalizarTexto } from '@/lib/roles/matrizPermisos';
import type { MiembroRoles, RolResumen } from '@/lib/roles/tipos';
import { useEtiquetasRoles } from './useEtiquetasRoles';

export interface DialogoAsignarRolProps {
  rol: RolResumen | null;
  onAbiertoChange: (abierto: boolean) => void;
  onAsignado: (mensaje: string) => void;
}

export function DialogoAsignarRol({ rol, onAbiertoChange, onAsignado }: DialogoAsignarRolProps) {
  const t = useTranslations('roles.asignar');
  const { mensajeError } = useEtiquetasRoles();
  const [miembros, setMiembros] = useState<MiembroRoles[] | null>(null);
  const [elegidos, setElegidos] = useState<Set<number>>(new Set());
  const [termino, setTermino] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rol) return;
    setElegidos(new Set());
    setTermino('');
    setError(null);
    setMiembros(null);
    let vigente = true;
    clienteRoles
      .miembros()
      .then((r) => vigente && setMiembros(r.miembros))
      .catch((err) => vigente && setError(mensajeError(err instanceof ErrorPeticionRoles ? err.codigo : 'error_interno')));
    return () => {
      vigente = false;
    };
  }, [rol, mensajeError]);

  const visibles = useMemo(() => {
    const q = normalizarTexto(termino);
    return (miembros ?? []).filter((m) => !q || normalizarTexto(`${m.nombre} ${m.email ?? ''}`).includes(q));
  }, [miembros, termino]);

  if (!rol) return null;

  const motivo = (m: MiembroRoles): string | null => {
    if (m.roleId === rol.id) return t('yaLoTiene');
    if (m.esSesion) return t('motivoTu');
    if (m.dueno) return t('motivoDueno');
    return null;
  };

  const asignar = async () => {
    setEnviando(true);
    setError(null);
    try {
      const r = await clienteRoles.asignar(rol.id, [...elegidos]);
      onAsignado(t('asignado', { n: r.asignados, rol: rol.nombre }));
    } catch (err) {
      if (err instanceof ErrorPeticionRoles && err.cuerpo.detalle) {
        const persona = miembros?.find((m) => String(m.id) === String(err.cuerpo.detalle))?.nombre ?? String(err.cuerpo.detalle);
        setError(t('fallo', { persona, motivo: String(err.cuerpo.mensaje ?? mensajeError(err.codigo)) }));
      } else {
        setError(mensajeError(err instanceof ErrorPeticionRoles ? err.codigo : 'error_interno'));
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto
      onAbiertoChange={onAbiertoChange}
      icono={UserPlus}
      titulo={t('titulo', { rol: rol.nombre })}
      descripcion={t('descripcion')}
      primario={{
        etiqueta: t('confirmar', { n: elegidos.size }),
        onClick: () => void asignar(),
        cargando: enviando,
        deshabilitada: elegidos.size === 0,
      }}
      ancho={520}
    >
      <SearchInput value={termino} onChange={setTermino} onValueChange={setTermino} placeholder={t('buscar')} etiqueta={t('buscar')} atajo={false} />
      {miembros === null && !error ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-subtle" />
          ))}
        </div>
      ) : visibles.length === 0 ? (
        <p className="text-sm text-fg-secondary">{t('nadie')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {visibles.map((m) => {
            const bloqueo = motivo(m);
            const id = `asignar-${m.id}`;
            return (
              <li key={m.id} className="flex min-h-14 items-center gap-3 px-3 py-2">
                <Checkbox
                  id={id}
                  checked={bloqueo === t('yaLoTiene') || elegidos.has(m.id)}
                  disabled={bloqueo !== null}
                  onCheckedChange={() =>
                    setElegidos((prev) => {
                      const s = new Set(prev);
                      if (s.has(m.id)) s.delete(m.id);
                      else s.add(m.id);
                      return s;
                    })
                  }
                  className="size-[18px] rounded border-line-strong"
                />
                <AvatarIniciales nombre={m.nombre} tamano="sm" />
                <label htmlFor={id} className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm text-fg">{m.nombre}</span>
                  <span className="truncate text-xs text-fg-muted">{[m.rolNombre, m.cargoNombre].filter(Boolean).join(' · ')}</span>
                </label>
                {bloqueo && (
                  <Badge tono="neutro" apariencia="suave" tamano="sm" title={bloqueo}>
                    {m.esSesion ? t('tu') : m.dueno && m.roleId !== rol.id ? t('dueno') : bloqueo}
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </Dialogo>
  );
}
