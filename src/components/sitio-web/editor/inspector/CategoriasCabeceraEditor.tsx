'use client';

/**
 * Dos controles del panel Encabezado (Figma «16 Sitio web» 3294:102190 y 3298:97349, aprobados el
 * 2026-11-25). Lo que hoy se ve es el valor por defecto: ninguna tienda cambia sola.
 *
 * - `CategoriasEnMenuCelular` (Celular): cómo se ve cada categoría en los menús del celular.
 * - `ContenidoBotonCategorias` (Contenido › Botón de categorías): qué lista el botón y el celular.
 *
 * El lienzo lo pinta en vivo (las dos opciones son del contrato: `goadmin:settings`). Cambiar de
 * menú armado sí necesita guardar, como en Páginas › Menús. Lógica en `categoriasCabeceraLogica.ts`.
 */
import { useId, type ReactNode } from 'react';
import { ExternalLink, Link2 } from 'lucide-react';
import { AvisoTonal } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/utils/Utils';
import { RUTA_CATEGORIAS_INVENTARIO } from '@/components/sitio-web/paginas/InspectorEnlace';
import { useTextosEditor } from '../textos';
import { InsigniaNuevo, TituloBloque } from './PartesZonaGlobal';
import type { MenuDisponible } from './InspectorEncabezado';
import {
  CONTENIDOS_BOTON,
  ESTILOS_CATEGORIAS,
  automaticoUsa,
  cambioContenidoBoton,
  cambioEstiloCategorias,
  estiloCategoriasMovil,
  fuenteBotonCategorias,
  menuDelBoton,
  menuGuardadoSinUsar,
  tarjetasComoLista,
} from './categoriasCabeceraLogica';
import { composicionCabecera } from '@/lib/website/v2/categoriasCabecera';

type Cambiar = (c: Record<string, unknown>) => void;
const SIN_MENU = '__ninguno';

/** Tarjeta de opción con radio, título, insignia y ayuda (mismo dibujo que «Origen de las reseñas»). */
function OpcionRadio({
  seleccionada,
  onElegir,
  titulo,
  ayuda,
  insignia,
  miniatura,
}: {
  seleccionada: boolean;
  onElegir: () => void;
  titulo: string;
  ayuda: string;
  insignia?: ReactNode;
  miniatura?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={seleccionada}
      onClick={onElegir}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-action focus-visible:ring-offset-1',
        seleccionada ? 'border-2 border-brand-action bg-brand-tint' : 'border-line bg-surface hover:bg-hover',
      )}
    >
      <span aria-hidden="true" className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2', seleccionada ? 'border-brand-action' : 'border-line-strong')}>
        {seleccionada && <span className="size-2 rounded-full bg-brand-action" />}
      </span>
      {miniatura}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-fg">
          {titulo}
          {insignia}
        </span>
        <span className="text-[11px] leading-[14px] text-fg-muted">{ayuda}</span>
      </span>
    </button>
  );
}

