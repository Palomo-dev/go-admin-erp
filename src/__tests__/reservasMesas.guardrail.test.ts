/**
 * Guardarraíl del paquete D (reservas de mesa). Impide reincidir en:
 * - crear reservas con un INSERT directo desde el ERP (duplicaba y contradecía
 *   `create_restaurant_reservation`: sin solape con buffer, sin cliente, mesa
 *   marcada `reserved` a mano);
 * - sentar con dos llamadas sueltas (abrir sesión + cambiar estado): la reserva
 *   nunca quedaba unida a su mesa ni pasaba a «Completada»;
 * - derivar el día con `toISOString().split('T')[0]` en el servicio de reservas;
 * - crear configuraciones de reserva sin `is_enabled` explícito en los
 *   recomendados (el DEFAULT de la tabla es false y apagaba las reservas web).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const raiz = join(__dirname, '..', '..');
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8');

describe('guardarraíl reservas de mesa', () => {
  const servicio = leer('src/components/pos/reservas-mesas/reservasMesasService.ts');

  it('el ERP no inserta reservas directamente: usa la RPC', () => {
    expect(servicio).not.toMatch(/from\(\s*['"]restaurant_reservations['"]\s*\)\s*\.insert/);
    expect(servicio).toMatch(/rpc\(\s*['"]create_restaurant_reservation['"]/);
  });

  it('la vía anterior (respaldoSinMigracion) solo se usa si falta la función o la columna', () => {
    // Permitido a propósito: el ERP debe funcionar antes y después de aplicar D1–D5
    // (regla del paquete). Cada llamada al respaldo va dentro de su guarda.
    const llamadas = servicio.match(/\w+SinMigracion\(/g) ?? [];
    expect(llamadas.length).toBe(4);
    for (const [, guarda] of [
      ['crearReservaSinMigracion', 'esFuncionInexistente(error)'],
      ['sentarReservaSinMigracion', 'esFuncionInexistente(error)'],
      ['cancelarReservaSinMigracion', 'esFuncionInexistente(error)'],
      ['noShowSinMigracion', 'esColumnaInexistente(error)'],
    ]) {
      expect(servicio).toContain(guarda);
    }
    const guardas = servicio.match(/if \((?:status === 'no_show' && )?es(Funcion|Columna)Inexistente\(error\)\)/g) ?? [];
    expect(guardas.length).toBeGreaterThanOrEqual(llamadas.length);
  });

  it('el «Esperar 15 min» y el intervalo de franja no se quedan solo en pantalla / fuera de la rejilla', () => {
    expect(servicio).toContain('arrival_wait_until');
    const ajustes = leer('src/lib/services/restaurantBookingSettingsService.ts');
    expect(ajustes).toMatch(/INTERVALOS_FRANJA = \[15, 30, 45, 60, 90, 120\]/);
  });

  it('sentar una reserva es una sola transacción (pos_reserva_sentar)', () => {
    expect(servicio).toMatch(/rpc\(\s*['"]pos_reserva_sentar['"]/);
    const mesas = leer('src/app/app/pos/mesas/page.tsx');
    const sentar = mesas.slice(mesas.indexOf('const handleSentarReserva'), mesas.indexOf('const handleCambiarMesaReserva'));
    expect(sentar).toContain('sentarReserva(');
    expect(sentar).not.toContain('MesasService.abrirSesion');
    expect(sentar).not.toContain("changeStatus(activa.reserva.id, 'seated')");
  });

  it('cancelar pasa por cancel_restaurant_reservation (plazo y zona de la sede en la base)', () => {
    expect(servicio).toMatch(/rpc\(\s*['"]cancel_restaurant_reservation['"]/);
  });

  it('nada de toISOString().split(\'T\')[0] en el servicio de reservas', () => {
    expect(servicio).not.toMatch(/toISOString\(\)\.split\(\s*['"]T['"]\s*\)/);
  });

  it('los ajustes recomendados guardan is_enabled: true explícito', () => {
    const ajustes = leer('src/lib/services/restaurantBookingSettingsService.ts');
    const recomendados = ajustes.slice(ajustes.indexOf('export const AJUSTES_RESERVA_RECOMENDADOS'));
    expect(recomendados.slice(0, 400)).toMatch(/is_enabled:\s*true/);
  });

  it('la ruta de configuración toma la organización de la sesión y resuelve el permiso en el servidor', () => {
    const ruta = leer('src/app/api/pos/reservas-mesas/configuracion/route.ts');
    expect(ruta).toContain('withOrg(');
    expect(ruta).toContain('hasOrgAdminOrPermission(');
    expect(ruta).toContain('ctx.organizationId');
    expect(ruta).not.toMatch(/getServiceClient/);
  });
});
