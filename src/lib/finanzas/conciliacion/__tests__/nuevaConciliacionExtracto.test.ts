import fs from 'fs';
import path from 'path';

describe('nueva conciliación ofrece el extracto', () => {
  const formulario = fs.readFileSync(
    path.join(process.cwd(), 'src/components/finanzas/conciliacion-bancaria/NuevaConciliacionForm.tsx'),
    'utf8',
  );

  it('acepta CSV y Excel al crear', () => {
    expect(formulario).toContain('type="file"');
    expect(formulario).toContain('accept=".csv,.txt,.xlsx,.xls"');
    expect(formulario).toContain('matrizDesdeArchivo');
    expect(formulario).toContain('importarExtracto');
  });
});
