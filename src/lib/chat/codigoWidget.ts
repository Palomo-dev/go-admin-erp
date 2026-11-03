/**
 * Código de instalación del widget de chat del canal «sitio web».
 *
 * Un solo generador para las dos pantallas que lo muestran
 * (`WidgetCodeDialog` y `WidgetCodeSection`) y para `chatChannelsService`.
 *
 * El fragmento funciona pegado tal cual en CUALQUIER página (no solo en los
 * sitios GO Admin): primero deja una cola `goChat(...)` y después carga el
 * script en asíncrono, así que no bloquea la página ni depende del orden. El
 * script (Edge Function `chat-widget`) también entiende el código antiguo
 * (`goChat('init', …)` después de un `<script src>` síncrono) y la cola
 * `GOChatWidget.q` que usan los sitios GO Admin.
 */

const RESPALDO_SUPABASE = 'https://taqjemqjtumhwptchcxk.supabase.co';

/** URL pública del script del widget. */
export function urlDelWidget(supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL): string {
  return `${(supabaseUrl || RESPALDO_SUPABASE).replace(/\/+$/, '')}/functions/v1/chat-widget`;
}

/** Forma de una clave pública de canal: `pk_` + alfanuméricos. */
export function esClavePublica(clave: unknown): clave is string {
  return typeof clave === 'string' && /^pk_[A-Za-z0-9]{16,64}$/.test(clave);
}

/**
 * Fragmento HTML para pegar antes de `</body>`. Si la clave no tiene la forma
 * esperada devuelve '' (no se genera código que inyecte nada en la página).
 */
export function codigoDelWidget(clave: string | null | undefined, supabaseUrl?: string): string {
  if (!esClavePublica(clave)) return '';
  return `<!-- GO Chat -->
<script>window.goChat=window.goChat||function(){(window.goChat.q=window.goChat.q||[]).push(arguments)};goChat('init','${clave}');</script>
<script src="${urlDelWidget(supabaseUrl)}" async></script>
<!-- Fin GO Chat -->`;
}
