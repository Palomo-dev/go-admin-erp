'use client';

/**
 * Tarjeta «Envío» de la ficha del producto (Figma 2800:4625): qué peso se usa para cotizar
 * (el del producto, el de su categoría o el de la organización), el volumétrico y lo que cobra la
 * transportadora. La cadena es `resolverPeso` (presentacionEnvio.ts), la misma de Logística ›
 * Configuración › Peso y medidas.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FilaDato, StatusBadge } from '@/components/kit';
import { supabase } from '@/lib/supabase/config';
import { leerPesoOrganizacion, type PesoOrganizacion } from '@/lib/services/logistica/pesoMedidasService';
import { resolverPeso } from '@/lib/logistica/presentacionEnvio';

interface Props {
  organizacionId: number;
  categoriaId: number | null;
  peso: number | null;
  largo: number | null;
  ancho: number | null;
  alto: number | null;
}

interface CategoriaPeso {
  name: string;
  default_weight_kg: number | null;
  default_length_cm: number | null;
  default_width_cm: number | null;
  default_height_cm: number | null;
}

export function ResumenPesoProducto({ organizacionId, categoriaId, peso, largo, ancho, alto }: Props) {
  const t = useTranslations('logistica.zonas.peso.ficha');
  const [categoria, setCategoria] = useState<CategoriaPeso | null>(null);
  const [org, setOrg] = useState<PesoOrganizacion | null>(null);

  useEffect(() => {
    let vigente = true;
    leerPesoOrganizacion(supabase, organizacionId)
      .then((o) => vigente && setOrg(o))
      .catch(() => vigente && setOrg(null));
    return () => {
      vigente = false;
    };
  }, [organizacionId]);

  useEffect(() => {
    let vigente = true;
    if (!categoriaId) {
      setCategoria(null);
      return;
    }
    supabase
      .from('categories')
      .select('name, default_weight_kg, default_length_cm, default_width_cm, default_height_cm')
      .eq('organization_id', organizacionId)
      .eq('id', categoriaId)
      .maybeSingle()
      .then(({ data }) => vigente && setCategoria((data as CategoriaPeso | null) ?? null));
    return () => {
      vigente = false;
    };
  }, [organizacionId, categoriaId]);

  const r = resolverPeso(
    { peso, largo, ancho, alto },
    categoria ? { peso: categoria.default_weight_kg, largo: categoria.default_length_cm, ancho: categoria.default_width_cm, alto: categoria.default_height_cm } : null,
    org ? { peso: org.default_weight_kg, largo: org.default_length_cm, ancho: org.default_width_cm, alto: org.default_height_cm } : null,
  );
  const hereda = r.fuente === 'categoria' && categoria;
  const fuente = r.fuente === 'producto' ? t('fuente.producto') : r.fuente === 'categoria' ? t('fuente.categoria', { nombre: categoria?.name ?? '' }) : r.fuente === 'organizacion' ? t('fuente.organizacion') : null;

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-subtle p-3" aria-live="polite">
      {hereda && (
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge estado="hereda" etiqueta={t('hereda', { nombre: categoria.name })} tono="informacion" tamano="sm" />
          <span className="text-xs text-fg-secondary">{t('vacioUsa', { peso: categoria.default_weight_kg ?? 0, nombre: categoria.name })}</span>
        </div>
      )}
      <FilaDato etiqueta={t('seUsa')} valor={r.peso !== null ? `${r.peso} kg${fuente ? ` (${fuente})` : ''}` : t('sinPeso')} tono={r.peso === null ? 'advertencia' : undefined} />
      <FilaDato etiqueta={t('volumetrico')} valor={r.volumetrico !== null ? `${r.volumetrico} kg` : '—'} />
      <FilaDato etiqueta={t('cobra')} valor={r.cobrado !== null ? `${r.cobrado} kg` : '—'} tono="fuerte" />
    </div>
  );
}
