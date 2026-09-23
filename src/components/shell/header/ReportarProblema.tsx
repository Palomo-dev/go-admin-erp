'use client';

/**
 * «Reportar un problema o sugerencia» (Figma `02 Componentes` › FeedbackButton
 * 67:3014 y FeedbackDialog 68:3208).
 *
 * El botón del header y la acción del drawer móvil abren el mismo diálogo con
 * el evento `REPORTAR_PROBLEMA_EVENT`. El reporte sale por `POST /api/feedback`
 * con el contexto de la página adjunto (ruta, organización, sucursal, versión,
 * navegador) y hasta 5 imágenes: fotos que se suben o una captura de la
 * pantalla tomada con html2canvas, sin el propio diálogo.
 *
 * Escritorio: diálogo centrado. Móvil (< 1024 px): hoja inferior.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bug, Camera, Check, ImagePlus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useBranch } from '@/lib/context/BranchContext';
import { getDesktopVersion, isDesktop } from '@/lib/utils/desktop';

export const REPORTAR_PROBLEMA_EVENT = 'shell:reportar-problema';

export function abrirReportarProblema(): void {
  window.dispatchEvent(new Event(REPORTAR_PROBLEMA_EVENT));
}

const MAX_ADJUNTOS = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const TIPOS = ['error', 'sugerencia', 'pregunta'] as const;
type Tipo = (typeof TIPOS)[number];

interface Adjunto {
  id: string;
  archivo: File;
  url: string;
}

function navegadorYSistema(): { navegador: string; sistema: string } {
  const ua = navigator.userAgent;
  const version = (re: RegExp) => ua.match(re)?.[1]?.split('.')[0] ?? '';
  const navegador = /Edg\//.test(ua)
    ? `Edge ${version(/Edg\/([\d.]+)/)}`
    : /Chrome\//.test(ua)
      ? `Chrome ${version(/Chrome\/([\d.]+)/)}`
      : /Firefox\//.test(ua)
        ? `Firefox ${version(/Firefox\/([\d.]+)/)}`
        : /Safari\//.test(ua)
          ? `Safari ${version(/Version\/([\d.]+)/)}`
          : 'Otro';
  const sistema = /Windows NT/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Otro';
  return { navegador: navegador.trim(), sistema };
}

export function FeedbackButton() {
  const t = useTranslations('header');
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={abrirReportarProblema}
          aria-label={t('reportProblem')}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface text-fg-secondary outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Bug className="h-5 w-5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{t('reportProblem')}</TooltipContent>
    </Tooltip>
  );
}

interface ReportarProblemaDialogProps {
  organizacionId: number | null;
  organizacionNombre: string;
  correo: string | null;
}

export function ReportarProblemaDialog({ organizacionId, organizacionNombre, correo }: ReportarProblemaDialogProps) {
  const t = useTranslations('header');
  const pathname = usePathname();
  const movil = useMediaQuery('(max-width: 1023px)');
  const { branches, selectedBranchId, isAllSelected } = useBranch();

  const [abierto, setAbierto] = useState(false);
  const [capturando, setCapturando] = useState(false);
  const [tipo, setTipo] = useState<Tipo>('error');
  const [descripcion, setDescripcion] = useState('');
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [incluirCorreo, setIncluirCorreo] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<{ id: number; correo: string | null } | null>(null);
  const [versionDesktop, setVersionDesktop] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const abrir = () => setAbierto(true);
    window.addEventListener(REPORTAR_PROBLEMA_EVENT, abrir);
    return () => window.removeEventListener(REPORTAR_PROBLEMA_EVENT, abrir);
  }, []);

  useEffect(() => {
    if (abierto && isDesktop()) void getDesktopVersion().then(setVersionDesktop);
  }, [abierto]);

  // Las URLs de las miniaturas se liberan al quitarlas o al desmontar.
  const adjuntosRef = useRef(adjuntos);
  adjuntosRef.current = adjuntos;
  useEffect(() => () => adjuntosRef.current.forEach((a) => URL.revokeObjectURL(a.url)), []);

  const sucursal = isAllSelected ? t('allBranches') : branches.find((b) => b.id === selectedBranchId)?.name ?? null;

  const contexto = useMemo(() => {
    if (!abierto) return null;
    const { navegador, sistema } = navegadorYSistema();
    return {
      pagina: typeof document !== 'undefined' ? document.title : '',
      organizacion: organizacionNombre,
      sucursal,
      versionWeb: process.env.NEXT_PUBLIC_APP_VERSION || 'dev',
      versionDesktop,
      navegador,
      sistema,
      ventana: `${window.innerWidth}×${window.innerHeight}`,
    };
  }, [abierto, organizacionNombre, sucursal, versionDesktop]);

  const agregar = useCallback(
    (archivos: File[]) => {
      const validos: Adjunto[] = [];
      for (const archivo of archivos) {
        if (adjuntosRef.current.length + validos.length >= MAX_ADJUNTOS) {
          toast.error(t('feedbackMaxFiles', { n: MAX_ADJUNTOS }));
          break;
        }
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(archivo.type)) {
          toast.error(t('feedbackFileType'));
          continue;
        }
        if (archivo.size > MAX_BYTES) {
          toast.error(t('feedbackFileSize'));
          continue;
        }
        validos.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, archivo, url: URL.createObjectURL(archivo) });
      }
      if (validos.length) setAdjuntos((a) => [...a, ...validos]);
    },
    [t]
  );

  const quitar = (id: string) =>
    setAdjuntos((lista) => {
      const fuera = lista.find((a) => a.id === id);
      if (fuera) URL.revokeObjectURL(fuera.url);
      return lista.filter((a) => a.id !== id);
    });

  const tomarCaptura = async () => {
    if (adjuntos.length >= MAX_ADJUNTOS) {
      toast.error(t('feedbackMaxFiles', { n: MAX_ADJUNTOS }));
      return;
    }
    setCapturando(true);
    // En páginas grandes html2canvas tarda unos segundos con el diálogo oculto.
    const aviso = toast.loading(t('feedbackCapturing'));
    try {
      // Esperar a que el diálogo y su velo terminen la animación de cierre (200 ms).
      await new Promise((r) => setTimeout(r, 260));
      const { default: html2canvas } = await import('html2canvas');
      const lienzo = await html2canvas(document.body, {
        logging: false,
        useCORS: true,
        scale: Math.min(window.devicePixelRatio || 1, 2),
        width: window.innerWidth,
        height: window.innerHeight,
        x: window.scrollX,
        y: window.scrollY,
        ignoreElements: (el) => el.hasAttribute?.('data-feedback-ignorar'),
      });
      const blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, 'image/png'));
      if (blob) agregar([new File([blob], 'captura.png', { type: 'image/png' })]);
    } catch (e) {
      console.warn('[ReportarProblema] captura', e);
      toast.error(t('feedbackCaptureError'));
    } finally {
      toast.dismiss(aviso);
      setCapturando(false);
    }
  };

  const reiniciar = () => {
    adjuntos.forEach((a) => URL.revokeObjectURL(a.url));
    setAdjuntos([]);
    setDescripcion('');
    setTipo('error');
    setEnviado(null);
  };

  const cerrar = () => {
    setAbierto(false);
    if (enviado) reiniciar();
  };

  const enviar = async () => {
    if (!descripcion.trim() || enviando) return;
    setEnviando(true);
    try {
      const form = new FormData();
      form.set('tipo', tipo);
      form.set('descripcion', descripcion.trim());
      form.set('ruta', pathname ?? '');
      form.set('contexto', JSON.stringify(contexto ?? {}));
      form.set('incluirCorreo', incluirCorreo && correo ? '1' : '0');
      if (!isAllSelected && selectedBranchId) form.set('sucursalId', String(selectedBranchId));
      adjuntos.forEach((a) => form.append('adjuntos', a.archivo));
      const r = await fetch('/api/feedback', { method: 'POST', body: form, credentials: 'same-origin' });
      const json = (await r.json().catch(() => ({}))) as { id?: number; correo?: string | null; error?: string };
      if (!r.ok || !json.id) throw new Error(json.error || t('feedbackError'));
      setEnviado({ id: json.id, correo: json.correo ?? null });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('feedbackError'));
    } finally {
      setEnviando(false);
    }
  };

  const titulo = t('feedbackTitle');
  const subtitulo = t('feedbackSubtitle');

  const cuerpo = enviado ? (
    <div className="flex flex-col">
      <div className="flex flex-col items-center px-2 py-8 text-center">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-subtle">
          <Check className="h-5 w-5 text-success-text" aria-hidden="true" />
        </span>
        <p className="text-lg font-semibold text-fg">{t('feedbackThanks')}</p>
        <p className="mt-2 max-w-sm text-sm text-fg-secondary">
          {enviado.correo ? t('feedbackReceivedEmail', { id: enviado.id, email: enviado.correo }) : t('feedbackReceived', { id: enviado.id })}
        </p>
      </div>
      <div className="-mx-6 -mb-6 flex justify-end border-t border-line bg-subtle/40 px-6 py-4 max-lg:-mx-4 max-lg:-mb-4 max-lg:px-4">
        <button
          type="button"
          onClick={cerrar}
          className="h-10 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover max-lg:w-full"
        >
          {t('close')}
        </button>
      </div>
    </div>
  ) : (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label={t('feedbackType')} className="grid grid-cols-3 gap-1 rounded-lg bg-subtle p-1">
        {TIPOS.map((x) => (
          <button
            key={x}
            type="button"
            role="radio"
            aria-checked={tipo === x}
            onClick={() => setTipo(x)}
            className={cn(
              'h-8 rounded-md text-sm font-medium transition-colors',
              tipo === x ? 'bg-surface text-fg shadow-sm' : 'text-fg-secondary hover:text-fg'
            )}
          >
            {t(`feedbackTypes.${x}`)}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="feedback-descripcion" className="text-xs font-medium text-fg">
          {t(`feedbackPrompt.${tipo}`)}
        </label>
        <textarea
          id="feedback-descripcion"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          maxLength={4000}
          rows={4}
          placeholder={t(`feedbackPlaceholder.${tipo}`)}
          className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-muted focus:border-line-brand focus:ring-2 focus:ring-brand/20"
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-fg">{t('feedbackAttachments')}</p>
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            agregar(Array.from(e.dataTransfer.files));
          }}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg border border-dashed px-3 py-3 text-left text-sm text-fg-secondary transition-colors',
            arrastrando ? 'border-line-brand bg-brand-tint' : 'border-line-strong hover:bg-hover'
          )}
        >
          <ImagePlus className="h-5 w-5 shrink-0 text-brand-deep" aria-hidden="true" />
          {t('feedbackDropzone', { n: MAX_ADJUNTOS })}
        </button>
        <input
          ref={entrada}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            agregar(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          {adjuntos.map((a) => (
            <div key={a.id} className="relative h-14 w-14">
              {/* eslint-disable-next-line @next/next/no-img-element -- miniatura de un blob local */}
              <img src={a.url} alt="" className="h-14 w-14 rounded-md border border-line object-cover" />
              <button
                type="button"
                onClick={() => quitar(a.id)}
                aria-label={t('feedbackRemoveFile')}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-fg text-canvas"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => void tomarCaptura()}
            disabled={capturando || adjuntos.length >= MAX_ADJUNTOS}
            className="flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-3 text-xs font-medium text-fg hover:bg-hover disabled:opacity-50"
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
            {t('feedbackScreenshot')}
          </button>
        </div>
      </div>

      {contexto && (
        <div className="rounded-lg bg-subtle px-3 py-2.5 text-xs leading-5 text-fg-secondary">
          <p className="text-fg-muted">{t('feedbackAutoContext')}</p>
          <p>
            {t('feedbackPage')}: {pathname}
            {contexto.pagina ? ` · ${contexto.pagina}` : ''}
          </p>
          <p>
            {t('organization')}: {organizacionNombre}
            {organizacionId ? ` (org ${organizacionId})` : ''}
            {sucursal ? ` · ${sucursal}` : ''}
          </p>
          <p>
            {t('feedbackVersion')}: web {contexto.versionWeb}
            {contexto.versionDesktop ? ` · GO Admin Desktop ${contexto.versionDesktop}` : ''}
          </p>
          <p>
            {t('feedbackBrowser')}: {contexto.navegador} · {contexto.sistema} · {contexto.ventana}
          </p>
        </div>
      )}

      {correo && (
        <label className="flex items-start gap-2 text-sm text-fg">
          <input
            type="checkbox"
            checked={incluirCorreo}
            onChange={(e) => setIncluirCorreo(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-line-strong accent-brand-action"
          />
          {t('feedbackIncludeEmail', { email: correo })}
        </label>
      )}

      <div className="-mx-6 -mb-6 flex justify-end gap-2 border-t border-line px-6 py-4 max-lg:-mx-4 max-lg:-mb-4 max-lg:grid max-lg:grid-cols-2 max-lg:px-4">
        <button
          type="button"
          onClick={cerrar}
          className="h-10 rounded-lg border border-line bg-surface px-4 text-sm font-medium text-fg hover:bg-hover"
        >
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={() => void enviar()}
          disabled={!descripcion.trim() || enviando}
          className="flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover disabled:opacity-50"
        >
          {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {t('send')}
        </button>
      </div>
    </div>
  );

  const visible = abierto && !capturando;

  if (movil) {
    return (
      <Sheet open={visible} onOpenChange={(o) => !o && cerrar()}>
        <SheetContent
          side="bottom"
          data-feedback-ignorar=""
          className="max-h-[92dvh] overflow-y-auto rounded-t-2xl border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" aria-hidden="true" />
          <SheetTitle className="pr-8 text-lg font-semibold text-fg">{titulo}</SheetTitle>
          <SheetDescription className="mb-4 text-sm text-fg-secondary">{subtitulo}</SheetDescription>
          {cuerpo}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={visible} onOpenChange={(o) => !o && cerrar()}>
      <DialogContent data-feedback-ignorar="" className="max-w-[440px] gap-0 border-line bg-surface p-6">
        <DialogTitle className="pr-8 text-lg font-semibold text-fg">{titulo}</DialogTitle>
        <DialogDescription className="mb-4 mt-1 text-sm text-fg-secondary">{subtitulo}</DialogDescription>
        {cuerpo}
      </DialogContent>
    </Dialog>
  );
}
