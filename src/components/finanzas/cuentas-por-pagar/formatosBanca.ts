/**
 * Formatos de archivo para la exportación a banca online de cuentas por pagar.
 *
 * Vive fuera de `ExportarBancaModal.tsx` por dos razones: el modal no puede
 * cargarse en un test de Node (arrastra React y todo el kit de UI), y el
 * servicio necesita el mismo catálogo para que el rastro de auditoría
 * (`bank_files.file_name` / `.file_type`) describa el archivo que la persona
 * se llevó de verdad, no uno inventado.
 *
 * Defecto que esto corrige: `generarContenidoArchivo` hacía `switch` sobre
 * `'bancolombia' | 'davivienda' | 'bbva'`, pero el desplegable enviaba
 * `'bancolombia_txt' | 'davivienda_csv' | 'bbva_excel'`. Ninguna rama casaba
 * nunca: **todos** los bancos caían en el CSV genérico del `default`.
 */

import type { BankFileRecord } from './types';

/** Lo mínimo que la plantilla de cada banco necesita de una cuenta por pagar. */
export interface CuentaExportable {
  balance: number;
  due_date?: string | null;
  supplier?: { name?: string | null; nit?: string | null } | null;
  invoice_purchase?: { number_ext?: string | null } | null;
}

export interface FormatoBanca {
  /** Valor del desplegable y clave de la plantilla. */
  value: string;
  label: string;
  /** Extensión real del archivo que se descarga, con el punto. */
  extension: string;
  /** Tipo con el que queda registrado el lote en `bank_files.file_type`. */
  tipo: BankFileRecord['file_type'];
}

/**
 * BBVA sale como `.csv` y no como `.xlsx`: el contenido que se genera es texto
 * separado por `;`, no un libro de Excel. Anunciar `.xlsx` producía un archivo
 * que Excel abre con una advertencia de formato corrupto. El día que exista un
 * escritor de xlsx de verdad, esta fila pasa a `extension: '.xlsx'` y
 * `tipo: 'excel'` — por eso `'excel'` sigue en la unión de tipos.
 */
export const FORMATOS_BANCO: readonly FormatoBanca[] = [
  { value: 'bancolombia_txt', label: 'Bancolombia TXT', extension: '.txt', tipo: 'txt' },
  { value: 'davivienda_csv', label: 'Davivienda CSV', extension: '.csv', tipo: 'csv' },
  { value: 'bbva_csv', label: 'BBVA CSV', extension: '.csv', tipo: 'csv' },
  { value: 'generic_csv', label: 'CSV Genérico', extension: '.csv', tipo: 'csv' },
] as const;

export function buscarFormato(value: string): FormatoBanca | undefined {
  return FORMATOS_BANCO.find((f) => f.value === value);
}

/**
 * Compone el contenido del archivo según la plantilla del banco.
 *
 * `formatearFecha` se recibe de fuera a propósito: el día de vencimiento se
 * imprime en la zona horaria de la organización, que solo conoce el componente
 * (`useFormatDate`). Aquí no se toca ninguna fecha.
 */
export function generarContenidoArchivo(
  cuentas: CuentaExportable[],
  formato: string,
  formatearFecha: (value: string | Date | null | undefined) => string,
): string {
  switch (formato) {
    case 'bancolombia_txt':
      return cuentas
        .map((cuenta) => {
          const nit = cuenta.supplier?.nit || '';
          const nombre = cuenta.supplier?.name || '';
          const monto = cuenta.balance.toFixed(2).padStart(12, '0');
          return `${nit.padEnd(15)}${nombre.padEnd(30)}${monto}`;
        })
        .join('\n');

    case 'davivienda_csv':
      return cuentas
        .map((cuenta) => `${cuenta.supplier?.nit || ''};${cuenta.supplier?.name || ''};${cuenta.balance}`)
        .join('\n');

    case 'bbva_csv':
      return (
        'NIT;NOMBRE;MONTO;REFERENCIA\n' +
        cuentas
          .map(
            (cuenta) =>
              `${cuenta.supplier?.nit || ''};${cuenta.supplier?.name || ''};${cuenta.balance};${cuenta.invoice_purchase?.number_ext || ''}`,
          )
          .join('\n')
      );

    default:
      return (
        'NIT,Nombre,Monto,Referencia,Vencimiento\n' +
        cuentas
          .map((cuenta) => {
            const fecha = cuenta.due_date ? formatearFecha(cuenta.due_date) : '';
            return `${cuenta.supplier?.nit || ''},"${cuenta.supplier?.name || ''}",${cuenta.balance},"${cuenta.invoice_purchase?.number_ext || ''}","${fecha}"`;
          })
          .join('\n')
      );
  }
}
