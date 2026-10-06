'use client';

/**
 * «Nuevo rol · paso 1: plantilla» y «Duplicar rol del sistema» (Figma «13.
 * Equipo › Roles y permisos», flujo principal y flujo B). Crea el rol en el
 * servidor (`fn_rol_crear`, que copia los permisos de la plantilla) y lleva al
 * editor para el paso 2. Antes el nombre se pedía con `window.prompt` y solo
 * se podía duplicar un rol personalizado (análisis §3.3, problemas 19 y 20).
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, FilePlus2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Dialogo } from '@/components/kit/Dialogo';
import { FormField } from '@/components/kit/FormField';
import { Input } from '@/components/ui/input';
import { clienteRoles, ErrorPeticionRoles } from '@/lib/services/roles/clienteRoles';
import type { RolResumen } from '@/lib/roles/tipos';
import { cn } from '@/utils/Utils';
import { useEtiquetasRoles } from './useEtiquetasRoles';

export interface DialogoNuevoRolProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  roles: readonly RolResumen[];
  /** `duplicar`: confirma la copia de `plantillaInicial` como rol propio. */
  modo?: 'nuevo' | 'duplicar';
  plantillaInicial?: RolResumen | null;
  onCreado: (id: number, nombre: string) => void;
}

export function DialogoNuevoRol({ abierto, onAbiertoChange, roles, modo = 'nuevo', plantillaInicial, onCreado }: DialogoNuevoRolProps) {
  const t = useTranslations('roles.nuevo');
  const td = useTranslations('roles.duplicar');
  const { mensajeError } = useEtiquetasRoles();
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [plantilla, setPlantilla] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setNombre(modo === 'duplicar' && plantillaInicial ? td('nombrePorDefecto', { rol: plantillaInicial.nombre }) : '');
    setDescripcion(modo === 'duplicar' && plantillaInicial ? plantillaInicial.descripcion ?? '' : '');
    setPlantilla(plantillaInicial?.id ?? null);
    setError(null);
  }, [abierto, modo, plantillaInicial, td]);

  const plantillas = roles.filter((r) => r.duplicable);
  const hayAdmin = roles.some((r) => r.esAdmin);
  const nombreValido = nombre.trim().length >= 2 && nombre.trim().length <= 60;

  const crear = async () => {
    if (!nombreValido) {
      setError(t('errorNombre'));
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const r = await clienteRoles.crear({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        plantillaId: plantilla,
        // Con plantilla, el servidor copia sus permisos; en blanco, ninguno.
        permisoIds: plantilla === null ? [] : null,
      });
      onCreado(r.id, nombre.trim());
    } catch (err) {
      setError(mensajeError(err instanceof ErrorPeticionRoles ? err.codigo : 'error_interno'));
    } finally {
      setEnviando(false);
    }
  };

  const campos = (
    <>
      <FormField etiqueta={t('nombre')} obligatorio ayuda={t('nombreAyuda')} error={error ?? undefined}>
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} autoFocus />
      </FormField>
      {modo === 'nuevo' && (
        <FormField etiqueta={t('descripcionCampo')} ayuda={t('descripcionAyuda')}>
          <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={240} />
        </FormField>
      )}
    </>
  );

  if (modo === 'duplicar' && plantillaInicial) {
    return (
      <Dialogo
        abierto={abierto}
        onAbiertoChange={onAbiertoChange}
        icono={Copy}
        titulo={td('titulo', { rol: plantillaInicial.nombre })}
        descripcion={td('descripcion', { n: plantillaInicial.permisoIds.length })}
        primario={{ etiqueta: td('confirmar'), onClick: () => void crear(), cargando: enviando }}
        ancho={440}
      >
        {campos}
      </Dialogo>
    );
  }

  const opcion = (id: number | null, titulo: string, detalle: string, Icono: typeof ShieldCheck) => {
    const elegida = plantilla === id;
    return (
      <button
        key={id ?? 'blanco'}
        type="button"
        role="radio"
        aria-checked={elegida}
        onClick={() => setPlantilla(id)}
        className={cn(
          'flex min-h-16 items-start gap-3 rounded-xl border p-3 text-left',
          elegida ? 'border-line-brand bg-brand-tint ring-1 ring-brand' : 'border-line bg-surface hover:bg-hover',
        )}
      >
        <Icono aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', elegida ? 'text-brand' : 'text-fg-muted')} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-fg">{titulo}</span>
          <span className="line-clamp-2 text-xs text-fg-secondary">{detalle}</span>
        </span>
      </button>
    );
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      icono={FilePlus2}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      primario={{ etiqueta: t('continuar'), onClick: () => void crear(), cargando: enviando }}
      ancho={672}
    >
      {campos}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-fg">{t('deQuePartes')}</legend>
        <p className="text-xs text-fg-secondary">{t('deQuePartesAyuda')}</p>
        <div role="radiogroup" aria-label={t('deQuePartes')} className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {opcion(null, t('enBlanco'), t('enBlancoDesc'), FilePlus2)}
          {plantillas.map((r) =>
            opcion(r.id, r.nombre, r.descripcion || t('plantillaDesc', { n: r.permisoIds.length }), r.sistema ? ShieldCheck : Copy),
          )}
        </div>
      </fieldset>
      {hayAdmin && (
        <p className="flex items-start gap-2 rounded-lg border border-line-warning bg-warning-subtle p-3 text-xs text-warning-text">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t('avisoAdmin')}
        </p>
      )}
    </Dialogo>
  );
}
