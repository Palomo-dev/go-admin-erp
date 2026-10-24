'use client';

/**
 * Paneles «Paginación» y «Carrusel» del inspector y de Estilos globales.
 * «Usar ajuste global» (solo en la sección) es el valor por defecto: no escribe
 * nada y el listado se ve como hoy.
 */
import { type ReactNode } from 'react';
import type { ParcialCarrusel, ParcialPaginacion } from '@/lib/website/v2/paginacionCarrusel';
import {
  ALINEACIONES,
  ESTILOS_FLECHA,
  ESTILOS_PAGINACION,
  FORMAS_PAGINACION,
  INDICADORES,
  POSICIONES_FLECHA,
  POSICIONES_INDICADOR,
  TAMANOS,
  clasesPaginacion,
  numerosDePagina,
  resolverPaginacion,
} from '@/lib/website/v2/paginacionCarrusel';

function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">
      <span className="font-medium text-fg">{etiqueta}</span>
      {children}
    </label>
  );
}

const control = 'h-9 rounded-lg border border-line bg-surface px-2 text-[13px] text-fg';

export function PanelPaginacion({
  valor,
  onCambiar,
  usarGlobal,
  onUsarGlobal,
  color,
  deshabilitado,
}: {
  valor: ParcialPaginacion | null;
  onCambiar: (p: ParcialPaginacion) => void;
  usarGlobal?: boolean;
  onUsarGlobal?: (v: boolean) => void;
  color: string;
  deshabilitado?: boolean;
}) {
  const bloqueado = deshabilitado || usarGlobal === true;
  const set = (parcial: Partial<ParcialPaginacion>) => onCambiar({ ...(valor ?? {}), ...parcial });
  const muestra = resolverPaginacion({ legado: 'grilla', porPagina: valor?.porPaginaEscritorio ?? 12 }, null, { ...(valor ?? {}), usar_global: false }, false);
  const clases = clasesPaginacion({ ...muestra, activo: true });
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line p-3" aria-label="Paginación">
      <h3 className="text-[13px] font-semibold text-fg">Paginación</h3>
      {onUsarGlobal && (
        <label className="flex items-center gap-2 text-[13px] text-fg">
          <input type="checkbox" checked={usarGlobal !== false} onChange={(e) => onUsarGlobal(e.target.checked)} disabled={deshabilitado} />
          Usar ajuste global
        </label>
      )}
      <div className={bloqueado ? 'pointer-events-none opacity-50' : 'flex flex-col gap-3'}>
        <div className="grid grid-cols-2 gap-2">
          <Fila etiqueta="Por página, escritorio">
            <input className={control} type="number" min={4} max={60} value={valor?.porPaginaEscritorio ?? 12} onChange={(e) => set({ porPaginaEscritorio: Number(e.target.value) })} />
          </Fila>
          <Fila etiqueta="Por página, móvil">
            <input className={control} type="number" min={4} max={60} value={valor?.porPaginaMovil ?? 12} onChange={(e) => set({ porPaginaMovil: Number(e.target.value) })} />
          </Fila>
        </div>
        <Fila etiqueta="Estilo">
          <select className={control} value={valor?.estilo ?? 'numerada'} onChange={(e) => set({ estilo: e.target.value as ParcialPaginacion['estilo'] })}>
            {ESTILOS_PAGINACION.map((e) => <option key={e} value={e}>{etiquetaEstilo(e)}</option>)}
          </select>
        </Fila>
        <Fila etiqueta="Forma">
          <select className={control} value={valor?.forma ?? 'semi'} onChange={(e) => set({ forma: e.target.value as ParcialPaginacion['forma'] })}>
            {FORMAS_PAGINACION.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </Fila>
        <div className="grid grid-cols-3 gap-2">
          <Fila etiqueta="Activo"><input className={control} type="color" value={valor?.colorActivo ?? color} onChange={(e) => set({ colorActivo: e.target.value })} /></Fila>
          <Fila etiqueta="Inactivo"><input className={control} type="color" value={valor?.colorInactivo ?? '#6b7280'} onChange={(e) => set({ colorInactivo: e.target.value })} /></Fila>
          <Fila etiqueta="Hover"><input className={control} type="color" value={valor?.colorHover ?? '#f3f4f6'} onChange={(e) => set({ colorHover: e.target.value })} /></Fila>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Fila etiqueta="Tamaño">
            <select className={control} value={valor?.tamano ?? 'md'} onChange={(e) => set({ tamano: e.target.value as ParcialPaginacion['tamano'] })}>
              {TAMANOS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Fila>
          <Fila etiqueta="Alineación">
            <select className={control} value={valor?.alineacion ?? 'centro'} onChange={(e) => set({ alineacion: e.target.value as ParcialPaginacion['alineacion'] })}>
              {ALINEACIONES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Fila>
        </div>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={valor?.mostrarExtremos !== false} onChange={(e) => set({ mostrarExtremos: e.target.checked })} /> Primera y última página</label>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={valor?.mostrarContador === true} onChange={(e) => set({ mostrarContador: e.target.checked })} /> Mostrar «Mostrando 1–24 de 400»</label>
        <Fila etiqueta="Texto anterior"><input className={control} value={valor?.textoAnterior ?? ''} placeholder="Anterior" onChange={(e) => set({ textoAnterior: e.target.value })} /></Fila>
        <Fila etiqueta="Texto siguiente"><input className={control} value={valor?.textoSiguiente ?? ''} placeholder="Siguiente" onChange={(e) => set({ textoSiguiente: e.target.value })} /></Fila>
        <Fila etiqueta="Texto cargar más"><input className={control} value={valor?.textoCargarMas ?? ''} placeholder="Cargar más" onChange={(e) => set({ textoCargarMas: e.target.value })} /></Fila>
        <div className={clases.contenedor} aria-hidden="true">
          {numerosDePagina(3, 17, valor?.mostrarExtremos !== false).map((n, i) => (
            <span key={i} className={clases.numero} style={n === 3 ? { background: valor?.colorActivo ?? color, color: '#fff' } : undefined}>{n}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PanelCarrusel({
  valor,
  onCambiar,
  usarGlobal,
  onUsarGlobal,
  deshabilitado,
}: {
  valor: ParcialCarrusel | null;
  onCambiar: (p: ParcialCarrusel) => void;
  usarGlobal?: boolean;
  onUsarGlobal?: (v: boolean) => void;
  deshabilitado?: boolean;
}) {
  const bloqueado = deshabilitado || usarGlobal === true;
  const set = (parcial: Partial<ParcialCarrusel>) => onCambiar({ ...(valor ?? {}), ...parcial });
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line p-3" aria-label="Carrusel">
      <h3 className="text-[13px] font-semibold text-fg">Carrusel</h3>
      {onUsarGlobal && (
        <label className="flex items-center gap-2 text-[13px] text-fg">
          <input type="checkbox" checked={usarGlobal !== false} onChange={(e) => onUsarGlobal(e.target.checked)} disabled={deshabilitado} />
          Usar ajuste global
        </label>
      )}
      <div className={bloqueado ? 'pointer-events-none opacity-50 flex flex-col gap-3' : 'flex flex-col gap-3'}>
        <Fila etiqueta="Indicador">
          <select className={control} value={valor?.indicador ?? 'puntos'} onChange={(e) => set({ indicador: e.target.value as ParcialCarrusel['indicador'] })}>
            {INDICADORES.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </Fila>
        <div className="grid grid-cols-2 gap-2">
          <Fila etiqueta="Posición">
            <select className={control} value={valor?.posicionIndicador ?? 'abajo_fuera'} onChange={(e) => set({ posicionIndicador: e.target.value as ParcialCarrusel['posicionIndicador'] })}>
              {POSICIONES_INDICADOR.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Fila>
          <Fila etiqueta="Alineación">
            <select className={control} value={valor?.alineacionIndicador ?? 'centro'} onChange={(e) => set({ alineacionIndicador: e.target.value as ParcialCarrusel['alineacionIndicador'] })}>
              {ALINEACIONES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Fila>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Fila etiqueta="Color activo"><input className={control} type="color" value={valor?.colorActivo ?? '#111827'} onChange={(e) => set({ colorActivo: e.target.value })} /></Fila>
          <Fila etiqueta="Color inactivo"><input className={control} type="color" value={valor?.colorInactivo ?? '#d1d5db'} onChange={(e) => set({ colorInactivo: e.target.value })} /></Fila>
        </div>
        <Fila etiqueta="Tamaño del indicador">
          <select className={control} value={valor?.tamanoIndicador ?? 'md'} onChange={(e) => set({ tamanoIndicador: e.target.value as ParcialCarrusel['tamanoIndicador'] })}>
            {TAMANOS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Fila>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={valor?.flechasEscritorio !== false} onChange={(e) => set({ flechasEscritorio: e.target.checked })} /> Flechas en escritorio</label>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={valor?.flechasMovil !== false} onChange={(e) => set({ flechasMovil: e.target.checked })} /> Flechas en móvil</label>
        <Fila etiqueta="Estilo de flechas">
          <select className={control} value={valor?.estiloFlechas ?? 'hover'} onChange={(e) => set({ estiloFlechas: e.target.value as ParcialCarrusel['estiloFlechas'] })}>
            {ESTILOS_FLECHA.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </Fila>
        <Fila etiqueta="Posición de flechas">
          <select className={control} value={valor?.posicionFlechas ?? 'lados_dentro'} onChange={(e) => set({ posicionFlechas: e.target.value as ParcialCarrusel['posicionFlechas'] })}>
            {POSICIONES_FLECHA.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Fila>
        <div className="grid grid-cols-2 gap-2">
          <Fila etiqueta="Fondo"><input className={control} type="color" value={valor?.fondoFlecha ?? '#ffffff'} onChange={(e) => set({ fondoFlecha: e.target.value })} /></Fila>
          <Fila etiqueta="Borde"><input className={control} type="color" value={valor?.bordeFlecha ?? '#e5e7eb'} onChange={(e) => set({ bordeFlecha: e.target.value })} /></Fila>
          <Fila etiqueta="Ícono"><input className={control} type="color" value={valor?.colorIcono ?? '#111827'} onChange={(e) => set({ colorIcono: e.target.value })} /></Fila>
          <Fila etiqueta="Tamaño">
            <select className={control} value={valor?.tamanoFlecha ?? 'md'} onChange={(e) => set({ tamanoFlecha: e.target.value as ParcialCarrusel['tamanoFlecha'] })}>
              {TAMANOS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Fila>
        </div>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={valor?.sombraFlecha !== false} onChange={(e) => set({ sombraFlecha: e.target.checked })} /> Sombra</label>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={valor?.autoplay === true} onChange={(e) => set({ autoplay: e.target.checked })} /> Autoplay</label>
        <Fila etiqueta="Segundos"><input className={control} type="number" min={1} max={15} value={valor?.segundos ?? 5} onChange={(e) => set({ segundos: Number(e.target.value) })} /></Fila>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={valor?.loop === true} onChange={(e) => set({ loop: e.target.checked })} /> Bucle</label>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={valor?.pausaHover !== false} onChange={(e) => set({ pausaHover: e.target.checked })} /> Pausa al pasar el mouse</label>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={valor?.arrastre !== false} onChange={(e) => set({ arrastre: e.target.checked })} /> Arrastre</label>
        <div className="grid grid-cols-3 gap-2">
          <Fila etiqueta="Visibles escritorio"><input className={control} type="number" min={1} max={8} value={valor?.visiblesEscritorio ?? 4} onChange={(e) => set({ visiblesEscritorio: Number(e.target.value) })} /></Fila>
          <Fila etiqueta="Tableta"><input className={control} type="number" min={1} max={6} value={valor?.visiblesTableta ?? 3} onChange={(e) => set({ visiblesTableta: Number(e.target.value) })} /></Fila>
          <Fila etiqueta="Móvil"><input className={control} type="number" min={1} max={3} value={valor?.visiblesMovil ?? 2} onChange={(e) => set({ visiblesMovil: Number(e.target.value) })} /></Fila>
        </div>
        <Fila etiqueta="Ítems por avance"><input className={control} type="number" min={1} max={8} value={valor?.avance ?? 1} onChange={(e) => set({ avance: Number(e.target.value) })} /></Fila>
      </div>
    </section>
  );
}

function etiquetaEstilo(e: string): string {
  if (e === 'numerada') return 'Numerada';
  if (e === 'compacta') return 'Página 3 de 17';
  if (e === 'cargar_mas') return 'Cargar más';
  if (e === 'infinito') return 'Scroll infinito';
  return 'Anterior / Siguiente';
}
