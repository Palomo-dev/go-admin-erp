'use client';

/**
 * Color con chips + campo de color en «Personalizado»: «Color del ícono» de la rejilla de categorías
 * y «Color del separador» de la franja (con `vacio='inherit'`, «Del texto», que borra la clave).
 */
import { useId } from 'react';
import { ChipsOpcion } from '@/components/kit';
import { ColorField } from '@/components/sitio-web/ui/ColorField';
import type { ContentFieldDef } from '@/lib/services/websitePageBuilderService';
import { EtiquetaGrupo } from './PartesZonaGlobal';
import { chipColorTokens, hexColorIcono, valorColorIcono } from './iconoCategoriaLogica';

export function CampoColorIconoCategoria({
  campo,
  valor,
  colorInicial,
  fondo,
  vacio = 'category',
  onCambiar,
}: {
  campo: ContentFieldDef;
  valor: unknown;
  /** Con el que arranca «Personalizado» (el primario del tema). */
  colorInicial: string;
  fondo?: string;
  /** Chip que se ve sin valor guardado (o con uno inválido). */
  vacio?: string;
  onCambiar: (v: string | null) => void;
}) {
  const id = useId();
  const chip = chipColorTokens(valor, vacio);
  const hex = hexColorIcono(valor);
  return (
    <div className="flex flex-col gap-2">
      <EtiquetaGrupo id={id}>{campo.label}</EtiquetaGrupo>
      <ChipsOpcion
        aria-labelledby={id}
        opciones={(campo.options ?? []).map((o) => ({ valor: o.value, etiqueta: o.label }))}
        valor={chip}
        onValorChange={(v) => onCambiar(valorColorIcono(v, valor, colorInicial))}
      />
      {chip === 'custom' && hex && <ColorField etiqueta={campo.label} valor={hex} fondo={fondo} onCambiar={(v) => onCambiar(v)} />}
      {campo.helpText ? <p className="text-xs leading-4 text-fg-secondary">{campo.helpText}</p> : null}
    </div>
  );
}
