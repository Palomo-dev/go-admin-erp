'use client';

/**
 * Panel «Nuevo menú» (Figma D/04-10): nombre, dónde se muestra (Encabezado, Megamenú de un
 * enlace, Pie de página con su columna, Sin ubicación), en qué sitio se crea y con qué enlace
 * empieza (página, categoría del Inventario, enlace externo, WhatsApp o teléfono).
 */
import { useState } from 'react';
import { Plus, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { ChipsOpcion, FormField, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ICONO_TIPO_ENLACE_MENU } from '@/components/sitio-web/ui/MenuLinkRow';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '@/components/sitio-web/ui/iconosSitio';
import type { UbicacionMenu } from './operacionesMenu';
import { useTextosPaginas } from './textos';
import { TituloZona } from './TituloZona';

export type PrimerEnlace = 'pagina' | 'categoria' | 'externo' | 'contacto';
type Donde = UbicacionMenu['tipo'];

export interface DatosNuevoMenu {
  nombre: string;
  ubicacion: UbicacionMenu;
  primerEnlace: PrimerEnlace | null;
}

export interface FormularioNuevoMenuProps {
  /** Sitio donde se crea («Sede Norte», «Sitio principal»). */
  sitioNombre: string;
  /** Columnas que ya tiene el pie (para ofrecer «Columna n del pie»). */
  columnasPie: number;
  /** Ya hay menú en el encabezado (el nuevo lo reemplazaría). */
  hayEncabezado: boolean;
  onCrear: (datos: DatosNuevoMenu) => string | null;
  onCancelar: () => void;
}

/** Los mismos iconos que la fila del menú (MenuLinkRow): lo que se elige aquí se reconoce en el árbol. */
const TIPOS: { valor: PrimerEnlace; icono: LucideIcon }[] = [
  { valor: 'pagina', icono: ICONO_TIPO_ENLACE_MENU.pagina },
  { valor: 'categoria', icono: ICONO_TIPO_ENLACE_MENU.categoria },
  { valor: 'externo', icono: ICONO_TIPO_ENLACE_MENU.externo },
  { valor: 'contacto', icono: ICONO_TIPO_ENLACE_MENU.whatsapp },
];

export function FormularioNuevoMenu({ sitioNombre, columnasPie, hayEncabezado, onCrear, onCancelar }: FormularioNuevoMenuProps) {
  const t = useTextosPaginas();
  const [nombre, setNombre] = useState('');
  const [donde, setDonde] = useState<Donde>('pie');
  const maxColumna = Math.min(10, columnasPie + 1);
  const [columna, setColumna] = useState(maxColumna);
  const [primer, setPrimer] = useState<PrimerEnlace | null>(null);
  const [error, setError] = useState<string | null>(null);

  const crear = () => {
    const ubicacion: UbicacionMenu = donde === 'pie' ? { tipo: 'pie', columna } : { tipo: donde };
    const e = onCrear({ nombre, ubicacion, primerEnlace: primer });
    setError(e);
  };

  return (
    <div className="flex flex-col gap-4">
      <TituloZona icono={Plus}>{t('nuevoMenu.titulo')}</TituloZona>
      <FormField etiqueta={t('nuevoMenu.nombre')} obligatorio error={error}>
        <Input
          value={nombre}
          maxLength={200}
          autoFocus
          onChange={(e) => {
            setNombre(e.target.value);
            setError(null);
          }}
        />
      </FormField>
      <div className="flex flex-col gap-1.5">
        <span id="nuevo-menu-donde" className="text-sm font-medium text-fg">
          {t('nuevoMenu.donde')}
        </span>
        <ChipsOpcion<Donde>
          aria-labelledby="nuevo-menu-donde"
          valor={donde}
          onValorChange={setDonde}
          opciones={(['encabezado', 'megamenu', 'pie', 'sin'] as const).map((v) => ({ valor: v, etiqueta: t(`nuevoMenu.opciones.${v}`) }))}
        />
        {donde === 'encabezado' && hayEncabezado && <p className="text-xs text-fg-secondary">{t('nuevoMenu.reemplazaEncabezado')}</p>}
      </div>
      {donde === 'pie' && (
        <Select value={String(columna)} onValueChange={(v) => setColumna(Number(v))}>
          <SelectTrigger aria-label={t('nuevoMenu.columna', { n: columna })} className="h-10 rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: maxColumna }, (_, i) => i + 1).map((n) => (
              <SelectItem key={n} value={String(n)}>
                {t('nuevoMenu.columna', { n })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <p className="text-xs text-fg-secondary">{t('nuevoMenu.seCreaEn', { nombre: sitioNombre })}</p>

      <div className="flex flex-col gap-1.5">
        <span id="nuevo-menu-enlace" className="text-sm font-medium text-fg">
          {t('nuevoMenu.anadirEnlace')}
        </span>
        <div role="radiogroup" aria-labelledby="nuevo-menu-enlace" className="flex flex-col overflow-hidden rounded-xl border border-line">
          {TIPOS.map(({ valor, icono: Icono }) => {
            const activo = primer === valor;
            return (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => setPrimer(activo ? null : valor)}
                className={cn(
                  'flex items-start gap-3 border-b border-line px-4 py-3 text-left last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
                  activo ? 'bg-brand-tint' : 'bg-surface hover:bg-hover',
                )}
              >
                <Icono aria-hidden="true" className={cn('mt-0.5 shrink-0', CLASE_TAMANO_ICONO.fila, activo ? 'text-brand' : 'text-fg-secondary')} strokeWidth={TRAZO_ICONO} />
                <span className="flex flex-col">
                  <span className={cn('text-sm font-medium', activo ? 'text-brand-deep' : 'text-fg')}>{t(`nuevoMenu.tipos.${valor}`)}</span>
                  <span className="text-[13px] text-fg-secondary">{t(`nuevoMenu.tipos.${valor}Ayuda`)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className={clasesBoton({ variante: 'fantasma' })}>
          {t('nuevoMenu.cancelar')}
        </button>
        <button type="button" onClick={crear} className={clasesBoton({ variante: 'primario' })}>
          {t('nuevoMenu.crear')}
        </button>
      </div>
    </div>
  );
}
