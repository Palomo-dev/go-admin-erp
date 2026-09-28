'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ImagePlus } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import type { PropsSeccionFormulario } from '../tipos';
import { MAX_IMAGENES, limiteImagenes, nuevaClave, type ImagenForm } from '../../logica/formularioProducto';
import { AccionesAgregarImagen, GaleriaEditable, type ItemGaleria } from '../../imagenes/GaleriaEditable';
import { VistaPreviaImagen } from '../../imagenes/VistaPreviaImagen';
import { DialogoGenerarImagenIA } from '../../imagenes/DialogoGenerarImagenIA';
import { DialogoBibliotecaImagenes } from '../../imagenes/DialogoBibliotecaImagenes';
import { ACEPTAR_IMAGENES, repartirArchivos, urlImagen, type ImagenBiblioteca, type ImagenGenerada } from '../../imagenes/subirImagen';

/** Libera la vista previa local de una imagen que sale del formulario. */
function liberar(img: ImagenForm) {
  if (img.vista.startsWith('blob:')) URL.revokeObjectURL(img.vista);
}

/** Garantiza exactamente una principal (la primera si no hay). */
function conPrincipal(lista: ImagenForm[]): ImagenForm[] {
  if (lista.length === 0) return lista;
  const i = lista.findIndex((x) => x.is_primary);
  return lista.map((x, idx) => ({ ...x, is_primary: idx === (i < 0 ? 0 : i) }));
}

/**
 * Sección «Imágenes» del formulario único (Figma `Nuevo producto`, bloque
 * Imágenes; móvil: Subir · Tomar foto · Generar con IA). Solo arma
 * `estado.imagenes`: no sube nada; `ProductoForm` sube los archivos al
 * guardar. Lo único que ya queda en storage es lo que guarda la API de IA
 * (y las de la biblioteca, que ya existen).
 */
