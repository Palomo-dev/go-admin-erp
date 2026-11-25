'use client';

/**
 * Constructor de segmentos (Figma CRM 1384:825677 «Constructor — conteo en
 * vivo» y 1388:1979 «conteo no disponible»). Sirve para crear
 * (`/app/crm/segmentos/nuevo`) y para editar las reglas de uno existente
 * (`/app/crm/segmentos/[id]/editar`).
 *
 * - Arriba, una tarjeta con «Nombre» y «Tipo» (Dinámico / Estático).
 * - Grupos de reglas: «Todos estos» y «O todos estos» (Y dentro, O entre
 *   grupos), el formato de `segmentosFiltroLogica`, que entienden igual el
 *   conteo, el recálculo y la materialización de campañas.
 * - A la derecha, el conteo que el SERVIDOR calcula mientras se escribe
 *   (`useConteoSegmento`): coinciden, se pueden contactar y muestra.
 * - Al guardar, el conteo definitivo lo escribe el servidor
 *   (`/api/crm/segments/[id]/recount`); si aún no está disponible, el segmento
 *   queda guardado igual y se avisa.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, Plus, Save, Users } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/kit/PageHeader';
import { FormField } from '@/components/kit/FormField';
import { EmptyState } from '@/components/kit/EmptyState';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { clasesBoton } from '@/components/kit/botonClases';
import { CLASE_CAMPO } from '@/components/crm/kit/camposCrm';
import { filtroParaGuardar, normalizarFiltroSegmento, type FiltroSegmento } from '@/lib/services/crm/segmentosFiltroLogica';
import { SegmentosService } from '../SegmentosService';
import type { FilterRule } from '../types';
import { ConteoEnVivoSegmento } from './ConteoEnVivoSegmento';
import { GrupoReglasSegmento } from './GrupoReglasSegmento';
import { useConteoSegmento } from './useConteoSegmento';
import { gruposParaContar, reglaCompleta } from './conteoSegmentoLogica';
import { anadirGrupo, anadirRegla, actualizarRegla, puedeAnadirGrupo, quitarGrupo, quitarRegla, reglaNueva } from './reglasSegmentoLogica';

type Tipo = 'dinamico' | 'estatico';

interface Props {
  /** Con id, edita las reglas de ese segmento. */
  segmentId?: string;
}

