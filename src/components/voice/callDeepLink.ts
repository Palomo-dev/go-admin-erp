import { UUID_RE } from '@/lib/services/crm/crmErrors';
export function parseCallDeepLink(call:string|null,start:string|null):{id:string;startMs:number|null}|null{
 if(!call||!UUID_RE.test(call))return null;
 if(start===null)return{id:call,startMs:null};
 if(!/^\d+$/.test(start))return null;
 const value=Number(start);return Number.isSafeInteger(value)&&value>=0?{id:call,startMs:value}:null;
}
export function clampRecordingSeek(ms:number,duration:number):number|null{
 if(!Number.isFinite(ms)||ms<0||!Number.isFinite(duration)||duration<=0)return null;
 return Math.min(Math.floor(ms),duration*1000);
}
