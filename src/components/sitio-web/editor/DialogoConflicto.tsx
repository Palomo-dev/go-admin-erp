'use client';

/**
 * Conflicto «otra persona publicó» (Figma A/05i): banda roja bajo la barra y diálogo «Hay una
 * versión más nueva» con tres salidas — nunca se pisa en silencio:
 *
 * 1. Combinar: aplicar mis cambios sobre la versión nueva (recomendado; solo chocan si tocamos
 *    la misma sección). Si chocan, se elige por sección «La mía» o «La suya».
 * 2. Descartar mis cambios y cargar la versión nueva (mis cambios quedan como guardado
 *    automático en el historial, si la tabla ya existe).
 * 3. Publicar los míos de todos modos (reemplaza lo que publicó la otra persona; en rojo).
 *
 * Sin revisión base (el borrador nunca partió de una publicación) no se puede combinar.
 */
import { useEffect, useState } from 'react';
import { cn } from '@/utils/Utils';
import { AvisoTonal, Dialogo, SegmentedControl, TarjetaSeleccionable, clasesBoton } from '@/components/kit';
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import type { Choque, Eleccion } from '@/lib/website/v2/combinarDocumentos';
import { nombreDeSeccion } from './iconosSeccion';
import type { ConflictoEditor } from './useEditorSitio';
import { useTextosEditor, type TraductorEditor } from './textos';

type Opcion = 'combinar' | 'descartar' | 'sobrescribir';

/** «hace 2 minutos» (o «hace un momento»). */
export function haceCuanto(iso: string | null, t: TraductorEditor, ahora: Date = new Date()): string {
  if (!iso) return '';
  const min = Math.max(0, Math.round((ahora.getTime() - new Date(iso).getTime()) / 60000));
  if (min < 1) return t('conflicto.haceUnMomento');
  if (min < 60) return t(min === 1 ? 'conflicto.haceMinuto' : 'conflicto.haceMinutos', { n: min });
  const h = Math.round(min / 60);
  return t(h === 1 ? 'conflicto.haceHora' : 'conflicto.haceHoras', { n: h });
}

export function textoQuien(c: ConflictoEditor, t: TraductorEditor): string {
  const quien = c.autor ?? t('conflicto.otraPersona');
  return c.publicado ? t('conflicto.publico', { quien, hace: haceCuanto(c.cuando, t) }) : t('conflicto.guardo', { quien });
}

export function BandaConflicto({ conflicto, onVerSuyos, onResolver }: { conflicto: ConflictoEditor; onVerSuyos?: () => void; onResolver: () => void }) {
  const t = useTextosEditor();
  return (
    <div role="alert" className="flex items-center gap-3 border-b border-line-danger bg-danger-subtle px-4 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-danger-text">{textoQuien(conflicto, t)}</p>
        <p className="truncate text-[13px] leading-[18px] text-fg-secondary">{t('conflicto.bandaDetalle')}</p>
      </div>
      {onVerSuyos && (
        <button type="button" onClick={onVerSuyos} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
          {t('conflicto.verSuyos')}
        </button>
      )}
      <button type="button" onClick={onResolver} className={clasesBoton({ variante: 'primario', tamano: 'sm' })}>
        {t('conflicto.resolver')}
      </button>
    </div>
  );
}

export interface DialogoConflictoProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  conflicto: ConflictoEditor;
  onVerSuyos?: () => void;
  prepararCombinacion: (elecciones: Record<string, Eleccion>) => Promise<{ documento: DocumentoSitio; choques: Choque[] } | null>;
  onResolver: (accion: Opcion, combinado?: DocumentoSitio) => Promise<boolean>;
}

