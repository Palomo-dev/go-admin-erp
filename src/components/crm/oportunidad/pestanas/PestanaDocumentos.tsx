'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Camera, CircleX, Download, ExternalLink, FileText, Loader2, RefreshCw, Trash2, Upload } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import { Dialogo } from '@/components/kit/Dialogo';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import { clasesBoton } from '@/components/kit/botonClases';
import { useEsEscritorio } from '@/components/kit/useEsEscritorio';
import { ErrorApiCrm, claveError, pedirCrm } from '@/components/crm/acciones/apiCrm';
import { nombreUsuario } from '@/components/crm/acciones/catalogosCrmLogica';
import type { OpcionUsuario } from '@/components/crm/kit/camposCrm';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { CRMDocument } from '@/lib/services/crm/documentService';
import { cuandoNota, tamanoArchivo } from './pestanasLogica';

/**
 * Pestaña «Documentos» de la oportunidad (Figma 822:236526, error 823:246103,
 * móvil 824:171769): zona para arrastrar o elegir varios archivos, filas con
 * tamaño, quién lo subió y cuándo (zona de la organización), «Descargar» y
 * «⋯» (Descargar, Ver en otra pestaña, Eliminar…). Todo por
 * `/api/crm/documents/**` (bucket privado, URL firmada del servidor).
 */
export interface PestanaDocumentosProps {
  oportunidadId: string;
  usuarios: readonly OpcionUsuario[];
  onConteo?: (n: number) => void;
}

async function subir(oportunidadId: string, archivo: File): Promise<void> {
  const datos = new FormData();
  datos.set('file', archivo);
  datos.set('name', archivo.name);
  datos.set('related_type', 'opportunity');
  datos.set('related_id', oportunidadId);
  const res = await fetch('/api/crm/documents', { method: 'POST', body: datos });
  const json = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
  if (!res.ok || !json?.success) throw new ErrorApiCrm(res.status, null, json?.error ?? `HTTP ${res.status}`);
}

