'use client';

/**
 * Paneles «Paginación» y «Carrusel»: un solo componente por función, el mismo en
 * el inspector de cada sección (productos, ofertas, destacados, categorías…), en
 * Estilos del sitio y en Diseño. Piezas del kit (Figma v2): chips con ✓,
 * «Sigue el tema / Fijar color», interruptores y campos numéricos.
 *
 * «Usar ajuste global» (solo en la sección) es el valor por defecto: no escribe
 * nada, el listado se ve como hoy y el resto del panel se oculta.
 * Cada opción tiene efecto en la tienda (goadmin-websites `resolverPaginacion` /
 * `resolverCarrusel`). «Ítems por avance» no lo lee ningún carrusel: ya no se
 * pinta y, si estaba guardado, sale en «Ajustes de versiones anteriores».
 */
import { useId, type ReactNode } from 'react';
import { CampoNumero, ChipsOpcion } from '@/components/kit';
import { cn } from '@/utils/Utils';
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
import { useTextosEditor } from '../textos';
import { CampoTexto, ColorTema, EtiquetaGrupo, FilaInterruptor, TituloBloque } from './PartesZonaGlobal';
import { AjustesAnteriores } from './InspectorEncabezado';
import { aplicarCambioContenido } from './espaciadoSeccion';

type T = ReturnType<typeof useTextosEditor>;

function Chips<V extends string>({ etiqueta, opciones, valor, onCambiar, t, prefijo }: { etiqueta: string; opciones: readonly V[]; valor: V; onCambiar: (v: V) => void; t: T; prefijo: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <EtiquetaGrupo id={id}>{etiqueta}</EtiquetaGrupo>
      <ChipsOpcion aria-labelledby={id} opciones={opciones.map((o) => ({ valor: o, etiqueta: t(`${prefijo}.${o}`) }))} valor={valor} onValorChange={onCambiar} />
    </div>
  );
}

function Numero({ etiqueta, valor, porDefecto, minimo, maximo, onCambiar }: { etiqueta: string; valor: number | undefined; porDefecto: number; minimo: number; maximo: number; onCambiar: (v: number | undefined) => void }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <EtiquetaGrupo id={id}>{etiqueta}</EtiquetaGrupo>
      <CampoNumero
        aria-labelledby={id}
        valor={valor ?? null}
        placeholder={String(porDefecto)}
        decimales={0}
        minimo={minimo}
        maximo={maximo}
        alinear="izquierda"
        onValorChange={(v) => onCambiar(v == null ? undefined : Math.min(maximo, Math.max(minimo, Math.round(v))))}
      />
    </div>
  );
}

/** Cabecera común: título, «Usar ajuste global» y, si está apagado, el resto. */
function Panel({ titulo, usarGlobal, onUsarGlobal, deshabilitado, t, children }: { titulo: string; usarGlobal?: boolean; onUsarGlobal?: (v: boolean) => void; deshabilitado?: boolean; t: T; children: ReactNode }) {
  const oculto = onUsarGlobal != null && usarGlobal !== false;
  return (
    <section aria-label={titulo} className="flex flex-col gap-4 border-t border-line pt-4">
      <TituloBloque>{titulo}</TituloBloque>
      {onUsarGlobal && (
        <FilaInterruptor titulo={t('listas.usarGlobal')} ayuda={t('listas.usarGlobalAyuda')} valor={usarGlobal !== false} onCambiar={onUsarGlobal} deshabilitado={deshabilitado} />
      )}
      {!oculto && (
        <fieldset disabled={deshabilitado} className={cn('flex min-w-0 flex-col gap-4', deshabilitado && 'opacity-60')}>
          {children}
        </fieldset>
      )}
    </section>
  );
}

