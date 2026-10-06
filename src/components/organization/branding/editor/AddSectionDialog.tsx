'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, Search, Sparkles, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/utils/Utils';
import { useEsEscritorio } from '@/components/kit/useEsEscritorio';
import type { BranchType } from '@/types/branch';
import type { SectionTypeDefinition } from '@/lib/services/websitePageBuilderService';
import {
  NOMBRE_TIPO_SEDE,
  filtrarCatalogo,
  getSectionCatalogForBranch,
  type GrupoCatalogo,
} from '@/lib/services/website/sectionsByBranchType';
import { avisoFaltanDatos, type ConteoFuentes } from '@/lib/services/website/fuentesDatosSecciones';
import { AvisoConAccion } from './AvisoConAccion';
import { SectionPickerCard } from './SectionPickerCard';

/**
 * Diálogo «Añadir sección» (Figma «16 Sitio web › 05 Editor»: 1732:878609,
 * 1891:918129 sin datos, 1891:918403 búsqueda vacía, 1893:919783 hoja móvil,
 * 1897:919594 en una sede).
 *
 * Todas las secciones están disponibles para cualquier negocio: el tipo de la
 * sede solo decide las «Recomendadas». «Faltan datos» se calcula con los
 * conteos reales del ERP (`/api/website/fuentes-datos`) y no bloquea.
 * En escritorio es un diálogo con la lista de propósitos a la izquierda; en
 * el celular, una hoja inferior con chips.
 */

export interface ContextoAnadirSeccion {
  /** Página donde se añade («Inicio»). */
  pagina: string;
  /** Sección tras la que se añade; `null` = al final de una página vacía. */
  despuesDe: string | null;
  /** Nombre del sitio de la sede si se edita una sede V2: la sección es solo de esa sede. */
  sede?: string | null;
  /** Nombre del sitio en la descripción de las recomendadas («Principal»). */
  nombreSitio?: string | null;
  /** Hay borrador (V2): la sección queda en el borrador hasta publicar. */
  enBorrador?: boolean;
}

interface AddSectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (sectionType: string, sectionVariant: string) => void;
  /** Tipo de la sede: ordena las recomendadas. Nunca filtra. */
  branchType?: BranchType | null;
  /** Tipo de la página (`product_detail`…): en las plantillas recomienda sus bloques. */
  pageType?: string | null;
  contexto: ContextoAnadirSeccion;
  /** Registros por fuente de datos; `null` mientras carga (no se marca «Faltan datos»). */
  conteos: ConteoFuentes | null;
}

const ID_RECOMENDADAS = 'recomendadas';

