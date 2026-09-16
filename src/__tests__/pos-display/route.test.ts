/**
 * isCustomerDisplayPath (src/lib/pos/display/route.ts): cómo el layout raíz
 * reconoce la pantalla del cliente para no pintar UI de GO Admin encima
 * (banner de instalación PWA, diálogo de permiso de notificaciones): PLAN
 * §4.1.4 («cero navegación, no hay menús») y §4.1.5 (marca del comercio).
 */

import fs from 'fs';
import path from 'path';
import { CUSTOMER_DISPLAY_ROUTE, isCustomerDisplayPath } from '@/lib/pos/display/route';
import { CUSTOMER_DISPLAY_ROUTE as ROUTE_FROM_OPEN_DISPLAY, isCustomerDisplayPath as fromIndex } from '@/lib/pos/display';

describe('isCustomerDisplayPath', () => {
  it('la ruta exacta y sus subrutas son la pantalla del cliente', () => {
    expect(CUSTOMER_DISPLAY_ROUTE).toBe('/pos-display');
    expect(isCustomerDisplayPath('/pos-display')).toBe(true);
    expect(isCustomerDisplayPath('/pos-display/')).toBe(true);
    expect(isCustomerDisplayPath('/pos-display/algo')).toBe(true);
  });

  it('null/undefined (usePathname puede serlo por src/pages) y cualquier otra ruta no lo son', () => {
    expect(isCustomerDisplayPath(null)).toBe(false);
    expect(isCustomerDisplayPath(undefined)).toBe(false);
    expect(isCustomerDisplayPath('')).toBe(false);
    expect(isCustomerDisplayPath('/')).toBe(false);
    expect(isCustomerDisplayPath('/app/pos')).toBe(false);
    expect(isCustomerDisplayPath('/pos-displays')).toBe(false);
    expect(isCustomerDisplayPath('/app/pos-display')).toBe(false);
    expect(isCustomerDisplayPath('pos-display')).toBe(false);
  });

  it('no lanza con valores raros', () => {
    expect(isCustomerDisplayPath(42 as unknown as string)).toBe(false);
    expect(isCustomerDisplayPath({} as unknown as string)).toBe(false);
  });

  it('openDisplay.ts y el índice reexportan la misma ruta y la misma función', () => {
    expect(ROUTE_FROM_OPEN_DISPLAY).toBe(CUSTOMER_DISPLAY_ROUTE);
    expect(fromIndex).toBe(isCustomerDisplayPath);
  });
});

describe('el layout raíz retira su UI en la pantalla del cliente', () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), 'src', 'components', rel), 'utf8');

  it.each(['PWAInstallPrompt.tsx', 'PushNotificationManager.tsx'])('%s consulta isCustomerDisplayPath(usePathname()) y cita PLAN §4.1.4', (file) => {
    const src = read(file);
    expect(src).toContain('isCustomerDisplayPath');
    expect(src).toContain('usePathname');
    expect(src).toContain('docs/pos-doble-pantalla/PLAN.md');
    expect(src).toContain('§4.1.4');
  });
});
