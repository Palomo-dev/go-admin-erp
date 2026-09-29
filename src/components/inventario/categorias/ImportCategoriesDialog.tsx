'use client';

import { useRef, useState, type DragEvent } from 'react';
import { useTranslations } from 'next-intl';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Dialogo } from '@/components/kit/Dialogo';
import { StatusBadge } from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import categoryService from '@/lib/services/categoryService';
import { extensionAdmitida, leerMatriz, TAMANO_MAXIMO_ARCHIVO } from '@/lib/inventario/importacion/lector';
import { BOM } from '@/lib/inventario/importacion/reporte';
import { PLANTILLA_CATEGORIAS, aRevision, filasDesdeMatriz, type FilaImportCategoria, type RevisionCategorias } from './importarCategoriasLogica';

/**
 * «Importar categorías» (Figma `973:186211`, 672 px): un solo paso. Se elige
 * o se suelta el archivo, el servidor lo REVISA (`fn_categorias_importar` sin
 * aplicar) y el diálogo muestra «N válidas · N con error · N subcategorías»,
 * cada error con su fila y su motivo, y lo que va a pasar. «Importar N
 * categorías» aplica en una transacción lo mismo que se revisó: los padres
 * antes que sus hijas, sin duplicar nombres que ya existen.
 */
interface ImportCategoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const MAX_ERRORES_VISIBLES = 6;