export function SeccionImagenes({ estado, cambiar, errores, modo, organizacionId }: PropsSeccionFormulario) {
  const t = useTranslations('productoForm.imagenes');
  const tImg = useTranslations('productoDetalle.imagenes');
  const te = useTranslations('productoForm.errores');
  const { toast } = useToast();
  const [vista, setVista] = useState<number | null>(null);
  const [dialogoIA, setDialogoIA] = useState(false);
  const [dialogoBiblio, setDialogoBiblio] = useState(false);

  // En editar, el límite respeta las que el producto ya tenía (limiteImagenes).
  const existentes = estado.imagenes.filter((i) => i.origen === 'existente').length;
  const [originales, setOriginales] = useState(existentes);
  useEffect(() => {
    if (existentes > originales) setOriginales(existentes);
  }, [existentes, originales]);

  const limite = limiteImagenes(modo, originales);
  const cupo = Math.max(0, limite - estado.imagenes.length);
  const imagenes = estado.imagenes;

  const poner = (lista: ImagenForm[]) => cambiar('imagenes', conPrincipal(lista));

  const agregarArchivos = (archivos: File[]) => {
    const { validos, rechazados, sobrantes } = repartirArchivos(archivos, cupo);
    for (const r of rechazados) {
      toast({
        variant: 'destructive',
        title: tImg('toasts.archivoRechazado', { nombre: r.nombre }),
        description: r.motivo === 'tipo' ? tImg('validacion.tipo') : tImg('validacion.tamano'),
      });
    }
    if (sobrantes > 0) toast({ variant: 'destructive', title: tImg('limite.lleno', { max: limite }), description: tImg('limite.sobrantes', { n: sobrantes }) });
    if (validos.length === 0) return;
    poner([
      ...imagenes,
      ...validos.map<ImagenForm>((file) => ({
        clave: nuevaClave('i'),
        file,
        vista: URL.createObjectURL(file),
        is_primary: false,
        alt_text: '',
        origen: 'subida',
      })),
    ]);
  };

  const agregarGenerada = (img: ImagenGenerada) => {
    poner([
      ...imagenes,
      {
        clave: nuevaClave('i'),
        storage_path: img.storage_path,
        file: img.file,
        vista: img.vista,
        is_primary: false,
        alt_text: estado.name.trim(),
        origen: 'ia',
      },
    ]);
    toast({ title: tImg('toasts.generada') });
  };

  const agregarBiblioteca = (elegidas: ImagenBiblioteca[]) => {
    poner([
      ...imagenes,
      ...elegidas.slice(0, cupo).map<ImagenForm>((b) => ({
        clave: nuevaClave('i'),
        storage_path: b.storage_path,
        shared_image_id: b.id,
        vista: b.url || urlImagen(b.storage_path),
        is_primary: false,
        alt_text: '',
        origen: 'biblioteca',
      })),
    ]);
  };

  const quitar = (clave: string) => {
    const img = imagenes.find((i) => i.clave === clave);
    if (img) liberar(img);
    poner(imagenes.filter((i) => i.clave !== clave));
  };

  const mover = (clave: string, delta: -1 | 1) => {
    const i = imagenes.findIndex((x) => x.clave === clave);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= imagenes.length) return;
    const lista = [...imagenes];
    [lista[i], lista[j]] = [lista[j], lista[i]];
    poner(lista);
  };

  const reordenar = (desde: number, hasta: number) => {
    const lista = [...imagenes];
    const [m] = lista.splice(desde, 1);
    lista.splice(hasta, 0, m);
    poner(lista);
  };

  const items: ItemGaleria[] = useMemo(() => {
    const insignia = (i: ImagenForm): string | undefined =>
      i.origen === 'ia'
        ? t('insignias.ia')
        : i.origen === 'biblioteca'
          ? t('insignias.biblioteca')
          : i.origen === 'subida' || i.origen === 'copia'
            ? t('insignias.nueva')
            : undefined;
    return imagenes.map((i) => ({ clave: i.clave, url: i.vista, alt: i.alt_text, principal: i.is_primary, insignia: insignia(i) }));
  }, [imagenes, t]);

  const acciones = (variante: 'barra' | 'zona', className?: string) => (
    <AccionesAgregarImagen
      variante={variante}
      className={className}
      onArchivos={agregarArchivos}
      onGenerarIA={() => setDialogoIA(true)}
      onBiblioteca={() => setDialogoBiblio(true)}
      cupo={cupo}
      maximo={limite}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      {imagenes.length === 0 ? (
        acciones('zona')
      ) : (
        <>
          <GaleriaEditable
            items={items}
            modoAlt="inmediato"
            verboQuitar="quitar"
            onVer={setVista}
            onPrincipal={(c) => cambiar('imagenes', imagenes.map((i) => ({ ...i, is_primary: i.clave === c })))}
            onAlt={(c, v) => cambiar('imagenes', imagenes.map((i) => (i.clave === c ? { ...i, alt_text: v } : i)))}
            onMover={mover}
            onReordenar={reordenar}
            onQuitar={quitar}
            agregar={
              cupo > 0 ? (
                <label className="flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line-strong bg-subtle text-fg-secondary hover:bg-hover focus-within:ring-2 focus-within:ring-brand">
                  <ImagePlus className="size-5" aria-hidden />
                  <span className="text-xs font-medium">{t('masCupo', { n: cupo })}</span>
                  <input
                    type="file"
                    accept={ACEPTAR_IMAGENES}
                    multiple
                    className="sr-only"
                    aria-label={t('agregarMas')}
                    onChange={(e) => {
                      agregarArchivos(Array.from(e.target.files ?? []));
                      e.target.value = '';
                    }}
                  />
                </label>
              ) : undefined
            }
          />
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-xs text-fg-secondary">{t('resumen', { n: imagenes.length, max: limite })}</p>
            {acciones('barra')}
          </div>
        </>
      )}

      {errores.imagenes && (
        <p role="alert" className="text-sm text-danger-text">
          {te(errores.imagenes)}
        </p>
      )}
      {limite > MAX_IMAGENES && <p className="text-xs text-fg-muted">{t('limiteHeredado', { n: limite })}</p>}

      <VistaPreviaImagen
        imagenes={items.map((i) => ({ clave: i.clave, url: i.url, alt: i.alt, principal: i.principal }))}
        indice={vista}
        onIndiceChange={setVista}
      />
      <DialogoGenerarImagenIA
        abierto={dialogoIA}
        onAbiertoChange={setDialogoIA}
        organizacionId={organizacionId}
        nombreInicial={estado.name}
        descripcionInicial={estado.description}
        onGenerada={agregarGenerada}
      />
      <DialogoBibliotecaImagenes
        abierto={dialogoBiblio}
        onAbiertoChange={setDialogoBiblio}
        organizacionId={organizacionId}
        cupo={cupo}
        usadas={{
          ids: imagenes.map((i) => i.shared_image_id).filter((x): x is number => typeof x === 'number'),
          rutas: imagenes.map((i) => i.storage_path).filter((x): x is string => !!x),
        }}
        onElegidas={agregarBiblioteca}
      />
    </div>
  );
}
