'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Copy } from 'lucide-react';
import { CampoNumero, Dialogo, FormField, SegmentedControl } from '@/components/kit';
import type { FormaMesa } from './estadoMesaPlano';

/**
 * «Agregar mesas en lote» (Figma 870:105746, paso 2: «Número, capacidad y
 * forma; en lote: 10 mesas de 4»). Crea las mesas en una sola inserción.
 */
export interface LoteMesasDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  zonas: readonly string[];
  /** Primer número libre («Mesa 17»). */
  desdeSugerido: number;
  onCrear: (datos: { desde: number; cantidad: number; capacidad: number; zona: string | null; forma: FormaMesa }) => Promise<void>;
}

export function LoteMesasDialog({ abierto, onAbiertoChange, zonas, desdeSugerido, onCrear }: LoteMesasDialogProps) {
  const t = useTranslations('posMesasPlano.lote');
  const tf = useTranslations('posMesasPlano.editor.mesa.formas');
  const [zona, setZona] = useState('');
  const [desde, setDesde] = useState<number | null>(desdeSugerido);
  const [cantidad, setCantidad] = useState<number | null>(10);
  const [capacidad, setCapacidad] = useState<number | null>(4);
  const [forma, setForma] = useState<FormaMesa>('cuadrada');
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setDesde(desdeSugerido);
    setZona(zonas[0] ?? '');
  }, [abierto, desdeSugerido, zonas]);

  const valido = desde != null && desde >= 1 && cantidad != null && cantidad >= 1 && cantidad <= 50 && capacidad != null && capacidad >= 1;

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={Copy}
      ancho={520}
      primario={{
        etiqueta: valido ? t('crear', { n: cantidad ?? 0 }) : t('crearSinN'),
        cargando: creando,
        deshabilitada: !valido,
        onClick: async () => {
          if (!valido) return;
          setCreando(true);
          try {
            await onCrear({ desde: desde!, cantidad: cantidad!, capacidad: capacidad!, zona: zona.trim() || null, forma });
            onAbiertoChange(false);
          } finally {
            setCreando(false);
          }
        },
      }}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('zona')} ayuda={t('zonaAyuda')}>
          {(c) => (
            <>
              <input
                id={c.id}
                list="lote-zonas"
                value={zona}
                maxLength={40}
                onChange={(e) => setZona(e.target.value)}
                className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              />
              <datalist id="lote-zonas">
                {zonas.map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
            </>
          )}
        </FormField>
        <div className="grid grid-cols-3 gap-3">
          <FormField etiqueta={t('desde')}>
            {() => <CampoNumero valor={desde} onValorChange={setDesde} minimo={1} decimales={0} alinear="izquierda" />}
          </FormField>
          <FormField etiqueta={t('cantidad')}>
            {() => <CampoNumero valor={cantidad} onValorChange={setCantidad} minimo={1} maximo={50} decimales={0} alinear="izquierda" />}
          </FormField>
          <FormField etiqueta={t('capacidad')}>
            {() => <CampoNumero valor={capacidad} onValorChange={setCapacidad} minimo={1} maximo={50} decimales={0} alinear="izquierda" />}
          </FormField>
        </div>
        <FormField etiqueta={t('forma')}>
          {() => (
            <SegmentedControl<FormaMesa>
              etiqueta={t('forma')}
              anchoCompleto
              valor={forma}
              onValorChange={setForma}
              opciones={(['cuadrada', 'redonda', 'larga', 'barra'] as const).map((f) => ({ valor: f, etiqueta: tf(f) }))}
            />
          )}
        </FormField>
        {valido && <p className="text-[13px] text-fg-secondary">{t('resumen', { desde: desde!, hasta: desde! + cantidad! - 1, n: cantidad!, cap: capacidad! })}</p>}
      </div>
    </Dialogo>
  );
}
