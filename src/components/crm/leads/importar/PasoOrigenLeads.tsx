'use client';

import { useState } from 'react';
import { FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { FormField, FormSection } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ZonaArchivo } from '@/components/inventario/productos/importar/PasoOrigen';
import { extensionAdmitida, leerLibro } from '@/lib/importacion/libro';
import { TAMANO_MAXIMO_ARCHIVO } from '@/lib/inventario/importacion/lector';
import { MAX_FILAS_POR_ARCHIVO } from '@/lib/crm/importacionLeads/validacion';
import type { ImportarLeads } from './useImportarLeads';
import { useTextosLeads } from './useTextosLeads';

export function PasoOrigenLeads({ a, onError }: { a: ImportarLeads; onError: (mensaje: string) => void }) {
  const { t } = useTextosLeads();
  const [leyendo, setLeyendo] = useState(false);

  const leer = async (f: File) => {
    if (!extensionAdmitida(f.name)) return onError(t('origen.errorFormato'));
    if (f.size > TAMANO_MAXIMO_ARCHIVO) return onError(t('origen.errorTamano'));
    setLeyendo(true);
    try {
      const libro = leerLibro(await f.arrayBuffer(), f.name);
      if (libro.hojas.length === 0) return onError(t('origen.sinDatos'));
      a.cargarLibro(f.name, libro);
    } catch {
      onError(t('origen.errorLectura'));
    } finally {
      setLeyendo(false);
    }
  };

  const archivo = a.archivo;
  const demasiadas = a.filas.length > MAX_FILAS_POR_ARCHIVO;

  return (
    <div className="flex flex-col gap-4">
      <FormSection titulo={t('origen.titulo')} descripcion={t('origen.descripcion', { max: MAX_FILAS_POR_ARCHIVO })} icono={FileSpreadsheet}>
        {leyendo ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-fg-secondary" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t('origen.leyendo')}
          </div>
        ) : (
          <ZonaArchivo
            etiqueta={t('origen.soltar')}
            ayuda={archivo ? t('origen.filas', { n: a.filas.length }) : t('origen.formatos')}
            icono={Upload}
            nombre={archivo?.nombre}
            onArchivo={(f) => void leer(f)}
          />
        )}

        {archivo && archivo.libro.hojas.length > 1 && (
          <FormField etiqueta={t('origen.hoja')} ayuda={t('origen.hojaAyuda')}>
            {(c) => (
              <Select value={archivo.hoja} onValueChange={a.elegirHoja}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="sm:max-w-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {archivo.libro.hojas.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        )}

        {archivo && archivo.filaCabecera < 0 && (
          <p className="rounded-lg bg-warning-subtle p-3 text-sm text-warning-text" role="alert">
            {t('origen.sinCabecera')}
          </p>
        )}
        {demasiadas && (
          <p className="rounded-lg bg-danger-subtle p-3 text-sm text-danger-text" role="alert">
            {t('origen.demasiadas', { n: a.filas.length, max: MAX_FILAS_POR_ARCHIVO })}
          </p>
        )}

        <details className="rounded-lg bg-subtle p-3 text-sm">
          <summary className="cursor-pointer font-medium text-fg">{t('origen.ayudaTitulo')}</summary>
          <p className="mt-2 text-xs text-fg-secondary">{t('origen.ayuda')}</p>
        </details>
      </FormSection>
    </div>
  );
}
