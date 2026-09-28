/**
 * Enmascarado de datos bancarios de las cuentas de dispersion antes de
 * devolverlos al navegador (auditoria de integraciones §2.4: numero de cuenta,
 * documento del titular y llave Bre-B viajaban en texto plano).
 *
 * Se deja visible lo necesario para reconocer la cuenta (ultimos 4 caracteres).
 * El dato completo sigue en la base; cifrarlo alli es otra tarea (Vault/pgsodium).
 */

const CAMPOS_SENSIBLES = ['account_number', 'account_holder_id', 'breb_key_value'] as const;

/** `'1234567890'` → `'******7890'`; valores cortos se tapan enteros. */
export function enmascararValor(valor: unknown): unknown {
  if (typeof valor !== 'string' && typeof valor !== 'number') return valor;
  const texto = String(valor);
  if (texto.length <= 4) return '*'.repeat(texto.length);
  return `${'*'.repeat(texto.length - 4)}${texto.slice(-4)}`;
}

/** Copia de la fila con los campos sensibles (y los de la cuenta contable embebida) enmascarados. */
export function enmascararCuentaDispersion<T>(fila: T): T {
  if (!fila || typeof fila !== 'object') return fila;
  const copia: Record<string, unknown> = { ...(fila as Record<string, unknown>) };
  for (const campo of CAMPOS_SENSIBLES) {
    if (campo in copia) copia[campo] = enmascararValor(copia[campo]);
  }
  const cuentaContable = copia.bank_account;
  if (cuentaContable && typeof cuentaContable === 'object' && !Array.isArray(cuentaContable)) {
    const embebida = { ...(cuentaContable as Record<string, unknown>) };
    if ('account_number' in embebida) embebida.account_number = enmascararValor(embebida.account_number);
    copia.bank_account = embebida;
  }
  return copia as T;
}
