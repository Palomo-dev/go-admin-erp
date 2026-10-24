'use client';

import { lazy, Suspense, useRef, useState } from 'react';
import Image from 'next/image';
import { Images, Upload } from 'lucide-react';
import { clasesBoton } from '@/components/kit';
import { ACEPTAR_BIBLIOTECA } from '@/components/inventario/imagenes/imagenesLogica';

const DialogoBibliotecaImagenes = lazy(() => import('@/components/inventario/productos/imagenes/DialogoBibliotecaImagenes').then(m => ({ default: m.DialogoBibliotecaImagenes })));

/** Selección y subida usan la biblioteca existente: permisos y aislamiento se validan en sus RPC. */
export function CampoImagenSeccion({ valor, onCambiar, organizationId, deshabilitado, etiqueta = 'imagen de fondo' }: {
  valor?: string; onCambiar: (url: string | undefined) => void; organizationId?: number; deshabilitado?: boolean; etiqueta?: string;
}) {
  const archivo = useRef<HTMLInputElement>(null);
  const [biblioteca, setBiblioteca] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [avance, setAvance] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const subir = async (f?: File) => {
    if (!f || !organizationId) return;
    setSubiendo(true);
    setError(null);
    setAvance(0);
    try {
      const { subirImagen } = await import('@/components/inventario/imagenes/ImagenesService');
      const imagen = await subirImagen(organizationId, f, setAvance);
      onCambiar(imagen.url);
    } catch (e) {
      setError(e && typeof e === 'object' && 'motivo' in e && e.motivo === 'tamano' ? 'La imagen debe pesar hasta 5 MB.' : e && typeof e === 'object' && 'motivo' in e && e.motivo === 'formato' ? 'Elige una imagen JPG, PNG o WEBP.' : 'No se pudo subir la imagen. Vuelve a intentarlo.');
    } finally {
      setSubiendo(false);
      if (archivo.current) archivo.current.value = '';
    }
  };
  return <div className="flex flex-col gap-2">
    {valor && <Image unoptimized width={640} height={224} src={valor} alt={etiqueta === 'imagen de fondo' ? 'Vista previa del fondo' : `Vista previa de ${etiqueta}`} className="h-28 w-full rounded-lg border border-line object-cover" />}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={deshabilitado || subiendo || !organizationId} onClick={() => setBiblioteca(true)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}><Images className="size-4" aria-hidden />Galería</button>
      <button type="button" disabled={deshabilitado || subiendo || !organizationId} onClick={() => archivo.current?.click()} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}><Upload className="size-4" aria-hidden />{subiendo ? `Subiendo ${avance}%` : 'Subir imagen'}</button>
      {valor && <button type="button" disabled={deshabilitado || subiendo} onClick={() => onCambiar(undefined)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>Quitar</button>}
    </div>
    <input ref={archivo} type="file" accept={ACEPTAR_BIBLIOTECA} className="sr-only" aria-label={`Subir ${etiqueta}`} onChange={e => void subir(e.target.files?.[0])} disabled={deshabilitado || subiendo || !organizationId} />
    {error && <p role="alert" className="text-xs text-danger-text">{error}</p>}
    {organizationId && biblioteca && <Suspense fallback={<p role="status" className="text-sm text-fg-secondary">Cargando galería…</p>}><DialogoBibliotecaImagenes abierto={biblioteca} onAbiertoChange={setBiblioteca} organizacionId={organizationId} cupo={1} usadas={{ ids: [], rutas: [] }} onElegidas={imagenes => { if (imagenes[0]) onCambiar(imagenes[0].url); }} /></Suspense>}
  </div>;
}
