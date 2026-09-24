'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, FileText, Loader2, Pencil, Pin, PinOff, Trash2 } from 'lucide-react';
import { AvatarIniciales } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { cn } from '@/utils/Utils';
import { urlDescarga, type ArchivoNota, type NotaProducto } from './datosNotas';

/** Nombres de rol del sistema → clave traducida; otro nombre se muestra tal cual. */
const ROLES_CONOCIDOS: Record<string, 'superAdmin' | 'adminOrganizacion' | 'manager' | 'empleado' | 'cliente'> = {
  'super admin': 'superAdmin',
  'admin de organización': 'adminOrganizacion',
  'admin de organizacion': 'adminOrganizacion',
  manager: 'manager',
  empleado: 'empleado',
  cliente: 'cliente',
};

export function useTamanoArchivo(): (bytes: number) => string {
  const locale = useLocaleIntl();
  return (bytes: number) => {
    const [unidad, valor] =
      bytes >= 1024 * 1024 ? (['megabyte', bytes / (1024 * 1024)] as const) : bytes >= 1024 ? (['kilobyte', bytes / 1024] as const) : (['byte', bytes] as const);
    try {
      return new Intl.NumberFormat(locale, { style: 'unit', unit: unidad, unitDisplay: 'short', maximumFractionDigits: 1 }).format(valor);
    } catch {
      return `${Math.round(valor)} ${unidad}`;
    }
  };
}