export function PestanaDocumentos({ oportunidadId, usuarios, onConteo }: PestanaDocumentosProps) {
  const t = useTranslations('crm.oportunidad.pestanas.documentos');
  const tn = useTranslations('crm.oportunidad.pestanas.notas');
  const te = useTranslations('crm.accionesRapidas.errores');
  const idioma = useLocale();
  const { timezone } = useFormatDate();
  const escritorio = useEsEscritorio();
  const [docs, setDocs] = useState<CRMDocument[] | null>(null);
  const [error, setError] = useState(false);
  const [subiendo, setSubiendo] = useState(0);
  const [encima, setEncima] = useState(false);
  const [borrar, setBorrar] = useState<CRMDocument | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const conteoRef = useRef(onConteo);
  conteoRef.current = onConteo;

  const cargar = useCallback(async () => {
    try {
      const { data } = await pedirCrm<CRMDocument[]>(`/api/crm/documents?related_type=opportunity&related_id=${encodeURIComponent(oportunidadId)}`);
      setDocs(data ?? []);
      setError(false);
      conteoRef.current?.((data ?? []).length);
    } catch {
      setError(true);
    }
  }, [oportunidadId]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const subirTodos = async (lista: FileList | File[] | null) => {
    const archivos = Array.from(lista ?? []);
    if (!archivos.length) return;
    setSubiendo(archivos.length);
    let ok = 0;
    for (const a of archivos) {
      try {
        await subir(oportunidadId, a);
        ok += 1;
      } catch (e) {
        toast({ title: t('errorSubir', { nombre: a.name }), description: te(claveError(e)), variant: 'destructive' });
      }
    }
    setSubiendo(0);
    if (input.current) input.current.value = '';
    if (ok > 0) toast({ title: t('subidos', { n: ok }) });
    await cargar();
  };
  const url = async (d: CRMDocument): Promise<string | null> => {
    try {
      const { extra } = await pedirCrm<unknown>(`/api/crm/documents/${d.id}/download`);
      return typeof extra.url === 'string' ? extra.url : null;
    } catch {
      return null;
    }
  };
  const abrir = async (d: CRMDocument, descargar: boolean) => {
    const enlace = await url(d);
    if (!enlace) {
      toast({ title: t('errorDescargar'), variant: 'destructive' });
      return;
    }
    if (descargar) {
      const a = document.createElement('a');
      a.href = enlace;
      a.download = d.name;
      a.rel = 'noopener';
      a.click();
    } else window.open(enlace, '_blank', 'noopener');
  };
  const eliminar = async () => {
    if (!borrar) return;
    setOcupado(true);
    try {
      await pedirCrm(`/api/crm/documents/${borrar.id}`, { method: 'DELETE' });
      toast({ title: t('eliminado') });
      setBorrar(null);
      await cargar();
    } catch (e) {
      toast({ title: t('errorEliminar'), description: te(claveError(e)), variant: 'destructive' });
    } finally {
      setOcupado(false);
    }
  };

  const ahora = new Date();
  return (
    <section aria-label={t('aria')} className="flex flex-col gap-3">
      {/* Figma 823:246103: el error va en un aviso arriba y la zona de subida sigue disponible. */}
      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-line-danger bg-danger-subtle px-3 py-2.5">
          <CircleX aria-hidden="true" className="size-4 shrink-0 text-danger-text" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[13px] font-semibold text-danger-text">{t('errorTitulo')}</span>
            <span className="text-[13px] text-fg">{t('errorDetalle')}</span>
          </div>
          <button type="button" onClick={() => void cargar()} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
            <RefreshCw aria-hidden="true" className="size-4" />
            {t('reintentar')}
          </button>
        </div>
      )}
      {/* Móvil (Figma 824:171769): un botón «Subir archivo o tomar foto» en vez de la zona de arrastre. */}
      {!escritorio ? (
        <button type="button" onClick={() => input.current?.click()} disabled={subiendo > 0} className={clasesBoton({ variante: 'secundario', anchoCompleto: true })}>
          {subiendo > 0 ? <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : <Camera aria-hidden="true" className="size-4" />}
          {subiendo > 0 ? t('subiendo', { n: subiendo }) : t('subirMovil')}
        </button>
      ) : (
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => { e.preventDefault(); setEncima(false); void subirTodos(e.dataTransfer.files); }}
        disabled={subiendo > 0}
        className={cn('flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand', encima ? 'border-brand bg-brand-tint' : 'border-line-strong bg-surface hover:bg-hover')}
      >
        {subiendo > 0 ? <Loader2 aria-hidden="true" className="size-5 animate-spin text-fg-secondary motion-reduce:animate-none" /> : <Upload aria-hidden="true" className="size-5 text-fg-secondary" />}
        <span className="text-sm font-medium text-fg">{subiendo > 0 ? t('subiendo', { n: subiendo }) : t('soltar')}</span>
        <span className="text-xs text-fg-secondary">{t('tipos')}</span>
      </button>
      )}
      <input ref={input} type="file" multiple hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,image/*" onChange={(e) => void subirTodos(e.target.files)} />

      {!docs ? (
        error ? null : <div aria-busy="true" className="flex flex-col gap-2">{[0, 1].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-subtle" />)}</div>
      ) : docs.length === 0 ? (
        <p className="py-2 text-center text-[13px] text-fg-secondary">{t('vacio')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {docs.map((d) => {
            const meta = [tamanoArchivo(d.file_size, idioma), nombreUsuario(usuarios, d.uploaded_by), cuandoNota(d.created_at, ahora, timezone, idioma, tn)].filter(Boolean).join(' · ');
            return (
              <li key={d.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
                <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-fg-secondary"><FileText className="size-4" /></span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-fg">{d.name}</span>
                  <span className="truncate text-xs text-fg-secondary">{meta}</span>
                </div>
                <button type="button" onClick={() => void abrir(d, true)} aria-label={t('descargarAria', { nombre: d.name })} className="hidden size-8 items-center justify-center rounded-lg sm:flex text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                  <Download aria-hidden="true" className="size-4" />
                </button>
                <RowActionsMenu
                  titulo={d.name}
                  tamano="sm"
                  acciones={[
                    { id: 'descargar', etiqueta: t('descargar'), icono: Download, onSelect: () => void abrir(d, true) },
                    { id: 'ver', etiqueta: t('verPestana'), icono: ExternalLink, onSelect: () => void abrir(d, false) },
                    { id: 'eliminar', etiqueta: t('eliminar'), icono: Trash2, destructiva: true, onSelect: () => setBorrar(d) },
                  ]}
                />
              </li>
            );
          })}
        </ul>
      )}

      <Dialogo
        abierto={!!borrar}
        onAbiertoChange={(a) => !a && setBorrar(null)}
        titulo={t('confirmarEliminar', { nombre: borrar?.name ?? '' })}
        descripcion={t('confirmarEliminarDetalle')}
        ancho={440}
        textoCancelar={tn('cancelar')}
        primario={{ etiqueta: tn('eliminarBoton'), destructiva: true, cargando: ocupado, onClick: () => void eliminar() }}
      />
    </section>
  );
}
