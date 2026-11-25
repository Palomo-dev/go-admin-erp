/**
 * Iconos de comida de `react-icons/gi` que ofrece el `IconSelector`: los 39
 * de su lista (`COMMON_ICONS`), importados UNO POR UNO.
 *
 * El selector hacía `import * as GiIcons from 'react-icons/gi'` y buscaba el
 * icono por nombre: eso mete en el arranque los 4.040 iconos de la librería
 * (2,6 MB comprimidos) en toda pantalla que alcance el selector —el catálogo y
 * el formulario de productos abrían con 3,7 MB—. Con imports con nombre, el
 * empaquetador se queda solo con estos.
 *
 * Para añadir uno al selector: impórtalo aquí y agrégalo a `COMMON_ICONS`.
 * Lo vigila `src/components/common/__tests__/iconSelector.test.tsx`.
 *
 * Un nombre `Gi…` que no esté aquí no se dibuja en el botón del selector (sí se
 * lee su nombre). El selector no puede guardar uno así, y al hacer el cambio
 * (2026-11-25) la base solo tenía iconos de esta lista. No se deja una carga
 * «por si acaso» del juego completo: el paquete no expone otra entrada, y pedir
 * el mismo módulo entero —aunque sea con `import()`— vuelve a meter los 4.040
 * en el arranque.
 */
import type { ComponentType, CSSProperties } from 'react';
import {
  GiTomato, GiHamburger, GiTacos, GiCheeseWedge, GiCoffeeCup,
  GiChickenLeg, GiSausage, GiCarrot, GiPotato, GiHotMeal,
  GiNoodles, GiSushis, GiDonut, GiCupcake, GiFrenchFries,
  GiWaterBottle, GiWineGlass, GiMilkCarton, GiBreadSlice, GiChiliPepper,
  GiGarlic, GiBroccoli, GiAvocado, GiPear, GiWatermelon,
  GiPeanut, GiCorn, GiMushroom, GiSteak, GiShrimp,
  GiCrab, GiHoneypot, GiCakeSlice, GiPretzel, GiPopcorn,
  GiIceCreamScoop, GiKnifeFork, GiCookingPot, GiFruitBowl,
} from 'react-icons/gi';

export type ComponenteIcono = ComponentType<{ size?: number; style?: CSSProperties }>;

export const ICONOS_GI_DEL_SELECTOR: Record<string, ComponenteIcono | undefined> = {
  GiTomato, GiHamburger, GiTacos, GiCheeseWedge, GiCoffeeCup,
  GiChickenLeg, GiSausage, GiCarrot, GiPotato, GiHotMeal,
  GiNoodles, GiSushis, GiDonut, GiCupcake, GiFrenchFries,
  GiWaterBottle, GiWineGlass, GiMilkCarton, GiBreadSlice, GiChiliPepper,
  GiGarlic, GiBroccoli, GiAvocado, GiPear, GiWatermelon,
  GiPeanut, GiCorn, GiMushroom, GiSteak, GiShrimp,
  GiCrab, GiHoneypot, GiCakeSlice, GiPretzel, GiPopcorn,
  GiIceCreamScoop, GiKnifeFork, GiCookingPot, GiFruitBowl,
};
