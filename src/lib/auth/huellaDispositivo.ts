/**
 * Huella simple del dispositivo con la que `registerUserDevice`
 * (`organizationAuth.ts`) guarda la fila de `user_devices` y con la que
 * «Mi perfil › Sesiones y dispositivos» reconoce «Este dispositivo».
 *
 * Vivía duplicada en los dos sitios con un comentario «debe coincidir»: una
 * sola implementación (regla 7 de CLAUDE.md). No es un identificador fuerte
 * (cambia con la resolución o el idioma) ni se usa para autorizar nada.
 */
export async function huellaDispositivo(): Promise<string> {
  const componentes = [
    window.navigator.userAgent,
    window.navigator.language,
    window.screen.colorDepth,
    window.screen.width + 'x' + window.screen.height,
    new Date().getTimezoneOffset(),
    !!window.sessionStorage,
    !!window.localStorage,
    !!window.indexedDB,
  ];

  const huella = componentes.join('###');

  if (window.crypto && window.crypto.subtle) {
    try {
      const bytes = new TextEncoder().encode(huella);
      const hash = await window.crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      return btoa(huella).substring(0, 64);
    }
  }
  return btoa(huella).substring(0, 64);
}
