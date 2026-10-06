'use client';

/**
 * «Alguien guardó … mientras editabas» (Figma «13. Equipo › Roles y permisos»,
 * flujo D). El servidor rechazó el guardado por versión (rol) o por
 * `updated_at` (cargo) y devolvió lo que hay guardado. Aquí se muestra qué
 * cambió cada uno y se ofrece:
 *  - «Aplicar mis cambios sobre su versión»: su versión + mis cambios, y se
 *    abre otra vez la revisión;
 *  - «Revisar primero» (también al cerrar): lo mismo, pero sin abrir la
 *    revisión, para mirarlo en la matriz;
 *  - «Descartar los míos»: queda su versión.
 * En los tres casos la pantalla pasa a la versión guardada: nunca se pisa lo
 * que guardó la otra persona sin verlo.
 */
import { useTranslations } from 'next-intl';
import { GitMerge, TriangleAlert } from 'lucide-react';
import { Dialogo } from '@/components/kit/Dialogo';
import type { Conflicto } from '@/lib/roles/cambios';
import { FilaPermiso } from './FilaPermiso';

export interface DialogoConflictoProps {
  conflicto: Conflicto | null;
  tipo: 'rol' | 'cargo';
  onAbiertoChange: (abierto: boolean) => void;
  onAplicarMios: () => void;
  onRevisar: () => void;
  onDescartarMios: () => void;
}

export function DialogoConflicto({ conflicto, tipo, onAbiertoChange, onAplicarMios, onRevisar, onDescartarMios }: DialogoConflictoProps) {
  const t = useTranslations('roles.conflicto');
  if (!conflicto) return null;
  const { suyos, mios, choques } = conflicto;
  return (
    <Dialogo
      abierto
      onAbiertoChange={(v) => {
        if (!v) onRevisar();
        onAbiertoChange(v);
      }}
      icono={GitMerge}
      titulo={tipo === 'rol' ? t('titulo') : t('tituloCargo')}
      descripcion={t('descripcion')}
      textoCancelar={t('revisarPrimero')}
      primario={{ etiqueta: t('aplicarMios', { n: mios.total }), onClick: onAplicarMios, deshabilitada: mios.total === 0 }}
      secundarios={[{ etiqueta: t('descartarMios'), onClick: onDescartarMios }]}
      ancho={560}
    >
      <section className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{t('suyos')}</h3>
        {suyos.total === 0 ? (
          <p className="text-sm text-fg-secondary">{t('nadaSuyo')}</p>
        ) : (
          <div className="rounded-lg border border-line">
            {suyos.anadidos.map((p) => (
              <FilaPermiso key={`s+${p.id}`} permiso={p} marcado delta="anadido" />
            ))}
            {suyos.quitados.map((p) => (
              <FilaPermiso key={`s-${p.id}`} permiso={p} marcado={false} delta="quitado" />
            ))}
          </div>
        )}
      </section>
      <section className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{t('mios')}</h3>
        <div className="rounded-lg border border-line">
          {mios.anadidos.map((p) => (
            <FilaPermiso key={`m+${p.id}`} permiso={p} marcado delta="anadido" />
          ))}
          {mios.quitados.map((p) => (
            <FilaPermiso key={`m-${p.id}`} permiso={p} marcado={false} delta="quitado" />
          ))}
        </div>
      </section>
      {choques.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-line-warning bg-warning-subtle p-3 text-sm text-warning-text">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t('choques', { n: choques.length })}
        </p>
      )}
    </Dialogo>
  );
}
