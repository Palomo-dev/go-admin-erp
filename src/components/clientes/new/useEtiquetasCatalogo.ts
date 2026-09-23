'use client';

import { useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';

/** `national_id` → `nationalId`, `O-13` → `o13`, `R-99-PN` → `r99Pn`. */
function claveCamel(codigo: string): string {
  const partes = codigo.toLowerCase().split(/[_-]+/).filter(Boolean);
  return partes.map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1))).join('');
}

/**
 * Etiquetas de los catálogos del formulario de cliente (tipos de documento,
 * roles y responsabilidades fiscales DIAN) en el idioma activo.
 *
 * Los catálogos viven en la BD en español. En español se muestra tal cual el
 * nombre de la BD (así se respeta, p. ej., «Carné de extranjería» en Chile y
 * «Cédula de extranjería» en Colombia); en los demás idiomas, la traducción
 * por código si existe y, si no, el nombre de la BD (siglas como NIT o CPF).
 */
export function useEtiquetasCatalogo() {
  const t = useTranslations('clientes.formulario');
  const esEspanol = useLocale() === 'es';

  const tipoDocumento = useCallback(
    (codigo: string, nombreBd: string) => {
      const c = claveCamel(codigo);
      if (esEspanol || !c || !t.has(`tiposDocumento.${c}`)) return nombreBd;
      return t(`tiposDocumento.${c}`);
    },
    [t, esEspanol],
  );

  const rol = useCallback(
    (codigo: string, nombreBd: string) => {
      const c = claveCamel(codigo);
      if (esEspanol || !c || !t.has(`roles.${c}`)) return nombreBd;
      return t(`roles.${c}`);
    },
    [t, esEspanol],
  );

  const fiscal = useCallback(
    (codigo: string, descripcionBd: string) => {
      const c = claveCamel(codigo);
      if (esEspanol || !c || !t.has(`fiscal.${c}`)) return descripcionBd;
      return t(`fiscal.${c}`);
    },
    [t, esEspanol],
  );

  return { tipoDocumento, rol, fiscal };
}
