/**
 * Cuenta de IVA generado. El mismo orden que `fn_cuenta_iva`: el mapeo de un
 * IVA activo, luego la configuración contable, luego la cuenta de la regla.
 * Una cadena vacía no cuenta. El SQL es quien escribe el asiento.
 */
export function cuentaIva(opciones: {
  mapeo?: string | null;
  configuracion?: string | null;
  regla?: string | null;
}): string | null {
  const limpio = (valor: string | null | undefined) => {
    const texto = (valor ?? '').trim();
    return texto.length > 0 ? texto : null;
  };
  return limpio(opciones.mapeo) ?? limpio(opciones.configuracion) ?? limpio(opciones.regla);
}