/** Quita las claves vacías: «Sigue el tema» o un campo vacío vuelven al valor de la tienda. */
const sinVacios = <O extends object>(o: O): O => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined && x !== null)) as O;

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
  const t = useTextosEditor();
  const v = valor ?? {};
  const set = (parcial: Partial<ParcialPaginacion>) => onCambiar(sinVacios({ ...v, ...parcial }));
  const estilo = v.estilo ?? 'numerada';
  const conBotones = estilo !== 'infinito';
  const conFlechas = estilo === 'numerada' || estilo === 'compacta' || estilo === 'anterior_siguiente';
  const muestra = resolverPaginacion({ legado: 'grilla', porPagina: v.porPaginaEscritorio ?? 12 }, null, { ...v, usar_global: false }, false);
  const clases = clasesPaginacion({ ...muestra, activo: true });
  return (
    <Panel titulo={t('listas.paginacion')} usarGlobal={usarGlobal} onUsarGlobal={onUsarGlobal} deshabilitado={deshabilitado} t={t}>
      <div className="grid grid-cols-2 items-end gap-3">
        <Numero etiqueta={t('listas.porPaginaComputador')} valor={v.porPaginaEscritorio} porDefecto={12} minimo={4} maximo={60} onCambiar={(n) => set({ porPaginaEscritorio: n })} />
        <Numero etiqueta={t('listas.porPaginaCelular')} valor={v.porPaginaMovil} porDefecto={v.porPaginaEscritorio ?? 12} minimo={4} maximo={60} onCambiar={(n) => set({ porPaginaMovil: n })} />
      </div>
      <Chips etiqueta={t('listas.estilo')} opciones={ESTILOS_PAGINACION} valor={estilo} onCambiar={(e) => set({ estilo: e })} t={t} prefijo="listas.estiloPaginacion" />
      {conBotones && (
        <>
          <Chips etiqueta={t('listas.forma')} opciones={FORMAS_PAGINACION} valor={v.forma ?? 'semi'} onCambiar={(forma) => set({ forma })} t={t} prefijo="listas.formaOpcion" />
          <Chips etiqueta={t('listas.tamano')} opciones={TAMANOS} valor={v.tamano ?? 'md'} onCambiar={(tamano) => set({ tamano })} t={t} prefijo="listas.tamanoOpcion" />
          <Chips etiqueta={t('listas.alineacion')} opciones={ALINEACIONES} valor={v.alineacion ?? 'centro'} onCambiar={(alineacion) => set({ alineacion })} t={t} prefijo="listas.alineacionOpcion" />
          <ColorTema etiqueta={t('listas.colorActivo')} valor={v.colorActivo ?? null} colorTema={color} onCambiar={(c) => set({ colorActivo: c ?? undefined })} />
          {estilo === 'numerada' && (
            <ColorTema etiqueta={t('listas.colorInactivo')} valor={v.colorInactivo ?? null} colorTema="#6B7280" onCambiar={(c) => set({ colorInactivo: c ?? undefined })} />
          )}
          {conFlechas && (
            <ColorTema etiqueta={t('listas.colorHover')} valor={v.colorHover ?? null} colorTema="#F3F4F6" onCambiar={(c) => set({ colorHover: c ?? undefined })} />
          )}
        </>
      )}
      {estilo === 'numerada' && (
        <FilaInterruptor titulo={t('listas.extremos')} ayuda={t('listas.extremosAyuda')} valor={v.mostrarExtremos !== false} onCambiar={(b) => set({ mostrarExtremos: b })} />
      )}
      <FilaInterruptor titulo={t('listas.contador')} ayuda={t('listas.contadorAyuda')} valor={v.mostrarContador === true} onCambiar={(b) => set({ mostrarContador: b })} />
      {conFlechas && (
        <>
          <CampoTexto etiqueta={t('listas.textoAnterior')} valor={v.textoAnterior ?? ''} placeholder={t('listas.textoAnteriorEjemplo')} max={30} onCambiar={(s) => set({ textoAnterior: s ?? undefined })} />
          <CampoTexto etiqueta={t('listas.textoSiguiente')} valor={v.textoSiguiente ?? ''} placeholder={t('listas.textoSiguienteEjemplo')} max={30} onCambiar={(s) => set({ textoSiguiente: s ?? undefined })} />
        </>
      )}
      {estilo === 'cargar_mas' && (
        <CampoTexto etiqueta={t('listas.textoCargarMas')} valor={v.textoCargarMas ?? ''} placeholder={t('listas.textoCargarMasEjemplo')} max={30} onCambiar={(s) => set({ textoCargarMas: s ?? undefined })} />
      )}
      {estilo === 'numerada' && (
        <div className="flex flex-col gap-1.5">
          <EtiquetaGrupo>{t('listas.vistaPrevia')}</EtiquetaGrupo>
          <div className={clases.contenedor} aria-hidden="true">
            {numerosDePagina(3, 17, v.mostrarExtremos !== false).map((n, i) => (
              <span
                key={i}
                className={clases.numero}
                style={n === 3 ? { background: v.colorActivo ?? color, color: '#fff' } : v.colorInactivo ? { color: v.colorInactivo, borderColor: v.colorInactivo } : undefined}
              >
                {n}
              </span>
            ))}
          </div>
        </div>
      )}
    </Panel>
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
  const t = useTextosEditor();
  const v = valor ?? {};
  const set = (parcial: Partial<ParcialCarrusel>) => onCambiar(sinVacios({ ...v, ...parcial }));
  const indicador = v.indicador ?? 'puntos';
  const conFlechas = v.flechasEscritorio !== false || v.flechasMovil !== false;
  const anteriores = v.avance != null ? [{ id: 'carrusel_avance', quitar: { avance: null }, motivo: 'sinEfecto' as const }] : [];
  return (
    <Panel titulo={t('listas.carrusel')} usarGlobal={usarGlobal} onUsarGlobal={onUsarGlobal} deshabilitado={deshabilitado} t={t}>
      <div className="grid grid-cols-3 items-end gap-2">
        <Numero etiqueta={t('listas.visiblesComputador')} valor={v.visiblesEscritorio} porDefecto={4} minimo={1} maximo={8} onCambiar={(n) => set({ visiblesEscritorio: n })} />
        <Numero etiqueta={t('listas.visiblesTableta')} valor={v.visiblesTableta} porDefecto={3} minimo={1} maximo={6} onCambiar={(n) => set({ visiblesTableta: n })} />
        <Numero etiqueta={t('listas.visiblesCelular')} valor={v.visiblesMovil} porDefecto={2} minimo={1} maximo={3} onCambiar={(n) => set({ visiblesMovil: n })} />
      </div>
      <Chips etiqueta={t('listas.indicador')} opciones={INDICADORES} valor={indicador} onCambiar={(i) => set({ indicador: i })} t={t} prefijo="listas.indicadorOpcion" />
      {indicador !== 'ninguno' && (
        <>
          <Chips etiqueta={t('listas.posicionIndicador')} opciones={POSICIONES_INDICADOR} valor={v.posicionIndicador ?? 'abajo_fuera'} onCambiar={(p) => set({ posicionIndicador: p })} t={t} prefijo="listas.posicionIndicadorOpcion" />
          <Chips etiqueta={t('listas.alineacion')} opciones={ALINEACIONES} valor={v.alineacionIndicador ?? 'centro'} onCambiar={(a) => set({ alineacionIndicador: a })} t={t} prefijo="listas.alineacionOpcion" />
          <Chips etiqueta={t('listas.tamanoIndicador')} opciones={TAMANOS} valor={v.tamanoIndicador ?? 'md'} onCambiar={(s) => set({ tamanoIndicador: s })} t={t} prefijo="listas.tamanoOpcion" />
          <ColorTema etiqueta={t('listas.colorActivo')} valor={v.colorActivo ?? null} colorTema="#111827" onCambiar={(c) => set({ colorActivo: c ?? undefined })} />
          <ColorTema etiqueta={t('listas.colorInactivo')} valor={v.colorInactivo ?? null} colorTema="#D1D5DB" onCambiar={(c) => set({ colorInactivo: c ?? undefined })} />
        </>
      )}
      <FilaInterruptor titulo={t('listas.flechasComputador')} valor={v.flechasEscritorio !== false} onCambiar={(b) => set({ flechasEscritorio: b })} />
      <FilaInterruptor titulo={t('listas.flechasCelular')} valor={v.flechasMovil !== false} onCambiar={(b) => set({ flechasMovil: b })} />
      {conFlechas && (
        <>
          <Chips etiqueta={t('listas.estiloFlechas')} opciones={ESTILOS_FLECHA} valor={v.estiloFlechas ?? 'hover'} onCambiar={(e) => set({ estiloFlechas: e })} t={t} prefijo="listas.estiloFlechaOpcion" />
          <Chips etiqueta={t('listas.posicionFlechas')} opciones={POSICIONES_FLECHA} valor={v.posicionFlechas ?? 'lados_dentro'} onCambiar={(p) => set({ posicionFlechas: p })} t={t} prefijo="listas.posicionFlechaOpcion" />
          <Chips etiqueta={t('listas.tamanoFlecha')} opciones={TAMANOS} valor={v.tamanoFlecha ?? 'md'} onCambiar={(s) => set({ tamanoFlecha: s })} t={t} prefijo="listas.tamanoOpcion" />
          <ColorTema etiqueta={t('listas.fondoFlecha')} valor={v.fondoFlecha ?? null} colorTema="#FFFFFF" onCambiar={(c) => set({ fondoFlecha: c ?? undefined })} />
          <ColorTema etiqueta={t('listas.bordeFlecha')} valor={v.bordeFlecha ?? null} colorTema="#E5E7EB" onCambiar={(c) => set({ bordeFlecha: c ?? undefined })} />
          <ColorTema etiqueta={t('listas.iconoFlecha')} valor={v.colorIcono ?? null} colorTema="#111827" onCambiar={(c) => set({ colorIcono: c ?? undefined })} />
          <FilaInterruptor titulo={t('listas.sombraFlecha')} valor={v.sombraFlecha !== false} onCambiar={(b) => set({ sombraFlecha: b })} />
        </>
      )}
      <FilaInterruptor titulo={t('listas.autoplay')} valor={v.autoplay === true} onCambiar={(b) => set({ autoplay: b })} />
      {v.autoplay === true && (
        <>
          <Numero etiqueta={t('listas.segundos')} valor={v.segundos} porDefecto={5} minimo={1} maximo={15} onCambiar={(n) => set({ segundos: n })} />
          <FilaInterruptor titulo={t('listas.pausaHover')} valor={v.pausaHover !== false} onCambiar={(b) => set({ pausaHover: b })} />
        </>
      )}
      <FilaInterruptor titulo={t('listas.bucle')} valor={v.loop === true} onCambiar={(b) => set({ loop: b })} />
      <FilaInterruptor titulo={t('listas.arrastre')} valor={v.arrastre !== false} onCambiar={(b) => set({ arrastre: b })} />
      <AjustesAnteriores ajustes={v as Record<string, unknown>} entradas={anteriores} cambiar={(c) => onCambiar(aplicarCambioContenido(v as Record<string, unknown>, c) as ParcialCarrusel)} />
    </Panel>
  );
}
