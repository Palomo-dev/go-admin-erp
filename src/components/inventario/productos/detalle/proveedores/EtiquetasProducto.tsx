'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Plus, Tag, X } from 'lucide-react';
import { EmptyState, FormField } from '@/components/kit';
import { MultiSelect, type OpcionMulti } from '@/components/kit/MultiSelect';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { avisarCambioCatalogo } from '@/lib/services/website/avisarCambioCatalogo';
import { useProductoDetalle } from '../ContextoProducto';
import { DialogoNuevaEtiqueta, type EtiquetaCreada } from './DialogoNuevaEtiqueta';
import { hexEtiqueta } from './colorEtiqueta';

interface Etiqueta {
  id: number;
  name: string;
  color: string | null;
}

/**
 * Sub-pestaña «Etiquetas» (A.11; Figma `Producto — Proveedores y etiquetas`):
 * MultiSelect del kit sobre las etiquetas de la organización con búsqueda y
 * «Crear “…”», píldoras asignadas con su color y «×», y el panel de ayuda.
 * Escribe en `product_tag_relations` (y en `product_tags` al crear).
 */
export function EtiquetasProducto() {
  const t = useTranslations('productoDetalle.etiquetas');
  const tt = useTranslations('productoDetalle.acciones');
  const { toast } = useToast();
  const { producto, organizacionId, resumen, permisos, recargarResumen, mensajeError } = useProductoDetalle();

  const [todas, setTodas] = useState<Etiqueta[]>([]);
  const [asignadas, setAsignadas] = useState<number[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [crear, setCrear] = useState<string | null>(null);

  const eliminado = producto.status === 'deleted';
  const sinPermiso = !!resumen && !permisos.editar;
  const bloqueado = eliminado || sinPermiso;
  const motivo = eliminado ? tt('motivoEliminado') : sinPermiso ? tt('motivoSinPermiso') : undefined;

  const cargar = useCallback(async () => {
    setError(null);
    const [et, rel] = await Promise.all([
      supabase.from('product_tags').select('id, name, color').eq('organization_id', organizacionId).order('name'),
      supabase.from('product_tag_relations').select('tag_id').eq('product_id', producto.id),
    ]);
    const e = et.error ?? rel.error;
    if (e) setError(mensajeError(e));
    else {
      setTodas((et.data ?? []) as Etiqueta[]);
      setAsignadas(((rel.data ?? []) as { tag_id: number }[]).map((r) => r.tag_id));
    }
    setCargando(false);
  }, [organizacionId, producto.id, mensajeError]);

  useEffect(() => {
    setCargando(true);
    void cargar();
  }, [cargar]);

  const opciones: OpcionMulti[] = useMemo(
    () => todas.map((e) => ({ valor: String(e.id), etiqueta: e.name, color: hexEtiqueta(e.color) })),
    [todas],
  );
  const elegidas = useMemo(
    () => asignadas.map((id) => todas.find((e) => e.id === id)).filter((e): e is Etiqueta => !!e),
    [asignadas, todas],
  );

  const aplicar = async (nuevas: number[]) => {
    const antes = asignadas;
    const agregar = nuevas.filter((id) => !antes.includes(id));
    const quitar = antes.filter((id) => !nuevas.includes(id));
    if (agregar.length === 0 && quitar.length === 0) return;
    setAsignadas(nuevas);
    setGuardando(true);
    try {
      if (agregar.length > 0) {
        const { error: e } = await supabase
          .from('product_tag_relations')
          .upsert(agregar.map((tag_id) => ({ product_id: producto.id, tag_id })), { onConflict: 'product_id,tag_id', ignoreDuplicates: true });
        if (e) throw e;
      }
      if (quitar.length > 0) {
        const { error: e } = await supabase.from('product_tag_relations').delete().eq('product_id', producto.id).in('tag_id', quitar);
        if (e) throw e;
      }
      const nombre = (id: number) => todas.find((x) => x.id === id)?.name ?? '';
      toast({
        title:
          agregar.length === 1 && quitar.length === 0
            ? t('toasts.agregada', { nombre: nombre(agregar[0]) })
            : quitar.length === 1 && agregar.length === 0
              ? t('toasts.quitada', { nombre: nombre(quitar[0]) })
              : t('toasts.actualizadas'),
      });
      avisarCambioCatalogo();
      await recargarResumen();
    } catch (e) {
      setAsignadas(antes);
      toast({ variant: 'destructive', title: t('toasts.error'), description: mensajeError(e) });
    } finally {
      setGuardando(false);
    }
  };

  const alCrear = async (et: EtiquetaCreada) => {
    setTodas((ts) => [...ts, et].sort((a, b) => a.name.localeCompare(b.name)));
    toast({ title: t('toasts.creada', { nombre: et.name }) });
    await aplicar([...asignadas, et.id]);
  };

  if (cargando) {
    return (
      <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 lg:p-5" aria-busy="true">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-10 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <EmptyState
        variante="error"
        titulo={t('estados.errorTitulo')}
        descripcion={error}
        onReintentar={() => {
          setCargando(true);
          void cargar();
        }}
      />
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 lg:p-5" aria-label={t('titulo')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-fg">{t('tituloConteo', { n: elegidas.length })}</h2>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setCrear('')} disabled={bloqueado} title={motivo}>
          <Plus className="size-4" aria-hidden /> {t('nueva')}
        </Button>
      </div>

      <FormField etiqueta={t('buscar')} ayuda={bloqueado ? motivo : t('buscarAyuda')}>
        {(campo) => (
          <MultiSelect
            id={campo.id}
            aria-labelledby={campo.idEtiqueta}
            aria-describedby={campo['aria-describedby']}
            opciones={opciones}
            valores={asignadas.map(String)}
            onValoresChange={(v) => void aplicar(v.map(Number))}
            onCrear={bloqueado ? undefined : (texto) => setCrear(texto)}
            textoCrear={(texto) => t('crearCon', { nombre: texto })}
            placeholder={t('placeholder')}
            placeholderBusqueda={t('placeholderBusqueda')}
            textoVacio={t('sinResultados')}
            etiquetaQuitar={(e) => t('quitar', { nombre: e })}
            deshabilitado={bloqueado || guardando}
          />
        )}
      </FormField>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-fg-secondary">{t('asignadas')}</h3>
        {elegidas.length === 0 ? (
          <EmptyState compacto icono={Tag} titulo={t('estados.vacioTitulo')} descripcion={t('estados.vacioDescripcion')} />
        ) : (
          <ul className="flex flex-wrap gap-2">
            {elegidas.map((e) => (
              <li key={e.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-subtle py-1 pl-2.5 pr-1 text-sm text-fg">
                <span className="size-2 rounded-full" style={{ backgroundColor: hexEtiqueta(e.color) }} aria-hidden />
                {e.name}
                <button
                  type="button"
                  onClick={() => void aplicar(asignadas.filter((id) => id !== e.id))}
                  disabled={bloqueado || guardando}
                  aria-label={t('quitar', { nombre: e.name })}
                  title={motivo}
                  className="flex size-6 items-center justify-center rounded-full text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-line-info bg-info-subtle p-4 text-info-text">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 className="size-4" aria-hidden /> {t('ayuda.titulo')}
        </h3>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>{t('ayuda.busqueda')}</li>
          <li>{t('ayuda.agrupar')}</li>
          <li>{t('ayuda.campanas')}</li>
          <li>{t('ayuda.reportes')}</li>
        </ul>
      </div>

      <DialogoNuevaEtiqueta
        abierto={crear !== null}
        onAbiertoChange={(v) => !v && setCrear(null)}
        organizacionId={organizacionId}
        nombreInicial={crear ?? ''}
        existentes={todas.map((e) => e.name)}
        onCreada={alCrear}
      />
    </section>
  );
}
