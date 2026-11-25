'use client';

/**
 * «Planes que se muestran» del inspector de «Planes de membresía» (Figma «16 Sitio web» E1/E2,
 * 3286-101346; aprobado el 2026-11-25).
 *
 * Lista los planes reales de Membresías › Planes: los activos con flechas para ordenar, la estrella
 * «Popular» (uno solo) y el ojo para ocultarlo en la tienda; los inactivos, apagados («no se
 * publica»). Solo escribe el `content` de la sección (`plan_order`, `hidden_plan_ids`,
 * `popular_plan_id`): sin columnas nuevas. Precio, duración, beneficios y activo se cambian en
 * Membresías › Planes. Sin planes activos: el aviso y el enlace para crear el primero.
 *
 * Textos: `sitioWeb.editor.planesMembresia.*` (es/en/fr/pt).
 */
import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Crown, ExternalLink, Eye, EyeOff, Lock, Plus, Star } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { AvisoTonal, clasesBoton } from '@/components/kit';
import { supabase } from '@/lib/supabase/config';
import {
  alternarPlanOculto,
  alternarPlanPopular,
  conOrdenPlanes,
  leerAjustesPlanes,
  type EstadoVentaPlan,
} from '@/lib/website/contrato/paginaMembresias';
import { useTextosEditor } from '../textos';
import { SELECT_PLANES_EDITOR, listaEditor, moverPlan, planesDesdeFilas, type FilaPlanEditor, type PlanEditor } from './planesMembresiaLogica';

/** Membresías › Planes del ERP. */
export const RUTA_PLANES_MEMBRESIA = '/app/membresias/planes';

const COLOR_ESTADO: Record<EstadoVentaPlan, string> = {
  en_linea: 'bg-green-600',
  consulta: 'bg-amber-500',
  pausado: 'bg-gray-400',
};

