'use client';

/**
 * Catálogo común › Importar desde Excel (Figma «23 Transporte» 2972:21818): plantilla, archivo,
 * revisión con errores por fila e importar. Reemplaza a `ImportVehiclesDialog` e
 * `ImportDriversDialog` con su misma lógica (columnas y reglas), ahora en
 * `lib/transporte/importarCatalogo.ts`. Lee CSV y Excel con el lector común (`leerLibro`).
 * Lo que ya existe (misma placa; mismo empleo) se actualiza.
 */
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { AvisoTonal, Dialogo, StatusBadge, Stepper, clasesBoton } from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { extensionAdmitida, leerLibro } from '@/lib/importacion/libro';
import {
  COLUMNAS_CONDUCTORES,
  COLUMNAS_VEHICULOS,
  EJEMPLO_CONDUCTORES,
  EJEMPLO_VEHICULOS,
  analizarConductores,
  analizarVehiculos,
  faltantes,
  plantillaCsv,
  registrosDesdeMatriz,
  resumenImportacion,
  type FilaImportacion,
} from '@/lib/transporte/importarCatalogo';

type Paso = 'plantilla' | 'archivo' | 'revisar' | 'importar';
const PASOS: readonly Paso[] = ['plantilla', 'archivo', 'revisar', 'importar'];

export interface ResultadoImportacion {
  importados: number;
  errores: { etiqueta: string; mensaje: string }[];
}

export interface ImportarCatalogoDialogoProps {
  tipo: 'vehiculos' | 'conductores';
  abierto: boolean;
  /** Clave → id de lo que ya existe (placa normalizada o `employment_id`). */
  existentes: ReadonlyMap<string, string>;
  onCerrar: () => void;
  onImportar: (filas: FilaImportacion[]) => Promise<ResultadoImportacion>;
}

