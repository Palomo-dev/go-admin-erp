'use client';

import { useMemo, type ReactNode } from 'react';
import { ScrollText } from 'lucide-react';
import { crearFormateadorMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { DateRangeButton } from '../DateRangeButton';
import { Dialogo, type AccionDialogo } from '../Dialogo';
import { EmptyState } from '../EmptyState';
import { FilaDato, ListaDatos } from '../FilaDato';
import type { RangoFechas } from '../rangoFechas';
import { useKitT } from '../useIdiomaKit';
import { estadoCuentaCsv, type EstadoCuentaVista } from './carteraLogica';
import type { TipoDocumento } from './documentos';

/**
 * Estado de cuenta de un cliente o de un proveedor (CxC X3 `740:52422`; CxP Y3,
 * captura `52-documentos-estado-de-cuenta-dialogo.png`): periodo, saldo
 * inicial, saldo final, vencido, por vencer y los movimientos con saldo
 * corrido; descarga en CSV.
 *
 * Los datos llegan calculados (`fn_estado_cuenta_proveedor`, el route handler
 * de clientes) y la pantalla los vuelve a pedir cuando cambia el `rango`. El
 * PDF, cuando exista su plantilla en el motor de documentos, entra por
 * `secundarios` (p. ej. «Descargar PDF» · «Enviar por correo»).
 */
export interface EstadoCuentaDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  tercero: { tipo: 'cliente' | 'proveedor'; nombre: string };
  datos: EstadoCuentaVista | null;
  cargando?: boolean;
  /** Error ya traducido; con `onReintentar` muestra «Reintentar». */
  error?: string | null;
  onReintentar?: () => void;
  rango: RangoFechas;
  onRangoChange: (rango: RangoFechas) => void;
  /** Día de la organización `YYYY-MM-DD`. */
  hoy: string;
  moneda: ContextoMoneda | string;
  formatearDia: (dia: string) => string;
  /** Nombre del CSV sin extensión (`estado_cuenta_proveedor_12_2026-09-24`). */
  nombreArchivo: string;
  /** Si la descarga falla (el navegador bloquea el archivo). */
  onErrorDescarga?: (error: unknown) => void;
  /**
   * PDF del motor de documentos: si llega, el primario es «Descargar PDF» e
   * «Imprimir» y «Descargar CSV» pasan a secundarios.
   */
  pdf?: { onDescargar: () => void; onImprimir?: () => void; cargando?: boolean } | null;
  /** Otras acciones del pie («Enviar por correo»). */
  secundarios?: AccionDialogo[];
  /** Contenido bajo el periodo (opciones del dominio: «Incluir pagadas»). */
  opciones?: ReactNode;
}

