let reportado = false;

/** Un solo evento por carga de la aplicación, visible para soporte. */
export function reportarFallosContables(
  fallos: { id: number; motivo: string | null }[],
): void {
  if (reportado || fallos.length === 0) return;
  reportado = true;
  const extra = fallos.map((fallo) => ({ id: fallo.id, motivo: fallo.motivo }));
  void import('@sentry/react')
    .then((Sentry) => {
      Sentry.captureMessage('Fallos contables técnicos sin resolver', {
        level: 'warning',
        extra: { fallos: extra },
      });
    })
    .catch((error) => {
      console.error('No se pudo reportar el fallo contable', error);
    });
}
