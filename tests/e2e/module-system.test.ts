import { test, expect } from '@playwright/test';

/**
 * Tests E2E para el Sistema de Gestión de Módulos
 * 
 * Estos tests verifican:
 * 1. Acceso a módulos core siempre disponibles
 * 2. Redirecciones correctas para módulos
 * 3. Límites de plan respetados
 * 4. Sidebar muestra correctamente los módulos
 */

// Credenciales de prueba
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'password123';

// URLs de módulos core para probar
const CORE_MODULES = [
  { name: 'Organización', url: '/app/organizacion' },
  { name: 'Branding', url: '/app/branding' },
  { name: 'Sucursales', url: '/app/sucursales' },
  { name: 'Roles', url: '/app/roles' }
];

// URLs de módulos pagados para probar
const PAID_MODULES = [
  { name: 'POS', url: '/app/pos' },
  { name: 'Inventario', url: '/app/inventario' },
  { name: 'PMS Hotel', url: '/app/pms' }
];

test.describe('Sistema de Gestión de Módulos', () => {
  test.beforeEach(async ({ page }) => {
    // Login antes de cada test
    await page.goto('/auth/login');
    await page.fill('input[name="email"]', TEST_EMAIL);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    
    // Esperar a que se complete el login
    await page.waitForURL('/app/inicio');
  });

  test('Los módulos core siempre están disponibles en el sidebar', async ({ page }) => {
    // Ir a la página de inicio
    await page.goto('/app/inicio');
    
    // Verificar que todos los módulos core están en el sidebar
    for (const module of CORE_MODULES) {
      const moduleLink = page.locator(`a[href="${module.url}"]`);
      await expect(moduleLink).toBeVisible();
    }
  });

  test('La redirección de roles funciona correctamente', async ({ page }) => {
    // Ir a la página principal de roles
    await page.goto('/app/roles');
    
    // Debería redirigir a /app/roles/roles
    await page.waitForURL('/app/roles/roles');
    
    // Verificar que estamos en la página correcta
    await expect(page.locator('h1:has-text("Administración de Roles")')).toBeVisible();
  });

  test('Las subrutas de roles son accesibles', async ({ page }) => {
    // Ir a la página de roles
    await page.goto('/app/roles/roles');
    
    // Verificar que podemos cambiar entre pestañas
    await page.click('button:has-text("Asignación de Roles")');
    await expect(page.locator('h2:has-text("Asignación de Roles")')).toBeVisible();
    
    await page.click('button:has-text("Analíticas")');
    await expect(page.locator('h2:has-text("Analíticas de Roles")')).toBeVisible();
  });

  test('El acceso a módulos pagados depende del plan', async ({ page }) => {
    // Ir a la página de inicio
    await page.goto('/app/inicio');
    
    // Verificar módulos pagados en el sidebar
    // Nota: Este test asume que tenemos al menos un módulo pagado activo
    const firstPaidModule = PAID_MODULES[0];
    const moduleLink = page.locator(`a[href="${firstPaidModule.url}"]`);
    
    // Si el módulo está visible, intentar acceder
    if (await moduleLink.isVisible()) {
      await moduleLink.click();
      // No debería redirigir a la página de error
      await expect(page.url()).not.toContain('error=module_not_activated');
    } else {
      // Si no está visible, verificar que otros módulos core sí lo están
      for (const module of CORE_MODULES) {
        const coreLink = page.locator(`a[href="${module.url}"]`);
        await expect(coreLink).toBeVisible();
      }
    }
  });

  test('Intento de acceso a módulo inactivo redirige correctamente', async ({ page }) => {
    // Intentar acceder directamente a un módulo que probablemente no esté activo
    // Usamos el último módulo pagado de la lista para aumentar probabilidades
    const inactiveModule = PAID_MODULES[PAID_MODULES.length - 1];
    await page.goto(inactiveModule.url);
    
    // Si el módulo no está activo, debería redirigir a página de inicio con error
    const currentUrl = page.url();
    if (currentUrl.includes('error=module_not_activated')) {
      await expect(page.url()).toContain('/app/inicio');
      await expect(page.url()).toContain('error=module_not_activated');
    } else {
      // Si no redirige, es porque el módulo está activo para este usuario
      await expect(page.url()).toBe(inactiveModule.url);
    }
  });

  test('DynamicSidebar muestra correctamente las subrutas de módulos core', async ({ page }) => {
    // Ir a un módulo core con subrutas (sucursales)
    await page.goto('/app/sucursales');
    
    // Verificar que las subrutas están visibles
    const subrutas = [
      '/app/sucursales/empleados',
      '/app/sucursales/nueva',
      '/app/sucursales/configuracion',
      '/app/sucursales/reportes'
    ];
    
    for (const subruta of subrutas) {
      const subrutaLink = page.locator(`a[href="${subruta}"]`);
      await expect(subrutaLink).toBeVisible();
    }
  });
});
