/**
 * Validacion de NIT y dígito de verificacion (modulo 11 DIAN)
 * Documentacion: https://muisca.dian.gov.co
 *
 * Algoritmo: se multiplica cada digito del NIT (sin DV) por una secuencia
 * de pesos [41, 23, 19, 17, 13, 7, 3] (de derecha a izquierda) y se aplica modulo 11.
 */

const PESOS_DIAN = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/**
 * Calcula el dígito de verificacion de un NIT usando modulo 11.
 * @param nitSinDv NIT sin el dígito de verificacion (solo numeros)
 * @returns dígito de verificacion (0-9) o null si el NIT es invalido
 */
export function calcularDv(nitSinDv: string): number | null {
  if (!nitSinDv) return null;
  const limpio = nitSinDv.replace(/[^0-9]/g, '');
  if (!limpio) return null;

  let suma = 0;
  // Recorrer de derecha a izquierda aplicando los pesos
  for (let i = 0; i < limpio.length; i++) {
    const digito = parseInt(limpio[limpio.length - 1 - i], 10);
    suma += digito * PESOS_DIAN[i % PESOS_DIAN.length];
  }

  const resto = suma % 11;
  // Si resto es 0 o 1, el DV es 0. Si resto > 1, DV = 11 - resto
  return resto < 2 ? 0 : 11 - resto;
}

/**
 * Valida que un NIT con dígito de verificacion sea correcto.
 * @param nitCompleto NIT con DV separado por guion (ej: "900123456-7") o junto ("9001234567")
 * @returns true si el DV es valido
 */
export function validarDv(nitCompleto: string): boolean {
  if (!nitCompleto) return false;
  const limpio = nitCompleto.replace(/[^0-9]/g, '');
  if (limpio.length < 2) return false;

  const nitSinDv = limpio.slice(0, -1);
  const dvIngresado = parseInt(limpio.slice(-1), 10);
  const dvCalculado = calcularDv(nitSinDv);

  return dvCalculado === dvIngresado;
}

/**
 * Extrae el NIT sin DV y el DV de una cadena.
 * Acepta formatos: "900123456-7", "9001234567", "900123456"
 * @returns { nit: string, dv: string | null }
 */
export function parsearNit(nitInput: string): { nit: string; dv: string | null } {
  if (!nitInput) return { nit: '', dv: null };
  const limpio = nitInput.trim();

  // Formato con guion: "900123456-7"
  if (limpio.includes('-')) {
    const [nit, dv] = limpio.split('-');
    return {
      nit: nit.replace(/[^0-9]/g, ''),
      dv: dv ? dv.replace(/[^0-9]/g, '') : null,
    };
  }

  // Formato junto: asumimos que el ultimo digito es el DV si tiene mas de 1 digito
  const soloNumeros = limpio.replace(/[^0-9]/g, '');
  if (soloNumeros.length > 1) {
    return {
      nit: soloNumeros.slice(0, -1),
      dv: soloNumeros.slice(-1),
    };
  }

  return { nit: soloNumeros, dv: null };
}

/**
 * Mapea el codigo de tipo de documento interno del ERP al codigo DIAN.
 * El ERP usa country_identification_types (ej: "national_id", "tax_id")
 * La DIAN usa codigos numericos (13=CC, 31=NIT, 41=Pasaporte)
 */
export function mapearTipoDocADian(tipoDocInterno: string): string {
  const mapeo: Record<string, string> = {
    // Codigos internos genericos
    national_id: '13', // Cedula de ciudadania
    tax_id: '31', // NIT
    passport: '41', // Pasaporte
    foreign_id: '42', // Doc identificacion extranjero
    other: '31',
    // Codigos DIAN directos (numericos)
    '13': '13',
    '31': '31',
    '41': '41',
    '42': '42',
    '91': '91', // NUIP
    // Codigos cortos de country_identification_types (COL, minusculas)
    cc: '13', // Cedula de ciudadania
    ce: '22', // Cedula de extranjeria
    ti: '12', // Tarjeta de identidad
    rc: '11', // Registro civil
    te: '21', // Tarjeta de extranjeria
    pep: '47', // PEP
    nuip: '91', // NUIP
    die: '42', // Doc identificacion extranjero
    nit: '31', // NIT
    nit_ext: '50', // NIT de otro pais
    // Mayusculas por seguridad
    CC: '13',
    CE: '22',
    TI: '12',
    NIT: '31',
    PP: '41',
    RC: '11',
    TE: '21',
    NUIP: '91',
  };
  return mapeo[tipoDocInterno] || '31';
}
