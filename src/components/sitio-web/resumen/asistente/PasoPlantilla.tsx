'use client';

/**
 * Paso 2 «Plantilla» (Figma «Asistente / Paso 2 — plantilla de tienda: todas a la vista»,
 * aprobado el 2026-11-22; antes A/03b escritorio y A/03g móvil): filtros por giro (primero el
 * del sitio, luego «Todas») y TODAS las plantillas del catálogo de Diseño a la vista, sin «Ver
 * más». La miniatura es su Inicio diseñado cuando lo hay (las 11 de tienda) y, si no, el esquema
 * en sus colores. En tienda van primero las 4 clásicas renovadas y luego las 7 nuevas con
 * «Nueva». Seleccionar no guarda nada: «Siguiente» arma el sitio con la plantilla.
 */
import { useMemo, useState } from 'react';
import { ChipsOpcion, EmptyState } from '@/components/kit';
import type { GiroSitio } from '@/lib/website/onboardingSitio';
import { TemplateCard } from '../../ui/TemplateCard';
import { ICONO_GIRO_PLANTILLA } from '../../ui/iconosSitio';
import { MiniaturaPaginaDisenada, tienePaginasDisenadas } from '../../diseno/PaginasDisenadas';
import { MiniaturaSitio } from '../MiniaturaSitio';
import {
  girosConPlantillas,
  PLANTILLAS_CATALOGO_ASISTENTE,
  plantillasCatalogoDelGiro,
  type PlantillaCatalogoAsistente,
} from './catalogoAsistente';
import { EncabezadoPaso } from './EncabezadoPaso';
import { useTextosResumen } from '../textos';
import { useTextosDiseno } from '../../diseno/textos';

export interface PasoPlantillaProps {
  giro: GiroSitio;
  seleccionada: string | null;
  onSeleccionar: (plantilla: PlantillaCatalogoAsistente) => void;
  catalogo?: readonly PlantillaCatalogoAsistente[];
  /** El sitio ya está publicado: de la plantilla se toman solo colores y fuentes (se avisa). */
  soloEstilo?: boolean;
}

type Filtro = GiroSitio | 'todas';

export function PasoPlantilla({ giro, seleccionada, onSeleccionar, catalogo = PLANTILLAS_CATALOGO_ASISTENTE, soloEstilo }: PasoPlantillaProps) {
  const t = useTextosResumen();
  const td = useTextosDiseno();
  // Solo los giros del asistente tienen chip; transporte y parqueadero salen en «Todas».
  const giros = useMemo<GiroSitio[]>(() => girosConPlantillas(catalogo).filter((g) => g !== 'otro'), [catalogo]);
  const inicial: Filtro = giros.includes(giro) ? giro : 'todas';
  const [filtro, setFiltro] = useState<Filtro>(inicial);
  const opciones = [
    ...(giros.includes(giro) ? [giro] : []),
    ...giros.filter((g) => g !== giro),
  ].map((g) => ({ valor: g as Filtro, etiqueta: t(`asistente.giro.giros.${g}`) }));
  const lista = plantillasCatalogoDelGiro(filtro, giro, catalogo);
  const nombreGiro = t(`asistente.giro.giros.${giros.includes(giro) ? giro : 'otro'}`).toLowerCase();
  const descripcion = t(giro === 'tienda' ? 'asistente.plantilla.descripcionTienda' : 'asistente.plantilla.descripcion', { giro: nombreGiro });

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPaso paso="plantilla" titulo={t('asistente.plantilla.titulo')} descripcion={descripcion} />
      <ChipsOpcion
        opciones={[...opciones, { valor: 'todas', etiqueta: t('asistente.plantilla.todas') }]}
        valor={filtro}
        onValorChange={setFiltro}
        etiqueta={t('asistente.plantilla.filtros')}
      />
      {soloEstilo && <p className="text-[13px] leading-[18px] text-fg-secondary">{t('asistente.plantilla.soloEstilo')}</p>}
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
              // El chip con el giro del catálogo: transporte y parqueadero no son giros del asistente.
              giro={td(`plantillas.giro.${p.catalogo.giro}`)}
              iconoGiro={ICONO_GIRO_PLANTILLA[p.catalogo.giro]}
              miniatura={tienePaginasDisenadas(p.id) ? <MiniaturaPaginaDisenada plantillaId={p.id} nombre={p.nombre} /> : <MiniaturaSitio tema={p.tema} />}
              novedad={p.nueva ? t('asistente.plantilla.nueva') : undefined}
              seleccionada={seleccionada === p.id}
              onSeleccionar={() => onSeleccionar(p)}
              className="h-full"
            />
          ))}
        </div>
      )}
    </div>
  );
}
