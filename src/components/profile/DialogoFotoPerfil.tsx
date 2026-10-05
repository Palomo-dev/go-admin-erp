'use client';

/**
 * Diálogo «Cambiar foto de perfil» (Figma 347:11988) y confirmación «Quitar
 * la foto» (347:12329). Sustituye al overlay que solo aparecía con el ratón
 * encima: vista previa en círculo, zona para soltar o elegir la imagen y, en
 * el móvil, la cámara.
 *
 * Nada se aplica hasta «Guardar foto»: elegir otra imagen o pulsar «Quitar
 * foto» solo cambia la vista previa, y «Cancelar» lo deshace. Al guardar se
 * sube al bucket `profiles` (como antes) y se borra la foto anterior, solo si
 * es de esta persona (`rutaFotoPropia`).
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Camera, ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/config';
import { Dialogo } from '@/components/kit/Dialogo';
import { clasesBoton } from '@/components/kit/botonClases';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AvatarUsuario } from '@/components/shell/sesion/AvatarUsuario';
import { cn } from '@/utils/Utils';
import { extensionDe, FOTO_ACCEPT, rutaFotoPropia, validarFoto } from './perfilLogica';

export interface FotoGuardada {
  avatar_url: string | null;
}

export function DialogoFotoPerfil({
  abierto,
  onAbiertoChange,
  userId,
  nombre,
  correo,
  fotoActual,
  onGuardada,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  userId: string | null;
  nombre: string;
  correo: string | null;
  fotoActual: string | null;
  onGuardada: (perfil: FotoGuardada) => void;
}) {
  const t = useTranslations('perfil.foto');
  const tp = useTranslations('perfil');
  const entrada = useRef<HTMLInputElement>(null);
  const camara = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [quitar, setQuitar] = useState(false);
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);

  // La URL de vista previa se libera al cambiarla o al cerrar.
  useEffect(() => {
    if (!archivo) {
      setVista(null);
      return;
    }
    const url = URL.createObjectURL(archivo);
    setVista(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  const reiniciar = () => {
    setArchivo(null);
    setQuitar(false);
    setError(null);
  };

  const elegir = (f: File | null | undefined) => {
    if (!f) return;
    const fallo = validarFoto(f);
    if (fallo) {
      setError(t(`errores.${fallo}`));
      return;
    }
    setError(null);
    setQuitar(false);
    setArchivo(f);
  };

  const hayCambio = !!archivo || (quitar && !!fotoActual);

  const guardar = async () => {
    if (!userId || !hayCambio) return;
    setGuardando(true);
    try {
      let nueva: string | null = null;
      if (archivo) {
        const ruta = `avatars/${userId}-${Date.now().toString(36)}.${extensionDe(archivo.name)}`;
        const { error: errSubida } = await supabase.storage.from('profiles').upload(ruta, archivo, { cacheControl: '3600', upsert: false });
        if (errSubida) throw errSubida;
        nueva = supabase.storage.from('profiles').getPublicUrl(ruta).data.publicUrl;
      }
      const { error: errPerfil } = await supabase
        .from('profiles')
        .update({ avatar_url: nueva, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (errPerfil) throw errPerfil;
      // La anterior se borra después de guardar: si algo falla antes, la persona conserva su foto.
      const vieja = rutaFotoPropia(fotoActual, userId);
      if (vieja) {
        const { error: errBorrar } = await supabase.storage.from('profiles').remove([vieja]);
        if (errBorrar) console.warn('[perfil] no se borró la foto anterior', errBorrar.message);
      }
      onGuardada({ avatar_url: nueva });
      toast.success(nueva ? t('guardada') : t('quitada'));
      reiniciar();
      onAbiertoChange(false);
    } catch {
      toast.error(tp('toasts.errorTitulo'), { description: tp('toasts.errorRed') });
    } finally {
      setGuardando(false);
    }
  };

  const fotoMostrada = quitar ? null : vista ?? fotoActual;

  return (
    <>
      <Dialogo
        abierto={abierto}
        onAbiertoChange={(v) => {
          onAbiertoChange(v);
          if (!v) reiniciar();
        }}
        titulo={t('titulo')}
        descripcion={t('descripcion')}
        ancho={520}
        primario={{ etiqueta: t('guardar'), onClick: () => void guardar(), cargando: guardando, deshabilitada: !hayCambio }}
        pie={
          fotoActual && !quitar ? (
            <button
              type="button"
              onClick={() => setConfirmarQuitar(true)}
              disabled={guardando}
              className={clasesBoton({ variante: 'fantasma', tamano: 'md', className: 'text-danger-text hover:text-danger-text' })}
            >
              <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('quitar')}
            </button>
          ) : undefined
        }
      >
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="shrink-0" aria-live="polite">
            {vista && !quitar ? (
              // Vista previa local (blob:) de la imagen elegida: next/image no aplica.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={vista} alt={t('vistaPrevia')} className="size-20 rounded-full object-cover ring-1 ring-line" />
            ) : (
              <AvatarUsuario nombre={nombre} correo={correo} foto={fotoMostrada} tamano={80} />
            )}
          </div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setArrastrando(true);
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastrando(false);
              elegir(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              'flex w-full flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-5 text-center',
              arrastrando ? 'border-brand bg-brand-tint' : 'border-line-strong bg-subtle',
            )}
          >
            <ImagePlus aria-hidden="true" className="size-6 text-fg-secondary" strokeWidth={1.5} />
            <p className="text-sm font-medium text-fg">{t('soltar')}</p>
            <p className="text-xs text-fg-secondary">{t('formatos')}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => entrada.current?.click()} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                {t('subir')}
              </button>
              <button
                type="button"
                onClick={() => camara.current?.click()}
                className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'lg:hidden' })}
              >
                <Camera aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('tomar')}
              </button>
            </div>
            <input
              ref={entrada}
              type="file"
              accept={FOTO_ACCEPT}
              className="hidden"
              aria-label={t('subir')}
              onChange={(e) => {
                elegir(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <input
              ref={camara}
              type="file"
              accept={FOTO_ACCEPT}
              capture="user"
              className="hidden"
              aria-label={t('tomar')}
              onChange={(e) => {
                elegir(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
        {quitar && <p className="text-sm text-fg-secondary">{t('quitarPendiente')}</p>}
      </Dialogo>

      <ConfirmDialog
        open={confirmarQuitar}
        onOpenChange={setConfirmarQuitar}
        title={t('confirmarTitulo')}
        description={t('confirmarDescripcion')}
        confirmLabel={t('confirmarAccion')}
        cancelLabel={tp('cancelar')}
        variant="destructive"
        onConfirm={() => {
          setArchivo(null);
          setQuitar(true);
        }}
      />
    </>
  );
}
