'use client';

/**
 * «¿Eliminar el rol …?» (Figma «13. Equipo › Roles y permisos», flujo A). Si
 * alguien tiene el rol, obliga a elegir a qué rol pasa antes de eliminar: la
 * base reasigna y borra en una transacción (`fn_rol_eliminar`). Antes se
 * bloqueaba con un aviso y, peor, borrar el rol directamente borraba las
 * membresías (`organization_members.role_id` es ON DELETE CASCADE).
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { Dialogo } from '@/components/kit/Dialogo';
import { FormField } from '@/components/kit/FormField';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { clienteRoles, ErrorPeticionRoles } from '@/lib/services/roles/clienteRoles';
import type { RolResumen } from '@/lib/roles/tipos';
import { useEtiquetasRoles } from './useEtiquetasRoles';

export interface DialogoEliminarRolProps {
  rol: RolResumen | null;
  roles: readonly RolResumen[];
  onAbiertoChange: (abierto: boolean) => void;
  onEliminado: (mensaje: string) => void;
}

export function DialogoEliminarRol({ rol, roles, onAbiertoChange, onEliminado }: DialogoEliminarRolProps) {
  const t = useTranslations('roles.eliminar');
  const { mensajeError } = useEtiquetasRoles();
  const [destino, setDestino] = useState<string>('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Invitaciones pendientes con este rol: la base también exige destino aunque nadie lo tenga aún.
  const [exigeDestino, setExigeDestino] = useState(false);

  useEffect(() => {
    setDestino('');
    setError(null);
    setExigeDestino(false);
  }, [rol?.id]);

  if (!rol) return null;
  const conPersonas = rol.personas > 0 || exigeDestino;
  const opciones = roles.filter((r) => r.id !== rol.id);

  const eliminar = async () => {
    if (conPersonas && !destino) {
      setError(mensajeError('requiere_destino'));
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const r = await clienteRoles.eliminar(rol.id, conPersonas ? Number(destino) : null);
      const nombreDestino = opciones.find((o) => String(o.id) === destino)?.nombre ?? '';
      onEliminado(r.reasignados > 0 ? t('reasignados', { n: r.reasignados, rol: nombreDestino }) : t('eliminado'));
    } catch (err) {
      const codigo = err instanceof ErrorPeticionRoles ? err.codigo : 'error_interno';
      if (codigo === 'requiere_destino') setExigeDestino(true);
      setError(mensajeError(codigo));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto
      onAbiertoChange={onAbiertoChange}
      icono={Trash2}
      titulo={t('titulo', { rol: rol.nombre })}
      descripcion={rol.personas > 0 ? t('conPersonas', { n: rol.personas }) : exigeDestino ? t('conInvitaciones') : t('sinPersonas')}
      primario={{
        etiqueta: conPersonas ? t('confirmarReasignar') : t('confirmar'),
        onClick: () => void eliminar(),
        destructiva: true,
        cargando: enviando,
        deshabilitada: conPersonas && !destino,
        motivo: conPersonas && !destino ? t('elegirDestino') : undefined,
      }}
      ancho={440}
    >
      {conPersonas && (
        <FormField etiqueta={t('destino')} obligatorio ayuda={t('destinoAyuda')}>
          {(c) => (
            <Select value={destino} onValueChange={setDestino}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']}>
                <SelectValue placeholder={t('elegirDestino')} />
              </SelectTrigger>
              <SelectContent>
                {opciones.map((o) => (
                  <SelectItem key={o.id} value={String(o.id)}>
                    {`${o.nombre} · ${o.permisoIds.length}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </Dialogo>
  );
}
