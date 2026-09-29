'use client';

/**
 * Importar clases o reservas desde un CSV (docs/design/MEMBRESIAS-FASE-1-2.md §13).
 *
 * 1. Plantilla descargable y archivo (.csv, hasta 2 MB, 500 filas).
 * 2. Vista previa con validación por fila: primero la del navegador (formato, fechas, horas,
 *    valores de la base, duplicadas en el archivo) y después la de la base con la misma RPC en
 *    modo `soloValidar` (miembro, clase, instructor, sede, cupo, duplicadas ya guardadas).
 * 3. Importar: TODO O NADA. El botón solo se habilita sin errores y la RPC vuelve a validar.
 *
 * Fechas y horas del archivo son de pared en la zona de la sede; la vista previa las pinta con la
 * zona de la organización y nunca con la del navegador.
 */
import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Download, FileUp, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, ListCard, PanelAdaptable, StatusBadge, type ColumnaTabla } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { leerMatriz } from '@/lib/inventario/importacion/lector';
import { apiMembresias, ErrorPeticionMembresias } from '@/lib/services/membresias/clienteMembresias';
import {
  MAX_FILAS_IMPORTACION,
  combinarReporte,
  esErrorFilaConocido,
  filasParaServidor,
  inicioPrevisto,
  leerClases,
  leerReservas,
  plantillaCsv,
  resumenReporte,
  type FilaClaseCsv,
  type FilaReporte,
  type FilaReservaCsv,
  type Lectura,
  type TipoImportacion,
} from '@/lib/services/membresias/importacionCsv';
import type { FechasOrg } from '../useFechasOrg';

const TAMANO_MAXIMO = 2 * 1024 * 1024;

type Datos = FilaClaseCsv | FilaReservaCsv;
interface FilaVista {
  reporte: FilaReporte;
  datos: Datos;
}

interface Props {
  tipo: TipoImportacion;
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  fechas: FechasOrg;
  /** Tras importar: la página recarga su listado. */
  onImportado: () => void;
}

