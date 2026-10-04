/// <reference types="jest" />
import {parseCallDeepLink,clampRecordingSeek} from '../callDeepLink';
const id='10000000-0000-4000-8000-000000000001';
test('valid call URL accepts zero or omitted seek',()=>{expect(parseCallDeepLink(id,'0')).toEqual({id,startMs:0});expect(parseCallDeepLink(id,null)).toEqual({id,startMs:null});});
test.each(['-1','0.5','NaN','Infinity','9007199254740992','1e3',' 4'])('unsafe seek %s is rejected',value=>expect(parseCallDeepLink(id,value)).toBeNull());
test.each([null,'foreign','x;drop table'])('invalid call %s is rejected',value=>expect(parseCallDeepLink(value,'5')).toBeNull());
test('clamp waits for finite metadata, then respects recording duration',()=>{expect(clampRecordingSeek(15000,NaN)).toBeNull();expect(clampRecordingSeek(15000,Infinity)).toBeNull();expect(clampRecordingSeek(15000,10)).toBe(10000);expect(clampRecordingSeek(0,10)).toBe(0);expect(clampRecordingSeek(-1,10)).toBeNull();});
