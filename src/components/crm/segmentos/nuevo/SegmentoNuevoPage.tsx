'use client';

/**
 * Constructor de segmentos (Figma CRM 1384:825677 «Constructor — conteo en
 * vivo» y 1388:1979 «conteo no disponible»).
 *
 * - Grupos de reglas: «Todos estos» y «O todos estos» (Y dentro, O entre
 *   grupos), el formato de `segmentosFiltroLogica`, que entienden igual el
 *   conteo, el recálculo y la materialización de campañas.
 * - El conteo se pide al SERVIDOR mientras se escribe (`useConteoSegmento`).
 * - Al guardar, el conteo definitivo lo escribe el servidor
 *   (`/api/crm/segments/[id]/recount`); si aún no está disponible, el segmento
 *   queda guardado igual y se avisa.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, Plus } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/kit/PageHeader';
import { FormField } from '@/components/kit/FormField';
import { Tarjeta } from '@/components/kit/Tarjeta';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { clasesBoton } from '@/components/kit/botonClases';
import { CLASE_AREA, CLASE_CAMPO } from '@/components/crm/kit/camposCrm';
import { filtroParaGuardar, type FiltroSegmento } from '@/lib/services/crm/segmentosFiltroLogica';
import { SegmentosService } from '../SegmentosService';
import type { FilterRule } from '../types';
import { ConteoEnVivoSegmento } from './ConteoEnVivoSegmento';
import { GrupoReglasSegmento } from './GrupoReglasSegmento';
import { useConteoSegmento } from './useConteoSegmento';
import { gruposParaContar } from './conteoSegmentoLogica';
import { anadirGrupo, anadirRegla, actualizarRegla, puedeAnadirGrupo, quitarGrupo, quitarRegla, reglaNueva } from './reglasSegmentoLogica';

type Tipo = 'dinamico' | 'estatico';

export function SegmentoNuevoPage() {
  const t = useTranslations('crm.segmentos.constructor');
  const router = useRouter();
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tipo, setTipo] = useState<Tipo>('dinamico');
  const [grupos, setGrupos] = useState<FilterRule[][]>([[reglaNueva()]]);
  const [guardando, setGuardando] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const conteo = useConteoSegmento(grupos);

  const errorNombre = intentado && !nombre.trim() ? t('datos.nombreObligatorio') : null;

  const guardar = async () => {
    setIntentado(true);
    if (!nombre.trim() || guardando) return;
    setGuardando(true);
    try {
      const segmento = await SegmentosService.createSegment({
        name: nombre.trim(),
        description: descripcion.trim() || undefined,
        filter_json: filtroParaGuardar(gruposParaContar(grupos)) as FilterRule[] | FiltroSegmento,
        is_dynamic: tipo === 'dinamico',
      });
      if (!segmento) throw new Error('crear');
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
    <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => void guardar()} disabled={guardando}>
      {guardando && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
      {guardando ? t('guardando') : t('guardar')}
    </button>
  );

  return (
    <div className="min-h-screen space-y-6 bg-canvas p-4 sm:p-6">
      <PageHeader
        variante="form"
        volverA="/app/crm/segmentos"
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        migas={[{ etiqueta: t('migas.crm'), href: '/app/crm' }, { etiqueta: t('migas.segmentos'), href: '/app/crm/segmentos' }, { etiqueta: t('migas.nuevo') }]}
        acciones={
          <>
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => router.push('/app/crm/segmentos')}>
              {t('cancelar')}
            </button>
            {botonGuardar}
          </>
        }
        movil={{ accion: botonGuardar }}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="min-w-0 space-y-4">
          <Tarjeta titulo={t('datos.titulo')}>
            <div className="space-y-4">
              <FormField etiqueta={t('datos.nombre')} obligatorio error={errorNombre}>
                <input className={CLASE_CAMPO} value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} placeholder={t('datos.nombrePlaceholder')} />
              </FormField>
              <FormField etiqueta={t('datos.descripcion')}>
                <textarea className={CLASE_AREA} value={descripcion} maxLength={500} onChange={(e) => setDescripcion(e.target.value)} placeholder={t('datos.descripcionPlaceholder')} />
              </FormField>
              <FormField etiqueta={t('datos.tipo')} ayuda={tipo === 'dinamico' ? t('datos.ayudaDinamico') : t('datos.ayudaEstatico')}>
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
          </Tarjeta>

          <div className="space-y-3">
            <h2 className="text-base font-semibold text-fg">{t('grupos.titulo')}</h2>
            {grupos.map((reglas, g) => (
              <div key={g} className="space-y-3">
                {g > 0 && (
                  <div className="flex items-center gap-3" aria-hidden="true">
                    <span className="h-px flex-1 bg-line" />
                    <span className="rounded-full bg-brand-tint px-2.5 py-0.5 text-xs font-semibold uppercase text-brand">{t('grupos.o')}</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                )}
                <GrupoReglasSegmento
                  indice={g}
                  reglas={reglas}
                  onCambiarRegla={(r, regla) => setGrupos((gs) => actualizarRegla(gs, g, r, regla))}
                  onQuitarRegla={(r) => setGrupos((gs) => quitarRegla(gs, g, r))}
                  onAnadirRegla={() => setGrupos((gs) => anadirRegla(gs, g))}
                  onQuitarGrupo={() => setGrupos((gs) => quitarGrupo(gs, g))}
                />
              </div>
            ))}
            <button type="button" className={clasesBoton({ variante: 'fantasma' })} onClick={() => setGrupos(anadirGrupo)} disabled={!puedeAnadirGrupo(grupos)}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('grupos.anadirO')}
            </button>
          </div>
        </div>

        <div className="lg:sticky lg:top-4">
          <ConteoEnVivoSegmento {...conteo} />
        </div>
      </div>
    </div>
  );
}
