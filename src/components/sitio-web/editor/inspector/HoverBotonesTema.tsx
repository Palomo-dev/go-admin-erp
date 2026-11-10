'use client';

/**
 * Estilo del sitio › «Efecto al pasar el mouse» (Figma A3, `tema.tokens.hover`): Ninguno · Sutil ·
 * Expresivo para los botones de las secciones. «Ninguno» no guarda nada (lo de hoy). Qué escribe
 * cada opción está en `hoverBotonesLogica.ts`. Las mayúsculas de los botones NO van aquí: ya están
 * en «Botones de las secciones» (`diseno/BotonesSecciones.tsx`).
 */
import { useId } from 'react';
import { ChipsOpcion } from '@/components/kit';
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { useTextosEditor } from '../textos';
import { InsigniaNuevo } from './PartesZonaGlobal';
import { OPCIONES_HOVER_BOTONES, cambiarHoverBotones, leerHoverBotones, type OpcionHoverBotones } from './hoverBotonesLogica';

export interface HoverBotonesTemaProps {
  documento: DocumentoSitio;
  onCambiarDocumento: (cambiar: (d: DocumentoSitio) => DocumentoSitio) => void;
  deshabilitado?: boolean;
}

export function HoverBotonesTema({ documento, onCambiarDocumento, deshabilitado }: HoverBotonesTemaProps) {
  const t = useTextosEditor();
  const th = (k: string) => t(`estiloSitio.hover.${k}`);
  const id = useId();
  const valor = leerHoverBotones(documento);
  return (
    <section className="mt-4 flex flex-col gap-2 px-1" data-grupo="hover-botones">
      <h3 id={id} className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-fg">
        {th('titulo')}
        <InsigniaNuevo />
      </h3>
      <ChipsOpcion<OpcionHoverBotones>
        aria-labelledby={id}
        opciones={OPCIONES_HOVER_BOTONES.map((v) => ({ valor: v, etiqueta: th(`opcion.${v}`), deshabilitada: deshabilitado }))}
        valor={valor}
        onValorChange={(v) => {
          if (!deshabilitado && v !== valor) onCambiarDocumento((d) => cambiarHoverBotones(d, v));
        }}
      />
      <p className="text-[11px] leading-[14px] text-fg-muted">
        {th(`detalle.${valor}`)} {th('ayuda')}
      </p>
    </section>
  );
}
