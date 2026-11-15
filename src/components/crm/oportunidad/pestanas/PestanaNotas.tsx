'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { FileText, Pencil, Pin, PinOff, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import { EmptyState } from '@/components/kit/EmptyState';
import { Dialogo } from '@/components/kit/Dialogo';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { clasesBoton } from '@/components/kit/botonClases';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { HtmlContentRenderer } from '@/components/shared/HtmlContentRenderer';
import { claveError, emitirCambioCrm, pedirCrm } from '@/components/crm/acciones/apiCrm';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { EntradaFeed } from '@/lib/services/crm/actividadesOrgService';
import { cuandoNota, ordenarNotas, textoPlano } from './pestanasLogica';

/**
 * Pestaña «Notas» de la oportunidad (Figma 822:235945, vacío 823:245869,
 * móvil 824:171631): editor con «Visible para el equipo de la organización» y
 * «+ Agregar nota»; cada nota con autor, hora en la zona de la organización,
 * «Fijada», fijar y «⋯» (Editar, Eliminar…). Lee `GET /api/crm/activities`
 * (`types=note`, con `editable` resuelto en el servidor) y escribe por
 * `/api/crm/notes/**` (o `/api/crm/activities/[id]` para las notas heredadas).
 */
export interface PestanaNotasProps {
  oportunidadId: string;
  onConteo?: (n: number) => void;
}

const vacia = (html: string) => !textoPlano(html);

