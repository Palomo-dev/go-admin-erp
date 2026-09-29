'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/kit';
import { detalleConversion } from '@/components/kit/receta';
import type { FuenteCostoReceta, ModoRecetaListado } from '@/lib/services/recipeService';

export const rutaRecetas = () => '/app/inventario/recetas';
export const rutaEditarReceta = (productId: number) => `/app/inventario/recetas/editar?producto=${productId}`;
export const rutaNuevaReceta = () => '/app/inventario/recetas/editar';
export const rutaCostoRecetas = () => '/app/inventario/reportes/costo-recetas';

/** Errores de las RPC de receta (claves en `inventarioRecetas.errores.*`). */
const ERRORES_RECETA = [
  'receta_sin_ingredientes',
  'receta_rinde_invalido',
  'receta_unidad_invalida',
  'receta_merma_invalida',
  'receta_ingrediente_invalido',
  'receta_autorreferida',
  'receta_cantidad_invalida',
  'receta_ingrediente_repetido',
  'receta_al_producir_sin_inventario',
  'receta_no_encontrada',
  'receta_inactiva',
  'receta_solo_por_rpc',
  'conversion_faltante',
  'producto_no_encontrado',
] as const;

export function useMensajeErrorReceta() {
  const t = useTranslations('inventarioRecetas.errores');
  return useCallback(
    (e: unknown): string => {
      const err = (e ?? {}) as { message?: string; code?: string; details?: string };
      const m = (err.message ?? '').trim();
      const clave = ERRORES_RECETA.find((c) => m === c || m.startsWith(`${c}:`));
      if (clave === 'conversion_faltante') {
        const d = detalleConversion(err.details);
        return d ? t('conversion_faltante_detalle', { de: d.de, a: d.a }) : t('conversion_faltante');
      }
      if (clave) return t(clave);
      if (err.code === '42501') return t('sin_permiso');
      return t('desconocido');
    },
    [t],
  );
}

export function BadgeModoReceta({ modo }: { modo: ModoRecetaListado }) {
  const t = useTranslations('inventarioRecetas.modo');
  return <StatusBadge estado={modo} tono={modo === 'al_producir' ? 'marca' : 'informacion'} apariencia="contorno" etiqueta={t(modo)} />;
}

export function BadgeEstadoReceta({ activa }: { activa: boolean }) {
  const t = useTranslations('inventarioRecetas.estados');
  return <StatusBadge estado={activa ? 'activa' : 'inactiva'} etiqueta={activa ? t('activa') : t('inactiva')} />;
}

const TONO_FUENTE: Record<FuenteCostoReceta, 'exito' | 'informacion' | 'advertencia' | 'peligro'> = {
  promedio_sucursal: 'exito',
  costo_vigente: 'informacion',
  sin_costo: 'advertencia',
  sin_conversion: 'peligro',
};

export function BadgeFuenteCosto({ fuente, sinCosto }: { fuente: FuenteCostoReceta; sinCosto?: number }) {
  const t = useTranslations('inventarioRecetas.fuentes');
  return (
    <StatusBadge
      estado={fuente}
      tono={TONO_FUENTE[fuente]}
      apariencia="contorno"
      etiqueta={fuente === 'sin_costo' && sinCosto ? t('nSinCosto', { count: sinCosto }) : t(fuente)}
    />
  );
}
