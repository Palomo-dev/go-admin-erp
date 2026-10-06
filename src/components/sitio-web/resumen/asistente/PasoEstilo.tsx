'use client';

/**
 * Paso 3 «Estilo» (Figma A/03c escritorio, A/03h móvil): presets de estilo del
 * giro con su muestra («Aa», «Cocina de autor», botón «Reservar» y paleta), la
 * tarjeta «¿Usar los colores de tu logo?» y, en móvil, «Colores del logo» y
 * «Vista previa». El acento del logo se corrige hasta AA contra el fondo del
 * estilo; el servidor vuelve a validar el documento al guardar.
 */
import { useState } from 'react';
import { Eye } from 'lucide-react';
import { clasesBoton } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { StylePresetCard } from '../../ui/StylePresetCard';
import { acentoDesdeLogo } from '@/lib/website/v2/temaDesdePreset';
import type { GiroSitio } from '@/lib/website/onboardingSitio';
import { plantillasDelGiro, textoSobre, type PlantillaAsistente } from './catalogoAsistente';
import { colorDeAcento } from './logicaAsistente';
import { EncabezadoPaso } from './EncabezadoPaso';
import { useTextosResumen } from '../textos';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO, ICONO_GRUPO_ESTILO } from '../../ui/iconosSitio';

/** Lee los píxeles del logo en un lienzo pequeño (CORS anónimo). `null` si no se puede. */
export async function pixelesDeImagen(url: string, lado = 48): Promise<Uint8ClampedArray | null> {
  return new Promise((resolver) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const lienzo = document.createElement('canvas');
        lienzo.width = lado;
        lienzo.height = lado;
        const ctx = lienzo.getContext('2d');
        if (!ctx) return resolver(null);
        ctx.drawImage(img, 0, 0, lado, lado);
        resolver(ctx.getImageData(0, 0, lado, lado).data);
      } catch {
        resolver(null);
      }
    };
    img.onerror = () => resolver(null);
    img.src = url;
  });
}

export interface EstiloElegido {
  preset: PlantillaAsistente;
  /** Acento tomado del logo (ya con contraste AA); `null` = el del preset. */
  acentoLogo: string | null;
}

export interface PasoEstiloProps {
  giro: GiroSitio;
  elegido: EstiloElegido | null;
  onElegir: (estilo: EstiloElegido) => void;
  logoUrl: string | null;
  onVistaPrevia: () => void;
  catalogo?: readonly PlantillaAsistente[];
}

export function PasoEstilo({ giro, elegido, onElegir, logoUrl, onVistaPrevia, catalogo }: PasoEstiloProps) {
  const t = useTextosResumen();
  const delGiro = plantillasDelGiro(giro, catalogo);
  const presets = delGiro.length > 0 ? delGiro : plantillasDelGiro('todas', catalogo);
  const [leyendoLogo, setLeyendoLogo] = useState(false);
  const [avisoLogo, setAvisoLogo] = useState<string | null>(null);

  const usarLogo = async () => {
    const base = elegido?.preset ?? presets[0];
    if (!logoUrl || !base) {
      setAvisoLogo(t('asistente.estilo.logoSinLogo'));
      return;
    }
    setLeyendoLogo(true);
    const pixeles = await pixelesDeImagen(logoUrl);
    setLeyendoLogo(false);
    const color = pixeles ? colorDeAcento(pixeles) : null;
    const acento = color ? acentoDesdeLogo(color, base.muestra.fondo) : null;
    if (!acento) {
      setAvisoLogo(t('asistente.estilo.logoNoSePudo'));
      return;
    }
    setAvisoLogo(t('asistente.estilo.logoAplicado', { color: acento }));
    onElegir({ preset: base, acentoLogo: acento });
  };

  const muestraCon = (p: PlantillaAsistente, acento: string | null) =>
    acento ? { ...p.muestra, acento, textoAcento: textoSobre(acento), puntos: [p.muestra.texto, acento, p.muestra.fondo] as const } : p.muestra;

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPaso paso="estilo" titulo={t('asistente.estilo.titulo')} descripcion={t('asistente.estilo.descripcion')} />
      <div role="radiogroup" aria-label={t('asistente.estilo.titulo')} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {presets.map((p) => {
          const seleccionado = elegido?.preset.id === p.id;
          return (
            <StylePresetCard
              key={p.id}
              nombre={p.nombre}
              fuentes={p.fuentes}
              muestra={muestraCon(p, seleccionado ? elegido?.acentoLogo ?? null : null)}
              textoMuestra={t('asistente.estilo.textoMuestra')}
              textoBoton={t('asistente.estilo.botonMuestra')}
              seleccionado={seleccionado}
              onSeleccionar={() => onElegir({ preset: p, acentoLogo: null })}
            />
          );
        })}
      </div>
      {/* Escritorio: tarjeta del logo (A/03c). */}
      <div className="hidden flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 lg:flex">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-medium leading-5 text-fg">{t('asistente.estilo.logoTitulo')}</p>
          <p className="text-[13px] leading-[18px] text-fg-secondary">{t('asistente.estilo.logoDescripcion')}</p>
        </div>
        <button type="button" onClick={() => void usarLogo()} disabled={leyendoLogo} aria-busy={leyendoLogo || undefined} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
          <ICONO_GRUPO_ESTILO.colores aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          {t('asistente.estilo.logoBoton')}
        </button>
      </div>
      {/* Móvil (A/03h): dos botones a medias. */}
      <div className="grid grid-cols-2 gap-2 lg:hidden">
        <button type="button" onClick={() => void usarLogo()} disabled={leyendoLogo} className={cn(clasesBoton({ variante: 'secundario', tamano: 'md' }), 'w-full')}>
          <ICONO_GRUPO_ESTILO.colores aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          {t('asistente.estilo.logoBotonCorto')}
        </button>
        <button type="button" onClick={onVistaPrevia} className={cn(clasesBoton({ variante: 'secundario', tamano: 'md' }), 'w-full')}>
          <Eye aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          {t('asistente.vistaPreviaBoton')}
        </button>
      </div>
      {avisoLogo && (
        <p role="status" className="text-[13px] leading-[18px] text-fg-secondary">
          {avisoLogo}
        </p>
      )}
    </div>
  );
}
