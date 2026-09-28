'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Tag } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Dialogo } from '@/components/kit/Dialogo';
import { FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase/config';
import { COLORES_ETIQUETA, COLOR_ETIQUETA_POR_DEFECTO, normalizarHex } from './colorEtiqueta';

export interface EtiquetaCreada {
  id: number;
  name: string;
  color: string | null;
}

/**
 * «Crear etiqueta» (A.11 #5-#6): nombre + color (10 de la paleta o cualquier
 * hex). Inserta en `product_tags` de la organización (UNIQUE por nombre) y
 * entrega la etiqueta para asignarla. El color siempre se guarda en hex.
 */
export function DialogoNuevaEtiqueta({
  abierto,
  onAbiertoChange,
  organizacionId,
  nombreInicial = '',
  existentes,
  onCreada,
}: {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  organizacionId: number;
  nombreInicial?: string;
  /** Nombres que ya existen (se comparan sin mayúsculas). */
  existentes: readonly string[];
  onCreada: (etiqueta: EtiquetaCreada) => void | Promise<void>;
}) {
  const t = useTranslations('productoDetalle.etiquetas');
  const tc = useTranslations('productoDetalle.comun');
  const [nombre, setNombre] = useState(nombreInicial);
  const [color, setColor] = useState<string>(COLOR_ETIQUETA_POR_DEFECTO);
  const [hex, setHex] = useState<string>(COLOR_ETIQUETA_POR_DEFECTO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setNombre(nombreInicial);
    setColor(COLOR_ETIQUETA_POR_DEFECTO);
    setHex(COLOR_ETIQUETA_POR_DEFECTO);
    setError(null);
  }, [abierto, nombreInicial]);

  const limpio = nombre.trim();
  const duplicada = existentes.some((n) => n.trim().toLowerCase() === limpio.toLowerCase());

  const elegir = (c: string) => {
    setColor(c);
    setHex(c);
  };

  const crear = async () => {
    if (!limpio || duplicada) return;
    setGuardando(true);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('product_tags')
        .insert({ organization_id: organizacionId, name: limpio, color })
        .select('id, name, color')
        .single();
      if (e) {
        setError(e.code === '23505' ? t('crear.duplicada') : t('crear.error'));
        return;
      }
      await onCreada(data as EtiquetaCreada);
      onAbiertoChange(false);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('crear.titulo')}
      icono={Tag}
      textoCancelar={tc('cancelar')}
      ancho={440}
      primario={{
        etiqueta: guardando ? tc('guardando') : t('crear.confirmar'),
        onClick: () => void crear(),
        cargando: guardando,
        deshabilitada: !limpio || duplicada,
        motivo: duplicada ? t('crear.duplicada') : t('crear.nombreRequerido'),
      }}
    >
      <FormField etiqueta={t('crear.nombre')} obligatorio error={duplicada ? t('crear.duplicada') : error}>
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder={t('crear.nombrePlaceholder')}
          maxLength={60}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void crear();
            }
          }}
        />
      </FormField>
      <FormField etiqueta={t('crear.color')}>
        {(campo) => (
          <div className="flex flex-col gap-3">
            <div role="radiogroup" aria-labelledby={campo.idEtiqueta} className="flex flex-wrap gap-2">
              {COLORES_ETIQUETA.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={c}
                  onClick={() => elegir(c)}
                  style={{ backgroundColor: c }}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full border-2 text-fg-on-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
                    color === c ? 'border-fg' : 'border-transparent',
                  )}
                >
                  {color === c && <Check className="size-4" aria-hidden />}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => elegir(e.target.value.toLowerCase())}
                aria-label={t('crear.colorPersonalizado')}
                className="h-9 w-12 cursor-pointer rounded-md border border-line bg-surface"
              />
              <Input
                id={campo.id}
                value={hex}
                onChange={(e) => {
                  setHex(e.target.value);
                  const n = normalizarHex(e.target.value);
                  if (n) setColor(n);
                }}
                aria-label={t('crear.hex')}
                maxLength={7}
                className="w-28 font-mono"
              />
            </div>
          </div>
        )}
      </FormField>
      <div className="flex items-center gap-2 text-sm text-fg-secondary">
        <span>{t('crear.vistaPrevia')}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-sm text-fg">
          <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
          {limpio || t('crear.nombrePlaceholder')}
        </span>
      </div>
    </Dialogo>
  );
}
