'use client';

/**
 * «⋯ › Importar» de Sucursales (Figma 08, sección 6): crea sucursales desde un
 * CSV con las mismas columnas que «Exportar» (nombre, código, ciudad,
 * dirección, teléfono). Fases: elegir archivo → revisar (válidas, con error y
 * las que no caben en el cupo) → importando (sin cerrar) → resultado.
 *
 * Cada sucursal se crea con `branchService.createBranch`, el MISMO camino que
 * «Nueva sucursal» (validaciones, zona horaria y RLS incluidas): aquí no hay
 * otra forma de crear sedes. Nunca se importan más de las que caben en el
 * cupo del plan.
 */
import { useMemo, useRef, useState } from 'react';
import { FileUp, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PanelAdaptable, clasesBoton } from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { branchService } from '@/lib/services/branchService';
import type { Branch } from '@/types/branch';
import {
  cabenEnCupo,
  leerCsv,
  prepararImportacion,
  type CampoImportable,
  type SucursalImportada,
} from '@/lib/organizacion/sucursales';
import type { SucursalFila } from './tipos';

type Fase = 'elegir' | 'revisar' | 'importando' | 'resultado';

/** Nombre técnico aceptado además del encabezado traducido de «Exportar». */
const TECNICOS: Record<CampoImportable, string> = {
  name: 'name',
  branch_code: 'branch_code',
  city: 'city',
  address: 'address',
  phone: 'phone',
};
const CLAVE_CSV: Record<CampoImportable, string> = {
  name: 'nombre',
  branch_code: 'codigo',
  city: 'ciudad',
  address: 'direccion',
  phone: 'telefono',
};

