'use client';

/** «Color del ícono» de la rejilla de categorías: chips + campo de color en «Personalizado». */
import { useId } from 'react';
import { ChipsOpcion } from '@/components/kit';
import { ColorField } from '@/components/sitio-web/ui/ColorField';
import type { ContentFieldDef } from '@/lib/services/websitePageBuilderService';
import { EtiquetaGrupo } from './PartesZonaGlobal';
import { chipColorIcono, hexColorIcono, valorColorIcono, type ChipColorIcono } from './iconoCategoriaLogica';

export function CampoColorIconoCategoria({
  campo,
  valor,
  colorInicial,
  fondo,
  onCambiar,
}: {
  campo: ContentFieldDef;
  valor: unknown;
  /** Con el que arranca «Personalizado» (el primario del tema). */
  colorInicial: string;
  fondo?: string;
  onCambiar: (v: string) => void;
}) {
  const id = useId();
  const chip = chipColorIcono(valor);
  const hex = hexColorIcono(valor);
  return (
    <div className="flex flex-col gap-2">
      <EtiquetaGrupo id={id}>{campo.label}</EtiquetaGrupo>
      <ChipsOpcion
        aria-labelledby={id}
        opciones={(campo.options ?? []).map((o) => ({ valor: o.value, etiqueta: o.label }))}
        valor={chip}
        onValorChange={(v) => onCambiar(valorColorIcono(v as ChipColorIcono, valor, colorInicial))}
      />
      {chip === 'custom' && hex && <ColorField etiqueta={campo.label} valor={hex} fondo={fondo} onCambiar={(v) => onCambiar(v)} />}
      {campo.helpText ? <p className="text-xs leading-4 text-fg-secondary">{campo.helpText}</p> : null}
    </div>
  );
}