function pesos(n: number): string {
  return `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
}

export interface EditorPlanesMembresiaProps {
  organizationId?: number;
  contenido: Record<string, unknown>;
  onCambiarContenido: (contenido: Record<string, unknown>) => void;
}

export function EditorPlanesMembresia({ organizationId, contenido, onCambiarContenido }: EditorPlanesMembresiaProps) {
  const t = useTextosEditor();
  const [carga, setCarga] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [planes, setPlanes] = useState<PlanEditor[]>([]);

  const cargar = useCallback(async () => {
    if (!organizationId) return;
    setCarga('cargando');
    const { data, error } = await supabase
      .from('membership_plans')
      .select(SELECT_PLANES_EDITOR)
      .eq('organization_id', organizationId);
    if (error) {
      setCarga('error');
      return;
    }
    setPlanes(planesDesdeFilas((data ?? []) as unknown as FilaPlanEditor[]));
    setCarga('listo');
  }, [organizationId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const ajustes = leerAjustesPlanes(contenido);
  const { activos, inactivos } = listaEditor(planes, ajustes);
  const ocultos = new Set(ajustes.ocultos);

  const estadoTexto = (p: PlanEditor) => {
    if (p.estado === 'en_linea') return p.price !== null ? t('planesMembresia.enLinea', { precio: pesos(p.price) }) : t('planesMembresia.enLineaSinPrecio');
    if (p.estado === 'pausado') return t('planesMembresia.pausado');
    return t('planesMembresia.consulta');
  };

  const enlacePlanes = (
    <a href={RUTA_PLANES_MEMBRESIA} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 self-start text-xs font-medium text-brand hover:underline">
      {t('planesMembresia.abrirPlanes')}
      <ExternalLink aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
    </a>
  );

  if (carga === 'cargando') {
    return <p className="text-xs text-fg-secondary" data-editor-planes-membresia="cargando">{t('planesMembresia.cargando')}</p>;
  }
  if (carga === 'error') {
    return (
      <div className="flex flex-col gap-2" data-editor-planes-membresia="error">
        <p className="text-xs text-fg-secondary">{t('planesMembresia.error')}</p>
        <button type="button" onClick={() => void cargar()} className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'self-start')}>
          {t('planesMembresia.reintentar')}
        </button>
      </div>
    );
  }

  if (activos.length === 0) {
    return (
      <div className="flex flex-col gap-3" data-editor-planes-membresia="vacio">
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line p-4 text-center">
          <Crown aria-hidden="true" className="size-6 text-fg-secondary" strokeWidth={1.5} />
          <p className="text-sm font-semibold text-fg">{t('planesMembresia.vacioTitulo')}</p>
          <p className="text-xs leading-4 text-fg-secondary">{t('planesMembresia.vacioTexto')}</p>
          <a href={RUTA_PLANES_MEMBRESIA} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'primario', tamano: 'sm' })}>
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('planesMembresia.crearPlan')}
          </a>
        </div>
        <AvisoTonal tono="advertencia" compacto titulo={t('planesMembresia.paginaNoVisibleTitulo')} descripcion={t('planesMembresia.paginaNoVisible')} />
        {inactivos.length > 0 && <FilasInactivas planes={inactivos} />}
      </div>
    );
  }

  const ids = activos.map((p) => p.id);
  return (
    <div className="flex flex-col gap-2" data-editor-planes-membresia="lista">
      <p className="text-xs leading-4 text-fg-secondary">{t('planesMembresia.ayuda')}</p>
      <ul className="flex flex-col gap-1.5">
        {activos.map((p, i) => {
          const oculto = ocultos.has(p.id);
          const popular = ajustes.popular === p.id;
          return (
            <li key={p.id} data-plan={p.id} className={cn('flex items-center gap-2 rounded-lg border border-line px-2 py-2', oculto && 'opacity-60')}>
              <span className="flex shrink-0 flex-col">
                <button type="button" aria-label={t('planesMembresia.subir', { nombre: p.nombre })} disabled={i === 0} onClick={() => onCambiarContenido(conOrdenPlanes(contenido, moverPlan(ids, i, -1)))} className="rounded p-0.5 text-fg-secondary hover:bg-subtle disabled:opacity-30">
                  <ArrowUp aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
                </button>
                <button type="button" aria-label={t('planesMembresia.bajar', { nombre: p.nombre })} disabled={i === activos.length - 1} onClick={() => onCambiarContenido(conOrdenPlanes(contenido, moverPlan(ids, i, 1)))} className="rounded p-0.5 text-fg-secondary hover:bg-subtle disabled:opacity-30">
                  <ArrowDown aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
                </button>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{p.nombre}</span>
                <span className="flex items-center gap-1.5 text-xs text-fg-secondary">
                  <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', COLOR_ESTADO[p.estado])} />
                  <span className="truncate">{oculto ? t('planesMembresia.oculto') : estadoTexto(p)}</span>
                </span>
              </span>
              <button
                type="button"
                aria-pressed={popular}
                aria-label={popular ? t('planesMembresia.quitarPopular', { nombre: p.nombre }) : t('planesMembresia.marcarPopular', { nombre: p.nombre })}
                title={popular ? t('planesMembresia.quitarPopular', { nombre: p.nombre }) : t('planesMembresia.marcarPopular', { nombre: p.nombre })}
                onClick={() => onCambiarContenido(alternarPlanPopular(contenido, p.id))}
                className={cn('rounded p-1 hover:bg-subtle', popular ? 'text-amber-500' : 'text-fg-secondary')}
              >
                <Star aria-hidden="true" className="size-4" strokeWidth={1.5} fill={popular ? 'currentColor' : 'none'} />
              </button>
              <button
                type="button"
                aria-pressed={!oculto}
                aria-label={oculto ? t('planesMembresia.mostrar', { nombre: p.nombre }) : t('planesMembresia.ocultar', { nombre: p.nombre })}
                title={oculto ? t('planesMembresia.mostrar', { nombre: p.nombre }) : t('planesMembresia.ocultar', { nombre: p.nombre })}
                onClick={() => onCambiarContenido(alternarPlanOculto(contenido, p.id))}
                className="rounded p-1 text-fg-secondary hover:bg-subtle"
              >
                {oculto ? <EyeOff aria-hidden="true" className="size-4" strokeWidth={1.5} /> : <Eye aria-hidden="true" className="size-4" strokeWidth={1.5} />}
              </button>
            </li>
          );
        })}
      </ul>
      {inactivos.length > 0 && <FilasInactivas planes={inactivos} />}
      <AvisoTonal tono="informacion" compacto titulo={t('planesMembresia.notaTitulo')} descripcion={t('planesMembresia.nota')} />
      {enlacePlanes}
    </div>
  );
}

function FilasInactivas({ planes }: { planes: readonly PlanEditor[] }) {
  const t = useTextosEditor();
  return (
    <ul className="flex flex-col gap-1.5" aria-label={t('planesMembresia.inactivosEtiqueta')}>
      {planes.map((p) => (
        <li key={p.id} data-plan-inactivo={p.id} className="flex items-center gap-2 rounded-lg border border-line bg-subtle px-2 py-2 text-fg-secondary">
          <Lock aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.5} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{p.nombre}</span>
            <span className="text-xs">{t('planesMembresia.inactivo')}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
