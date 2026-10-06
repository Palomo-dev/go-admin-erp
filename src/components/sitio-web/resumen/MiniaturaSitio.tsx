'use client';

/**
 * Miniatura esquemática de un sitio con los colores y fuentes de una plantilla
 * (Figma A/02b, A/03b: encabezado, portada con título y botón, tres tarjetas).
 * Los colores son DATOS de la plantilla del cliente: solo existen aquí dentro y
 * nunca tiñen el cromo del ERP. Decorativa (`aria-hidden`): quien la usa
 * nombra la plantilla en texto.
 */
import { estilosTema, type TemaVistaSitio } from '../ui/temaVistaSitio';
import { cn } from '@/utils/Utils';

export function MiniaturaSitio({ tema, className }: { tema: TemaVistaSitio; className?: string }) {
  const e = estilosTema(tema);
  return (
    <span aria-hidden="true" className={cn('flex size-full flex-col overflow-hidden', className)} style={e.base}>
      <span className="flex items-center justify-between px-[6%] py-[4%]" style={e.secundario}>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-[2px]" style={e.logo} />
          <span className="h-1 w-8 rounded-full" style={{ backgroundColor: tema.texto, opacity: 0.85 }} />
        </span>
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-0.5 w-3 rounded-full" style={{ backgroundColor: tema.textoSuave ?? tema.texto, opacity: 0.7 }} />
          ))}
        </span>
      </span>
      <span className="flex flex-1 flex-col items-center justify-center gap-1.5 px-[10%]">
        <span className="h-1.5 w-2/5 rounded-full" style={{ backgroundColor: tema.texto }} />
        <span className="h-1 w-1/4 rounded-full" style={{ backgroundColor: tema.textoSuave ?? tema.texto, opacity: 0.7 }} />
        <span className="mt-0.5 h-2 w-1/6" style={e.boton} />
      </span>
      <span className="grid grid-cols-3 gap-[3%] px-[6%] pb-[5%]">
        {[0, 1, 2].map((i) => (
          <span key={i} className="flex flex-col gap-1 rounded-[3px] p-1" style={e.secundario}>
            <span className="aspect-[4/3] w-full rounded-[2px]" style={{ backgroundColor: tema.linea ?? tema.textoSuave }} />
            <span className="h-0.5 w-3/4 rounded-full" style={{ backgroundColor: tema.texto, opacity: 0.8 }} />
            <span className="h-0.5 w-1/3 rounded-full" style={e.boton} />
          </span>
        ))}
      </span>
    </span>
  );
}
