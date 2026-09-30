'use client';

/**
 * Aviso de reloj desfasado (POS y apertura de caja).
 *
 * Mide el desfase del equipo contra el servidor al montarse y, si pasa de 2
 * minutos, avisa: «La hora de este equipo está desfasada N minutos; las ventas
 * usan la hora del servidor». No bloquea nada: la hora de las ventas, pagos y
 * cajas la pone el servidor (docs/reglas-fechas-timezone.md §«Hora oficial»).
 * La medición queda guardada para las operaciones sin conexión.
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Clock } from 'lucide-react';
import { Tarjeta } from '@/components/kit/Tarjeta';
import { desfaseRelevante, minutosDeDesfase } from '@/lib/pos/reloj/horaOficial';
import { guardarDesfase, leerDesfaseGuardado, medirDesfase, type MedicionDesfase } from '@/lib/pos/reloj/desfaseReloj';

/** Último desfase conocido; mide de nuevo cada vez que `activo` pasa a true. */
export function useDesfaseReloj(activo: boolean = true): MedicionDesfase | null {
  const [medicion, setMedicion] = useState<MedicionDesfase | null>(null);

  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    // Primero lo guardado (sin red sigue valiendo) y luego una medición fresca.
    const guardada = leerDesfaseGuardado();
    if (guardada) setMedicion(guardada);
    void medirDesfase().then((m) => {
      if (!m || !vigente) return;
      guardarDesfase(m);
      setMedicion(m);
    });
    return () => {
      vigente = false;
    };
  }, [activo]);

  return medicion;
}

interface AvisoRelojDesfasadoProps {
  /** Mide solo mientras la pantalla o el diálogo está visible. */
  activo?: boolean;
  className?: string;
}

export function AvisoRelojDesfasado({ activo = true, className }: AvisoRelojDesfasadoProps) {
  const t = useTranslations('posReloj');
  const medicion = useDesfaseReloj(activo);
  if (!activo || !medicion || !desfaseRelevante(medicion.desfaseMs)) return null;

  const minutos = minutosDeDesfase(medicion.desfaseMs);
  return (
    <div role="status" aria-live="polite" className={className}>
      <Tarjeta
        tono="advertencia"
        icono={Clock}
        titulo={t('titulo')}
        descripcion={`${t('mensaje', { minutos })} ${t(medicion.desfaseMs > 0 ? 'adelantado' : 'atrasado')}`}
      />
    </div>
  );
}