export function SegmentoNuevoPage({ segmentId }: Props = {}) {
  const t = useTranslations('crm.segmentos.constructor');
  const router = useRouter();
  const editando = !!segmentId;
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<Tipo>('dinamico');
  const [grupos, setGrupos] = useState<FilterRule[][]>([[reglaNueva()]]);
  const [cargado, setCargado] = useState<'cargando' | 'listo' | 'noEncontrado'>(editando ? 'cargando' : 'listo');
  const [guardando, setGuardando] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const [tocado, setTocado] = useState(false);
  const conteo = useConteoSegmento(grupos);

  useEffect(() => {
    if (!segmentId) return;
    let vivo = true;
    void SegmentosService.getSegmentById(segmentId).then((s) => {
      if (!vivo) return;
      if (!s) {
        setCargado('noEncontrado');
        return;
      }
      setNombre(s.name);
      setTipo(s.is_dynamic ? 'dinamico' : 'estatico');
      const filtro = normalizarFiltroSegmento(s.filter_json);
      const leidos = (filtro?.grupos ?? []) as FilterRule[][];
      setGrupos(leidos.length > 0 ? leidos : [[]]);
      setCargado('listo');
    });
    return () => {
      vivo = false;
    };
  }, [segmentId]);

  const volverA = editando ? `/app/crm/segmentos/${segmentId}` : '/app/crm/segmentos';
  const errorNombre = intentado && !nombre.trim() ? t('datos.nombreObligatorio') : null;
  // Figma 1388:2472: una regla sin valor se marca en rojo y «Guardar» se deshabilita.
  const incompletas = grupos.some((g) => g.some((r) => !reglaCompleta(r)));
  const cambiar = (f: (gs: FilterRule[][]) => FilterRule[][]) => {
    setTocado(true);
    setGrupos(f);
  };

  const guardar = async () => {
    setIntentado(true);
    if (!nombre.trim() || incompletas || guardando || cargado !== 'listo') return;
    setGuardando(true);
    try {
      const filter_json = filtroParaGuardar(gruposParaContar(grupos)) as FilterRule[] | FiltroSegmento;
      const segmento = editando
        ? await SegmentosService.updateSegment(segmentId, { name: nombre.trim(), filter_json, is_dynamic: tipo === 'dinamico' })
        : await SegmentosService.createSegment({ name: nombre.trim(), filter_json, is_dynamic: tipo === 'dinamico' });
      if (!segmento) throw new Error('guardar');
      try {
        await SegmentosService.recalculateSegment(segmento.id);
        toast({ title: t('ok.creado') });
      } catch {
        toast({ title: t('ok.creado'), description: t('ok.sinConteo') });
      }
      router.push(`/app/crm/segmentos/${segmento.id}`);
    } catch {
      toast({ title: t('errores.crear'), variant: 'destructive' });
      setGuardando(false);
    }
  };

  const botonGuardar = (
    <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => void guardar()} disabled={guardando || incompletas || cargado !== 'listo'} title={incompletas ? t('regla.incompletas') : undefined}>
      {guardando ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Save aria-hidden="true" className="size-4" strokeWidth={1.5} />}
      {guardando ? t('guardando') : t('guardar')}
    </button>
  );

  const migas = [
    { etiqueta: t('migas.crm'), href: '/app/crm' },
    { etiqueta: t('migas.segmentos'), href: '/app/crm/segmentos' },
    { etiqueta: editando ? nombre || t('migas.editar') : t('migas.nuevo') },
  ];

  if (cargado === 'noEncontrado') {
    return (
      <div className="min-h-screen space-y-6 bg-canvas p-4 sm:p-6">
        <PageHeader variante="form" volverA="/app/crm/segmentos" titulo={t('tituloEditar')} migas={migas.slice(0, 2)} />
        <EmptyState titulo={t('noEncontrado.titulo')} descripcion={t('noEncontrado.descripcion')} accion={{ etiqueta: t('noEncontrado.volver'), href: '/app/crm/segmentos' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-4 bg-canvas p-4 sm:p-6">
      <PageHeader
        variante="form"
        volverA={volverA}
        titulo={editando ? t('tituloEditar') : t('titulo')}
        subtitulo={t('subtitulo')}
        icono={Users}
        cargando={cargado === 'cargando'}
        migas={migas}
        acciones={
          <>
            <button type="button" className={clasesBoton({ variante: 'fantasma' })} onClick={() => router.push(volverA)}>
              {t('cancelar')}
            </button>
            {botonGuardar}
          </>
        }
        movil={{ accion: botonGuardar }}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="min-w-0 space-y-4">
          <section aria-label={t('datos.titulo')} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <FormField etiqueta={t('datos.nombre')} obligatorio error={errorNombre} className="min-w-0 flex-1">
                <input className={CLASE_CAMPO} value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} placeholder={t('datos.nombrePlaceholder')} />
              </FormField>
              <FormField etiqueta={t('datos.tipo')} className="sm:w-[178px]">
                {(campo) => (
                  <SegmentedControl<Tipo>
                    aria-labelledby={campo.idEtiqueta}
                    aria-describedby={campo['aria-describedby']}
                    opciones={[
                      { valor: 'dinamico', etiqueta: t('datos.dinamico') },
                      { valor: 'estatico', etiqueta: t('datos.estatico') },
                    ]}
                    valor={tipo}
                    onValorChange={setTipo}
                  />
                )}
              </FormField>
            </div>
            <p className="mt-2 text-xs text-fg-secondary">{tipo === 'dinamico' ? t('datos.ayudaDinamico') : t('datos.ayudaEstatico')}</p>
          </section>

          <h2 className="sr-only">{t('grupos.titulo')}</h2>
          {grupos.map((reglas, g) => (
            <div key={g} className="space-y-4">
              {g > 0 && (
                <span aria-hidden="true" className="inline-flex size-[22px] items-center justify-center rounded-full border border-line bg-surface text-xs font-semibold text-fg-secondary">
                  {t('grupos.o')}
                </span>
              )}
              <GrupoReglasSegmento
                indice={g}
                reglas={reglas}
                marcarIncompletas={tocado || intentado}
                onCambiarRegla={(r, regla) => cambiar((gs) => actualizarRegla(gs, g, r, regla))}
                onQuitarRegla={(r) => cambiar((gs) => quitarRegla(gs, g, r))}
                onAnadirRegla={() => cambiar((gs) => anadirRegla(gs, g))}
                onQuitarGrupo={() => cambiar((gs) => quitarGrupo(gs, g))}
              />
            </div>
          ))}
          {incompletas && (tocado || intentado) && (
            <p role="status" className="text-[13px] text-danger-text">
              {t('regla.incompletas')}
            </p>
          )}
          <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => cambiar(anadirGrupo)} disabled={!puedeAnadirGrupo(grupos)}>
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('grupos.anadirO')}
          </button>
        </div>

        <div className="lg:sticky lg:top-4">
          <ConteoEnVivoSegmento {...conteo} />
        </div>
      </div>
    </div>
  );
}
