'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Copy, Plus, Trash2 } from 'lucide-react';
import { Select, FormField, clasesBoton } from '@/components/kit';
import type { ContentFieldDef } from '@/lib/services/websitePageBuilderService';
import { CampoSeccion, campoVisible, type CampoSeccionProps } from './CampoSeccion';

type Elemento = Record<string, unknown>;

/** Los predeterminados son una vista: visitar el panel no escribe el documento. */
export function elementosRepetidor(campo: ContentFieldDef, valor: unknown): Elemento[] {
  return (Array.isArray(valor) ? valor : campo.defaultItems ?? []).filter(
    (item): item is Elemento => !!item && typeof item === 'object' && !Array.isArray(item),
  );
}

export function CampoRepetidor(props: CampoSeccionProps) {
  const { campo, valor, onCambiar, deshabilitado } = props;
  const items = elementosRepetidor(campo, valor);
  const campos = campo.itemFields ?? [];
  const [abierto, setAbierto] = useState<number | null>(null);
  const etiqueta = (item: Elemento, i: number) => {
    const clave = campo.itemLabelKey ?? campos[0]?.key;
    const v = clave ? item[clave] : null;
    const opcion = campos.find((f) => f.key === clave)?.options?.find((o) => o.value === v);
    return opcion?.label || (typeof v === 'string' && v.trim()) || `${campo.label} ${i + 1}`;
  };
  const actualizar = (i: number, siguiente: Elemento) => onCambiar(items.map((item, n) => n === i ? siguiente : item));
  const mover = (i: number, delta: number) => {
    const siguiente = [...items];
    [siguiente[i], siguiente[i + delta]] = [siguiente[i + delta], siguiente[i]];
    onCambiar(siguiente);
    setAbierto(i + delta);
  };
  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-2 text-xs font-medium leading-4 text-fg">{campo.label} ({items.length})</legend>
      {campo.helpText && <p className="text-xs text-fg-secondary">{campo.helpText}</p>}
      {items.map((item, i) => (
        <div key={typeof item.id === 'string' ? item.id : `${campo.key}-${i}`} className="rounded-lg border border-line bg-surface">
          <div className="flex items-center gap-1 p-2">
            <button type="button" disabled={deshabilitado} aria-expanded={abierto === i} onClick={() => setAbierto(abierto === i ? null : i)} className={`${clasesBoton({ variante: 'fantasma', tamano: 'sm' })} min-w-0 flex-1 justify-start`}>
              <ChevronDown aria-hidden className={`size-4 shrink-0 ${abierto === i ? 'rotate-180' : ''}`} strokeWidth={1.5} />
              <span className="truncate">{etiqueta(item, i)}</span>
            </button>
            <button type="button" aria-label={`Subir ${etiqueta(item, i)}`} disabled={deshabilitado || i === 0} onClick={() => mover(i, -1)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}><ArrowUp aria-hidden className="size-4" strokeWidth={1.5} /></button>
            <button type="button" aria-label={`Bajar ${etiqueta(item, i)}`} disabled={deshabilitado || i === items.length - 1} onClick={() => mover(i, 1)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}><ArrowDown aria-hidden className="size-4" strokeWidth={1.5} /></button>
          </div>
          {abierto === i && (
            <div className="flex flex-col gap-3 border-t border-line p-3">
              {campos.filter((f) => campoVisible(f, item, '')).map((f) => (
                f.type === 'icon' && ['badges', 'card_buttons'].includes(campo.key) ? (
                  <FormField key={f.key} etiqueta={f.label}>
                    {(c) => <Select id={c.id} aria-labelledby={c.idEtiqueta} disabled={deshabilitado} valor={typeof item[f.key] === 'string' && item[f.key] ? String(item[f.key]) : 'sin-icono'} opciones={[
                      { valor: 'sin-icono', etiqueta: 'Sin icono' },
                      ...(campo.key === 'badges' ? ['Layers', 'TrendingUp', 'Zap', 'Star'] : ['Plus', 'Check', 'ShoppingBag', 'Heart', 'Eye', 'Share2', 'MessageCircle', 'Layers', 'Package', 'Star', 'TrendingUp', 'Zap']).map((icono) => ({ valor: icono, etiqueta: icono })),
                    ]} onValorChange={(v) => actualizar(i, { ...item, [f.key]: v === 'sin-icono' ? '' : v })} />}
                  </FormField>
                ) : <CampoSeccion key={f.key} {...props} campo={f} valor={item[f.key] ?? f.defaultValue} contenido={item} onCambiar={(v) => actualizar(i, { ...item, [f.key]: v })} onCambiarContenido={(v) => actualizar(i, v)} />
              ))}
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={deshabilitado || !!(campo.maxItems && items.length >= campo.maxItems)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => { const siguiente = [...items]; siguiente.splice(i + 1, 0, { ...item, id: crypto.randomUUID() }); onCambiar(siguiente); setAbierto(i + 1); }}><Copy aria-hidden className="size-4" strokeWidth={1.5} />Duplicar</button>
                <button type="button" disabled={deshabilitado} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => { onCambiar(items.filter((_, n) => n !== i)); setAbierto(null); }}><Trash2 aria-hidden className="size-4" strokeWidth={1.5} />Eliminar</button>
              </div>
            </div>
          )}
        </div>
      ))}
      <button type="button" disabled={deshabilitado || !!(campo.maxItems && items.length >= campo.maxItems)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => {
        const nuevo: Elemento = { id: crypto.randomUUID() };
        campos.forEach((f) => { if (f.defaultValue !== undefined) nuevo[f.key] = f.defaultValue; });
        onCambiar([...items, nuevo]); setAbierto(items.length);
      }}><Plus aria-hidden className="size-4" strokeWidth={1.5} />Agregar</button>
    </fieldset>
  );
}
