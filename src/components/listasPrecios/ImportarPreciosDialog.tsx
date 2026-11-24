'use client';

/**
 * «Importar precios a «Lista»» (Figma «05 POS y ventas» 03, 3020:273733).
 *
 * Paso 1: subir el Excel o CSV (se lee en el navegador: `leerArchivoPrecios`).
 * Paso 2: revisar. La vista previa la calcula el SERVIDOR (`price_list_import` con
 * `aplicar = false`): SKU de la organización, precio, cantidad, duplicados y qué cambia. Nada se
 * escribe hasta «Importar N precios», que entra en una sola transacción.
 */
import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, FileSpreadsheet, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Dialogo } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { ListasPreciosService, ErrorPeticionLista } from '@/lib/services/listasPreciosService';
import { leerArchivoPrecios, plantillaCsv, type ArchivoLeido } from '@/lib/listasPrecios/archivoPrecios';
import type { EstadoFilaImportacion, ResultadoImportacion } from '@/lib/listasPrecios/tipos';
import type { TonoBadge } from '@/components/kit';

const TONO: Record<EstadoFilaImportacion, TonoBadge> = {
  igual: 'neutro',
  nuevo: 'exito',
  escalon_nuevo: 'exito',
  cambia: 'informacion',
  no_existe: 'peligro',
  precio_invalido: 'peligro',
  cantidad_invalida: 'peligro',
  duplicado: 'peligro',
};
const ES_ERROR = (e: EstadoFilaImportacion) => TONO[e] === 'peligro';

type Vista = 'todas' | 'errores' | 'cambios';

