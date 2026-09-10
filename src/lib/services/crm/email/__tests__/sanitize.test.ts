/// <reference types="jest" />
import { htmlToText, sanitizeEmailHtml, sanitizeFragment } from '../sanitize';

describe('sanitizeEmailHtml', () => {
  it('elimina script, iframe, form, on* y javascript:', () => {
    const dirty = `<div onclick="x()"><script>alert(1)</script><iframe src="https://evil"></iframe><form><input></form><a href="javascript:alert(1)">x</a><p>ok</p></div>`;
    const out = sanitizeEmailHtml(dirty);
    expect(out).not.toMatch(/script|iframe|form|input|onclick|javascript:/i);
    expect(out).toContain('<p>ok</p>');
  });

  it('conserva tablas, estilos inline seguros, img http(s) y variables', () => {
    const html = `<table width="100%" cellpadding="0"><tr><td style="padding:8px;color:#333;position:fixed">Hola {{contact.first_name|hola}}</td></tr></table><img src="https://cdn/x.png" alt="l">`;
    const out = sanitizeEmailHtml(html);
    expect(out).toContain('<table width="100%" cellpadding="0">');
    expect(out).toContain('padding:8px');
    expect(out).toContain('color:#333');
    expect(out).not.toContain('position');
    expect(out).toContain('{{contact.first_name|hola}}');
    expect(out).toContain('<img src="https://cdn/x.png" alt="l"');
  });

  it('acepta data:image pero no otros data: y añade rel=noopener a enlaces', () => {
    const out = sanitizeEmailHtml(`<img src="data:image/png;base64,AAAA"><img src="data:text/html;base64,AAAA"><a href="https://a.co">a</a>`);
    expect(out).toContain('data:image/png');
    expect(out).not.toContain('data:text/html');
    expect(out).toMatch(/<a href="https:\/\/a.co" target="_blank" rel="noopener">a<\/a>/);
  });

  it('sanitizeFragment quita html/head/body/style pero mantiene el contenido', () => {
    const out = sanitizeFragment('<html><head><style>p{}</style></head><body><p><b>hola</b> {{x.y}}</p></body></html>');
    expect(out).not.toMatch(/<html|<head|<style|<body/);
    expect(out).toContain('<p><b>hola</b> {{x.y}}</p>');
  });

  it('htmlToText convierte enlaces, saltos y entidades', () => {
    const t = htmlToText('<style>p{}</style><p>Hola &amp; adiós</p><a href="https://a.co">Ver</a><br><table><tr><td>1</td><td>2</td></tr></table>');
    expect(t).toContain('Hola & adiós');
    expect(t).toContain('Ver (https://a.co)');
    expect(t).toMatch(/1\t2/);
    expect(t).not.toContain('p{}');
  });
});
