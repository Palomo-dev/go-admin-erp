'use client';

import { clasesBoton, FormField } from '@/components/kit';
import type { ContentFieldDef } from '@/lib/services/websitePageBuilderService';

const FILAS = ['top', 'middle', 'bottom'];
const COLUMNAS = ['left', 'center', 'right'];
const NOMBRES: Record<string, string> = { top: 'Arriba', middle: 'Centro', bottom: 'Abajo', left: 'izquierda', center: 'centro', right: 'derecha' };

/** Composición del botón del kit; guarda la posición completa, sin escribir al montar. */
export function CampoAlineacion({ campo, valor, onCambiar, deshabilitado }: { campo: ContentFieldDef; valor: unknown; onCambiar: (valor: unknown) => void; deshabilitado?: boolean }) {
  const guardado = typeof valor === 'string' ? valor : String(campo.defaultValue ?? 'middle-center');
  const actual = COLUMNAS.includes(guardado) ? `middle-${guardado}` : guardado;
  return (
    <FormField etiqueta={campo.label} ayuda={campo.helpText}>
      <div role="radiogroup" aria-label={campo.label} className="grid w-fit grid-cols-3 gap-1">
        {FILAS.flatMap((fila) => COLUMNAS.map((columna) => {
          const posicion = `${fila}-${columna}`;
          return <button key={posicion} type="button" role="radio" aria-label={`${NOMBRES[fila]} ${NOMBRES[columna]}`} aria-checked={actual === posicion} tabIndex={actual === posicion ? 0 : -1} onKeyDown={(e) => {
            const delta = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 } as Record<string, number | undefined>)[e.key];
            if (delta === undefined) return;
            e.preventDefault();
            const n = (FILAS.indexOf(fila) * 3 + COLUMNAS.indexOf(columna) + delta + 9) % 9;
            onCambiar(`${FILAS[Math.floor(n / 3)]}-${COLUMNAS[n % 3]}`);
            (e.currentTarget.parentElement?.querySelectorAll('button')[n] as HTMLButtonElement | undefined)?.focus();
          }} disabled={deshabilitado} onClick={() => onCambiar(posicion)} className={`${clasesBoton({ variante: actual === posicion ? 'primario' : 'secundario', tamano: 'sm' })} size-8 p-0`}><span aria-hidden className="grid size-4 grid-cols-3 grid-rows-3">{Array.from({ length: 9 }, (_, i) => <span key={i} className={`m-px rounded-full ${i === FILAS.indexOf(fila) * 3 + COLUMNAS.indexOf(columna) ? 'bg-current' : 'bg-current opacity-20'}`} />)}</span></button>;
        }))}
      </div>
    </FormField>
  );
}