export function DialogoImportarSucursales({
  abierto,
  onAbiertoChange,
  organizationId,
  existentes,
  restantes,
  onImportadas,
}: {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  organizationId: number;
  existentes: readonly SucursalFila[];
  /** Cupo libre de sucursales (`null` = sin tope). */
  restantes: number | null;
  onImportadas: () => void;
}) {
  const t = useTranslations('org.acceso.sucursales');
  const ti = useTranslations('org.acceso.sucursales.importar');
  const entero = useFormatoEntero();
  const archivo = useRef<HTMLInputElement>(null);
  const [fase, setFase] = useState<Fase>('elegir');
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [filas, setFilas] = useState<SucursalImportada[]>([]);
  const [sinNombre, setSinNombre] = useState(false);
  const [avance, setAvance] = useState(0);
  const [resultado, setResultado] = useState<{ creadas: number; fallos: string[] }>({ creadas: 0, fallos: [] });

  const encabezados = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(TECNICOS) as CampoImportable[]).map((c) => [c, [t(`csv.${CLAVE_CSV[c]}`), TECNICOS[c]]]),
      ) as Record<CampoImportable, string[]>,
    [t],
  );

  const validas = filas.filter((f) => f.error === null);
  const caben = cabenEnCupo(validas.length, restantes);
  const fueraDeCupo = validas.length - caben;

  const reiniciar = () => {
    setFase('elegir');
    setFilas([]);
    setNombreArchivo('');
    setSinNombre(false);
    setAvance(0);
    if (archivo.current) archivo.current.value = '';
  };

  const cerrar = (a: boolean) => {
    if (fase === 'importando') return;
    onAbiertoChange(a);
    if (!a) reiniciar();
  };

  const leer = async (f: File | undefined) => {
    if (!f) return;
    const texto = await f.text();
    const { columnas, sucursales } = prepararImportacion(leerCsv(texto), encabezados, existentes);
    setNombreArchivo(f.name);
    setSinNombre(!columnas.includes('name'));
    setFilas(sucursales);
    setFase('revisar');
  };

  const importar = async () => {
    const lote = validas.slice(0, caben);
    setFase('importando');
    setAvance(0);
    let creadas = 0;
    const fallos: string[] = [];
    for (const s of lote) {
      try {
        const codigo = s.datos.branch_code || (await branchService.generateBranchCode(organizationId));
        await branchService.createBranch({
          organization_id: organizationId,
          name: s.datos.name ?? '',
          branch_code: codigo,
          city: s.datos.city,
          address: s.datos.address,
          phone: s.datos.phone,
          is_main: false,
          is_active: true,
        } as Branch);
        creadas++;
      } catch (e) {
        fallos.push(ti('fallo', { linea: s.linea, nombre: s.datos.name ?? '', motivo: e instanceof Error ? e.message : '' }));
      }
      setAvance((n) => n + 1);
    }
    setResultado({ creadas, fallos });
    setFase('resultado');
    if (creadas > 0) onImportadas();
  };

  const pie = (() => {
    switch (fase) {
      case 'elegir':
        return (
          <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => cerrar(false)}>
            {ti('cancelar')}
          </button>
        );
      case 'revisar':
        return (
          <>
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={reiniciar}>
              {ti('otroArchivo')}
            </button>
            <button type="button" className={clasesBoton()} disabled={caben === 0} onClick={() => void importar()}>
              {ti('importar', { n: caben })}
            </button>
          </>
        );
      case 'importando':
        return (
          <button type="button" className={clasesBoton()} disabled aria-busy="true">
            {ti('importando', { hechas: avance, total: caben })}
          </button>
        );
      default:
        return (
          <button type="button" className={clasesBoton()} onClick={() => cerrar(false)}>
            {ti('listo')}
          </button>
        );
    }
  })();

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={cerrar}
      titulo={ti('titulo')}
      descripcion={ti('descripcion')}
      icono={FileUp}
      ancho={560}
      ocupado={fase === 'importando'}
      bloquearClicFuera={fase === 'importando'}
      pie={pie}
    >
      {fase === 'elegir' && (
        <div className="flex flex-col gap-4">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-subtle p-6 text-center hover:bg-hover focus-within:ring-2 focus-within:ring-brand">
            <Upload aria-hidden="true" className="size-6 text-fg-secondary" strokeWidth={1.5} />
            <span className="text-sm font-medium text-fg">{ti('elegir')}</span>
            <span className="text-[13px] text-fg-secondary">{ti('formato')}</span>
            <input ref={archivo} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void leer(e.target.files?.[0])} />
          </label>
          <p className="text-[13px] text-fg-secondary">
            {ti('columnas', { columnas: (Object.keys(CLAVE_CSV) as CampoImportable[]).map((c) => t(`csv.${CLAVE_CSV[c]}`)).join(', ') })}
          </p>
          <p className="text-[13px] text-fg-secondary">{restantes === null ? ti('cupoSinTope') : ti('cupo', { n: restantes })}</p>
        </div>
      )}

      {fase === 'revisar' && (
        <div className="flex flex-col gap-4">
          <p className="truncate text-[13px] text-fg-secondary">{nombreArchivo}</p>
          {sinNombre ? (
            <div role="alert" className="rounded-xl border border-line-danger bg-danger-subtle p-4 text-sm text-danger-text">
              {ti('sinColumnaNombre', { columna: t('csv.nombre') })}
            </div>
          ) : (
            <dl className="flex flex-col gap-2 rounded-xl bg-subtle p-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-fg-secondary">{ti('resumen.leidas')}</dt>
                <dd className="tabular-nums text-fg">{entero(filas.length)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-secondary">{ti('resumen.conError')}</dt>
                <dd className="tabular-nums text-fg">{entero(filas.length - validas.length)}</dd>
              </div>
              {fueraDeCupo > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-warning-text">{ti('resumen.fueraDeCupo')}</dt>
                  <dd className="tabular-nums text-warning-text">{entero(fueraDeCupo)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold">
                <dt className="text-fg">{ti('resumen.seCrearan')}</dt>
                <dd className="tabular-nums text-fg">{entero(caben)}</dd>
              </div>
            </dl>
          )}
          {filas.some((f) => f.error) && (
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-[13px] text-fg-secondary" aria-label={ti('resumen.conError')}>
              {filas
                .filter((f) => f.error)
                .slice(0, 50)
                .map((f) => (
                  <li key={f.linea}>{ti(`errores.${f.error}`, { linea: f.linea, nombre: f.datos.name ?? '' })}</li>
                ))}
            </ul>
          )}
        </div>
      )}

      {fase === 'importando' && (
        <div role="status" className="flex flex-col gap-3 py-2">
          <p className="text-sm text-fg">{ti('noCierres')}</p>
          <div
            role="progressbar"
            aria-label={ti('titulo')}
            aria-valuemin={0}
            aria-valuemax={caben}
            aria-valuenow={avance}
            className="h-2 overflow-hidden rounded-full bg-subtle"
          >
            <div className="h-full rounded-full bg-brand-action transition-[width] motion-reduce:transition-none" style={{ width: `${caben ? (avance / caben) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {fase === 'resultado' && (
        <div role="status" className="flex flex-col gap-3">
          <p className="text-base font-semibold text-fg">{ti('resultado.creadas', { n: resultado.creadas })}</p>
          {resultado.fallos.length > 0 && (
            <div role="alert" className="flex flex-col gap-1 rounded-xl border border-line-danger bg-danger-subtle p-4 text-[13px] text-danger-text">
              <p className="font-semibold">{ti('resultado.fallos', { n: resultado.fallos.length })}</p>
              <ul className="max-h-40 overflow-y-auto">
                {resultado.fallos.slice(0, 20).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </PanelAdaptable>
  );
}
