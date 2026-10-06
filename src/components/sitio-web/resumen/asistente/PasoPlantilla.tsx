'use client';

/**
 * Paso 2 «Plantilla» (Figma A/03b escritorio, A/03g móvil): filtros por giro
 * (primero el del sitio, luego «Todas») y la rejilla de `TemplateCard` con la
 * miniatura en los colores de cada plantilla. Seleccionar no guarda nada:
 * «Siguiente» escribe la plantilla en el borrador.
 */
import { useMemo, useState } from 'react';
import { ChipsOpcion, EmptyState } from '@/components/kit';
import type { GiroSitio } from '@/lib/website/onboardingSitio';
import { TemplateCard } from '../../ui/TemplateCard';
import { MiniaturaSitio } from '../MiniaturaSitio';
import { girosConPlantillas, plantillasDelGiro, type PlantillaAsistente } from './catalogoAsistente';
import { EncabezadoPaso } from './EncabezadoPaso';
import { useTextosResumen } from '../textos';

export interface PasoPlantillaProps {
  giro: GiroSitio;
  seleccionada: string | null;
  onSeleccionar: (plantilla: PlantillaAsistente) => void;
  catalogo?: readonly PlantillaAsistente[];
}

type Filtro = GiroSitio | 'todas';

export function PasoPlantilla({ giro, seleccionada, onSeleccionar, catalogo }: PasoPlantillaProps) {
  const t = useTextosResumen();
  const giros = useMemo(() => girosConPlantillas(catalogo), [catalogo]);
  const inicial: Filtro = giros.includes(giro) ? giro : 'todas';
  const [filtro, setFiltro] = useState<Filtro>(inicial);
  const opciones = [
    ...(giros.includes(giro) ? [giro] : []),
    ...giros.filter((g) => g !== giro),
  ].map((g) => ({ valor: g as Filtro, etiqueta: t(`asistente.giro.giros.${g}`) }));
  const lista = plantillasDelGiro(filtro, catalogo);
  const nombreGiro = t(`asistente.giro.giros.${giros.includes(giro) ? giro : 'otro'}`).toLowerCase();

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPaso paso="plantilla" titulo={t('asistente.plantilla.titulo')} descripcion={t('asistente.plantilla.descripcion', { giro: nombreGiro })} />
      <ChipsOpcion
        opciones={[...opciones, { valor: 'todas', etiqueta: t('asistente.plantilla.todas') }]}
        valor={filtro}
        onValorChange={setFiltro}
        etiqueta={t('asistente.plantilla.filtros')}
      />
      {lista.length === 0 ? (
        <EmptyState variante="empty" titulo={t('asistente.plantilla.vacio')} compacto />
      ) : (
        <div role="radiogroup" aria-label={t('asistente.plantilla.titulo')} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {lista.map((p) => (
            <TemplateCard
              key={p.id}
              rol="radio"
              nombre={p.nombre}
              descripcion={p.descripcion}
              giro={t(`asistente.giro.giros.${p.giro}`)}
              miniatura={<MiniaturaSitio tema={p.tema} />}
              seleccionada={seleccionada === p.id}
              onSeleccionar={() => onSeleccionar(p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