export function DialogoConflicto(p: DialogoConflictoProps) {
  const t = useTextosEditor();
  const [opcion, setOpcion] = useState<Opcion>(p.conflicto.puedeCombinar ? 'combinar' : 'descartar');
  const [choques, setChoques] = useState<Choque[] | null>(null);
  const [elecciones, setElecciones] = useState<Record<string, Eleccion>>({});
  const [trabajando, setTrabajando] = useState(false);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    if (!p.abierto) return;
    setOpcion(p.conflicto.puedeCombinar ? 'combinar' : 'descartar');
    setChoques(null);
    setElecciones({});
    setFallo(false);
  }, [p.abierto, p.conflicto.puedeCombinar]);

  const continuar = async () => {
    setTrabajando(true);
    setFallo(false);
    try {
      if (opcion === 'combinar') {
        const r = await p.prepararCombinacion(elecciones);
        if (!r) {
          setFallo(true);
          return;
        }
        // Primera pasada con choques: se muestran para elegir antes de guardar.
        if (r.choques.length > 0 && choques === null) {
          setChoques(r.choques);
          setElecciones(Object.fromEntries(r.choques.map((c) => [c.clave, 'mia' as Eleccion])));
          return;
        }
        if (await p.onResolver('combinar', r.documento)) p.onAbiertoChange(false);
        return;
      }
      if (await p.onResolver(opcion)) p.onAbiertoChange(false);
    } finally {
      setTrabajando(false);
    }
  };

  const nombreChoque = (c: Choque) => {
    if (c.tipo === 'seccion') return t('conflicto.choqueSeccion', { pagina: c.titulo, seccion: nombreDeSeccion(c.seccionTipo) });
    if (c.tipo === 'pagina') return t('conflicto.choquePagina', { pagina: c.titulo });
    if (c.tipo === 'orden') return t('conflicto.choqueOrden', { pagina: c.titulo });
    return t(`publicar.area.${c.area}`);
  };

  const primario =
    opcion === 'combinar'
      ? choques
        ? t('conflicto.combinarElegido')
        : t('conflicto.combinarAccion')
      : opcion === 'descartar'
        ? t('conflicto.descartarAccion')
        : t('conflicto.sobrescribirAccion');

  return (
    <Dialogo
      abierto={p.abierto}
      onAbiertoChange={p.onAbiertoChange}
      titulo={t('conflicto.titulo')}
      descripcion={`${textoQuien(p.conflicto, t)} ${t('conflicto.tusCambiosSiguen')}`}
      ancho={560}
      textoCancelar={t('conflicto.ahoraNo')}
      secundarios={p.onVerSuyos ? [{ etiqueta: t('conflicto.verSuyos'), onClick: p.onVerSuyos }] : undefined}
      primario={{ etiqueta: primario, onClick: () => void continuar(), cargando: trabajando, destructiva: opcion === 'sobrescribir' }}
    >
      {choques ? (
        <div className="flex flex-col gap-3">
          <AvisoTonal tono="advertencia" titulo={t('conflicto.choquesTitulo', { n: choques.length })} descripcion={t('conflicto.choquesDescripcion')} />
          <ul className="flex flex-col gap-2">
            {choques.map((c) => (
              <li key={c.clave} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
                <span className="min-w-0 truncate text-sm text-fg">{nombreChoque(c)}</span>
                <SegmentedControl
                  etiqueta={nombreChoque(c)}
                  tamano="sm"
                  opciones={[
                    { valor: 'mia', etiqueta: t('conflicto.mia') },
                    { valor: 'suya', etiqueta: t('conflicto.suya') },
                  ]}
                  valor={elecciones[c.clave] ?? 'mia'}
                  onValorChange={(v) => setElecciones((e) => ({ ...e, [c.clave]: v }))}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div role="radiogroup" aria-label={t('conflicto.opciones')} className="flex flex-col gap-3">
          <TarjetaSeleccionable
            titulo={t('conflicto.combinar')}
            descripcion={p.conflicto.puedeCombinar ? t('conflicto.combinarAyuda') : t('conflicto.combinarNoDisponible')}
            seleccionada={opcion === 'combinar'}
            onSeleccionar={() => setOpcion('combinar')}
            deshabilitada={!p.conflicto.puedeCombinar}
            orientacion="horizontal"
          />
          <TarjetaSeleccionable
            titulo={t('conflicto.descartar')}
            descripcion={t('conflicto.descartarAyuda')}
            seleccionada={opcion === 'descartar'}
            onSeleccionar={() => setOpcion('descartar')}
            orientacion="horizontal"
          />
          <TarjetaSeleccionable
            titulo={t('conflicto.sobrescribir')}
            descripcion={t('conflicto.sobrescribirAyuda', { quien: p.conflicto.autor ?? t('conflicto.otraPersona') })}
            seleccionada={opcion === 'sobrescribir'}
            onSeleccionar={() => setOpcion('sobrescribir')}
            orientacion="horizontal"
            className={cn('border-line-danger', opcion === 'sobrescribir' && 'bg-danger-subtle')}
          />
          {fallo && <AvisoTonal tono="peligro" titulo={t('conflicto.error')} descripcion={t('conflicto.errorCombinar')} />}
        </div>
      )}
    </Dialogo>
  );
}