export default function AddSectionDialog({
  open,
  onOpenChange,
  onAdd,
  branchType,
  pageType,
  contexto,
  conteos,
}: AddSectionDialogProps) {
  const esEscritorio = useEsEscritorio();
  const [busqueda, setBusqueda] = useState('');
  const [elegida, setElegida] = useState<SectionTypeDefinition | null>(null);
  const [chipActivo, setChipActivo] = useState<string>(ID_RECOMENDADAS);
  const refsGrupo = useRef<Record<string, HTMLElement | null>>({});
  const refBusqueda = useRef<HTMLInputElement | null>(null);

  const catalogo = useMemo(() => getSectionCatalogForBranch(branchType, { pageType }), [branchType, pageType]);
  const filtrado = useMemo(() => filtrarCatalogo(catalogo, busqueda), [catalogo, busqueda]);
  const hayBusqueda = busqueda.trim().length > 0;
  const sinResultados = hayBusqueda && filtrado.coincidencias === 0;
  const tiposRecomendados = useMemo(() => new Set(catalogo.recomendadas.map((s) => s.type)), [catalogo]);
  const sujeto = contexto.sede ?? 'Tu organización';

  useEffect(() => {
    if (!open) return;
    setBusqueda('');
    setElegida(null);
    setChipActivo(catalogo.recomendadas.length > 0 ? ID_RECOMENDADAS : catalogo.grupos[0]?.id ?? ID_RECOMENDADAS);
  }, [open, catalogo]);

  const aviso = (def: SectionTypeDefinition) => avisoFaltanDatos(def.type, def.label, conteos, sujeto);
  const avisoElegida = elegida ? aviso(elegida) : null;

  const cerrar = () => onOpenChange(false);
  const anadir = (def: SectionTypeDefinition | null = elegida) => {
    if (!def) return;
    onAdd(def.type, def.variants[0]?.id ?? 'default');
    cerrar();
  };

  const irAGrupo = (id: string) => {
    setChipActivo(id);
    refsGrupo.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── Textos ──────────────────────────────────────────────────────────────
  const titulo = contexto.sede ? `Añadir sección a ${contexto.sede}` : 'Añadir sección';
  const lugar = contexto.despuesDe
    ? `Se añade después de «${contexto.despuesDe}» en ${contexto.pagina}`
    : `Se añade en ${contexto.pagina}`;
  const tipoSede = branchType ? NOMBRE_TIPO_SEDE[branchType] : null;
  const descripcion = contexto.sede
    ? `${lugar} de ${contexto.sede}. El sitio principal y las demás sedes no cambian. Para que salga en todas, añádela desde el sitio principal.`
    : `${lugar}. Todas las secciones sirven para cualquier negocio${
        tipoSede ? `: las recomendadas salen del tipo de la sede (${contexto.nombreSitio ?? 'Principal'} · ${tipoSede})` : ''
      }.`;
  const tituloRecomendadas = contexto.sede ? `Recomendadas para ${contexto.sede}` : 'Recomendadas para tu negocio';
  const subtituloRecomendadas = contexto.sede
    ? `Según el tipo de ${contexto.sede}${tipoSede ? ` (${tipoSede})` : ''}. Están también en su grupo; nada queda oculto.`
    : `${tipoSede ? `Para un ${tipoSede}. ` : ''}Están también en su grupo; nada queda oculto.`;
  const textoPrimario = `${avisoElegida ? 'Añadir de todas formas' : 'Añadir sección'}${contexto.sede ? ` a ${contexto.sede}` : ''}`;
  const pie = sinResultados || hayBusqueda
    ? `${filtrado.coincidencias} de ${catalogo.total} secciones coinciden`
    : contexto.sede
      ? `Quedará con el chip «Solo esta sede» en la lista de secciones de ${contexto.sede}.`
      : avisoElegida
        ? `Faltan datos no bloquea: la sección queda en ${contexto.enBorrador ? 'el borrador' : 'la página'} y se llena sola cuando existan los datos.`
        : `${catalogo.total} secciones · todas disponibles para cualquier negocio · «Faltan datos» no bloquea`;

  // ── Piezas ──────────────────────────────────────────────────────────────
  const tarjetas = (secciones: SectionTypeDefinition[], enRecomendadas: boolean, columnas: string) => {
    const elegidaAqui = elegida && secciones.some((s) => s.type === elegida.type) ? elegida : null;
    const avisoAqui = elegidaAqui ? aviso(elegidaAqui) : null;
    return (
      <>
        <div className={cn('grid gap-3', columnas)}>
          {secciones.map((def) => (
            <SectionPickerCard
              key={def.type}
              tipo={def.type}
              etiqueta={def.label}
              descripcion={def.description}
              seleccionada={elegida?.type === def.type}
              faltanDatos={Boolean(aviso(def))}
              recomendada={!enRecomendadas && tiposRecomendados.has(def.type)}
              onSeleccionar={() => setElegida(def)}
              onConfirmar={() => anadir(def)}
            />
          ))}
        </div>
        {avisoAqui ? (
          <AvisoConAccion titulo={avisoAqui.titulo} detalle={avisoAqui.detalle} accion={avisoAqui.accion} />
        ) : null}
      </>
    );
  };

  const encabezadoGrupo = (g: GrupoCatalogo) => (
    <h3 className="flex items-center gap-2 text-base font-semibold text-fg">
      <span className="min-w-0 truncate">
        {g.etiqueta} · {g.proposito}
      </span>
      <span className="text-xs font-medium text-fg-secondary">{g.secciones.length}</span>
    </h3>
  );

  const buscador = (compacto: boolean) => (
    <div className="relative">
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
      <input
        ref={refBusqueda}
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder={compacto ? 'Buscar sección…' : 'Buscar sección (habitaciones, carta, productos, reservas…)'}
        aria-label="Buscar sección"
        className={cn(
          'h-10 w-full rounded-lg border bg-surface pl-9 pr-9 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-brand [&::-webkit-search-cancel-button]:hidden',
          hayBusqueda ? 'border-brand' : 'border-line-strong',
        )}
      />
      {hayBusqueda ? (
        <button
          type="button"
          aria-label="Limpiar búsqueda"
          onClick={() => {
            setBusqueda('');
            refBusqueda.current?.focus();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-secondary hover:bg-hover"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );

  const vacio = (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-tint">
        <Search aria-hidden className="h-5 w-5 text-brand-deep" />
      </span>
      <p className="text-base font-semibold text-fg">Ninguna sección coincide con «{busqueda.trim()}»</p>
      <p className="max-w-sm text-[13px] leading-[18px] text-fg-secondary">
        Busca por lo que quieres mostrar: «habitaciones», «servicios», «galería». Todas las secciones están disponibles para tu negocio.
      </p>
      <button
        type="button"
        onClick={() => {
          setBusqueda('');
          refBusqueda.current?.focus();
        }}
        className="h-8 rounded-lg border border-line-strong bg-surface px-3 text-xs font-medium text-fg hover:bg-hover"
      >
        Limpiar búsqueda
      </button>
    </div>
  );

  const botones = (
    <>
      <button
        type="button"
        onClick={cerrar}
        className="h-10 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover"
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={() => anadir()}
        disabled={!elegida}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover disabled:opacity-50"
      >
        <Plus aria-hidden className="h-4 w-4" />
        {textoPrimario}
      </button>
    </>
  );

  const chipSede = contexto.sede ? (
    <span className="inline-flex items-center rounded-full border border-line-brand bg-brand-tint px-1.5 py-0.5 text-xs font-semibold text-brand-deep">
      Solo esta sede
    </span>
  ) : null;

  // ── Celular: hoja inferior con chips ────────────────────────────────────
  if (!esEscritorio) {
    const chips = [
      ...(filtrado.recomendadas.length > 0 || catalogo.recomendadas.length > 0
        ? [{ id: ID_RECOMENDADAS, etiqueta: 'Recomendadas', n: filtrado.recomendadas.length }]
        : []),
      ...filtrado.grupos.map((g) => ({ id: g.id, etiqueta: g.etiqueta, n: g.secciones.length })),
    ];
    const grupoChip = filtrado.grupos.find((g) => g.id === chipActivo);
    const seccionesChip = chipActivo === ID_RECOMENDADAS ? filtrado.recomendadas : grupoChip?.secciones ?? [];
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" hideCloseButton className="flex max-h-[85vh] flex-col gap-3 rounded-t-2xl bg-surface px-4 pb-4 pt-2">
          <span aria-hidden className="mx-auto h-1 w-10 rounded-full bg-line-strong" />
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle className="flex flex-wrap items-center gap-2 text-base font-semibold text-fg">
                {titulo} {chipSede}
              </SheetTitle>
              <SheetDescription className="text-xs text-fg-secondary">
                {contexto.despuesDe ? `Después de «${contexto.despuesDe}» en ${contexto.pagina}` : `En ${contexto.pagina}`} · todas disponibles
              </SheetDescription>
            </div>
            <button type="button" aria-label="Cerrar" onClick={cerrar} className="rounded-lg p-2 text-fg-secondary hover:bg-hover">
              <X className="h-4 w-4" />
            </button>
          </div>
          {buscador(true)}
          <div role="tablist" aria-label="Propósitos" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {chips.map((c) => {
              const activo = c.id === chipActivo;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={activo}
                  onClick={() => setChipActivo(c.id)}
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-xs',
                    activo ? 'border-brand bg-brand-tint font-medium text-brand-deep' : 'border-line-strong bg-surface text-fg',
                    c.n === 0 && !activo && 'text-fg-muted',
                  )}
                >
                  {activo ? <Check aria-hidden className="h-3.5 w-3.5" /> : null}
                  {c.etiqueta} {c.n}
                </button>
              );
            })}
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            {sinResultados ? (
              vacio
            ) : (
              <>
                <p className="text-xs text-fg-secondary">
                  {chipActivo === ID_RECOMENDADAS
                    ? subtituloRecomendadas
                    : grupoChip
                      ? `${grupoChip.etiqueta} · ${grupoChip.proposito}`
                      : ''}
                </p>
                {tarjetas(seccionesChip, chipActivo === ID_RECOMENDADAS, 'grid-cols-2')}
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">{botones}</div>
        </SheetContent>
      </Sheet>
    );
  }

  // ── Escritorio: diálogo con propósitos a la izquierda ───────────────────
  const navItem = (id: string, etiqueta: string, n: number) => {
    const activo = id === chipActivo && !hayBusqueda;
    return (
      <button
        key={id}
        type="button"
        onClick={() => irAGrupo(id)}
        disabled={n === 0}
        aria-current={activo ? 'true' : undefined}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm',
          activo ? 'bg-brand-tint font-medium text-brand-deep' : 'text-fg hover:bg-hover',
          n === 0 && 'cursor-default text-fg-muted hover:bg-transparent',
        )}
      >
        <span className="min-w-0 flex-1">{etiqueta}</span>
        <span className="text-xs font-medium text-fg-secondary">{n}</span>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="flex h-[min(712px,90vh)] w-[calc(100vw-32px)] max-w-[1024px] flex-col gap-4 overflow-hidden rounded-xl border border-line bg-surface p-6"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-lg font-semibold leading-6 text-fg">
              {titulo} {chipSede}
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-[18px] text-fg-secondary">{descripcion}</DialogDescription>
          </div>
          <button type="button" aria-label="Cerrar" onClick={cerrar} className="rounded-lg p-2 text-fg-secondary hover:bg-hover">
            <X className="h-4 w-4" />
          </button>
        </div>

        {buscador(false)}

        <div className="flex min-h-0 flex-1 gap-5">
          <nav aria-label="Propósitos" className="w-[220px] shrink-0 space-y-0.5 overflow-y-auto">
            {catalogo.recomendadas.length > 0 ? navItem(ID_RECOMENDADAS, tituloRecomendadas, filtrado.recomendadas.length) : null}
            <p className="px-3 pb-1 pt-2.5 text-xs font-semibold uppercase text-fg-muted">Por propósito</p>
            {filtrado.grupos.map((g) => navItem(g.id, g.etiqueta, g.secciones.length))}
          </nav>

          <div className="min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto pr-1">
            {sinResultados ? (
              vacio
            ) : (
              <>
                {filtrado.recomendadas.length > 0 ? (
                  <section
                    aria-label={tituloRecomendadas}
                    ref={(el) => {
                      refsGrupo.current[ID_RECOMENDADAS] = el;
                    }}
                    className="scroll-mt-2 space-y-3"
                  >
                    <div className="space-y-1">
                      <h3 className="flex items-center gap-2 text-base font-semibold text-fg">
                        <Sparkles aria-hidden className="h-5 w-5 text-brand" />
                        {tituloRecomendadas}
                        <span className="text-xs font-medium text-fg-secondary">{filtrado.recomendadas.length}</span>
                      </h3>
                      <p className="text-[13px] leading-[18px] text-fg-secondary">{subtituloRecomendadas}</p>
                    </div>
                    {tarjetas(filtrado.recomendadas, true, 'grid-cols-[repeat(auto-fill,minmax(150px,1fr))]')}
                  </section>
                ) : null}
                {filtrado.grupos
                  .filter((g) => g.secciones.length > 0)
                  .map((g) => (
                    <section
                      key={g.id}
                      aria-label={g.etiqueta}
                      ref={(el) => {
                        refsGrupo.current[g.id] = el;
                      }}
                      className="scroll-mt-2 space-y-3"
                    >
                      {encabezadoGrupo(g)}
                      {tarjetas(g.secciones, false, 'grid-cols-[repeat(auto-fill,minmax(150px,1fr))]')}
                    </section>
                  ))}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-[200px] flex-1 text-[13px] leading-[18px] text-fg-secondary">{pie}</p>
          {botones}
        </div>
      </DialogContent>
    </Dialog>
  );
}