function InsigniaGris({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-surface-muted px-1.5 py-px text-[10px] font-medium text-fg-secondary">{children}</span>;
}

/** Dibujo de cada estilo (Figma A): decorativo. */
function MiniaturaEstilo({ estilo }: { estilo: (typeof ESTILOS_CATEGORIAS)[number] }) {
  const linea = <span className="h-1 w-8 rounded-full bg-line-strong" />;
  return (
    <span aria-hidden="true" className="flex h-12 w-16 shrink-0 flex-col justify-center gap-1.5 rounded-md border border-line bg-surface px-1.5">
      {estilo === 'tarjetas' ? (
        <span className="grid grid-cols-2 gap-1">
          {['#1E3A8A', '#F59E0B', '#FACC15', '#7C3AED'].map((c) => (
            <span key={c} className="h-3.5 rounded-sm" style={{ backgroundColor: c }} />
          ))}
        </span>
      ) : (
        ['#1E3A8A', '#F59E0B', '#DC2626'].map((c) => (
          <span key={c} className="flex items-center gap-1.5">
            {estilo === 'redonda' ? <span className="size-2 rounded-full" style={{ backgroundColor: c }} /> : <span className="size-2 rounded-[2px] border border-fg-muted" />}
            {linea}
          </span>
        ))
      )}
    </span>
  );
}

function EnlaceInventario() {
  const t = useTextosEditor();
  return (
    <a href={RUTA_CATEGORIAS_INVENTARIO} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-brand-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-action">
      <ExternalLink aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
      {t('zonaGlobal.categoriasCabecera.editarInventario')}
    </a>
  );
}

/** Celular › «Categorías en el menú» (Figma 3294:102190). */
export function CategoriasEnMenuCelular({ ajustes: a, cambiar }: { ajustes: Record<string, unknown>; cambiar: Cambiar }) {
  const t = useTextosEditor();
  const id = useId();
  const tc = (k: string, v?: Record<string, string | number>) => t(`zonaGlobal.categoriasCabecera.estilo.${k}`, v);
  const estilo = estiloCategoriasMovil(a);
  const comoLista = tarjetasComoLista(a);
  return (
    <section className="flex flex-col gap-2" aria-labelledby={id} data-bloque="categorias-en-menu">
      <span className="flex items-center gap-2">
        <span id={id}><TituloBloque>{tc('titulo')}</TituloBloque></span>
        <InsigniaNuevo />
      </span>
      <p className="text-[11px] leading-[14px] text-fg-muted">{tc('ayuda')}</p>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-col gap-2">
        {ESTILOS_CATEGORIAS.map((v) => (
          <OpcionRadio
            key={v}
            seleccionada={estilo === v}
            onElegir={() => { if (v !== estilo) cambiar(cambioEstiloCategorias(v)); }}
            titulo={tc(`opcion.${v}.titulo`)}
            ayuda={tc(`opcion.${v}.ayuda`)}
            insignia={v === 'icono' ? <InsigniaGris>{tc('porDefecto')}</InsigniaGris> : undefined}
            miniatura={<MiniaturaEstilo estilo={v} />}
          />
        ))}
      </div>
      {comoLista && (
        <AvisoTonal compacto tono="informacion" titulo={tc('avisoTarjetas', { menu: t(`zonaGlobal.movilEncabezado.menuOpcion.${comoLista}`) })} />
      )}
      <EnlaceInventario />
    </section>
  );
}

/** Contenido › «Contenido del botón» (Figma 3298:97349, opción B). */
export function ContenidoBotonCategorias({
  ajustes: a,
  cambiar,
  menus,
  onEditarMenus,
}: {
  ajustes: Record<string, unknown>;
  cambiar: Cambiar;
  menus: readonly MenuDisponible[];
  onEditarMenus: () => void;
}) {
  const t = useTextosEditor();
  const id = useId();
  const idMenu = useId();
  const tc = (k: string, v?: Record<string, string | number>) => t(`zonaGlobal.categoriasCabecera.contenido.${k}`, v);
  const fuente = fuenteBotonCategorias(a);
  const menu = menuDelBoton(a, menus);
  const sinUsar = menuGuardadoSinUsar(a, menus);
  const composicion = composicionCabecera(a);
  const claveComposicion = `zonaGlobal.diseno.composicion.${composicion}`;
  const nombreComposicion = t(claveComposicion) === claveComposicion ? composicion : t(claveComposicion);
  return (
    <div className="flex flex-col gap-2" data-bloque="contenido-boton">
      <span className="flex items-center gap-2">
        <span id={id} className="text-[13px] font-medium leading-[18px] text-fg">{tc('titulo')}</span>
        <InsigniaNuevo />
      </span>
      <p className="text-[11px] leading-[14px] text-fg-muted">{tc('ayuda')}</p>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-col gap-2">
        {CONTENIDOS_BOTON.map((v) => (
          <OpcionRadio
            key={v}
            seleccionada={fuente === v}
            onElegir={() => { if (v !== fuente) cambiar(cambioContenidoBoton(a, v)); }}
            titulo={tc(`opcion.${v}.titulo`)}
            ayuda={v === 'auto' ? tc(`opcion.auto.ahora.${automaticoUsa(a)}`) : tc(`opcion.${v}.ayuda`)}
            insignia={v === 'auto' ? <InsigniaGris>{tc('comoHoy')}</InsigniaGris> : undefined}
          />
        ))}
      </div>

      {fuente === 'menu' && (
        <div className="flex flex-col gap-1.5 pl-6">
          <span id={idMenu} className="sr-only">{tc('menu')}</span>
          <Select value={menu?.id ?? SIN_MENU} onValueChange={(v) => cambiar({ header_mega_menu_id: v === SIN_MENU ? null : v })}>
            <SelectTrigger aria-labelledby={idMenu} className="h-10">
              <SelectValue placeholder={tc('elegirMenu')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SIN_MENU}>{tc('sinMenu')}</SelectItem>
              {menus.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button type="button" onClick={onEditarMenus} className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-brand-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-action">
            <Link2 aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
            {tc('editarMenus')}
          </button>
          {!menu && <p className="text-[11px] leading-[14px] text-fg-muted">{tc('sinMenuAyuda')}</p>}
          <AvisoTonal compacto tono="informacion" titulo={tc('celularTambien')} />
        </div>
      )}

      {sinUsar && (
        <AvisoTonal
          compacto
          tono="advertencia"
          titulo={tc('aviso', { menu: sinUsar.name, composicion: nombreComposicion })}
          accion={{ etiqueta: tc('usarlo'), onClick: () => cambiar(cambioContenidoBoton(a, 'menu')) }}
        />
      )}
    </div>
  );
}
