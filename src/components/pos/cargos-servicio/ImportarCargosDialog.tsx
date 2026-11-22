'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Dialogo } from '@/components/kit';
import { CargosServicioService } from './cargosServicioService';
import { codigoErrorCargo, type ErrorFilaCsv } from './cargosLogica';

/** Encabezado y una fila de ejemplo de la plantilla CSV. */
export const PLANTILLA_CSV_CARGOS =
  'name,charge_type,charge_value,min_amount,min_guests,applies_to,is_optional\n"Servicio mesa grande",percentage,10,,8,dine_in,false\n';

export function descargarPlantillaCargos() {
  const blob = new Blob(['﻿', PLANTILLA_CSV_CARGOS], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cargos-servicio.csv';
  a.click();
  URL.revokeObjectURL(url);
}

interface ImportarCargosDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  onImportado: () => void;
}

/** «Importar» cargos desde CSV (los errores por fila se traducen con `posCargosServicio.importar`). */
export function ImportarCargosDialog({ abierto, onAbiertoChange, onImportado }: ImportarCargosDialogProps) {
  const t = useTranslations('posCargos.importar');
  const tViejo = useTranslations('posCargosServicio');
  const tErr = useTranslations('posCargos.errores');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [importando, setImportando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const textoErrorFila = (e: ErrorFilaCsv) =>
    tViejo('importar.fila', { fila: e.fila, error: tViejo(`importar.errores.${e.codigo}`, { valor: e.valor ?? '' }) });

  const importar = async () => {
    if (!archivo) return;
    setImportando(true);
    try {
      const r = await CargosServicioService.importFromCSV(await archivo.text());
      if (r.columnasFaltantes.length > 0) {
        toast.error(tViejo('importar.columnasFaltantes', { columnas: r.columnasFaltantes.join(', ') }));
        return;
      }
      if (r.errors.length > 0) {
        toast.warning(tViejo('importar.resultado', { importados: r.imported, errores: r.errors.length }), {
          description: r.errors.slice(0, 3).map(textoErrorFila).join('\n'),
        });
      } else {
        toast.success(tViejo('importar.exito', { count: r.imported }));
      }
      onImportado();
      setArchivo(null);
      onAbiertoChange(false);
    } catch (e) {
      toast.error(tErr(codigoErrorCargo(e)));
    } finally {
      setImportando(false);
      if (entrada.current) entrada.current.value = '';
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => {
        if (importando) return;
        if (!v) setArchivo(null);
        onAbiertoChange(v);
      }}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={Upload}
      ancho={520}
      textoCancelar={t('cancelar')}
      secundarios={[{ etiqueta: t('plantilla'), onClick: descargarPlantillaCargos }]}
      primario={{
        etiqueta: importando ? t('importando') : t('importar'),
        onClick: () => void importar(),
        cargando: importando,
        deshabilitada: !archivo,
        motivo: t('eligeArchivo'),
      }}
    >
      <div className="flex flex-col gap-3 text-sm">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-line-strong p-6 text-center hover:bg-hover focus-within:ring-2 focus-within:ring-brand">
          <Upload aria-hidden="true" className="size-5 text-fg-secondary" strokeWidth={1.5} />
          <span className="font-medium text-fg">{archivo ? archivo.name : t('eligeArchivo')}</span>
          <span className="text-xs text-fg-secondary">{t('formato')}</span>
          <input
            ref={entrada}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          />
        </label>
        <ul className="list-disc space-y-1 pl-5 text-xs text-fg-secondary">
          <li>{tViejo('csvAyuda.tipoCargo')}</li>
          <li>{tViejo('csvAyuda.aplicaA')}</li>
          <li>{t('ayudaImpuesto')}</li>
        </ul>
      </div>
    </Dialogo>
  );
}
