'use client';

/**
 * «Personalizar el inicio» (Figma 448:196794, aprobado por el dueño el
 * 2026-09-30): qué bloques y qué módulos ve la persona en SU inicio, en esta
 * organización. Se guarda en `user_dashboard_preferences` (viaja entre
 * dispositivos). «Hoy» siempre visible. Ocultar un módulo deja de consultarlo
 * y no cambia permisos ni los módulos de la organización.
 *
 * Los módulos que se listan son los que el servidor le devuelve a esta persona
 * (`modulos`), nunca una lista cableada.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SlidersHorizontal } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Dialogo } from '@/components/kit/Dialogo';
import { BLOQUES_OCULTABLES, PREFERENCIAS_VACIAS, type BloqueInicio, type PreferenciasInicio } from '@/lib/dashboard/preferenciasInicio';

export interface DialogoPersonalizarProps {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  prefs: PreferenciasInicio;
  /** Módulos que ve la persona: código y nombre ya traducido. */
  modulos: Array<{ codigo: string; nombre: string }>;
  onGuardar: (p: PreferenciasInicio) => Promise<boolean>;
  guardando?: boolean;
}

function Fila({ etiqueta, detalle, checked, disabled, onChange }: { etiqueta: string; detalle?: string; checked: boolean; disabled?: boolean; onChange?: (v: boolean) => void }) {
  return (
    <li className="flex items-center gap-3 rounded-lg bg-canvas px-3 py-2">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium text-fg">{etiqueta}</span>
        {detalle && <span className="text-xs text-fg-secondary">{detalle}</span>}
      </span>
      <Switch checked={checked} disabled={disabled} aria-label={etiqueta} onCheckedChange={(v) => onChange?.(v)} />
    </li>
  );
}

export function DialogoPersonalizar({ abierto, onAbiertoChange, prefs, modulos, onGuardar, guardando }: DialogoPersonalizarProps) {
  const t = useTranslations('home.personalizar');
  const [borrador, setBorrador] = useState<PreferenciasInicio>(prefs);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (abierto) {
      setBorrador(prefs);
      setError(false);
    }
  }, [abierto, prefs]);

  const alternarBloque = (b: BloqueInicio, visible: boolean) =>
    setBorrador((p) => ({ ...p, bloquesOcultos: visible ? p.bloquesOcultos.filter((x) => x !== b) : [...p.bloquesOcultos, b] }));
  const alternarModulo = (c: string, visible: boolean) =>
    setBorrador((p) => ({ ...p, modulosOcultos: visible ? p.modulosOcultos.filter((x) => x !== c) : [...p.modulosOcultos, c] }));

  const guardar = async (p: PreferenciasInicio) => {
    setError(false);
    if (await onGuardar(p)) onAbiertoChange(false);
    else setError(true);
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={SlidersHorizontal}
      primario={{ etiqueta: t('guardar'), onClick: () => guardar(borrador), cargando: guardando }}
      secundarios={[{ etiqueta: t('restablecer'), onClick: () => guardar({ ...PREFERENCIAS_VACIAS }), deshabilitada: guardando }]}
      pie={error ? <span role="alert" className="text-danger">{t('errorGuardar')}</span> : undefined}
    >
      <h3 className="text-sm font-semibold text-fg">{t('bloques')}</h3>
      <ul className="flex flex-col gap-2">
        <Fila etiqueta={t('hoy')} detalle={t('siempreVisible')} checked disabled />
        {BLOQUES_OCULTABLES.map((b) => (
          <Fila key={b} etiqueta={t(`bloque.${b}`)} checked={!borrador.bloquesOcultos.includes(b)} onChange={(v) => alternarBloque(b, v)} />
        ))}
      </ul>
      {modulos.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-fg">{t('modulos')}</h3>
          <ul className="flex flex-col gap-2">
            {modulos.map((m) => (
              <Fila key={m.codigo} etiqueta={m.nombre} checked={!borrador.modulosOcultos.includes(m.codigo)} onChange={(v) => alternarModulo(m.codigo, v)} />
            ))}
          </ul>
        </>
      )}
      <p className="text-xs leading-4 text-fg-secondary">{t('nota')}</p>
    </Dialogo>
  );
}
