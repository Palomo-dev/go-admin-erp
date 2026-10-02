/** Claves estables para las etiquetas del catálogo y el humanizador canónico. */
export type AutomationText = (source: string | null | undefined, values?: Record<string, unknown>) => string;
export function automationTextKey(source: string): string {
  const name = source.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0,55);
  let hash=0; for (const char of source) hash=(Math.imul(hash,31)+char.charCodeAt(0))>>>0;
  return `${name}_${hash.toString(36)}`;
}
export function interpolateAutomationText(source: string, values: Record<string, unknown> = {}): string {
  return source.replace(/\{(p\d+)\}/g, (_, key: string) => String(values[key] ?? ''));
}