export function ImportarCatalogoDialogo({ tipo, abierto, existentes, onCerrar, onImportar }: ImportarCatalogoDialogoProps) {
  const t = useTranslations('catalogoComun.dialogos.importar');
  const entero = useFormatoEntero();
  const entrada = useRef<HTMLInputElement>(null);
  const [plantilla, setPlantilla] = useState(false);
  const [archivo, setArchivo] = useState<{ nombre: string; filas: FilaImportacion[] } | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);

  const columnas = tipo === 'vehiculos' ? COLUMNAS_VEHICULOS : COLUMNAS_CONDUCTORES;
  const obligatorias = tipo === 'vehiculos' ? ['plate', 'vehicle_type'] : ['license_number', 'license_category', 'license_expiry'];
  const paso: Paso = resultado ? 'importar' : archivo ? 'revisar' : plantilla ? 'archivo' : 'plantilla';
  const r = archivo ? resumenImportacion(archivo.filas) : null;
  const aImportar = archivo ? archivo.filas.filter((f) => f.estado !== 'error') : [];

  const descargarPlantilla = () => {
    const csv = plantillaCsv(columnas, tipo === 'vehiculos' ? EJEMPLO_VEHICULOS : EJEMPLO_CONDUCTORES);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = tipo === 'vehiculos' ? 'plantilla_vehiculos.csv' : 'plantilla_conductores.csv';
    a.click();
    URL.revokeObjectURL(url);
    setPlantilla(true);
  };

  const leer = async (f: File) => {
    setErrorArchivo(null);
    if (!extensionAdmitida(f.name)) {
      setErrorArchivo(t('errores.extension'));
      return;
    }
    try {
      const matriz = leerLibro(await f.arrayBuffer(), f.name).matriz();
      const falta = faltantes(matriz, obligatorias);
      if (falta.length) {
        setErrorArchivo(t('errores.columnas', { columnas: falta.join(', ') }));
        return;
      }
      const registros = registrosDesdeMatriz(matriz);
      if (!registros.length) {
        setErrorArchivo(t('errores.vacio'));
        return;
      }
      setArchivo({ nombre: f.name, filas: tipo === 'vehiculos' ? analizarVehiculos(registros, existentes) : analizarConductores(registros, existentes) });
    } catch {
      setErrorArchivo(t('errores.lectura'));
    }
  };

  const importar = async () => {
    if (!aImportar.length) return;
    setImportando(true);
    try {
      setResultado(await onImportar(aImportar));
    } finally {
      setImportando(false);
    }
  };

  const mensajeError = (f: FilaImportacion) => t(`codigos.${f.error?.codigo ?? 'placaVacia'}`, { valor: f.error?.valor ?? '', campo: f.error?.campo ?? '' });

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !v && !importando && onCerrar()}
      titulo={t(`titulo.${tipo}`)}
      descripcion={t('descripcion')}
      ancho={560}
      icono={FileSpreadsheet}
      sinCancelar={paso === 'importar'}
      primario={
        paso === 'importar'
          ? { etiqueta: t('listo'), onClick: onCerrar }
          : paso === 'revisar'
            ? { etiqueta: t(`importarN.${tipo}`, { count: aImportar.length }), onClick: () => void importar(), cargando: importando, deshabilitada: aImportar.length === 0, motivo: t('nadaQueImportar') }
            : { etiqueta: t('elegirArchivo'), onClick: () => entrada.current?.click() }
      }
    >
      <div className="flex flex-col gap-4">
        <Stepper<Paso>
          etiqueta={t('pasos.etiqueta')}
          pasos={PASOS.map((p) => ({ valor: p, etiqueta: t(`pasos.${p}`) }))}
          actual={paso}
          resumenMovil={(n, total, etiqueta) => t('pasos.movil', { n, total, etiqueta })}
        />
        <input
          ref={entrada}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="sr-only"
          aria-label={t('elegirArchivo')}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void leer(f);
            e.target.value = '';
          }}
        />

        {paso === 'importar' && resultado ? (
          <div className="flex flex-col gap-3">
            <AvisoTonal tono={resultado.errores.length ? 'advertencia' : 'exito'} titulo={t(`resultado.${tipo}`, { count: resultado.importados })} />
            {resultado.errores.length > 0 && (
              <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg bg-danger-subtle p-3 text-[13px] text-danger-text">
                {resultado.errores.map((e, i) => (
                  <li key={i}>{`${e.etiqueta} · ${e.mensaje}`}</li>
                ))}
              </ul>
            )}
          </div>
        ) : archivo && r ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-xl border border-line p-3">
              <FileSpreadsheet aria-hidden="true" className="size-5 shrink-0 text-fg-secondary" strokeWidth={1.5} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-fg">{archivo.nombre}</span>
                <span className="text-xs text-fg-muted">{t('filas', { count: archivo.filas.length })}</span>
              </div>
              <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => entrada.current?.click()}>
                {t('cambiar')}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge estado="nuevos" tono="exito" apariencia="contorno" etiqueta={t('listos', { count: r.nuevos })} />
              {r.existen > 0 && <StatusBadge estado="existen" tono="informacion" apariencia="contorno" etiqueta={t('existen', { count: r.existen })} />}
              {r.errores > 0 && <StatusBadge estado="errores" tono="peligro" apariencia="contorno" etiqueta={t('conError', { count: r.errores })} />}
            </div>
            {r.errores > 0 && (
              <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg bg-danger-subtle p-3 text-[13px] text-danger-text" aria-label={t('conError', { count: r.errores })}>
                {archivo.filas
                  .filter((f) => f.estado === 'error')
                  .map((f) => (
                    <li key={f.fila}>{t('filaError', { fila: entero(f.fila), mensaje: mensajeError(f) })}</li>
                  ))}
              </ul>
            )}
            <button type="button" onClick={descargarPlantilla} className="inline-flex items-center gap-2 self-start text-[13px] font-medium text-brand hover:underline">
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('descargarPlantilla')}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 rounded-xl border border-line p-4">
              <span className="text-sm font-medium text-fg">{t('paso1')}</span>
              <span className="text-[13px] text-fg-secondary">{t(`columnas.${tipo}`)}</span>
              <button type="button" onClick={descargarPlantilla} className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'self-start' })}>
                <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('descargarPlantilla')}
              </button>
            </div>
            <div className="flex flex-col gap-2 rounded-xl border border-dashed border-line-strong p-4">
              <span className="text-sm font-medium text-fg">{t('paso2')}</span>
              <span className="text-[13px] text-fg-secondary">{t('formatos')}</span>
              <button type="button" onClick={() => entrada.current?.click()} className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'self-start' })}>
                <Upload aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('elegirArchivo')}
              </button>
            </div>
          </div>
        )}
        {errorArchivo && <AvisoTonal tono="peligro" rol="alert" titulo={errorArchivo} />}
      </div>
    </Dialogo>
  );
}
