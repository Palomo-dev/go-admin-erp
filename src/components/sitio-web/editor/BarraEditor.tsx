'use client';

/**
 * Barra superior del editor (Figma A/05a, figma-estilo/02; contexto de sede aprobado por el
 * dueño): «← [Sitio principal ▾] / [Inicio ▾]» — primero el sitio o la sede, después la página —
 * · dispositivo con iconos (computador 1440, portátil 1024, tableta 768, celular 390) · Deshacer
 * + «Rehacer» · estado · «Ver sitio publicado» · «Vista previa» · «Publicar» (único primario) · «⋯».
 *
 * La flecha vuelve a Sitio web (tooltip «Volver a Sitio web»); no hay migas de texto. El selector
 * de sitio es neutro, el mismo `Select` del ERP que el de página; si no hay sedes para elegir se
 * ve como texto sin flecha (una sola sede publicada). Sin chip «Global» ni banda de color: el contexto lo da el nombre.
 *
 * Ancho: el editor de escritorio se monta desde 1024 px. Entre lg y xl la barra se compacta
 * (sin «1440 px» junto a los iconos, «Rehacer» y «Vista previa» solo con icono y nombre
 * accesible, selector de página y de sede más angostos y el texto del primario truncado);
 * desde xl se ve completa como en Figma A/05a. Los hijos que pueden encoger llevan `min-w-0`.
 *
 * En legacy guardar es publicar: el estado dice «Cambios sin guardar» y el primario «Guardar y
 * publicar». No guarda nada por su cuenta: todo llega del hook del editor.
 */
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Eye, Loader2, Redo2, Save, Send, Undo2 } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { RowActionsMenu, StatusBadge, clasesBoton, type AccionFila } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { PublishStatusBadge } from '@/components/sitio-web/ui/PublishStatusBadge';
import type { EstadoPublicacion } from '@/components/sitio-web/ui/estadoPublicacion';
import { RAIZ_SITIO_WEB } from '@/components/sitio-web/rutasSitioWeb';
import { SelectorAnchoVista } from '@/components/sitio-web/ui/SelectorAnchoVista';
import { DISPOSITIVOS_EDITOR, VIEWPORT_DISPOSITIVO, type DispositivoVista } from '@/components/sitio-web/ui/dispositivos';
import { useTextosEditor } from './textos';

export const RUTA_PAGINAS_EDITOR = `${RAIZ_SITIO_WEB}/paginas`;

/** Valor del sitio principal en el selector (`null` no es un valor válido de `Select`). */
const PRINCIPAL = '__principal__';
/** Selectores de la barra: los mismos del ERP (borde neutro, 40 px, radio 8). */
const CLASE_SELECTOR = 'h-10 min-w-0 shrink rounded-lg border-line-strong bg-surface text-sm text-fg';

export interface BarraEditorProps {
  paginas: readonly { id: string; title: string }[];
  paginaId: string;
  onCambiarPagina: (id: string) => void;
  /** Sitio que se edita: `null` = principal; el id es el de la sucursal en texto. */
  sitioActual: string | null;
  sedes: readonly { id: string; nombre: string }[];
  onCambiarSitio?: (id: string | null) => void;
  dispositivo: DispositivoVista;
  onDispositivo: (d: DispositivoVista) => void;
  onDeshacer: () => void;
  onRehacer: () => void;
  puedeDeshacer: boolean;
  puedeRehacer: boolean;
  /** V2: estado de publicación; legacy: `null` y se usa `cambiosLegacy`. */
  estado: EstadoPublicacion | null;
  /** No se pudo guardar el borrador (píldora roja «No se guardó»). */
  errorGuardado?: boolean;
  cambiosLegacy?: boolean;
  enV2: boolean;
  urlPublica: string | null;
  onVistaPrevia: () => void;
  generandoVistaPrevia?: boolean;
  textoPublicar: string;
  onPublicar: () => void;
  publicando?: boolean;
  puedePublicar: boolean;
  motivoNoPublicar?: string;
  acciones: readonly AccionFila[];
  className?: string;
}

