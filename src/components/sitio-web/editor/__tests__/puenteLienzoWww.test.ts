import { mismoSitioWww } from '../usePuenteLienzo';

describe('mismoSitioWww', () => {
  it('acepta el mismo origen y la variante con o sin www', () => {
    expect(mismoSitioWww('https://www.tuhogarcolombia.store', 'https://tuhogarcolombia.store')).toBe(true);
    expect(mismoSitioWww('https://tuhogarcolombia.store', 'https://www.tuhogarcolombia.store')).toBe(true);
    expect(mismoSitioWww('https://a.goadmin.io', 'https://a.goadmin.io')).toBe(true);
  });
  it('rechaza otros sitios, protocolos o puertos', () => {
    expect(mismoSitioWww('https://evil.store', 'https://tuhogarcolombia.store')).toBe(false);
    expect(mismoSitioWww('https://www.evil.tuhogarcolombia.store', 'https://tuhogarcolombia.store')).toBe(false);
    expect(mismoSitioWww('http://www.tuhogarcolombia.store', 'https://tuhogarcolombia.store')).toBe(false);
    expect(mismoSitioWww('https://x.store', null)).toBe(false);
  });
});
