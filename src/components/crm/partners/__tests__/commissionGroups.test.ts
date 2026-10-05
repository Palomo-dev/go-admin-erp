import { commissionGroups } from "../partnerCommissionGroups";
import type { PartnerDealView } from "@/lib/services/crm/partnerService";
const row=(currency:string|null,amount:number|null,status="pending")=>({commission_amount:amount,commission_status:status,opportunity:{currency}}) as PartnerDealView;
it("cada moneda se suma separadamente con el motor nativo",()=>{
  const groups=commissionGroups([row("USD",10),row("COP",200),row("USD",20,"paid"),row("USD",5,"rejected")]);expect(groups).toHaveLength(2);expect(groups.find(g=>g.currency==="USD")?.summary).toMatchObject({pending:10,paid:20,rejected:5,outstanding:10});expect(groups.find(g=>g.currency==="COP")?.summary.outstanding).toBe(200);
});
it("moneda o importe desconocidos se presentan explícitamente sin total aparente",()=>{
  const groups=commissionGroups([row(null,10),row("USD",null)]);expect(groups).toHaveLength(2);expect(groups.every(g=>!g.known)).toBe(true);
});
