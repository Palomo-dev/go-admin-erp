'use client';

/**
 * Diálogo de Configuración (decisión del dueño; Figma pág. 10, sección 12
 * «Configuración como diálogo», capturas docs/design/figma/92-config-dialogo-*).
 *
 * - Escritorio: diálogo de 1080×780 centrado sobre la pantalla actual, con
 *   velo. Izquierda: «Configuración», buscador (Ctrl+K o «/») y los grupos del
 *   menú. Derecha: cerrar (Esc), migas «Grupo › Entrada», título, sub-pestañas
 *   cuando la entrada tiene varias secciones y el panel. Abajo, fija, la barra
 *   «N cambios sin guardar · Descartar · Guardar cambios».
 * - Celular: pantalla completa; primero el menú (tarjetas con chevron) y, al
 *   elegir, el detalle con «←» y la barra Descartar/Guardar abajo.
 * - Los paneles son los de siempre (`ConfiguracionPanelRenderer`): cambia el
 *   contenedor, no la lógica de cada ajuste. Qué se ve y qué se edita lo
 *   decide el servidor (`useSeccionesPermitidas`).
 *
 * Accesibilidad: Radix Dialog atrapa el foco y lo devuelve al cerrar; Esc
 * limpia la búsqueda y, si no hay búsqueda, cierra; el menú se recorre con
 * flechas y el buscador es un combobox.
 */
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ArrowLeft, Loader2, Search, Settings, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Breadcrumbs, EmptyState, Kbd, SegmentedControl, useEsEscritorio } from '@/components/kit';
import { clasesBoton } from '@/components/kit/botonClases';
import { esCapaFlotante } from '@/components/kit/capaFlotante';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/Utils';
import { buscarAjustes, construirIndice, type ResultadoBusqueda } from '../config/buscadorConfiguracion';
import type { DestinoDialogo } from '../config/dialogoUrl';
import { construirMenu, entradaConSeccion, entradaDeSeccion, type EntradaMenu } from '../config/menuConfiguracion';
import { useSeccionesPermitidas } from '../hooks/useSeccionesPermitidas';
import { useResaltarAncla } from '../hooks/useResaltarAncla';
import { ConfiguracionPanelRenderer } from '../layout/ConfiguracionPanelRenderer';
import { AvisoMovido } from '../layout/AvisoMovido';
import type { CambiosPanel } from './cambiosSinGuardar';
import { MenuConfiguracion } from './MenuConfiguracion';
import { ResultadosBusqueda, idOpcion } from './ResultadosBusqueda';

interface Props {
  destino: DestinoDialogo;
  cambios: CambiosPanel | null;
  onNavegar: (destino: DestinoDialogo) => void;
  onCerrar: () => void;
  onAbrirEnlace: (href: string) => void;
  onMovidoVisto: () => void;
}

function esCampoEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export function ConfiguracionDialogo({ destino, cambios, onNavegar, onCerrar, onAbrirEnlace, onMovidoVisto }: Props) {
  const t = useTranslations('configuracionDialogo');
  const tu = useTranslations('configuracionUnificada');
  const permitidas = useSeccionesPermitidas();
  const esEscritorio = useEsEscritorio();
  const [consulta, setConsulta] = useState('');
  const [activo, setActivo] = useState(0);
  const buscadorRef = useRef<HTMLInputElement>(null);
  const contenidoRef = useRef<HTMLDivElement>(null);

  const etiquetaEntrada = (id: string) => (t.has(`entradas.${id}`) ? t(`entradas.${id}`) : tu(`modulos.${id}`));
  const etiquetaPestana = (clave: string) => (t.has(`pestanas.${clave}`) ? t(`pestanas.${clave}`) : tu(`secciones.${clave}.titulo`));

  const secciones = useMemo(() => permitidas.secciones.map((p) => p.seccion), [permitidas.secciones]);
  const menu = useMemo(() => construirMenu(secciones), [secciones]);

  const indice = useMemo(
    () =>
      construirIndice(secciones, {
        modulo: (_id, s) => (t.has(`entradas.${entradaDeSeccion(s)}`) ? t(`entradas.${entradaDeSeccion(s)}`) : tu(`modulos.${s.modulo}`)),
        seccion: (clave) => ({ titulo: tu(`secciones.${clave}.titulo`), palabras: tu(`secciones.${clave}.palabras`) }),
        ajuste: (clave) => ({ titulo: tu(`ajustes.${clave}.titulo`), palabras: tu(`ajustes.${clave}.palabras`) }),
      }),
    [secciones, t, tu],
  );
  const buscando = consulta.trim().length > 0;
  const resultados = useMemo(() => buscarAjustes(consulta, indice), [consulta, indice]);

  // Sección efectiva: la pedida si el servidor la deja ver; en escritorio, sin
  // sección, la primera del menú. En el celular, sin sección, el menú.
  const pedida = destino.seccionId ? permitidas.secciones.find((p) => p.seccion.id === destino.seccionId) : undefined;
  const primera = menu[0]?.entradas[0]?.secciones[0];
  const actual = pedida ?? (esEscritorio && primera ? permitidas.secciones.find((p) => p.seccion.id === primera.id) : undefined);
  const entrada = actual ? entradaConSeccion(menu, actual.seccion.id) : undefined;
  const grupo = entrada ? menu.find((g) => g.entradas.includes(entrada))?.grupo : undefined;
  const enDetalle = !!actual;

  useResaltarAncla(buscando ? null : destino.ancla ?? null, actual?.seccion.id);

  const elegirEntrada = (e: EntradaMenu) => {
    setConsulta('');
    onNavegar({ seccionId: e.secciones[0].id });
  };
  const elegirResultado = (r: ResultadoBusqueda) => {
    setConsulta('');
    setActivo(0);
    onNavegar({ seccionId: r.seccionId, ancla: r.ancla });
  };

  const alPulsarBuscador = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!buscando || resultados.length === 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = resultados.length;
      setActivo((i) => (e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      elegirResultado(resultados[Math.min(activo, resultados.length - 1)]);
    }
  };

  // Ctrl+K o «/» enfocan el buscador del diálogo (y no el buscador global ni el de la página de atrás);
  // Ctrl+S guarda si el panel tiene cambios.
  const alPulsar = (e: KeyboardEvent<HTMLDivElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    const tecla = e.key.toLowerCase();
    if ((mod && tecla === 'k') || (e.key === '/' && !mod && !esCampoEditable(e.target))) {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      buscadorRef.current?.focus();
      buscadorRef.current?.select();
    } else if (mod && tecla === 's' && cambios && cambios.cambios > 0 && !cambios.guardando) {
      e.preventDefault();
      e.stopPropagation();
      void cambios.guardar();
    }
  };

  const prefijoLista = esEscritorio ? 'config-res-escritorio' : 'config-res-movil';
  const nCambios = cambios?.cambios ?? 0;

  const buscador = (
    <div className="relative">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
      <input
        ref={buscadorRef}
        type="search"
        role="combobox"
        aria-label={t('buscar.etiqueta')}
        aria-expanded={buscando && resultados.length > 0}
        aria-controls={buscando ? `${prefijoLista}-lista` : undefined}
        aria-activedescendant={buscando && resultados.length > 0 ? idOpcion(prefijoLista, Math.min(activo, resultados.length - 1)) : undefined}
        aria-autocomplete="list"
        aria-keyshortcuts="Control+K /"
        value={consulta}
        onChange={(e) => {
          setConsulta(e.target.value);
          setActivo(0);
        }}
        onKeyDown={alPulsarBuscador}
        placeholder={t('buscar.placeholder')}
        autoComplete="off"
        spellCheck={false}
        className="h-9 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-9 text-sm text-fg placeholder:text-fg-muted focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 [&::-webkit-search-cancel-button]:hidden"
      />
      {consulta ? (
        <button
          type="button"
          onClick={() => {
            setConsulta('');
            buscadorRef.current?.focus();
          }}
          aria-label={tu('buscar.limpiar')}
          className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : (
        <Kbd tecla="/" className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 lg:inline-flex" />
      )}
    </div>
  );

  const resultadosVista = (prefijo: string) => (
    <ResultadosBusqueda
      prefijo={prefijo}
      consulta={consulta}
      resultados={resultados}
      activo={Math.min(activo, Math.max(resultados.length - 1, 0))}
      onActivo={setActivo}
      onElegir={elegirResultado}
      onLimpiar={() => setConsulta('')}
    />
  );

  const botonCerrar = (
    <button
      type="button"
      onClick={onCerrar}
      aria-label={t('cerrar')}
      title={t('cerrar')}
      aria-keyshortcuts="Escape"
      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-fg-secondary outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-brand"
    >
      <X aria-hidden="true" className="size-5" strokeWidth={1.5} />
    </button>
  );

  const tituloEntrada = entrada ? etiquetaEntrada(entrada.id) : '';

  let cuerpo: React.ReactNode;
  if (permitidas.cargando) {
    cuerpo = (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  } else if (permitidas.error) {
    cuerpo = <EmptyState variante="error" titulo={tu('estados.errorTitulo')} descripcion={permitidas.error} onReintentar={() => void permitidas.recargar()} />;
  } else if (menu.length === 0) {
    cuerpo = <EmptyState variante="empty" icono={Settings} titulo={tu('estados.vacioTitulo')} descripcion={tu('estados.vacioDescripcion')} />;
  } else if (buscando) {
    cuerpo = <div className="hidden lg:block">{resultadosVista('config-res-escritorio')}</div>;
  } else if (actual && entrada) {
    cuerpo = (
      <div className="flex min-w-0 flex-col gap-4">
        <div className="hidden flex-col gap-1 lg:flex">
          {grupo && <Breadcrumbs migas={[{ etiqueta: t(`grupos.${grupo}`) }, { etiqueta: tituloEntrada }]} />}
          <h2 className="text-xl font-semibold leading-7 text-fg">{tituloEntrada}</h2>
        </div>
        {entrada.secciones.length > 1 && (
          <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
            <SegmentedControl
              etiqueta={t('pestanasAria', { entrada: tituloEntrada })}
              opciones={entrada.secciones.map((s) => ({ valor: s.id, etiqueta: etiquetaPestana(s.clave) }))}
              valor={actual.seccion.id}
              onValorChange={(id) => onNavegar({ seccionId: id })}
              anchoCompleto={!esEscritorio && entrada.secciones.length <= 3}
            />
          </div>
        )}
        <div className="sticky top-0 z-10 empty:hidden">
          <AvisoMovido origen={destino.movido ?? null} onVisto={onMovidoVisto} />
        </div>
        <ConfiguracionPanelRenderer
          key={actual.seccion.id}
          seccion={actual.seccion}
          puedeEditar={actual.puedeEditar}
          algunAjusteEditable={Object.values(actual.ajustes).some(Boolean)}
          onAbrirEnlace={onAbrirEnlace}
        />
      </div>
    );
  } else {
    cuerpo = null;
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(v) => !v && onCerrar()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          ref={contenidoRef}
          aria-describedby={undefined}
          onKeyDown={alPulsar}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            if (esEscritorio) buscadorRef.current?.focus();
            else contenidoRef.current?.focus();
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            if (consulta) setConsulta('');
            else onCerrar();
          }}
          onPointerDownOutside={(e) => {
            e.preventDefault();
            if (!esCapaFlotante(e.detail.originalEvent.target)) onCerrar();
          }}
          onInteractOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
          className={cn(
            'fixed inset-0 z-50 flex bg-surface text-fg outline-none',
            'lg:inset-auto lg:left-1/2 lg:top-1/2 lg:h-[min(780px,calc(100dvh-48px))] lg:w-[min(1080px,calc(100vw-48px))] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:overflow-hidden lg:rounded-2xl lg:shadow-2xl',
          )}
        >
          {/* Menú: en el celular ocupa la pantalla hasta elegir una entrada. */}
          <aside className={cn('min-h-0 flex-col bg-sidebar lg:flex lg:w-[264px] lg:shrink-0 lg:border-r lg:border-line', enDetalle ? 'hidden' : 'flex w-full')}>
            <div className="flex items-center gap-2 border-b border-line px-3 py-3 lg:border-0 lg:px-3 lg:pb-3 lg:pt-5">
              <Settings aria-hidden="true" className="hidden size-[18px] text-fg-secondary lg:block" strokeWidth={1.5} />
              <DialogPrimitive.Title className="min-w-0 flex-1 text-lg font-semibold text-fg lg:text-base">{t('titulo')}</DialogPrimitive.Title>
              <span className="lg:hidden">{botonCerrar}</span>
            </div>
            <div className="px-4 pt-4 lg:px-3 lg:pt-0">{buscador}</div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4 lg:px-3 lg:pt-2">
              {buscando && !esEscritorio ? (
                resultadosVista('config-res-movil')
              ) : permitidas.cargando ? (
                <div className="space-y-2" aria-busy="true">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : (
                <MenuConfiguracion menu={menu} entradaActiva={buscando ? null : entrada?.id ?? null} onEntrada={elegirEntrada} etiquetaEntrada={etiquetaEntrada} />
              )}
            </div>
          </aside>

          {/* Detalle */}
          <section aria-label={tituloEntrada || t('titulo')} className={cn('relative min-h-0 min-w-0 flex-1 flex-col', enDetalle ? 'flex' : 'hidden lg:flex')}>
            <div className="flex items-center gap-2 border-b border-line px-2 py-2 lg:hidden">
              <button
                type="button"
                onClick={() => onNavegar({ seccionId: null })}
                aria-label={t('volver')}
                className="flex size-10 items-center justify-center rounded-lg text-fg outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
              >
                <ArrowLeft aria-hidden="true" className="size-5" strokeWidth={1.5} />
              </button>
              <p className="min-w-0 flex-1 truncate text-lg font-semibold text-fg">{tituloEntrada}</p>
              {botonCerrar}
            </div>
            <div className="absolute right-4 top-4 z-20 hidden lg:block">{botonCerrar}</div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-surface px-4 py-4 lg:px-8 lg:pb-8 lg:pt-14">{cuerpo}</div>

            {nCambios > 0 && (
              <div
                role="region"
                aria-label={t('cambios.region')}
                className="flex items-center gap-3 border-t border-line bg-surface px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 lg:px-8 lg:py-3"
              >
                <span aria-live="polite" className="hidden rounded-full border border-line-warning bg-warning-subtle px-2 py-0.5 text-[13px] font-medium text-warning-text lg:inline">
                  {t('cambios.contador', { n: nCambios })}
                </span>
                <span className="sr-only lg:hidden" aria-live="polite">
                  {t('cambios.contador', { n: nCambios })}
                </span>
                <div className="flex flex-1 gap-3 lg:flex-none lg:justify-end lg:gap-2 lg:ml-auto">
                  <button
                    type="button"
                    onClick={() => cambios?.descartar()}
                    disabled={cambios?.guardando}
                    className={cn(clasesBoton({ variante: 'secundario', tamano: 'md' }), 'flex-1 lg:flex-none lg:border-transparent')}
                  >
                    {t('cambios.descartar')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void cambios?.guardar()}
                    disabled={cambios?.guardando}
                    aria-busy={cambios?.guardando || undefined}
                    aria-keyshortcuts="Control+S"
                    aria-label={t('cambios.guardar')}
                    className={cn(clasesBoton({ variante: 'primario', tamano: 'md' }), 'flex-1 lg:flex-none')}
                  >
                    {cambios?.guardando && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
                    <span className="lg:hidden">{t('cambios.guardarCorto')}</span>
                    <span className="hidden lg:inline">{t('cambios.guardar')}</span>
                  </button>
                </div>
              </div>
            )}
          </section>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
