'use client';

/**
 * Repetidor del inspector con piezas del kit (CONTAC-04): lista de elementos plegables con agregar,
 * duplicar, quitar y ordenar (subir/bajar o arrastrar). Cada campo del elemento usa `CampoSeccion`,
 * así que texto, lista, interruptor… salen con los mismos controles que el resto de la sección.
 * Nada se escribe al abrir: los `defaultItems` se muestran y se guardan con la primera edición.
 */
import { useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';
import { SeccionPlegable } from '@/components/kit';
import type { ContentFieldDef } from '@/lib/services/websitePageBuilderService';
import { useTextosEditor } from '../textos';
import { CampoSeccion, type CampoSeccionProps } from './CampoSeccion';

type Elemento = Record<string, unknown> & { id?: string };

const nuevoId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`);

/** ¿Se ve el campo dentro del elemento? (`showIf` contra el propio elemento; sin variante). */
export function campoElementoVisible(campo: ContentFieldDef, elemento: Elemento): boolean {
  const c = campo.showIf;
  if (!c?.field) return true;
  const v = elemento?.[c.field];
  if (c.equals !== undefined && v !== c.equals) return false;
  if (c.in && !c.in.includes(v)) return false;
  return true;
}

/** Operaciones puras del repetidor (se prueban sin pintar). Siempre devuelven elementos con id. */
export function operarRepetidor(
  lista: readonly Elemento[],
  op: { tipo: 'agregar'; campos: readonly ContentFieldDef[] } | { tipo: 'duplicar' | 'quitar'; i: number } | { tipo: 'mover'; de: number; a: number } | { tipo: 'editar'; i: number; clave: string; valor: unknown } | { tipo: 'reemplazar'; i: number; elemento: Elemento },
): Elemento[] {
  const base = lista.map((e) => (e.id ? { ...e } : { ...e, id: nuevoId() }));
  switch (op.tipo) {
    case 'agregar': {
      const e: Elemento = { id: nuevoId() };
      for (const f of op.campos) if (f.defaultValue !== undefined) e[f.key] = f.defaultValue;
      return [...base, e];
    }
    case 'duplicar':
      return [...base.slice(0, op.i + 1), { ...base[op.i], id: nuevoId() }, ...base.slice(op.i + 1)];
    case 'quitar':
      return base.filter((_, i) => i !== op.i);
    case 'mover': {
      if (op.a < 0 || op.a >= base.length || op.de === op.a) return base;
      const sig = [...base];
      const [m] = sig.splice(op.de, 1);
      sig.splice(op.a, 0, m);
      return sig;
    }
    case 'editar':
      return base.map((e, i) => (i === op.i ? { ...e, [op.clave]: op.valor } : e));
    case 'reemplazar':
      return base.map((e, i) => (i === op.i ? { ...op.elemento, id: e.id } : e));
  }
}

const boton = 'inline-flex size-8 items-center justify-center rounded-md text-fg-secondary hover:bg-surface-hover hover:text-fg disabled:opacity-40';

export function RepetidorSeccion({
  campo,
  valor,
  onCambiar,
  ...resto
}: Omit<CampoSeccionProps, 'contenido' | 'onCambiarContenido'>) {
  const t = useTextosEditor();
  const guardados = Array.isArray(valor) ? (valor as Elemento[]) : [];
  const porDefecto = guardados.length === 0 && !!campo.defaultItems?.length;
  const lista: Elemento[] = porDefecto ? (campo.defaultItems as Elemento[]) : guardados;
  // La tienda no usa los sugeridos: el panel dice lo que ella pinta y cuenta 0.
  const vacioEnTienda = porDefecto && !!campo.emptyStoreText;
  const campos = campo.itemFields ?? [];
  const claveEtiqueta = campo.itemLabelKey || campos[0]?.key;
  const [abierto, setAbierto] = useState<number | null>(null);
  const [arrastrado, setArrastrado] = useState<number | null>(null);
  const lleno = !!campo.maxItems && lista.length >= campo.maxItems;
  const operar = (op: Parameters<typeof operarRepetidor>[1]) => onCambiar(operarRepetidor(lista, op));
  const des = resto.deshabilitado;

  return (
    <div className="flex flex-col gap-2" role="group" aria-label={campo.label}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium leading-[18px] text-fg">
          {campo.label} <span className="text-fg-secondary">({vacioEnTienda ? 0 : lista.length})</span>
        </p>
        <button type="button" className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-accent hover:bg-surface-hover disabled:opacity-40" disabled={des || lleno} onClick={() => { operar({ tipo: 'agregar', campos }); setAbierto(lista.length); }}>
          <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} /> {t('repetidor.agregar')}
        </button>
      </div>
      {campo.helpText ? <p className="text-xs leading-4 text-fg-secondary">{campo.helpText}</p> : null}
      {porDefecto ? <p className="text-xs leading-4 text-fg-secondary">{vacioEnTienda ? t('repetidor.vacioEnTienda', { texto: campo.emptyStoreText as string }) : t('repetidor.porDefecto')}</p> : null}
      {lista.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-3 text-center text-xs text-fg-secondary">{t('repetidor.vacio')}</p>
      ) : (
        lista.map((e, i) => {
          const etiqueta = (claveEtiqueta && typeof e[claveEtiqueta] === 'string' && (e[claveEtiqueta] as string).trim()) || t('repetidor.elemento', { campo: campo.label, n: i + 1 });
          return (
            <div
              key={e.id ?? `i-${i}`}
              draggable={!des}
              onDragStart={(ev) => { setArrastrado(i); ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', String(i)); }}
              onDragOver={(ev) => { if (arrastrado !== null) ev.preventDefault(); }}
              onDrop={(ev) => { ev.preventDefault(); if (arrastrado !== null && arrastrado !== i) operar({ tipo: 'mover', de: arrastrado, a: i }); setArrastrado(null); }}
              onDragEnd={() => setArrastrado(null)}
              className={arrastrado === i ? 'opacity-50' : undefined}
            >
              <SeccionPlegable titulo={etiqueta} abierta={abierto === i} onAbiertaChange={(a) => setAbierto(a ? i : null)}>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-end gap-0.5">
                    <button type="button" className={boton} aria-label={t('repetidor.subir')} title={t('repetidor.subir')} disabled={des || i === 0} onClick={() => { operar({ tipo: 'mover', de: i, a: i - 1 }); setAbierto(i - 1); }}><ArrowUp aria-hidden="true" className="size-4" strokeWidth={1.5} /></button>
                    <button type="button" className={boton} aria-label={t('repetidor.bajar')} title={t('repetidor.bajar')} disabled={des || i === lista.length - 1} onClick={() => { operar({ tipo: 'mover', de: i, a: i + 1 }); setAbierto(i + 1); }}><ArrowDown aria-hidden="true" className="size-4" strokeWidth={1.5} /></button>
                    <button type="button" className={boton} aria-label={t('repetidor.duplicar')} title={t('repetidor.duplicar')} disabled={des || lleno} onClick={() => { operar({ tipo: 'duplicar', i }); setAbierto(i + 1); }}><Copy aria-hidden="true" className="size-4" strokeWidth={1.5} /></button>
                    <button type="button" className={`${boton} hover:text-danger`} aria-label={t('repetidor.quitar')} title={t('repetidor.quitar')} disabled={des} onClick={() => { operar({ tipo: 'quitar', i }); setAbierto(null); }}><Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} /></button>
                  </div>
                  {campos.filter((f) => campoElementoVisible(f, e)).map((f) => (
                    <CampoSeccion
                      key={f.key}
                      {...resto}
                      campo={f}
                      valor={e[f.key]}
                      contenido={e}
                      onCambiar={(v) => operar({ tipo: 'editar', i, clave: f.key, valor: v })}
                      onCambiarContenido={(c) => onCambiar(operarRepetidor(lista, { tipo: 'reemplazar', i, elemento: c }))}
                    />
                  ))}
                </div>
              </SeccionPlegable>
            </div>
          );
        })
      )}
    </div>
  );
}
