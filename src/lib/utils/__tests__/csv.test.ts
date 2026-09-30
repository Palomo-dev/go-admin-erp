import { celdaCsv, filasACsv } from "../csv";
it.each([
  "=1+1",
  '  =HYPERLINK("https://example.invalid")',
  " +1",
  "\ttexto",
  "\rtexto",
  "@SUM(1)",
  " -2",
])("neutraliza fórmula textual %j", (v) =>
  expect(celdaCsv(v).replace(/^"|"$/g, "")).toMatch(/^'/),
);
it("conserva números negativos, escapa comillas y separadores, y usa BOM", () => {
  expect(celdaCsv(-2)).toBe("-2");
  expect(celdaCsv('Dato; "citado"')).toBe('"Dato; ""citado"""');
  expect(filasACsv(["Nombre"], [["Ejemplo"]])).toBe("\ufeffNombre\r\nEjemplo");
});