export function TarjetaNota({
  nota,
  timezone,
  esAutor,
  puedeFijar,
  puedeEliminar,
  motivoSinPermiso,
  ocupada,
  onFijar,
  onGuardarEdicion,
  onEliminar,
}: {
  nota: NotaProducto;
  timezone: string;
  esAutor: boolean;
  puedeFijar: boolean;
  puedeEliminar: boolean;
  motivoSinPermiso: string;
  ocupada: boolean;
  onFijar: () => void;
  onGuardarEdicion: (contenido: string) => Promise<boolean>;
  onEliminar: () => void;
}) {
  const t = useTranslations('productoDetalle.notas');
  const tc = useTranslations('productoDetalle.comun');
  const locale = useLocaleIntl();
  const tamano = useTamanoArchivo();
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(nota.contenido);
  const [guardando, setGuardando] = useState(false);

  const nombre = nota.autor.nombre ?? tc('usuarioDesconocido');
  const claveRol = nota.autor.rol ? ROLES_CONOCIDOS[nota.autor.rol.trim().toLowerCase()] : undefined;
  const rol = claveRol ? t(`roles.${claveRol}`) : nota.autor.rol;
  const fecha = formatDateTimeInTz(nota.creada, timezone, {
    locale,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const guardar = async () => {
    const texto = borrador.trim();
    if (!texto) return;
    setGuardando(true);
    const ok = await onGuardarEdicion(texto);
    setGuardando(false);
    if (ok) setEditando(false);
  };

  const botonIcono = 'size-9 shrink-0 text-fg-secondary hover:text-fg';

  return (
    <article
      className={cn('rounded-xl border bg-surface p-4', nota.fijada ? 'border-line-brand' : 'border-line')}
      aria-label={t('etiquetaNota', { autor: nombre })}
    >
      <header className="flex items-start gap-3">
        <AvatarIniciales nombre={nombre} src={nota.autor.avatar} tamano="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn('text-sm font-medium', nota.autor.nombre ? 'text-fg' : 'text-fg-muted')}>{nombre}</span>
            {rol && (
              <Badge tono="neutro" tamano="sm">
                {rol}
              </Badge>
            )}
            {nota.fijada && (
              <Badge tono="marca" tamano="sm" icono={Pin}>
                {t('fijada')}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 break-words text-xs text-fg-secondary">
            {nota.autor.email && <span>{nota.autor.email} · </span>}
            <span className="tabular-nums">{fecha}</span>
            {nota.editadaEn && (
              <span title={formatDateTimeInTz(nota.editadaEn, timezone, { locale })}> · {t('editada')}</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon"
            className={botonIcono}
            onClick={onFijar}
            disabled={!puedeFijar || ocupada || editando}
            title={puedeFijar ? (nota.fijada ? t('desfijar') : t('fijar')) : motivoSinPermiso}
            aria-label={nota.fijada ? t('desfijar') : t('fijar')}
            aria-pressed={nota.fijada}
          >
            {nota.fijada ? <PinOff className="size-4" aria-hidden /> : <Pin className="size-4" aria-hidden />}
          </Button>
          {esAutor && (
            <Button
              variant="ghost"
              size="icon"
              className={botonIcono}
              onClick={() => {
                setBorrador(nota.contenido);
                setEditando(true);
              }}
              disabled={ocupada || editando}
              title={tc('editar')}
              aria-label={t('editarNota')}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 text-danger-text hover:bg-danger-subtle hover:text-danger-text"
            onClick={onEliminar}
            disabled={!puedeEliminar || ocupada || editando}
            title={puedeEliminar ? tc('eliminar') : t('motivoEliminar')}
            aria-label={t('eliminarNota')}
          >
            {ocupada ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
          </Button>
        </div>
      </header>

      {editando ? (
        <div className="mt-3 flex flex-col gap-2">
          <Textarea
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            className="min-h-24"
            aria-label={t('editarNota')}
            autoFocus
            disabled={guardando}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditando(false)} disabled={guardando}>
              {tc('cancelar')}
            </Button>
            <Button onClick={() => void guardar()} disabled={guardando || !borrador.trim() || borrador.trim() === nota.contenido}>
              {guardando && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {guardando ? tc('guardando') : tc('guardarCambios')}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-3 whitespace-pre-wrap break-words text-sm text-fg">{nota.contenido}</p>
      )}

      {nota.archivos.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-fg-secondary">{t('adjuntos')}</p>
          <ul className="flex flex-col gap-1.5">
            {nota.archivos.map((a) => (
              <FilaAdjunto key={a.id} archivo={a} tamano={tamano(a.tamano)} />
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function FilaAdjunto({ archivo, tamano }: { archivo: ArchivoNota; tamano: string }) {
  const t = useTranslations('productoDetalle.notas');
  const [abriendo, setAbriendo] = useState(false);
  const [fallo, setFallo] = useState(false);
  const disponible = !!archivo.rutaStorage || !!archivo.url;

  const descargar = async () => {
    setAbriendo(true);
    setFallo(false);
    try {
      // La URL firmada lleva «download»: el navegador descarga sin salir de la página.
      const url = await urlDescarga(archivo);
      if (url) window.location.assign(url);
      else setFallo(true);
    } catch {
      setFallo(true);
    } finally {
      setAbriendo(false);
    }
  };

  return (
    <li className="flex items-center gap-2 rounded-lg bg-subtle px-3 py-2 text-sm">
      <FileText className="size-4 shrink-0 text-fg-secondary" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-fg" title={archivo.nombre}>
        {archivo.nombre} <span className="text-fg-secondary">({tamano})</span>
      </span>
      {fallo && <span className="shrink-0 text-xs text-danger-text">{t('errorDescarga')}</span>}
      {!archivo.rutaStorage && archivo.url ? (
        // Nota antigua sin objeto en el bucket: el enlace que quedó guardado.
        <a
          href={archivo.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-label={t('descargar', { nombre: archivo.nombre })}
          title={t('descargar', { nombre: archivo.nombre })}
        >
          <Download className="size-4" aria-hidden />
        </a>
      ) : (
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-fg-secondary hover:text-fg"
        onClick={() => void descargar()}
        disabled={!disponible || abriendo}
        aria-label={t('descargar', { nombre: archivo.nombre })}
        title={t('descargar', { nombre: archivo.nombre })}
      >
        {abriendo ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
      </Button>
      )}
    </li>
  );
}
