/** @jest-environment jsdom */
/// <reference types="jest" />
import {fireEvent,screen} from '@testing-library/react';
import {renderConIdioma} from '@/test-utils/renderConIdioma';
import {ExportObjections} from '../ExportObjections';
import type {LibraryRow} from '../objectionLibraryModel';
const rows=[{objection:{title:'=SUM(1)',category:'precio'},calls:2,advancedRate:.5}] as LibraryRow[];
test('export downloads only the supplied filtered view, uses canonical safe CSV and releases the blob URL',()=>{
 const original=global.Blob;let parts:BlobPart[]=[];
 global.Blob=class {constructor(value:BlobPart[]){parts=value;}} as unknown as typeof Blob;
 const create=jest.fn(()=> 'blob:private-view'),revoke=jest.fn();Object.defineProperty(URL,'createObjectURL',{configurable:true,value:create});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revoke});
 const click=jest.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 try{renderConIdioma(<ExportObjections rows={rows} disabled={false}/>);fireEvent.click(screen.getByRole('button',{name:'Exportar'}));expect(parts.join('')).toContain("'=SUM(1);Precio;2;50");expect(parts.join('')).not.toContain('undefined');expect(create).toHaveBeenCalledTimes(1);expect(click).toHaveBeenCalledTimes(1);expect(revoke).toHaveBeenCalledWith('blob:private-view');expect(document.querySelector('a[download]')).toBeNull();}
 finally{global.Blob=original;click.mockRestore();}
});
test('unavailable metrics disable export instead of emitting fabricated zero values',()=>{renderConIdioma(<ExportObjections rows={rows} disabled/>);const button=screen.getByRole('button',{name:'Exportar'});expect(button.hasAttribute('disabled')).toBe(true);});
