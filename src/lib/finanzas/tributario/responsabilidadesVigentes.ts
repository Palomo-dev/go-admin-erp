/**
 * Responsabilidades del RUT de la empresa VIGENTES EN UNA FECHA (H2 de la nota
 * técnica del Contador, 2026-11-07).
 *
 * `fn_perfil_tributario_guardar` copia las responsabilidades a
 * `organizations.fiscal_responsibilities` solo al guardar: una vigencia que
 * empieza después no se aplica sola. La fuente correcta para un documento es el
 * perfil por vigencias en la FECHA DEL DOCUMENTO:
 * `fn_responsabilidades_fiscales_en(org, fecha)` (migración 20261108140500).
 * Si la organización no tiene perfil que rija ese día, la función devuelve
 * `organizations.fiscal_responsibilities`, lo mismo que se leía antes.
 *
 * Mientras la migración no esté aplicada (o si la RPC falla) se usa la ficha de
 * la organización que el llamador ya leyó: el documento sale igual que hoy.
 * Uso solo en servidor, con el cliente que el llamador ya tiene (sesión con RLS
 * en el motor de documentos; servicio en la configuración de FE, con la
 * organización ya validada).
 */
import { esObjetoInexistente } from './perfil';

export interface ErrorRpc {
  code?: string;
  message?: string;
}

export interface ClienteRpcResponsabilidades {
  rpc(nombre: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: ErrorRpc | null }>;
}

/** Lista limpia de códigos (sin vacíos ni espacios); `null` si el valor no es una lista. */
export function normalizarResponsabilidades(valor: unknown): string[] | null {
  if (!Array.isArray(valor)) return null;
  return valor
    .map((codigo) => (typeof codigo === 'string' ? codigo.trim() : ''))
    .filter((codigo) => codigo.length > 0);
}

/** Día calendario `AAAA-MM-DD`; cualquier otra cosa no es una fecha válida para la RPC. */
export function esDiaCalendario(valor: string | null | undefined): valor is string {
  return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

/**
 * Responsabilidades vigentes el día `dia` (día calendario de la organización;
 * `null` = hoy en su zona, lo resuelve la base). `respaldo` es
 * `organizations.fiscal_responsibilities` tal como el llamador ya la leyó.
 */
export async function responsabilidadesFiscalesEn(
  db: ClienteRpcResponsabilidades,
  organizationId: number,
  dia: string | null,
  respaldo: readonly unknown[] | null | undefined,
): Promise<string[]> {
  const deLaFicha = normalizarResponsabilidades(respaldo) ?? [];
  const { data, error } = await db.rpc('fn_responsabilidades_fiscales_en', {
    p_organization_id: organizationId,
    p_fecha: esDiaCalendario(dia) ? dia : null,
  });
  if (error) {
    if (!esObjetoInexistente(error)) {
      console.warn('[tributario] responsabilidades vigentes: se usan las de la ficha de la organización', {
        organizationId,
        codigo: error.code ?? null,
      });
    }
    return deLaFicha;
  }
  return normalizarResponsabilidades(data) ?? deLaFicha;
}
