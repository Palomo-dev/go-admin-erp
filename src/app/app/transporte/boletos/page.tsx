'use client';

/**
 * Transporte › Boletos (Figma «23 Transporte» › 16): pestañas Boletos · Tarifas.
 * /app/transporte/tarifas-pasajeros redirige aquí con `?pestana=tarifas` (308, next.config.js).
 */
import { useTranslations } from 'next-intl';
import { AtajoConfigurar } from '@/components/configuracion/AtajoConfigurar';
import { PestanasTransporte, usePestana } from '@/components/transporte/PestanasTransporte';
import VistaBoletos from '@/components/transporte/boletos/VistaBoletos';
import VistaTarifasPasajeros from '@/components/transporte/tarifas-pasajeros/VistaTarifasPasajeros';

const PESTANAS = ['boletos', 'tarifas'] as const;

export default function Page() {
  const t = useTranslations('transporte.pestanas');
  const [pestana, setPestana] = usePestana(PESTANAS, 'boletos');
  return (
    <PestanasTransporte id="transporte-boletos" etiqueta={t('boletosAria')} pestanas={PESTANAS.map((v) => ({ valor: v, etiqueta: t(v) }))} valor={pestana} onValorChange={setPestana}
      acciones={<AtajoConfigurar seccion="transporte.general" ancla="retencion" />}
    >
      {pestana === 'boletos' ? <VistaBoletos /> : <VistaTarifasPasajeros />}
    </PestanasTransporte>
  );
}
