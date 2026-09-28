'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Globe, Images, ImageOff } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Dialogo } from '@/components/kit/Dialogo';
import { EmptyState, SearchInput } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { cargarBiblioteca, type ImagenBiblioteca } from './subirImagen';

/**
 * «Desde la biblioteca»: imágenes compartidas de la organización y públicas
 * (`shared_images`, gestionadas en /app/inventario/imagenes). Selección
 * múltiple hasta el cupo; las que el producto ya usa salen marcadas y no se
 * pueden volver a elegir.
 */
export function DialogoBibliotecaImagenes({
  abierto,
  onAbiertoChange,
  organizacionId,
  cupo,
  usadas,
  onElegidas,
}: {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  organizacionId: number;
  /** Cuántas caben todavía. */
  cupo: number;
  /** Ids de `shared_images` o rutas que el producto ya tiene. */
  usadas: { ids: readonly number[]; rutas: readonly string[] };
  onElegidas: (imagenes: ImagenBiblioteca[]) => void | Promise<void>;
}) {
  const t = useTranslations('productoDetalle.imagenes');
  const tc = useTranslations('productoDetalle.comun');
  const [imagenes, setImagenes] = useState<ImagenBiblioteca[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [elegidas, setElegidas] = useState<number[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [fallidas, setFallidas] = useState<ReadonlySet<number>>(new Set());

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(false);
    try {
      setImagenes(await cargarBiblioteca(organizacionId));
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }, [organizacionId]);

  useEffect(() => {
    if (!abierto) return;
    setElegidas([]);
    setBusqueda('');
    void cargar();
  }, [abierto, cargar]);

  const usadaIds = useMemo(() => new Set(usadas.ids), [usadas.ids]);
  const usadaRutas = useMemo(() => new Set(usadas.rutas), [usadas.rutas]);
  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return imagenes;
    return imagenes.filter((i) => i.file_name.toLowerCase().includes(q) || i.tags.some((tag) => tag.toLowerCase().includes(q)));
  }, [imagenes, busqueda]);

  const alternar = (id: number) =>
    setElegidas((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= cupo ? s : [...s, id]));

  const agregar = async () => {
    setGuardando(true);
    try {
      await onElegidas(elegidas.map((id) => imagenes.find((i) => i.id === id)).filter((i): i is ImagenBiblioteca => !!i));
      onAbiertoChange(false);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('biblio.titulo')}
      descripcion={t('biblio.descripcion')}
      icono={Images}
      textoCancelar={tc('cancelar')}
      ancho={880}
      pie={t('biblio.seleccion', { n: elegidas.length, cupo })}
      primario={{
        etiqueta: t('biblio.agregar', { n: elegidas.length }),
        onClick: () => void agregar(),
        cargando: guardando,
        deshabilitada: elegidas.length === 0,
        motivo: t('biblio.eligeUna'),
      }}
    >
      <SearchInput value={busqueda} onChange={setBusqueda} onValueChange={setBusqueda} placeholder={t('biblio.buscar')} atajo={false} />
      {cargando ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <EmptyState variante="error" compacto titulo={t('biblio.error')} onReintentar={() => void cargar()} />
      ) : filtradas.length === 0 ? (
        <EmptyState
          variante={busqueda ? 'search' : 'empty'}
          compacto
          icono={Images}
          titulo={busqueda ? undefined : t('biblio.vacia')}
          descripcion={busqueda ? undefined : t('biblio.vaciaAyuda')}
          termino={busqueda || undefined}
          onLimpiarFiltros={busqueda ? () => setBusqueda('') : undefined}
          accion={busqueda ? undefined : { etiqueta: t('biblio.irBiblioteca'), href: '/app/inventario/imagenes' }}
        />
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6" aria-label={t('biblio.titulo')}>
          {filtradas.map((img) => {
            const usada = usadaIds.has(img.id) || usadaRutas.has(img.storage_path);
            const marcada = elegidas.includes(img.id);
            const sinCupo = !marcada && elegidas.length >= cupo;
            return (
              <li key={img.id}>
                <button
                  type="button"
                  onClick={() => alternar(img.id)}
                  disabled={usada || sinCupo}
                  aria-pressed={marcada}
                  title={usada ? t('biblio.yaUsada') : sinCupo ? t('limite.lleno', { max: cupo }) : img.file_name}
                  className={cn(
                    'relative aspect-square w-full overflow-hidden rounded-lg border bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed',
                    marcada ? 'border-line-brand ring-2 ring-brand' : 'border-line',
                    (usada || sinCupo) && 'opacity-50',
                  )}
                >
                  {fallidas.has(img.id) ? (
                    <span className="flex size-full items-center justify-center text-fg-muted">
                      <ImageOff className="size-5" aria-hidden />
                    </span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- imágenes públicas del bucket
                    <img
                      src={img.url}
                      alt={img.file_name}
                      loading="lazy"
                      onError={() => setFallidas((s) => new Set(s).add(img.id))}
                      className="size-full object-cover"
                    />
                  )}
                  {marcada && (
                    <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-brand-action text-fg-on-brand">
                      <Check className="size-3.5" aria-hidden />
                    </span>
                  )}
                  {img.is_public && img.organization_id !== organizacionId && (
                    <span className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded-full bg-surface/90 px-1.5 py-0.5 text-[10px] text-fg-secondary">
                      <Globe className="size-3" aria-hidden /> {t('biblio.publica')}
                    </span>
                  )}
                  {usada && (
                    <span className="absolute bottom-1 right-1 rounded-full bg-surface/90 px-1.5 py-0.5 text-[10px] text-fg-secondary">
                      {t('biblio.enUso')}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialogo>
  );
}
