/**
 * Importar empleados desde CSV (fase 1). Sin React: lo prueba
 * `__tests__/importarEmpleados.test.ts`.
 *
 * Cada fila se convierte en el cuerpo de `POST /api/hrm/empleados/alta` (la
 * misma transacción del alta manual). La plantilla NO tiene banco ni seguridad
 * social: esos datos van por la ficha, con su permiso y su registro. El salario
 * solo viaja si quien importa tiene el permiso de salario.
 */
import { esTipoDocumento, normalizarNumeroDocumento, TIPOS_CONTRATO } from './catalogo';
import { normalizar } from './logica';

export const COLUMNAS_IMPORTAR = [
  'tipo_documento',
  'numero_documento',
  'nombres',
  'apellidos',
  'fecha_nacimiento',
  'celular',
  'correo',
  'sede',
  'area',
  'cargo',
  'tipo_contrato',
  'fecha_ingreso',
  'fin_contrato',
  'jornada_horas',
  'salario_mensual',
] as const;
export type ColumnaImportar = (typeof COLUMNAS_IMPORTAR)[number];

export const EJEMPLO_IMPORTAR: Record<ColumnaImportar, string> = {
  tipo_documento: 'CC',
  numero_documento: '1036654321',
  nombres: 'Andrés Felipe',
  apellidos: 'Morales Rincón',
  fecha_nacimiento: '1996-08-14',
  celular: '+57 310 555 0142',
  correo: 'andres@ejemplo.com',
  sede: 'Sede Centro',
  area: 'Cocina',
  cargo: 'Cocinero/a',
  tipo_contrato: 'indefinite',
  fecha_ingreso: '2026-12-01',
  fin_contrato: '',
  jornada_horas: '42',
  salario_mensual: '',
};

/** Divide una línea CSV respetando comillas («"Calle 45, apto 3"»). */
export function partirLinea(linea: string, sep: string): string[] {
  const out: string[] = [];
  let actual = '';
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (comillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else comillas = !comillas;
    } else if (c === sep && !comillas) {
      out.push(actual.trim());
      actual = '';
    } else actual += c;
  }
  out.push(actual.trim());
  return out;
}

export function leerCsv(texto: string): Record<string, string>[] {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lineas.length < 2) return [];
  const sep = (lineas[0].match(/;/g)?.length ?? 0) > (lineas[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const cabecera = partirLinea(lineas[0], sep).map((h) => normalizar(h).replace(/\s+/g, '_'));
  return lineas.slice(1).map((l) => {
    const celdas = partirLinea(l, sep);
    return Object.fromEntries(cabecera.map((h, i) => [h, celdas[i] ?? '']));
  });
}

export interface CatalogosImportar {
  sedes: { id: number; name: string }[];
  areas: { id: string; name: string }[];
  cargos: { id: string; name: string }[];
}

export interface FilaImportar {
  fila: number;
  nombre: string;
  errores: string[];
  cuerpo: Record<string, unknown> | null;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function buscar<T extends { name: string }>(lista: T[], valor: string): T | undefined {
  const v = normalizar(valor);
  return v ? lista.find((x) => normalizar(x.name) === v || String((x as { id?: unknown }).id) === valor.trim()) : undefined;
}

function partir(texto: string): [string, string] {
  const p = texto.trim().split(/\s+/).filter(Boolean);
  return [p[0] ?? '', p.slice(1).join(' ')];
}

/** Valida cada fila y arma el cuerpo del alta. Los errores son claves i18n. */
export function prepararFilas(filas: Record<string, string>[], cat: CatalogosImportar, conSalario: boolean): FilaImportar[] {
  return filas.map((r, i) => {
    const errores: string[] = [];
    const tipo = (r.tipo_documento ?? '').toUpperCase().trim();
    const numero = normalizarNumeroDocumento(r.numero_documento ?? '');
    if (!esTipoDocumento(tipo)) errores.push('tipoDocumento');
    if (numero.length < 3) errores.push('numeroDocumento');
    if (!(r.nombres ?? '').trim() || !(r.apellidos ?? '').trim()) errores.push('nombre');
    if (!FECHA.test(r.fecha_ingreso ?? '')) errores.push('fechaIngreso');
    if (r.fecha_nacimiento && !FECHA.test(r.fecha_nacimiento)) errores.push('fechaNacimiento');
    if (r.fin_contrato && !FECHA.test(r.fin_contrato)) errores.push('finContrato');
    const sede = buscar(cat.sedes, r.sede ?? '');
    if (!sede) errores.push('sede');
    const area = r.area ? buscar(cat.areas, r.area) : undefined;
    if (r.area && !area) errores.push('area');
    const cargo = r.cargo ? buscar(cat.cargos, r.cargo) : undefined;
    if (r.cargo && !cargo) errores.push('cargo');
    const contrato = (r.tipo_contrato || 'indefinite').trim();
    if (!(TIPOS_CONTRATO as readonly string[]).includes(contrato)) errores.push('contrato');
    const jornada = r.jornada_horas ? Number(r.jornada_horas.replace(',', '.')) : 42;
    if (!Number.isFinite(jornada) || jornada <= 0 || jornada > 48) errores.push('jornada');
    const salario = r.salario_mensual ? Number(r.salario_mensual.replace(/[.\s$]/g, '').replace(',', '.')) : null;
    if (r.salario_mensual && (!Number.isFinite(salario) || (salario ?? 0) <= 0)) errores.push('salario');

    const [first_name, second_name] = partir(r.nombres ?? '');
    const [last_name, second_last_name] = partir(r.apellidos ?? '');
    return {
      fila: i + 2,
      nombre: `${r.nombres ?? ''} ${r.apellidos ?? ''}`.trim(),
      errores,
      cuerpo:
        errores.length > 0
          ? null
          : {
              first_name,
              second_name,
              last_name,
              second_last_name,
              doc_type: tipo,
              doc_number: numero,
              birth_date: r.fecha_nacimiento || undefined,
              personal_phone: r.celular || undefined,
              personal_email: r.correo || undefined,
              branch_id: sede?.id,
              department_id: area?.id,
              position_id: cargo?.id,
              contract_type: contrato,
              contract_end_date: r.fin_contrato || undefined,
              hire_date: r.fecha_ingreso,
              work_hours_per_week: jornada,
              salario: conSalario && salario ? salario : undefined,
            },
    };
  });
}
