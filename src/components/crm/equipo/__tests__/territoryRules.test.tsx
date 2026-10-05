/** @jest-environment jsdom */
/// <reference types="jest" />
import {renderConIdioma,type IdiomaPrueba} from '@/test-utils/renderConIdioma';
import {TerritoryRules} from '../TerritoryRules';
import type {ConditionGroup} from '@/lib/services/crm/automation/conditionsDsl';
describe.each<IdiomaPrueba>(['es','en','fr','pt'])('territory rules in %s',idioma=>{
 test('nested alternatives and all-rules groups remain distinguishable and preserve actual values',()=>{
  const {container}=renderConIdioma(<TerritoryRules criteria={{filter:{op:'and',rules:[{field:'customer.city',operator:'eq',value:'Ciudad A'},{op:'or',rules:[{field:'customer.city',operator:'eq',value:'Ciudad B'},{field:'customer.city',operator:'eq',value:'Ciudad C'}]}]}}}/>,{idioma});
  const text=container.textContent!;expect(text).toContain('Ciudad A');expect(text).toContain('Ciudad B');expect(text).toContain('Ciudad C');expect(text).toMatch(/\(.*\(.*\).*\)/);expect(text).not.toContain('customer.city');expect(text).not.toContain('crm.');
 });
});
test('legacy weighted criteria retain their existing rules and do not acquire a fabricated DSL combination',()=>{
 const {container}=renderConIdioma(<TerritoryRules criteria={{rules:[{field_key:'city',operator:'eq',value:'Ciudad A',weight:25}]}}/>);
 expect(container.textContent).toContain('Ciudad A');expect(container.textContent).not.toContain('Todas las reglas');expect(container.textContent).not.toContain('Alguna regla');
});
test('invalid persisted criteria are shown as unavailable instead of a matching rule',()=>{const {container}=renderConIdioma(<TerritoryRules criteria={{filter:{fake:'rule'} as unknown as ConditionGroup}}/>);expect(container.textContent).toContain('—');expect(container.textContent).not.toContain('fake');});