export function ImportCategoriesDialog({ open, onOpenChange, onSuccess }: ImportCategoriesDialogProps) {
  const t = useTranslations('categorias.importar');
  const n = useFormatoEntero();
  const { toast } = useToast();
  const refArchivo = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [filas, setFilas] = useState<FilaImportCategoria[]>([]);
  const [revision, setRevision] = useState<RevisionCategorias | null>(null);
  const [estado, setEstado] = useState<'inicial' | 'leyendo' | 'listo' | 'error' | 'importando'>('inicial');
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const limpiar = () => {
    setArchivo(null);
    setFilas([]);
    setRevision(null);
    setEstado('inicial');
    setError(null);
    if (refArchivo.current) refArchivo.current.value = '';
  };

  const cambiarAbierto = (v: boolean) => {
    if (!v && estado === 'importando') return;
    onOpenChange(v);
    if (!v) limpiar();
  };

  const descargarPlantilla = () => {
    const blob = new Blob([BOM + PLANTILLA_CATEGORIAS], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = t('nombrePlantilla');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const leer = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!extensionAdmitida(file.name)) {
      setError(t('errores.formato'));
      return;
    }
    if (file.size > TAMANO_MAXIMO_ARCHIVO) {
      setError(t('errores.tamano'));
      return;
    }
    setArchivo(file.name);
    setEstado('leyendo');
    try {
      const matriz = leerMatriz(await file.arrayBuffer(), file.name);
      const leidas = filasDesdeMatriz(matriz);
      setFilas(leidas);
      if (leidas.length === 0) {
        setRevision(null);
        setEstado('error');
        setError(t('errores.vacio'));
        return;
      }
      const r = aRevision(await categoryService.importarCategorias(getOrganizationId(), leidas, false));
      setRevision(r);
      setEstado('listo');
    } catch (e) {
      setRevision(null);
      setEstado('error');
      const codigo = e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '';
      setError(codigo === '42501' ? t('errores.sinPermiso') : t('errores.leer'));
    }
  };

  const importar = async () => {
    if (!revision || revision.validas === 0) return;
    setEstado('importando');
    try {
      const r = aRevision(await categoryService.importarCategorias(getOrganizationId(), filas, true));
      toast({ title: t('toast.importadas', { count: r.creadas, n: n(r.creadas) }) });
      onSuccess();
      onOpenChange(false);
      limpiar();
    } catch (e) {
      setEstado('listo');
      const codigo = e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '';
      toast({ variant: 'destructive', title: codigo === '42501' ? t('errores.sinPermiso') : t('toast.error') });
    }
  };

  const soltar = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setArrastrando(false);
    void leer(e.dataTransfer.files?.[0]);
  };

  const errores = revision?.filas.filter((f) => f.accion === 'error') ?? [];
  const motivo = (f: RevisionCategorias['filas'][number]) =>
    t(`motivos.${f.motivo ?? 'nombre_obligatorio'}`, { padre: f.padre ?? '' });

  return (
    <Dialogo
      abierto={open}
      onAbiertoChange={cambiarAbierto}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      ancho={672}
      primario={{
        etiqueta: revision ? t('importarN', { count: revision.validas, n: n(revision.validas) }) : t('importar'),
        onClick: () => void importar(),
        cargando: estado === 'importando',
        deshabilitada: !revision || revision.validas === 0 || estado !== 'listo',
        motivo: t('sinValidas'),
      }}
    >
      <div className="flex flex-col gap-3">
        <div
          role="button"
          tabIndex={0}
          aria-label={archivo ? t('cambiarArchivo') : t('elegirArchivo')}
          onClick={() => refArchivo.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              refArchivo.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={soltar}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            arrastrando ? 'border-brand bg-brand-tint' : 'border-line-strong bg-subtle',
          )}
        >
          {estado === 'leyendo' ? (
            <Loader2 aria-hidden="true" className="size-5 animate-spin text-fg-muted" />
          ) : (
            !archivo && <FileSpreadsheet aria-hidden="true" className="size-6 text-fg-muted" strokeWidth={1.5} />
          )}
          <p className="text-sm font-medium text-fg">
            {archivo ? t('archivoFilas', { archivo, count: filas.length, n: n(filas.length) }) : t('arrastra')}
          </p>
          <p className="text-[13px] text-link">
            {archivo ? t('cambiar') : t('elegir')} ·{' '}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                descargarPlantilla();
              }}
              className="font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {t('descargarPlantilla')}
            </button>
          </p>
          <input
            ref={refArchivo}
            type="file"
            accept=".csv,.xlsx,.xls"
            hidden
            onChange={(e) => void leer(e.target.files?.[0])}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}

        {revision && (
          <>
            <div className="flex flex-wrap gap-2">
              <StatusBadge estado="valida" etiqueta={t('validas', { count: revision.validas, n: n(revision.validas) })} tono="exito" tamano="sm" />
              {revision.con_error > 0 && (
                <StatusBadge estado="error" etiqueta={t('conError', { count: revision.con_error, n: n(revision.con_error) })} tono="peligro" tamano="sm" />
              )}
              {revision.subcategorias > 0 && (
                <StatusBadge
                  estado="subcategorias"
                  etiqueta={t('subcategorias', { count: revision.subcategorias, n: n(revision.subcategorias) })}
                  tono="neutro"
                  tamano="sm"
                />
              )}
            </div>

            {errores.length > 0 && (
              <ul className="flex flex-col gap-1.5 text-sm text-danger-text">
                {errores.slice(0, MAX_ERRORES_VISIBLES).map((f) => (
                  <li key={f.fila}>{t('filaError', { fila: f.fila, nombre: f.nombre || '—', motivo: motivo(f) })}</li>
                ))}
                {errores.length > MAX_ERRORES_VISIBLES && (
                  <li className="text-fg-secondary">{t('yMas', { count: errores.length - MAX_ERRORES_VISIBLES, n: n(errores.length - MAX_ERRORES_VISIBLES) })}</li>
                )}
              </ul>
            )}

            <p className="rounded-lg bg-info-subtle px-3 py-2.5 text-sm text-info-text">
              {revision.validas > 0
                ? t('resumen', { count: revision.validas, n: n(revision.validas) }) + (revision.con_error > 0 ? ` ${t('resumenErrores')}` : '')
                : t('nadaValido')}
            </p>
          </>
        )}
      </div>
    </Dialogo>
  );
}
