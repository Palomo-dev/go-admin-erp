'use client';

/**
 * Estilo de tarjeta › Etiquetas › «Etiquetas propias»: lista ordenada de etiquetas con texto
 * propio («Originales»…) para TODOS los productos. Agregar, editar, ocultar, subir/bajar y quitar.
 * Cada una: texto, fondo, texto (vacío = contraste automático), esquina e ícono opcional.
 * Se pintan en la tarjeta común de la tienda y se apilan con descuento, nuevo y vendidos.
 */
import { useState } from 'react';
import { ArrowDown, ArrowUp, BadgeCheck, ListMinus, ShieldCheck, Star, Tag, TrendingUp, Zap, type LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { clasesBoton, type AccionFila } from '@/components/kit';
import { SortableRow } from '@/components/sitio-web/ui/SortableRow';
import { SelectKit } from './controlesKit';
import { ColorTema } from './PartesZonaGlobal';
import {
  ICONOS_ETIQUETA_PROPIA,
  MAX_ETIQUETAS_PROPIAS,
  MAX_TEXTO_ETIQUETA_PROPIA,
  POSICIONES_ETIQUETA_PROPIA,
  textoContraste,
  type EtiquetaPropiaTarjeta,
} from '@/lib/website/tarjetaProducto';

const ICONO: Record<(typeof ICONOS_ETIQUETA_PROPIA)[number], LucideIcon> = {
  check: BadgeCheck,
  shield: ShieldCheck,
  star: Star,
  zap: Zap,
  trending: TrendingUp,
};
const NOMBRE_ICONO: Record<string, string> = { '': 'Sin ícono', check: 'Verificado', shield: 'Escudo', star: 'Estrella', zap: 'Rayo', trending: 'Tendencia' };
const NOMBRE_POSICION: Record<string, string> = {
  top_left: 'Arriba izquierda',
  top_right: 'Arriba derecha',
  bottom_left: 'Abajo izquierda',
  bottom_right: 'Abajo derecha',
};

function mover<T>(lista: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= lista.length) return lista;
  const copia = [...lista];
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return copia;
}

function idNuevo(lista: EtiquetaPropiaTarjeta[]): string {
  let n = lista.length + 1;
  while (lista.some((e) => e.id === `et${n}`)) n += 1;
  return `et${n}`;
}

export function EtiquetasPropiasTarjeta({
  lista,
  onCambiar,
}: {
  lista: EtiquetaPropiaTarjeta[];
  /** Lista completa nueva; vacía = sin etiquetas propias (se borra la clave). */
  onCambiar: (lista: EtiquetaPropiaTarjeta[]) => void;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const poner = (id: string, cambio: Partial<EtiquetaPropiaTarjeta>) =>
    onCambiar(lista.map((e) => (e.id === id ? { ...e, ...cambio } : e)));

  const acciones = (e: EtiquetaPropiaTarjeta, i: number): AccionFila[] => [
    { id: 'subir', etiqueta: 'Subir', icono: ArrowUp, deshabilitada: i === 0, onSelect: () => onCambiar(mover(lista, i, -1)) },
    { id: 'bajar', etiqueta: 'Bajar', icono: ArrowDown, deshabilitada: i === lista.length - 1, onSelect: () => onCambiar(mover(lista, i, 1)) },
    { id: 'quitar', etiqueta: 'Quitar', icono: ListMinus, destructiva: true, separadorAntes: true, onSelect: () => onCambiar(lista.filter((x) => x.id !== e.id)) },
  ];

  return (
    <section className="flex flex-col gap-2" data-bloque="etiquetas-propias">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold text-fg">Etiquetas propias</span>
        <span className="text-[11px] leading-[14px] text-fg-muted">Salen en todos los productos y se apilan con descuento, nuevo y vendidos.</span>
      </div>
      {lista.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="Etiquetas propias">
          {lista.map((e, i) => (
            <li key={e.id} className="flex flex-col gap-2">
              <SortableRow
                etiqueta={e.label}
                icono={e.icon ? ICONO[e.icon] : Tag}
                detalle={NOMBRE_POSICION[e.position ?? 'top_right']}
                oculta={e.show === false}
                seleccionada={abierta === e.id}
                onSeleccionar={() => setAbierta(abierta === e.id ? null : e.id)}
                onAlternarVisible={() => poner(e.id, { show: e.show === false ? undefined : false })}
                acciones={acciones(e, i)}
                onMover={(d) => onCambiar(mover(lista, i, d))}
              />
              {abierta === e.id && (
                <div className="flex flex-col gap-2 rounded-md border border-border p-2">
                  <label className="flex flex-col gap-1 text-xs text-fg">
                    Texto de la etiqueta
                    <Input
                      value={e.label}
                      maxLength={MAX_TEXTO_ETIQUETA_PROPIA}
                      onChange={(ev) => ev.target.value.trim() && poner(e.id, { label: ev.target.value })}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <ColorTema etiqueta="Fondo" valor={e.bg ?? null} colorTema="#111827" onCambiar={(v) => poner(e.id, { bg: v ?? undefined })} />
                    <ColorTema etiqueta="Color del texto" valor={e.text ?? null} colorTema={textoContraste(e.bg ?? '#111827')} etiquetaNulo="Automático" onCambiar={(v) => poner(e.id, { text: v ?? undefined })} />
                  </div>
                  <span className="text-xs text-fg">Posición</span>
                  <SelectKit aria-label="Posición" value={e.position ?? 'top_right'} onChange={(ev) => poner(e.id, { position: ev.target.value as EtiquetaPropiaTarjeta['position'] })}>
                    {POSICIONES_ETIQUETA_PROPIA.map((p) => <option key={p} value={p}>{NOMBRE_POSICION[p]}</option>)}
                  </SelectKit>
                  <span className="text-xs text-fg">Ícono</span>
                  <SelectKit aria-label="Ícono" value={e.icon ?? ''} onChange={(ev) => poner(e.id, { icon: (ev.target.value || undefined) as EtiquetaPropiaTarjeta['icon'] })}>
                    {['', ...ICONOS_ETIQUETA_PROPIA].map((k) => <option key={k} value={k}>{NOMBRE_ICONO[k]}</option>)}
                  </SelectKit>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {lista.length < MAX_ETIQUETAS_PROPIAS && (
        <button
          type="button"
          className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
          onClick={() => {
            const nueva: EtiquetaPropiaTarjeta = { id: idNuevo(lista), label: 'Nueva etiqueta' };
            onCambiar([...lista, nueva]);
            setAbierta(nueva.id);
          }}
        >
          Agregar etiqueta
        </button>
      )}
    </section>
  );
}