export function ImportarPreciosDialog({
  abierto,
  onAbiertoChange,
  listaId,
  listaNombre,
  listas,
  onImportado,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  listaId: string;
  listaNombre: string;
  /** Para elegir otra lista cuando se abre desde el listado. */
  listas?: readonly { id: string; name: string }[];
  onImportado: () => void;
}) {
  const t = useTranslations('listasPrecios.importar');
  const te = useTranslations('listasPrecios.errores');
  const { formatear } = useMonedaOrganizacion();
  const entrada = useRef<HTMLInputElement>(null);

  const [destino, setDestino] = useState(listaId);
  const [archivo, setArchivo] = useState<{ nombre: string; leido: ArchivoLeido } | null>(null);
  const [previa, setPrevia] = useState<ResultadoImportacion | null>(null);
  const [reemplazar, setReemplazar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [vista, setVista] = useState<Vista>('todas');

  const nombreDestino = listas?.find((l) => l.id === destino)?.name ?? listaNombre;

  const reiniciar = () => {
    setArchivo(null);
    setPrevia(null);
    setReemplazar(false);
    setVista('todas');
    if (entrada.current) entrada.current.value = '';
  };

  const elegirArchivo = async (f: File | undefined) => {
    if (!f) return;
    setOcupado(true);
    try {
      const leido = await leerArchivoPrecios(f);
      if (leido.filas.length === 0 || !leido.columnas.sku || !leido.columnas.precio) {
        toast.error(t('sinColumnas'));
        return;
      }
      setArchivo({ nombre: f.name, leido });
      setPrevia(await ListasPreciosService.importar(destino, leido.filas, false, false));
    } catch (e) {
      toast.error(te(e instanceof ErrorPeticionLista ? e.codigo : 'archivo_invalido'));
    } finally {
      setOcupado(false);
    }
  };

  const importar = async () => {
    if (!archivo) return;
    setOcupado(true);
    try {
      const r = await ListasPreciosService.importar(destino, archivo.leido.filas, reemplazar, true);
      toast.success(t('listo', { n: r.resumen.nuevos + r.resumen.cambian }));
      onImportado();
      reiniciar();
      onAbiertoChange(false);
    } catch (e) {
      toast.error(te(e instanceof ErrorPeticionLista ? e.codigo : 'error_desconocido'));
    } finally {
      setOcupado(false);
    }
  };

  const descargarPlantilla = () => {
    const csv = plantillaCsv({ sku: t('plantilla.sku'), precio: t('plantilla.precio'), cantidad: t('plantilla.cantidad') });
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = t('plantilla.archivo');
    a.click();
    URL.revokeObjectURL(url);
  };

  const filas = useMemo(() => {
    const todas = previa?.filas ?? [];
    if (vista === 'errores') return todas.filter((f) => ES_ERROR(f.estado));
    if (vista === 'cambios') return todas.filter((f) => f.estado !== 'igual' && !ES_ERROR(f.estado));
    return todas.slice(0, 200);
  }, [previa, vista]);

  const r = previa?.resumen;
  const aImportar = r ? r.nuevos + r.cambian : 0;
  const filasConError = (previa?.filas ?? []).filter((f) => ES_ERROR(f.estado)).map((f) => f.fila);

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => {
        if (!v) reiniciar();
        onAbiertoChange(v);
      }}
      titulo={t('titulo', { nombre: nombreDestino })}
      descripcion={previa ? t('paso2') : t('paso1')}
      ancho={880}
      icono={Upload}
      primario={{
        etiqueta: previa ? t('confirmar', { n: aImportar }) : t('elegirArchivo'),
        onClick: () => (previa ? void importar() : entrada.current?.click()),
        cargando: ocupado,
        deshabilitada: !!previa && aImportar === 0 && !reemplazar,
        motivo: previa && aImportar === 0 ? t('nadaQueImportar') : undefined,
      }}
      textoCancelar={previa ? t('atras') : undefined}
      onCancelar={previa ? reiniciar : undefined}
      secundarios={[{ etiqueta: t('plantilla.descargar'), onClick: descargarPlantilla }]}
    >
      <div className="flex flex-col gap-4">
        <ol className="grid gap-2 sm:grid-cols-2">
          <li className={`flex items-center gap-3 rounded-lg border p-3 ${previa ? 'border-line' : 'border-brand bg-brand-tint'}`}>
            <span className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${previa ? 'bg-success-subtle text-success-text' : 'bg-brand text-white'}`}>
              {previa ? <Check aria-hidden="true" className="size-3.5" /> : 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-fg">{t('pasoSubir')}</span>
              <span className="block truncate text-xs text-fg-secondary">{archivo?.nombre ?? t('formatos')}</span>
            </span>
          </li>
          <li className={`flex items-center gap-3 rounded-lg border p-3 ${previa ? 'border-brand bg-brand-tint' : 'border-line'}`}>
            <span className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${previa ? 'bg-brand text-white' : 'bg-subtle text-fg-secondary'}`}>2</span>
            <span>
              <span className="block text-sm font-medium text-fg">{t('pasoRevisar')}</span>
              <span className="block text-xs text-fg-secondary">{r ? t('filasLeidas', { n: r.filas }) : '—'}</span>
            </span>
          </li>
        </ol>

        <input
          ref={entrada}
          type="file"
          accept=".xlsx,.xls,.csv,text/csv"
          className="sr-only"
          aria-label={t('elegirArchivo')}
          onChange={(e) => void elegirArchivo(e.target.files?.[0])}
        />

        {!previa && (
          <>
            {listas && listas.length > 1 && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-fg-secondary">{t('lista')}</span>
                <Select value={destino} onValueChange={setDestino}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {listas.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            )}
            <button
              type="button"
              onClick={() => entrada.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void elegirArchivo(e.dataTransfer.files?.[0]);
              }}
              className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong p-8 text-center hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <FileSpreadsheet aria-hidden="true" className="size-8 text-fg-muted" strokeWidth={1.5} />
              <span className="text-sm font-medium text-fg">{t('soltar')}</span>
              <span className="text-xs text-fg-secondary">{t('columnasEsperadas')}</span>
            </button>
          </>
        )}

        {previa && archivo && r && (
          <>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-subtle p-3">
              <div className="flex min-w-0 items-center gap-3">
                <FileSpreadsheet aria-hidden="true" className="size-5 shrink-0 text-success-text" strokeWidth={1.5} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{archivo.nombre}</p>
                  <p className="truncate text-xs text-fg-secondary">
                    {t('resumenArchivo', {
                      n: r.filas,
                      columnas: [archivo.leido.columnas.sku, archivo.leido.columnas.precio, archivo.leido.columnas.cantidad].filter(Boolean).join(', '),
                    })}
                  </p>
                </div>
              </div>
              <button type="button" className="shrink-0 text-sm font-medium text-brand" onClick={reiniciar}>
                {t('cambiarArchivo')}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge tono="exito" apariencia="contorno" tamano="sm">{t('nuevos', { n: r.nuevos })}</Badge>
              <Badge tono="informacion" apariencia="contorno" tamano="sm">{t('cambian', { n: r.cambian })}</Badge>
              {r.errores > 0 && <Badge tono="peligro" apariencia="contorno" tamano="sm">{t('conError', { n: r.errores })}</Badge>}
              <span className="ml-auto text-xs text-fg-muted">{t('igualesSeQuedan')}</span>
            </div>

            <div className="max-h-[320px] overflow-auto rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-subtle text-left text-xs text-fg-secondary">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t('col.fila')}</th>
                    <th className="px-3 py-2 font-medium">{t('col.sku')}</th>
                    <th className="px-3 py-2 font-medium">{t('col.producto')}</th>
                    <th className="px-3 py-2 font-medium">{t('col.desde')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('col.hoy')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('col.nuevo')}</th>
                    <th className="px-3 py-2 font-medium">{t('col.estado')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.fila} className={`border-t border-line ${ES_ERROR(f.estado) ? 'bg-danger-subtle/50' : ''}`}>
                      <td className="px-3 py-2 text-fg-muted">{f.fila}</td>
                      <td className="px-3 py-2 font-mono text-xs">{f.sku ?? '—'}</td>
                      <td className={`px-3 py-2 ${f.product_id ? 'text-fg' : 'text-danger-text'}`}>{f.nombre ?? t('noEncontrado')}</td>
                      <td className="px-3 py-2">{f.min_qty != null ? t('unidades', { n: f.min_qty }) : '—'}</td>
                      <td className="px-3 py-2 text-right text-fg-muted">{f.hoy != null ? formatear(f.hoy) : '—'}</td>
                      <td className="px-3 py-2 text-right font-medium text-fg">{f.nuevo != null ? formatear(f.nuevo) : '—'}</td>
                      <td className="px-3 py-2">
                        <Badge tono={TONO[f.estado]} apariencia="contorno" tamano="sm">{t(`estados.${f.estado}`)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              {(['todas', 'errores', 'cambios'] as const).map((v) => (
                <button key={v} type="button" className={vista === v ? 'font-medium text-fg' : 'text-brand'} onClick={() => setVista(v)}>
                  {t(`vista.${v}`, { n: r.filas })}
                </button>
              ))}
            </div>

            <label className="flex items-center justify-between gap-4 rounded-lg bg-subtle p-3">
              <span>
                <span className="block text-sm font-medium text-fg">{t('reemplazar')}</span>
                <span className="block text-xs text-fg-secondary">{t('reemplazarAyuda', { n: r.quedan_fuera })}</span>
              </span>
              <Switch checked={reemplazar} onCheckedChange={setReemplazar} aria-label={t('reemplazar')} />
            </label>
            {filasConError.length > 0 && (
              <p className="text-sm text-fg-secondary">{t('filasConError', { filas: filasConError.slice(0, 10).join(', '), n: filasConError.length })}</p>
            )}
          </>
        )}
      </div>
    </Dialogo>
  );
}