export function PestanaNotas({ oportunidadId, onConteo }: PestanaNotasProps) {
  const t = useTranslations('crm.oportunidad.pestanas.notas');
  const te = useTranslations('crm.accionesRapidas.errores');
  const idioma = useLocale();
  const { timezone } = useFormatDate();
  const [notas, setNotas] = useState<EntradaFeed[] | null>(null);
  const [error, setError] = useState(false);
  const [cuerpo, setCuerpo] = useState('');
  const [escribiendo, setEscribiendo] = useState(false);
  const [editando, setEditando] = useState<{ id: string; html: string } | null>(null);
  const [borrar, setBorrar] = useState<EntradaFeed | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const conteoRef = useRef(onConteo);
  conteoRef.current = onConteo;

  const cargar = useCallback(async () => {
    try {
      const { data } = await pedirCrm<EntradaFeed[]>(`/api/crm/activities?opportunity_id=${encodeURIComponent(oportunidadId)}&types=note&limit=50`);
      const lista = ordenarNotas(data ?? []);
      setNotas(lista);
      setError(false);
      conteoRef.current?.(lista.length);
    } catch {
      setError(true);
    }
  }, [oportunidadId]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const ejecutar = async (accion: () => Promise<unknown>, ok: string | null) => {
    setOcupado(true);
    try {
      await accion();
      if (ok) toast({ title: ok });
      emitirCambioCrm({ entidad: 'note', id: oportunidadId, accion: 'nota' });
      await cargar();
      return true;
    } catch (e) {
      toast({ title: t('error'), description: te(claveError(e)), variant: 'destructive' });
      return false;
    } finally {
      setOcupado(false);
    }
  };
  const ruta = (n: EntradaFeed) => (n.fuente === 'note' ? `/api/crm/notes/${n.id}` : `/api/crm/activities/${n.id}`);
  const agregar = async () => {
    if (vacia(cuerpo)) return;
    if (await ejecutar(() => pedirCrm('/api/crm/notes', { method: 'POST', cuerpo: { related_type: 'opportunity', related_id: oportunidadId, body: cuerpo } }), t('agregada'))) {
      setCuerpo('');
      setEscribiendo(false);
    }
  };
  const guardarEdicion = async (n: EntradaFeed) => {
    if (!editando || vacia(editando.html)) return;
    const cuerpoPatch = n.fuente === 'note' ? { body: editando.html } : { notes: textoPlano(editando.html) };
    if (await ejecutar(() => pedirCrm(ruta(n), { method: 'PATCH', cuerpo: cuerpoPatch }), t('guardada'))) setEditando(null);
  };

  if (error && !notas) return <div className="rounded-xl border border-line bg-surface"><EmptyState variante="error" compacto titulo={t('errorCarga')} onReintentar={() => void cargar()} /></div>;
  if (!notas) return <div aria-busy="true" className="flex flex-col gap-2">{[120, 72, 72].map((h, i) => <div key={i} className="animate-pulse rounded-xl bg-subtle" style={{ height: h }} />)}</div>;

  if (notas.length === 0 && !escribiendo) {
    return <EmptyState variante="empty" icono={FileText} titulo={t('vacioTitulo')} descripcion={t('vacioDetalle')} accion={{ etiqueta: t('vacioAccion'), icono: Plus, onClick: () => setEscribiendo(true) }} />;
  }

  const ahora = new Date();
  return (
    <section aria-label={t('aria')} className="flex flex-col gap-3">
      <div className="flex flex-col rounded-xl border border-line bg-surface">
        <RichTextEditor value={cuerpo} onChange={setCuerpo} placeholder={t('placeholder')} minHeight={72} className="rounded-b-none border-0" />
        <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
          <span className="text-xs text-fg-muted">{t('visible')}</span>
          <button type="button" onClick={() => void agregar()} disabled={ocupado || vacia(cuerpo)} className={clasesBoton({ tamano: 'sm' })}>
            <Plus aria-hidden="true" className="size-4" />
            {t('agregar')}
          </button>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {notas.map((n) => {
          const enEdicion = editando?.id === n.id;
          return (
            <li key={`${n.fuente}:${n.id}`} className={cn('flex flex-col gap-2 rounded-xl border px-3 py-2.5', n.fijada ? 'border-line-brand bg-brand-tint' : 'border-line bg-surface')}>
              <div className="flex items-center gap-2">
                <AvatarIniciales nombre={n.autor ?? '?'} tamano="sm" className="size-7 text-[11px]" />
                <span className="truncate text-sm font-medium text-fg">{n.autor ?? t('sinAutor')}</span>
                <span className="shrink-0 text-xs text-fg-muted">{cuandoNota(n.ocurrio_en, ahora, timezone, idioma, t)}</span>
                {n.fijada && <Badge tono="marca" apariencia="contorno" tamano="sm">{t('fijada')}</Badge>}
                <span className="flex-1" />
                {n.fuente === 'note' && n.editable && (
                  <button type="button" disabled={ocupado} onClick={() => void ejecutar(() => pedirCrm(ruta(n), { method: 'PATCH', cuerpo: { is_pinned: !n.fijada } }), null)} aria-label={t(n.fijada ? 'desfijar' : 'fijar')} title={t(n.fijada ? 'desfijar' : 'fijar')} className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                    {n.fijada ? <PinOff aria-hidden="true" className="size-4" /> : <Pin aria-hidden="true" className="size-4" />}
                  </button>
                )}
                {n.editable && (
                  <RowActionsMenu
                    titulo={t('accionesAria')}
                    tamano="sm"
                    acciones={[
                      { id: 'editar', etiqueta: t('editar'), icono: Pencil, onSelect: () => setEditando({ id: n.id, html: n.fuente === 'note' ? n.texto ?? '' : `<p>${n.texto ?? ''}</p>` }) },
                      { id: 'eliminar', etiqueta: t('eliminar'), icono: Trash2, destructiva: true, onSelect: () => setBorrar(n) },
                    ]}
                  />
                )}
              </div>
              {enEdicion ? (
                <div className="flex flex-col gap-2">
                  <RichTextEditor value={editando.html} onChange={(html) => setEditando({ id: n.id, html })} minHeight={60} />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setEditando(null)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>{t('cancelar')}</button>
                    <button type="button" disabled={ocupado || vacia(editando.html)} onClick={() => void guardarEdicion(n)} className={clasesBoton({ tamano: 'sm' })}>{t('guardar')}</button>
                  </div>
                </div>
              ) : n.fuente === 'note' ? (
                <HtmlContentRenderer html={n.texto ?? ''} className="text-sm text-fg" />
              ) : (
                <p className="whitespace-pre-wrap text-sm text-fg">{n.texto}</p>
              )}
            </li>
          );
        })}
      </ul>

      <Dialogo
        abierto={!!borrar}
        onAbiertoChange={(a) => !a && setBorrar(null)}
        titulo={t('confirmarEliminar')}
        descripcion={t('confirmarEliminarDetalle')}
        ancho={440}
        textoCancelar={t('cancelar')}
        primario={{ etiqueta: t('eliminarBoton'), destructiva: true, cargando: ocupado, onClick: () => borrar && void ejecutar(() => pedirCrm(ruta(borrar), { method: 'DELETE' }), t('eliminada')).then((ok) => ok && setBorrar(null)) }}
      />
    </section>
  );
}
