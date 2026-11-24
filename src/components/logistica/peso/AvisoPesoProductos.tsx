'use client';

/**
 * Aviso «X de N productos tienen peso» de Logística (Figma 2800:3649, alerta superior).
 *
 * El peso y las medidas son datos de Inventario: se editan en el producto (Avanzado › Envío) y en
 * la categoría (sección «Envío»). Aquí solo se cuenta con la misma cadena de `resolverPeso`
 * (producto → categoría → organización) y se enlaza a Inventario › Categorías. Sin productos o
 * con todos cubiertos, no se muestra nada.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Scale } from 'lucide-react';
import { AvisoTonal } from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { supabase } from '@/lib/supabase/config';
import { contarProductosPorCategoria, leerPesoOrganizacion, listarPesoCategorias } from '@/lib/services/logistica/pesoMedidasService';

const RUTA_CATEGORIAS = '/app/inventario/categorias';

export interface CoberturaPeso {
  total: number;
  conPeso: number;
}

/** Productos con algún peso: propio, de su categoría o (si existe) el de la organización. Puro. */
export function coberturaPeso(
  conteo: ReadonlyMap<number | null, { productos: number; conPeso: number }>,
  categoriasConPeso: ReadonlySet<number>,
  orgConPeso: boolean,
): CoberturaPeso {
  let total = 0;
  let conPeso = 0;
  for (const [categoria, c] of conteo) {
    total += c.productos;
    conPeso += orgConPeso || (categoria !== null && categoriasConPeso.has(categoria)) ? c.productos : c.conPeso;
  }
  return { total, conPeso };
}

export function AvisoPesoProductos({ organizationId }: { organizationId: number }) {
  const t = useTranslations('logistica.zonas.peso');
  const entero = useFormatoEntero();
  const [cobertura, setCobertura] = useState<CoberturaPeso | null>(null);

  useEffect(() => {
    let vigente = true;
    Promise.all([
      contarProductosPorCategoria(supabase, organizationId),
      listarPesoCategorias(supabase, organizationId),
      leerPesoOrganizacion(supabase, organizationId),
    ])
      .then(([conteo, categorias, org]) => {
        if (!vigente) return;
        const conPeso = new Set(categorias.filter((c) => c.default_weight_kg != null).map((c) => c.id));
        setCobertura(coberturaPeso(conteo, conPeso, org.default_weight_kg != null));
      })
      .catch(() => vigente && setCobertura(null));
    return () => {
      vigente = false;
    };
  }, [organizationId]);

  if (!cobertura || cobertura.total === 0 || cobertura.conPeso >= cobertura.total) return null;
  return (
    <AvisoTonal
      tono={cobertura.conPeso === 0 ? 'peligro' : 'advertencia'}
      icono={Scale}
      titulo={t('alerta.titulo', { n: entero(cobertura.conPeso), total: entero(cobertura.total) })}
      descripcion={t('alerta.descripcion')}
      accion={{ etiqueta: t('alerta.accion'), href: RUTA_CATEGORIAS }}
    />
  );
}
