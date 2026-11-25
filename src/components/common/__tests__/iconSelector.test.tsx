/**
 * @jest-environment jsdom
 *
 * `IconSelector`: el selector de iconos de categoría.
 *
 * Cargaba los 4.040 iconos de `react-icons/gi` (2,6 MB comprimidos) para
 * ofrecer 39. Ahora importa solo los que ofrece (`iconosGiDelSelector.ts`).
 * Estas pruebas fijan que no se perdió ninguno: cada icono de la lista se
 * sigue pintando y eligiendo.
 */
import fs from 'fs';
import path from 'path';
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import IconSelector, { COMMON_ICONS } from '@/components/common/IconSelector';
import { ICONOS_GI_DEL_SELECTOR } from '@/components/common/iconosGiDelSelector';

const deGi = Array.from(new Set(COMMON_ICONS.filter((n) => /^Gi[A-Z]/.test(n) && n !== 'Gift')));

describe('IconSelector · iconos de comida (react-icons/gi)', () => {
  test('todos los `Gi…` que ofrece el selector están importados, y no sobra ninguno', () => {
    expect(deGi.length).toBeGreaterThanOrEqual(39);
    expect(deGi.filter((n) => typeof ICONOS_GI_DEL_SELECTOR[n] !== 'function')).toEqual([]);
    expect(Object.keys(ICONOS_GI_DEL_SELECTOR).filter((n) => !deGi.includes(n))).toEqual([]);
  });

  test('el selector los pinta todos y elegir uno entrega su nombre', () => {
    const onChange = jest.fn();
    renderConIdioma(<IconSelector value="GiNoodles" onChange={onChange} />);
    // El botón muestra el icono guardado.
    const boton = screen.getByRole('button', { name: /GiNoodles/ });
    expect(boton.querySelector('svg')).toBeTruthy();
    fireEvent.click(boton);
    for (const nombre of deGi) {
      const celda = screen.getAllByText(nombre).map((el) => el.closest('button')).find((b) => b && b !== boton);
      expect(celda?.querySelector('svg')).toBeTruthy();
    }
    fireEvent.click(screen.getAllByText('GiHamburger').map((el) => el.closest('button')).find((b) => b && b !== boton) as HTMLElement);
    expect(onChange).toHaveBeenCalledWith('GiHamburger');
  });

  test('un nombre `Gi…` de fuera de la lista no rompe el selector: se lee el nombre, sin dibujo', () => {
    renderConIdioma(<IconSelector value="GiAbacus" onChange={jest.fn()} />);
    const boton = screen.getByRole('button', { name: /GiAbacus/ });
    expect(boton.textContent).toContain('GiAbacus');
    expect(boton.querySelector('svg')).toBeNull();
  });
});

describe('ningún archivo importa un juego completo de `react-icons`', () => {
  // `import * as X from 'react-icons/…'` + buscar por nombre impide que el
  // empaquetador descarte los iconos sin usar: van todos al arranque. Lo válido
  // es importar con nombre, o `import()` dinámico (como el editor del sitio).
  test('no hay `import * as … from "react-icons/…"` en src', () => {
    const raiz = path.resolve(__dirname, '../../..');
    const culpables: string[] = [];
    const recorrer = (dir: string) => {
      for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
        const ruta = path.join(dir, entrada.name);
        if (entrada.isDirectory()) {
          if (entrada.name !== 'node_modules' && entrada.name !== '__tests__') recorrer(ruta);
        } else if (/\.(ts|tsx)$/.test(entrada.name)) {
          // Sin comentarios: los que explican el problema citan el import viejo.
          const codigo = fs.readFileSync(ruta, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
          if (/import\s+\*\s+as\s+\w+\s+from\s+['"]react-icons\//.test(codigo)) culpables.push(path.relative(raiz, ruta));
        }
      }
    };
    recorrer(raiz);
    expect(culpables).toEqual([]);
  });
});
