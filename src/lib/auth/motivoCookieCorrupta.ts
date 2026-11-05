/**
 * Por qué la cookie de sesión está dañada (null = no lo está). Las mismas condiciones de siempre;
 * el motivo va a Sentry, nunca el valor.
 */
export function motivoCookieCorrupta(valor: string): 'object_object' | 'undefined' | 'null' | 'no_json' | null {
  if (valor.includes('[object Object]')) return 'object_object';
  if (valor === 'undefined') return 'undefined';
  if (valor === 'null') return 'null';
  if (!valor.trim().startsWith('{')) return 'no_json';
  return null;
}
