'use client';

/**
 * TarjetaDocumento (Figma 20.6, pieza propia de RR. HH. armada con el kit):
 * un documento del expediente. Tres formas: subido (con vencimiento y menú
 * «⋯»), faltante (lo exige el cargo, botón «Subir») y restringido (de un grupo
 * que el usuario no puede ver: sin nombre de archivo).
 */
import { FileText, Lock, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { RowActionsMenu, StatusBadge, clasesBoton, type AccionFila } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { fechaCorta } from '../textosPersonas';

export type EstadoDocumento = 'vigente' | 'por_vencer' | 'vencido' | 'sin_vencimiento' | 'falta' | 'restringido';

const TONO: Record<EstadoDocumento, 'exito' | 'advertencia' | 'peligro' | 'neutro'> = {
  vigente: 'exito',
  por_vencer: 'advertencia',
  vencido: 'peligro',
  sin_vencimiento: 'neutro',
  falta: 'advertencia',
  restringido: 'neutro',
};

export interface TarjetaDocumentoProps {
  titulo: string;
  carpeta: string;
  estado: EstadoDocumento;
  detalle?: string | null;
  vence?: string | null;
  dias?: number | null;
  subido?: string | null;
  acciones?: readonly AccionFila[];
  onSubir?: () => void;
}

export function TarjetaDocumento({ titulo, carpeta, estado, detalle, vence, dias, subido, acciones, onSubir }: TarjetaDocumentoProps) {
  const t = useTranslations('hrmPersonas.documentos');
  const Icono = estado === 'falta' ? Upload : estado === 'restringido' ? Lock : FileText;
  return (
    <article
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-xl border p-4',
        estado === 'falta' ? 'border-dashed border-line-strong bg-subtle' : 'border-line bg-surface'
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg',
            estado === 'restringido' ? 'bg-warning-subtle text-warning-text' : 'bg-brand-tint text-brand'
          )}
        >
          <Icono aria-hidden className="size-4" strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-fg">{titulo}</h3>
          {detalle ? <p className="truncate text-xs text-fg-secondary">{detalle}</p> : null}
        </div>
        {acciones && acciones.length > 0 ? <RowActionsMenu acciones={acciones} titulo={titulo} /> : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-fg-secondary">{carpeta}</span>
        <StatusBadge estado={estado} tono={TONO[estado]} etiqueta={t(`estados.${estado}`)} />
      </div>
      {estado === 'falta' && onSubir ? (
        <button type="button" onClick={onSubir} className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'w-full' })}>
          <Upload aria-hidden className="size-4" strokeWidth={1.5} />
          {t('subir')}
        </button>
      ) : estado === 'restringido' ? (
        <p className="text-xs text-warning-text">{t('consultaRegistrada')}</p>
      ) : (
        <>
          <p className={cn('text-sm', estado === 'vencido' ? 'text-danger-text' : estado === 'por_vencer' ? 'text-warning-text' : 'text-fg-secondary')}>
            {vence
              ? estado === 'vencido'
                ? t('vencio', { fecha: fechaCorta(vence) })
                : estado === 'por_vencer'
                  ? t('venceEn', { fecha: fechaCorta(vence), dias: dias ?? 0 })
                  : t('vence', { fecha: fechaCorta(vence) })
              : t('sinVencimiento')}
          </p>
          {subido ? <p className="text-xs text-fg-muted">{subido}</p> : null}
        </>
      )}
    </article>
  );
}
