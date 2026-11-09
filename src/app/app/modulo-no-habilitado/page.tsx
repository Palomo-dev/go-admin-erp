/**
 * Ruta INTERNA a la que el middleware reescribe una petición a un módulo o
 * página que la persona no puede usar (docs/design/MODULO-NO-HABILITADO.md).
 * La URL del navegador no cambia: la pantalla lee la ruta pedida con
 * `usePathname()` y, si se entró aquí directamente, con `?ruta=` (la pone la
 * reescritura). Ni `?bloqueo=` ni `?modulo=` se usan para decidir nada: la
 * causa la recalcula el servidor (`GET /api/modules/acceso`).
 */
import { ModuloNoHabilitado } from '@/components/modules/ModuloNoHabilitado';

export const dynamic = 'force-dynamic';

export default async function ModuloNoHabilitadoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const ruta = typeof params.ruta === 'string' ? params.ruta : null;
  return <ModuloNoHabilitado rutaRespaldo={ruta} />;
}