function descargar(nombre: string, contenido: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function DialogoImportarCsv({ tipo, abierto, onAbiertoChange, fechas, onImportado }: Props) {
  const t = useTranslations('membresias.importar');
  const te = useTranslations('membresias.errores');
  const entrada = useRef<HTMLInputElement>(null);
  const [nombre, setNombre] = useState<string | null>(null);
  const [lectura, setLectura] = useState<Lectura<Datos> | null>(null);
  const [servidor, setServidor] = useState<Parameters<typeof combinarReporte>[1]>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [validando, setValidando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [encima, setEncima] = useState(false);

  const reiniciar = () => {
    setNombre(null);
    setLectura(null);
    setServidor(null);
    setErrorArchivo(null);
  };

  const cerrar = (v: boolean) => {
    if (!v && (validando || importando)) return;
    if (!v) reiniciar();
    onAbiertoChange(v);
  };

  const mensajeApi = (e: unknown) => {
    const codigo = e instanceof ErrorPeticionMembresias ? e.codigo : '';
    return codigo && te.has(codigo) ? te(codigo) : t('erroresArchivo.validar');
  };

  const leerArchivo = async (archivo: File) => {
    reiniciar();
    setNombre(archivo.name);
    if (!archivo.name.toLowerCase().endsWith('.csv')) return setErrorArchivo(t('erroresArchivo.formato'));
    if (archivo.size > TAMANO_MAXIMO) return setErrorArchivo(t('erroresArchivo.tamano'));
    let l: Lectura<Datos>;
    try {
      const matriz = leerMatriz(await archivo.arrayBuffer(), archivo.name);
      l = (tipo === 'clases' ? leerClases(matriz) : leerReservas(matriz)) as Lectura<Datos>;
    } catch {
      return setErrorArchivo(t('erroresArchivo.lectura'));
    }
    if (l.error) {
      return setErrorArchivo(
        t(`erroresArchivo.${l.error}`, { columnas: l.faltantes.join(', '), n: l.filas.length, max: MAX_FILAS_IMPORTACION }),
      );
    }
    setLectura(l);
    const enviar = filasParaServidor(l);
    if (enviar.length === 0) return;
    setValidando(true);
    try {
      const res = await apiMembresias.importar(tipo, enviar, true);
      setServidor(res.filas);
    } catch (e) {
      setErrorArchivo(mensajeApi(e));
    } finally {
      setValidando(false);
    }
  };

  const reporte = useMemo(() => (lectura ? combinarReporte(lectura, servidor) : []), [lectura, servidor]);
  const vista = useMemo<FilaVista[]>(
    () => (lectura ? lectura.filas.map((f, i) => ({ reporte: reporte[i], datos: f.datos })) : []),
    [lectura, reporte],
  );
  const resumen = resumenReporte(reporte);
  const validadoEnBase = !!lectura && (servidor !== null || filasParaServidor(lectura).length === 0);
  const listo = validadoEnBase && resumen.total > 0 && resumen.conError === 0 && !errorArchivo;

  const importar = async () => {
    if (!lectura || !listo) return;
    setImportando(true);
    try {
      const res = await apiMembresias.importar(tipo, filasParaServidor(lectura), false);
      if (res.ok) {
        toast.success(t('toasts.importadas', { n: res.importadas }));
        reiniciar();
        onAbiertoChange(false);
        onImportado();
      } else {
        // La base cambió desde la vista previa (otra persona reservó el último cupo, p. ej.).
        setServidor(res.filas);
        toast.error(t('toasts.cambios'));
      }
    } catch (e) {
      toast.error(mensajeApi(e));
    } finally {
      setImportando(false);
    }
  };

  const textoError = (codigo: string) => (esErrorFilaConocido(codigo) ? t(`errores.${codigo}`) : codigo);
  const cuando = (f: FilaVista) => {
    const inicio = f.reporte.inicio ?? inicioPrevisto(f.datos.fecha, f.datos.hora, fechas.zona);
    return inicio ? fechas.fechaHora(inicio) : '—';
  };
  const principal = (f: FilaVista) => {
    if (tipo === 'clases') {
      const d = f.datos as FilaClaseCsv;
      return { titulo: d.titulo ?? '—', detalle: [d.tipo, d.sede, d.instructor].filter(Boolean).join(' · ') };
    }
    const d = f.datos as FilaReservaCsv;
    return { titulo: f.reporte.miembro ?? d.documento ?? d.correo ?? '—', detalle: f.reporte.clase ?? d.clase ?? '' };
  };
  const insignia = (f: FilaVista) =>
    f.reporte.errores.length === 0 ? (
      <StatusBadge estado="lista" etiqueta={t('estados.lista')} tono="exito" />
    ) : (
      <StatusBadge estado="con_errores" etiqueta={t('estados.conErrores')} tono="peligro" />
    );
  const errores = (f: FilaVista) =>
    f.reporte.errores.length === 0 ? (
      <span className="text-fg-muted">—</span>
    ) : (
      <ul className="space-y-0.5 text-sm text-danger">
        {f.reporte.errores.map((c) => (
          <li key={c}>{textoError(c)}</li>
        ))}
      </ul>
    );

  const columnas: ColumnaTabla<FilaVista>[] = [
    { id: 'fila', encabezado: t('tabla.fila'), celda: (f) => f.reporte.fila, variante: 'importe', ancho: 64 },
    {
      id: 'registro',
      encabezado: tipo === 'clases' ? t('tabla.clase') : t('tabla.reserva'),
      celda: (f) => {
        const p = principal(f);
        return (
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{p.titulo}</p>
            {p.detalle && <p className="truncate text-xs text-fg-secondary">{p.detalle}</p>}
          </div>
        );
      },
    },
    { id: 'cuando', encabezado: t('tabla.cuando'), celda: cuando, ocultarDebajo: 'md' },
    { id: 'estado', encabezado: t('tabla.estado'), celda: insignia },
    { id: 'errores', encabezado: t('tabla.errores'), celda: errores },
  ];

  const titulo = tipo === 'clases' ? t('tituloClases') : t('tituloReservas');
  const descripcion =
    tipo === 'clases'
      ? t('descripcionClases', { zona: fechas.zona, max: MAX_FILAS_IMPORTACION })
      : t('descripcionReservas', { zona: fechas.zona, max: MAX_FILAS_IMPORTACION });

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={cerrar}
      titulo={titulo}
      descripcion={descripcion}
      icono={Upload}
      ocupado={validando || importando}
      ancho={1120}
      pie={
        <>
          <Button variant="outline" onClick={() => cerrar(false)} disabled={validando || importando}>
            {t('cancelar')}
          </Button>
          <Button
            onClick={() => void importar()}
            disabled={!listo || validando || importando}
            aria-disabled={!listo}
            title={!listo && lectura ? t('motivoDeshabilitado') : undefined}
          >
            {importando ? t('importando') : t('importarN', { n: resumen.validas })}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-fg-secondary">{t('reglaTodoONada')}</p>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 self-start"
            onClick={() => descargar(tipo === 'clases' ? 'plantilla-clases.csv' : 'plantilla-reservas.csv', plantillaCsv(tipo))}
          >
            <Download aria-hidden="true" className="mr-2 size-4" />
            {t('plantilla')}
          </Button>
        </div>

        <div
          role="button"
          tabIndex={0}
          aria-label={t('archivo.etiqueta')}
          onClick={() => entrada.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              entrada.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setEncima(true);
          }}
          onDragLeave={() => setEncima(false)}
          onDrop={(e) => {
            e.preventDefault();
            setEncima(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void leerArchivo(f);
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            encima ? 'border-line-brand bg-brand-tint' : 'border-line-strong hover:border-line-brand hover:bg-hover',
          )}
        >
          <FileUp aria-hidden="true" className="size-8 text-fg-muted" strokeWidth={1.5} />
          <p className="break-all text-sm font-medium text-fg">{nombre ?? t('archivo.etiqueta')}</p>
          <p className="text-xs text-fg-secondary">{nombre ? t('archivo.otro') : t('archivo.ayuda')}</p>
          <input
            ref={entrada}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void leerArchivo(f);
              e.target.value = '';
            }}
          />
        </div>

        {errorArchivo && (
          <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle px-3 py-2 text-sm text-danger">
            {errorArchivo}
          </p>
        )}

        {lectura && !errorArchivo && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
              <span className="font-medium text-fg">
                {validando ? t('validando') : t('resumen', { total: resumen.total, validas: resumen.validas, conError: resumen.conError })}
              </span>
              {lectura.ignoradas.length > 0 && (
                <span className="text-fg-secondary">{t('ignoradas', { columnas: lectura.ignoradas.join(', ') })}</span>
              )}
            </div>
            <DataTable
              etiqueta={t('tabla.etiqueta')}
              columnas={columnas}
              filas={vista}
              obtenerId={(f) => String(f.reporte.fila)}
              estado={validando ? 'cargando' : 'listo'}
              densidad="compacta"
              etiquetaFila={(f) => t('tabla.etiquetaFila', { n: f.reporte.fila })}
              tonoFila={(f) => (f.reporte.errores.length > 0 ? 'peligro' : undefined)}
              altoMaximo="50vh"
              tarjetaMovil={(f) => {
                const p = principal(f);
                return (
                  <ListCard
                    titulo={`${t('tabla.fila')} ${f.reporte.fila} · ${p.titulo}`}
                    subtitulo={[p.detalle, cuando(f)].filter(Boolean).join(' · ')}
                    estado={insignia(f)}
                    meta={f.reporte.errores.map(textoError).join(' · ') || undefined}
                  />
                );
              }}
            />
          </>
        )}
      </div>
    </PanelAdaptable>
  );
}
