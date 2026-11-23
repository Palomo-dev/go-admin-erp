'use client';

/**
 * Transporte › Rutas y paradas (Figma «23 Transporte» › 5 y 17): pestañas Rutas · Paradas.
 * /app/transporte/paradas redirige aquí con `?pestana=paradas` (308, next.config.js).
 */
import { useTranslations } from 'next-intl';
import { PestanasTransporte, usePestana } from '@/components/transporte/PestanasTransporte';
import VistaRutas from '@/components/transporte/rutas/VistaRutas';
import VistaParadas from '@/components/transporte/paradas/VistaParadas';

const PESTANAS = ['rutas', 'paradas'] as const;

export default function Page() {
  const t = useTranslations('transporte.pestanas');
  const [pestana, setPestana] = usePestana(PESTANAS, 'rutas');
  return (
    <PestanasTransporte id="transporte-rutas" etiqueta={t('rutasAria')} pestanas={PESTANAS.map((v) => ({ valor: v, etiqueta: t(v) }))} valor={pestana} onValorChange={setPestana}>
      {pestana === 'rutas' ? <VistaRutas /> : <VistaParadas />}
    </PestanasTransporte>
  );
}