export function descargarTexto(contenido: string, nombre: string, tipo = 'text/csv;charset=utf-8;'): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function EstadoCuentaDialog({
  abierto,
  onAbiertoChange,
  tercero,
  datos,
  cargando,
  error,
  onReintentar,
  rango,
  onRangoChange,
  hoy,
  moneda,
  formatearDia,
  nombreArchivo,
  onErrorDescarga,
  pdf,
  secundarios,
  opciones,
}: EstadoCuentaDialogProps) {
  const t = useKitT();
  const formatear = useMemo(() => crearFormateadorMoneda(moneda), [moneda]);
  const nombreTipo = (tipo: TipoDocumento) => t(`documento.tipos.${tipo}`);
  const titulo = t('documento.estadoCuenta.titulo', { tercero: tercero.nombre });

  const descargar = () => {
    if (!datos) return;
    try {
      const csv = estadoCuentaCsv(
        datos,
        {
          columnas: {
            fecha: t('documento.estadoCuenta.columnas.fecha'),
            documento: t('documento.estadoCuenta.columnas.documento'),
            vence: t('documento.estadoCuenta.columnas.vence'),
            cargo: t('documento.estadoCuenta.columnas.cargo'),
            abono: t('documento.estadoCuenta.columnas.abono'),
            saldo: t('documento.estadoCuenta.columnas.saldo'),
          },
          saldoInicial: t('documento.estadoCuenta.saldoInicial'),
          tipo: nombreTipo,
        },
        formatearDia,
      );
      descargarTexto(csv, `${nombreArchivo}.csv`);
    } catch (e) {
      onErrorDescarga?.(e);
    }
  };

  const sinDatos = !datos || !!cargando;
  const motivo = t('documento.estadoCuenta.sinDatos');
  const csv: AccionDialogo = { etiqueta: t('documento.estadoCuenta.descargar'), onClick: descargar, deshabilitada: sinDatos, motivo };
  const primario: AccionDialogo = pdf
    ? { etiqueta: t('documento.estadoCuenta.descargarPdf'), onClick: pdf.onDescargar, cargando: pdf.cargando, deshabilitada: sinDatos, motivo }
    : csv;
  const delPdf: AccionDialogo[] = [];
  if (pdf?.onImprimir) delPdf.push({ etiqueta: t('documento.estadoCuenta.imprimir'), onClick: pdf.onImprimir, deshabilitada: sinDatos, motivo });
  if (pdf) delPdf.push(csv);

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={titulo}
      descripcion={t(`documento.estadoCuenta.descripcion.${tercero.tipo}`)}
      icono={ScrollText}
      ancho={880}
      textoCancelar={t('comun.cerrar')}
      secundarios={[...delPdf, ...(secundarios ?? [])]}
      primario={primario}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeButton hoy={hoy} etiqueta={t('documento.estadoCuenta.periodo')} valor={rango} onValorChange={onRangoChange} />
          {opciones}
        </div>
        {error ? (
          <EmptyState variante="error" titulo={error} onReintentar={onReintentar} compacto />
        ) : cargando || !datos ? (
          <p role="status" className="py-6 text-center text-sm text-fg-secondary">
            {t('documento.estadoCuenta.cargando')}
          </p>
        ) : (
          <>
            <ListaDatos etiqueta={t('documento.estadoCuenta.resumen')} className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <FilaDato etiqueta={t('documento.estadoCuenta.saldoInicial')} valor={formatear(datos.saldoInicial)} />
              <FilaDato etiqueta={t('documento.estadoCuenta.saldoFinal')} valor={formatear(datos.saldoFinal)} tamano="lg" />
              <FilaDato etiqueta={t('documento.estadoCuenta.vencido')} valor={formatear(datos.vencido)} tono={datos.vencido > 0 ? 'peligro' : undefined} />
              <FilaDato etiqueta={t('documento.estadoCuenta.porVencer')} valor={formatear(datos.porVencer)} />
            </ListaDatos>
            {datos.movimientos.length === 0 ? (
              <p className="py-4 text-sm text-fg-secondary">{t('documento.estadoCuenta.vacio')}</p>
            ) : (
              <div className="max-h-[50vh] overflow-auto rounded-lg border border-line">
                <table className="w-full text-sm">
                  <caption className="sr-only">{t('documento.estadoCuenta.tabla', { tercero: tercero.nombre })}</caption>
                  <thead className="sticky top-0 bg-subtle text-left text-xs text-fg-secondary">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">{t('documento.estadoCuenta.columnas.fecha')}</th>
                      <th scope="col" className="px-3 py-2 font-medium">{t('documento.estadoCuenta.columnas.documento')}</th>
                      <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">{t('documento.estadoCuenta.columnas.vence')}</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">{t('documento.estadoCuenta.columnas.cargo')}</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">{t('documento.estadoCuenta.columnas.abono')}</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">{t('documento.estadoCuenta.columnas.saldo')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.movimientos.map((m) => (
                      <tr key={m.id} className="border-t border-line">
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatearDia(m.dia)}</td>
                        <td className="px-3 py-2">{m.documento ?? nombreTipo(m.tipo)}</td>
                        <td className="hidden whitespace-nowrap px-3 py-2 tabular-nums sm:table-cell">{m.vence ? formatearDia(m.vence) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{m.cargo ? formatear(m.cargo) : ''}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{m.abono ? formatear(m.abono) : ''}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{formatear(m.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-line-strong text-sm font-medium">
                    <tr>
                      <th scope="row" colSpan={3} className="px-3 py-2 text-left">
                        {t('documento.estadoCuenta.totales')}
                      </th>
                      <td className="px-3 py-2 text-right tabular-nums">{formatear(datos.totalCargos)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatear(datos.totalAbonos)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatear(datos.saldoFinal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </Dialogo>
  );
}
