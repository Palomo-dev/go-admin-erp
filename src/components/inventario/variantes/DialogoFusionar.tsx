'use client';

import { useEffect, useState } from 'react';
import { Info, Merge } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Dialogo } from '@/components/kit';

export interface ElementoFusion {
  id: number;
  nombre: string;
  variantes: number;
  /** Detalle bajo el nombre («8 valores», «Código SKU: NEG»). */
  detalle?: string;
}

export interface DialogoFusionarProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  clase: 'tipos' | 'valores';
  elementos: readonly ElementoFusion[];
  /** Preselección del destino (si no, el más usado). */
  destinoInicial?: number | null;
  onConfirmar: (destino: number, origen: number[]) => Promise<void>;
}

/**
 * «Fusionar tipos» / «Fusionar valores» (Figma `972:607660`): se elige cuál
 * se conserva. Las variantes de los demás pasan al elegido (si una variante
 * tiene los dos, se conserva el elegido), los valores iguales se unen y los
 * demás se borran del catálogo. Una sola RPC: todo o nada.
 */
export function DialogoFusionar({ abierto, onAbiertoChange, clase, elementos, destinoInicial, onConfirmar }: DialogoFusionarProps) {
  const t = useTranslations('inventarioVariantes.fusion');
  const locale = useLocale();
  const [destino, setDestino] = useState<number | null>(null);
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    const porUso = [...elementos].sort((a, b) => b.variantes - a.variantes || a.id - b.id);
    setDestino(destinoInicial ?? porUso[0]?.id ?? null);
  }, [abierto, elementos, destinoInicial]);

  const elegido = elementos.find((e) => e.id === destino);
  const afectadas = elementos.filter((e) => e.id !== destino).reduce((s, e) => s + e.variantes, 0);

  const confirmar = async () => {
    if (!destino) return;
    setProcesando(true);
    try {
      await onConfirmar(
        destino,
        elementos.filter((e) => e.id !== destino).map((e) => e.id),
      );
      onAbiertoChange(false);
    } finally {
      setProcesando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !procesando && onAbiertoChange(v)}
      titulo={t(clase === 'tipos' ? 'tituloTipos' : 'tituloValores', { n: elementos.length })}
      descripcion={t(clase === 'tipos' ? 'descripcionTipos' : 'descripcionValores')}
      icono={Merge}
      ancho={520}
      primario={{
        etiqueta: t('confirmar'),
        onClick: () => void confirmar(),
        cargando: procesando,
        deshabilitada: !destino || elementos.length < 2,
        motivo: t('motivo'),
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-fg">{t('conservar')}</legend>
        {elementos.map((e) => (
          <label key={e.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2.5 hover:bg-hover has-[:checked]:border-brand has-[:checked]:bg-brand-tint">
            <input
              type="radio"
              name={`fusion-${clase}`}
              value={String(e.id)}
              checked={destino === e.id}
              onChange={() => setDestino(e.id)}
              className="size-[18px] accent-brand"
            />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-fg">«{e.nombre}»</span>
              {e.detalle && <span className="truncate text-xs text-fg-secondary">{e.detalle}</span>}
            </span>
            <span className="ml-auto shrink-0 text-xs text-fg-secondary">{t('variantes', { n: e.variantes })}</span>
          </label>
        ))}
      </fieldset>
      {elegido && (
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-info-subtle p-3 text-xs text-info-text">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
          {t('impacto', { nombre: elegido.nombre, n: afectadas, total: afectadas.toLocaleString(locale) })}
        </p>
      )}
    </Dialogo>
  );
}