export function BarraEditor(p: BarraEditorProps) {
  const t = useTextosEditor();
  const paginaActual = p.paginas.find((x) => x.id === p.paginaId);
  const nombreSitio = (p.sitioActual ? p.sedes.find((x) => x.id === p.sitioActual)?.nombre : null) ?? t('sede.principal');
  return (
    <header className={cn('flex h-14 min-w-0 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 xl:gap-3', p.className)}>
      <Link
        href={RAIZ_SITIO_WEB}
        aria-label={t('barra.volver')}
        title={t('barra.volver')}
        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ArrowLeft aria-hidden="true" className="size-5" strokeWidth={1.5} />
      </Link>

      <nav aria-label={t('barra.migas')} className="flex min-w-0 items-center gap-1">
        {/* Sin sedes además del principal no hay nada que elegir: texto sin flecha. */}
        {p.onCambiarSitio && (p.sedes.length > 0 || p.sitioActual !== null) ? (
          <Select value={p.sitioActual ?? PRINCIPAL} onValueChange={(v) => p.onCambiarSitio?.(v === PRINCIPAL ? null : v)}>
            <SelectTrigger aria-label={t('barra.sitio')} className={cn(CLASE_SELECTOR, 'w-[140px] xl:w-[190px]')}>
              <span className="truncate">{nombreSitio}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={PRINCIPAL}>{t('sede.principal')}</SelectItem>
              {p.sedes.map((x) => (
                <SelectItem key={x.id} value={x.id}>
                  {x.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="truncate px-1 text-sm font-medium text-fg" title={t('barra.sitio')}>
            {nombreSitio}
          </span>
        )}
        <span aria-hidden="true" className="px-0.5 text-sm text-fg-muted">
          /
        </span>
        <Select value={p.paginaId} onValueChange={p.onCambiarPagina}>
          <SelectTrigger aria-label={t('barra.pagina')} className={cn(CLASE_SELECTOR, 'w-[140px] xl:w-[190px]')}>
            <span className="truncate">{paginaActual?.title ?? ''}</span>
          </SelectTrigger>
          <SelectContent>
            {p.paginas.map((x) => (
              <SelectItem key={x.id} value={x.id}>
                {x.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </nav>

      <div className="flex min-w-0 flex-1 justify-center">
        <SelectorAnchoVista
          variante="icono"
          tamano="md"
          etiqueta={t('barra.ancho')}
          dispositivos={DISPOSITIVOS_EDITOR}
          nombreOpcion={(d) => t(`barra.dispositivo.${d}`, { ancho: VIEWPORT_DISPOSITIVO[d].ancho })}
          valor={p.dispositivo}
          onValorChange={p.onDispositivo}
          claseAncho="hidden xl:inline"
        />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={p.onDeshacer}
          disabled={!p.puedeDeshacer}
          aria-label={t('barra.deshacer')}
          aria-keyshortcuts="Control+Z"
          title={t('barra.deshacerAtajo')}
          className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'w-8 px-0')}
        >
          <Undo2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={p.onRehacer}
          disabled={!p.puedeRehacer}
          aria-keyshortcuts="Control+Shift+Z"
          title={t('barra.rehacerAtajo')}
          aria-label={t('barra.rehacer')}
          className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'w-8 px-0 xl:w-auto xl:px-3')}
        >
          <Redo2 aria-hidden="true" className="size-4 xl:hidden" strokeWidth={1.5} />
          <span className="hidden xl:inline">{t('barra.rehacer')}</span>
        </button>

        {p.enV2 ? (
          p.errorGuardado ? (
            <span role="status" aria-live="polite" className="inline-flex">
              <StatusBadge estado="error" etiqueta={t('barra.noSeGuardo')} tono="peligro" tamano="md" />
            </span>
          ) : (
            p.estado && <PublishStatusBadge estado={p.estado} />
          )
        ) : (
          <span role="status" aria-live="polite" className="inline-flex">
            <StatusBadge
              estado={p.cambiosLegacy ? 'cambios sin publicar' : 'publicado'}
              etiqueta={p.cambiosLegacy ? t('barra.cambiosSinGuardar') : t('barra.legacyAlDia')}
              tamano="md"
            />
          </span>
        )}

        {p.urlPublica && (
          <a
            href={p.urlPublica}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(clasesBoton({ variante: 'fantasma', tamano: 'md' }), 'hidden 2xl:inline-flex')}
          >
            <ExternalLink aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('barra.verPublicado')}
          </a>
        )}
        <button
          type="button"
          onClick={p.onVistaPrevia}
          disabled={p.generandoVistaPrevia}
          aria-label={t('barra.vistaPrevia')}
          title={t('barra.vistaPrevia')}
          className={cn(clasesBoton({ variante: 'secundario', tamano: 'md' }), 'w-10 px-0 xl:w-auto xl:px-4')}
        >
          {p.generandoVistaPrevia ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" strokeWidth={1.5} />
          ) : (
            <Eye aria-hidden="true" className="size-4" strokeWidth={1.5} />
          )}
          <span className="hidden xl:inline">{t('barra.vistaPrevia')}</span>
        </button>
        <button
          type="button"
          onClick={p.onPublicar}
          disabled={!p.puedePublicar || p.publicando}
          title={p.motivoNoPublicar ?? p.textoPublicar}
          className={cn(clasesBoton({ variante: 'primario', tamano: 'md' }), 'min-w-0')}
        >
          {p.publicando ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" strokeWidth={1.5} />
          ) : p.enV2 ? (
            <Send aria-hidden="true" className="size-4" strokeWidth={1.5} />
          ) : (
            <Save aria-hidden="true" className="size-4" strokeWidth={1.5} />
          )}
          <span className="max-w-[9rem] truncate xl:max-w-none">{p.textoPublicar}</span>
        </button>
        <RowActionsMenu acciones={p.acciones} orientacion="horizontal" tamano="md" titulo={t('barra.masAcciones')} />
      </div>
    </header>
  );
}
