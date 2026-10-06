'use client';

/**
 * Elegir una persona para abrir «¿Qué puede hacer esta persona?» desde Roles y
 * permisos (en Organización › Miembros se abre directamente desde la fila).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { UserSearch } from 'lucide-react';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { SearchInput } from '@/components/kit/SearchInput';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { clienteRoles, ErrorPeticionRoles } from '@/lib/services/roles/clienteRoles';
import { normalizarTexto } from '@/lib/roles/matrizPermisos';
import type { MiembroRoles } from '@/lib/roles/tipos';
import { useEtiquetasRoles } from './useEtiquetasRoles';

export interface SelectorPersonaProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  onElegir: (memberId: number) => void;
}

export function SelectorPersona({ abierto, onAbiertoChange, onElegir }: SelectorPersonaProps) {
  const t = useTranslations('roles.quePuede');
  const ta = useTranslations('roles.asignar');
  const { mensajeError } = useEtiquetasRoles();
  const [miembros, setMiembros] = useState<MiembroRoles[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [termino, setTermino] = useState('');

  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    setTermino('');
    setError(null);
    clienteRoles
      .miembros()
      .then((r) => vigente && setMiembros(r.miembros))
      .catch((err) => vigente && setError(mensajeError(err instanceof ErrorPeticionRoles ? err.codigo : 'error_interno')));
    return () => {
      vigente = false;
    };
  }, [abierto, mensajeError]);

  const visibles = useMemo(() => {
    const q = normalizarTexto(termino);
    return (miembros ?? []).filter((m) => !q || normalizarTexto(`${m.nombre} ${m.email ?? ''} ${m.rolNombre ?? ''}`).includes(q));
  }, [miembros, termino]);

  return (
    <PanelAdaptable abierto={abierto} onAbiertoChange={onAbiertoChange} icono={UserSearch} titulo={t('abrir')} descripcion={t('elegirPersona')} ancho={560}>
      <div className="flex flex-col gap-3">
      <SearchInput value={termino} onChange={setTermino} onValueChange={setTermino} placeholder={ta('buscar')} etiqueta={ta('buscar')} atajo={false} autoFocus />
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
      {miembros === null && !error ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-subtle" />
          ))}
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {visibles.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => onElegir(m.id)} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-hover">
                <AvatarIniciales nombre={m.nombre} tamano="sm" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm text-fg">{m.nombre}</span>
                  <span className="truncate text-xs text-fg-muted">{[m.rolNombre, m.cargoNombre].filter(Boolean).join(' + ')}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      </div>
    </PanelAdaptable>
  );
}
