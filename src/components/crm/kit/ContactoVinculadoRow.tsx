'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Mail, Phone, Star, Trash2 } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Badge } from '@/components/ui/badge';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { accionTeclaCargo, cargoCambio, cargoNormalizado, MAX_CARGO } from './contactoVinculadoRowLogica';

/**
 * Contacto vinculado a una empresa (Figma `ContactoVinculadoRow` 329:109310,
 * sección Clientes): cargo editable en línea (Enter guarda, Escape cancela),
 * marcar como principal y desvincular. La papelera **no** desvincula: pide a
 * la pantalla que confirme (`ConfirmDialog`). `nuevo` resalta la fila recién
 * vinculada.
 */
export interface ContactoVinculadoRowProps {
  persona: { id: string; full_name: string | null; email?: string | null; phone?: string | null; avatar_url?: string | null };
  cargo: string | null;
  principal?: boolean;
  nuevo?: boolean;
  onGuardarCargo?: (cargo: string | null) => void;
  onMarcarPrincipal?: () => void;
  /** La pantalla confirma antes de desvincular. */
  onDesvincular?: () => void;
  deshabilitada?: boolean;
}

export function ContactoVinculadoRow({ persona, cargo, principal, nuevo, onGuardarCargo, onMarcarPrincipal, onDesvincular, deshabilitada }: ContactoVinculadoRowProps) {
  const t = useTranslations('crm.kit.contacto');
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(cargo ?? '');
  const campo = useRef<HTMLInputElement>(null);
  const nombre = persona.full_name?.trim() || t('sinNombre');
  useEffect(() => { if (editando) campo.current?.focus(); }, [editando]);

  const terminar = (guardar: boolean) => {
    if (guardar && cargoCambio(cargo, borrador)) onGuardarCargo?.(cargoNormalizado(borrador));
    if (!guardar) setBorrador(cargo ?? '');
    setEditando(false);
  };

  return (
    <div className={cn('flex items-center gap-3 rounded-lg px-3 py-2', nuevo ? 'bg-brand-tint' : 'bg-surface', editando && 'ring-1 ring-brand')}>
      <AvatarIniciales nombre={nombre} src={persona.avatar_url} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-fg">{nombre}</span>
          {principal && <Badge tono="advertencia" apariencia="contorno" tamano="sm">{t('principal')}</Badge>}
          {nuevo && <Badge tono="marca" tamano="sm">{t('nuevo')}</Badge>}
        </span>
        <span className="flex flex-wrap gap-x-3 text-xs text-fg-muted">
          {persona.email && <span className="inline-flex items-center gap-1"><Mail aria-hidden="true" className="size-3" />{persona.email}</span>}
          {persona.phone && <span className="inline-flex items-center gap-1"><Phone aria-hidden="true" className="size-3" />{persona.phone}</span>}
        </span>
      </div>
      {editando ? (
        <input
          ref={campo}
          aria-label={t('cargoDe', { nombre })}
          value={borrador}
          maxLength={MAX_CARGO}
          onChange={(e) => setBorrador(e.target.value)}
          onKeyDown={(e) => {
            const a = accionTeclaCargo(e.key);
            if (a) { e.preventDefault(); terminar(a === 'guardar'); }
          }}
          onBlur={() => terminar(true)}
          className="h-8 w-40 rounded-full border border-brand bg-surface px-3 text-[13px] text-fg focus-visible:outline-none"
        />
      ) : (
        <button type="button" disabled={deshabilitada || !onGuardarCargo} onClick={() => { setBorrador(cargo ?? ''); setEditando(true); }} aria-label={t('editarCargo', { nombre, cargo: cargo || t('sinCargo') })} className="h-8 max-w-[160px] truncate rounded-full border border-line-strong px-3 text-[13px] text-fg hover:bg-hover disabled:cursor-default disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          {cargo || <span className="text-fg-muted">{t('agregarCargo')}</span>}
        </button>
      )}
      {onMarcarPrincipal && (
        <button type="button" aria-pressed={!!principal} disabled={deshabilitada || principal} onClick={onMarcarPrincipal} aria-label={principal ? t('esPrincipal', { nombre }) : t('marcarPrincipal', { nombre })} className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          <Star aria-hidden="true" className={cn('size-4', principal && 'fill-current text-warning-text')} strokeWidth={1.5} />
        </button>
      )}
      {onDesvincular && (
        <button type="button" disabled={deshabilitada} onClick={onDesvincular} aria-label={t('desvincular', { nombre })} className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
