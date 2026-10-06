'use client';

/**
 * «¿Guardar N cambios en …?» (Figma «13. Equipo › Roles y permisos», «Revisar
 * cambios antes de guardar»): lo que se añade y se quita, aviso de permisos
 * sensibles y a quién afecta. Antes la matriz guardaba sin resumen ni aviso
 * (análisis §3.3, problema 21).
 */
import { useTranslations } from 'next-intl';
import { ClipboardCheck, TriangleAlert } from 'lucide-react';
import { Dialogo } from '@/components/kit/Dialogo';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import type { ResumenCambios } from '@/lib/roles/cambios';
import type { PersonaResumen } from '@/lib/roles/tipos';
import { FilaPermiso } from './FilaPermiso';

export interface DialogoRevisarCambiosProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  nombre: string;
  cambios: ResumenCambios;
  /** Cambios que no son permisos (nombre, descripción). */
  otrosCambios?: number;
  personas: readonly PersonaResumen[];
  guardando: boolean;
  onGuardar: () => void;
}

const MAX_AVATARES = 5;

export function DialogoRevisarCambios({ abierto, onAbiertoChange, nombre, cambios, otrosCambios = 0, personas, guardando, onGuardar }: DialogoRevisarCambiosProps) {
  const t = useTranslations('roles.revisar');
  const total = cambios.total + otrosCambios;
  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      icono={ClipboardCheck}
      titulo={t('titulo', { n: total, rol: nombre })}
      descripcion={t('descripcion')}
      textoCancelar={t('volver')}
      primario={{ etiqueta: t('guardar', { n: total }), onClick: onGuardar, cargando: guardando, deshabilitada: total === 0 }}
      ancho={560}
    >
      {cambios.anadidos.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{t('anadidos')}</h3>
          <div className="rounded-lg border border-line">
            {cambios.anadidos.map((p) => (
              <FilaPermiso key={p.id} permiso={p} marcado delta="anadido" />
            ))}
          </div>
        </section>
      )}
      {cambios.quitados.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{t('quitados')}</h3>
          <div className="rounded-lg border border-line">
            {cambios.quitados.map((p) => (
              <FilaPermiso key={p.id} permiso={p} marcado={false} delta="quitado" />
            ))}
          </div>
        </section>
      )}
      {cambios.sensibles.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-line-warning bg-warning-subtle p-3 text-sm text-warning-text">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t('avisoSensibles', { n: cambios.sensibles.length })}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
        <span>{t('afecta', { n: personas.length })}</span>
        {personas.length > 0 && (
          <span className="flex -space-x-2">
            {personas.slice(0, MAX_AVATARES).map((p) => (
              <AvatarIniciales key={p.id} nombre={p.nombre} tamano="sm" className="ring-2 ring-surface" />
            ))}
          </span>
        )}
        {personas.length > 0 && (
          <span className="min-w-0 truncate">
            {personas
              .slice(0, MAX_AVATARES)
              .map((p) => p.nombre)
              .join(', ')}
            {personas.length > MAX_AVATARES ? '…' : ''}
          </span>
        )}
      </div>
    </Dialogo>
  );
}
