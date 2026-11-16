'use client';

/**
 * Importar empleados desde CSV. Reemplaza el importador viejo, que escribía
 * `employments` desde el navegador con salario, banco y seguridad social.
 * Ahora cada fila pasa por `POST /api/hrm/empleados/alta` (la misma transacción
 * del alta manual, con sus permisos y su registro). La plantilla no tiene banco
 * ni seguridad social; el salario solo viaja con el permiso de salario.
 * Cada fila crea su usuario de la app y le manda la invitación (revisión
 * 2026-11-15): ocupa un usuario del plan; sin cupo se detiene.
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Download, FileUp, Upload } from 'lucide-react';
import { AvisoTonal, DataTable, PageHeader, StatusBadge, Tarjeta, clasesBoton, type ColumnaTabla } from '@/components/kit';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import { COLUMNAS_IMPORTAR, EJEMPLO_IMPORTAR, leerCsv, prepararFilas, type FilaImportar } from '@/lib/hrm/personas/importar';
import { ErrorPersonas, pedir, useCarga, type Catalogos } from '../apiPersonas';

const LISTA = '/app/hrm/empleados';
type Resultado = 'creado' | 'duplicado' | 'sin_cupo' | 'error';

export function ImportarEmpleados() {
  const t = useTranslations('hrmPersonas.importar');
  const tc = useTranslations('hrmPersonas.comun');
  const catalogos = useCarga<Catalogos>('/api/hrm/catalogos');
  const permisos = useCarga<{ grupos: Record<string, { editar: boolean }> }>('/api/hrm/permisos');
  const conSalario = permisos.carga.estado === 'listo' && !!permisos.carga.datos.grupos.salario_pago?.editar;
  const [crudas, setCrudas] = useState<Record<string, string>[] | null>(null);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Record<number, Resultado>>({});
  const [importando, setImportando] = useState(false);

  const filas = useMemo<FilaImportar[]>(
    () => (crudas && catalogos.carga.estado === 'listo' ? prepararFilas(crudas, catalogos.carga.datos, conSalario) : []),
    [crudas, catalogos.carga, conSalario]
  );
  const validas = filas.filter((f) => f.cuerpo);

  const plantilla = () =>
    descargarCsv(
      t('archivoPlantilla'),
      aCsv([[...COLUMNAS_IMPORTAR], COLUMNAS_IMPORTAR.map((c) => (c === 'salario_mensual' && !conSalario ? '' : EJEMPLO_IMPORTAR[c]))])
    );

  const leer = async (f: File | undefined) => {
    if (!f) return;
    setArchivo(f.name);
    setResultados({});
    setCrudas(leerCsv(await f.text()));
  };

  const importar = async () => {
    setImportando(true);
    let creados = 0;
    let sinCupo = false;
    for (const f of validas) {
      if (sinCupo) {
        setResultados((r) => ({ ...r, [f.fila]: 'sin_cupo' }));
        continue;
      }
      try {
        await pedir('/api/hrm/empleados/alta', { metodo: 'POST', cuerpo: { ...f.cuerpo, origin: window.location.origin } });
        creados += 1;
        setResultados((r) => ({ ...r, [f.fila]: 'creado' }));
      } catch (e) {
        const codigo = e instanceof ErrorPersonas ? e.codigo : '';
        sinCupo = codigo === 'sin_cupo';
        setResultados((r) => ({ ...r, [f.fila]: codigo === 'documento_duplicado' ? 'duplicado' : sinCupo ? 'sin_cupo' : 'error' }));
      }
    }
    setImportando(false);
    toast.success(t('importados', { n: creados }));
  };

  const columnas: ColumnaTabla<FilaImportar>[] = [
    { id: 'fila', encabezado: t('columnas.fila'), variante: 'mono', celda: (f) => f.fila },
    { id: 'nombre', encabezado: t('columnas.nombre'), celda: (f) => <span className="font-medium text-fg">{f.nombre || '—'}</span> },
    {
      id: 'estado',
      encabezado: t('columnas.estado'),
      celda: (f) => {
        const r = resultados[f.fila];
        if (r) return <StatusBadge estado={r} tono={r === 'creado' ? 'exito' : 'peligro'} etiqueta={t(`resultados.${r}`)} />;
        return f.errores.length > 0 ? (
          <span className="text-xs text-danger-text">{f.errores.map((e) => t(`errores.${e}`)).join(' · ')}</span>
        ) : (
          <StatusBadge estado="lista" tono="informacion" etiqueta={t('lista')} />
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        variante="form"
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        volverA={LISTA}
        migas={[{ etiqueta: tc('migas.rrhh'), href: LISTA }, { etiqueta: tc('migas.empleados'), href: LISTA }, { etiqueta: t('titulo') }]}
      />
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-4">
        <Tarjeta
          titulo={t('paso1')}
          descripcion={conSalario ? t('plantillaConSalario') : t('plantillaSinSalario')}
          accion={
            <button type="button" onClick={plantilla} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              <Download aria-hidden className="size-4" strokeWidth={1.5} />
              {t('descargarPlantilla')}
            </button>
          }
        >
          <div className="flex flex-col gap-2">
            <AvisoTonal tono="informacion" compacto titulo={t('sinSensibles')} />
            <AvisoTonal tono="neutro" compacto titulo={t('cadaUsuario')} />
          </div>
        </Tarjeta>
        <Tarjeta titulo={t('paso2')} descripcion={archivo ?? t('sinArchivo')}>
          <label className={clasesBoton({ variante: 'secundario' })}>
            <FileUp aria-hidden className="size-4" strokeWidth={1.5} />
            {t('elegirArchivo')}
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void leer(e.target.files?.[0])} />
          </label>
        </Tarjeta>
        {crudas && (
          <DataTable
            etiqueta={t('vista')}
            columnas={columnas}
            filas={filas}
            obtenerId={(f) => String(f.fila)}
            estado={catalogos.carga.estado === 'cargando' ? 'cargando' : filas.length === 0 ? 'vacio' : 'listo'}
            densidad="compacta"
            vacio={{ titulo: t('vacio'), icono: Upload }}
            pie={
              <div className="flex flex-wrap items-center justify-between gap-3 p-3">
                <p className="text-sm text-fg-secondary">{t('resumen', { validas: validas.length, total: filas.length })}</p>
                <button type="button" onClick={() => void importar()} disabled={validas.length === 0 || importando} className={clasesBoton({ variante: 'primario' })}>
                  <Upload aria-hidden className="size-4" strokeWidth={1.5} />
                  {t('importar', { n: validas.length })}
                </button>
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}
