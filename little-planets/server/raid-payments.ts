import { randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { RaidError, type RaidServer } from "./raid";
import type { RaidSkin } from "../shared/raid";
export const RAID_OFFERS = {
  solar: { title: "RIFT RAID · Солнечный", description: "Косметический образ. Характеристики оружия и персонажа не меняются.", stars: 49, skin: "solar" as RaidSkin },
  void: { title: "RIFT RAID · Спектр", description: "Косметический образ с фиолетовым свечением. Покупка не усиливает персонажа.", stars: 99, skin: "void" as RaidSkin },
  founder: { title: "RIFT RAID · Пионер", description: "Образ первопроходца с белым свечением. Только внешний вид.", stars: 149, skin: "founder" as RaidSkin },
} as const;
type Offer=keyof typeof RAID_OFFERS;
export interface RaidPaymentConfig { enabled?:boolean; secret?:string; appURL?:string; botUsername?:string; }
type BotCall=(method:string,body:Record<string,unknown>)=>Promise<any>;
/** Native Stars only. Client invoice callbacks never grant entitlements. */
export class RaidPayments {
  enabled=false;
  private invoiceJobs=new Map<string,Promise<{url:string}>>();
  private refundJobs=new Map<string,Promise<{ok:boolean}>>();
  private call:BotCall;
  private cachedUsername:string|null;
  constructor(private raid:RaidServer,private token:string,private config:RaidPaymentConfig={},call?:BotCall){
    this.cachedUsername=config.botUsername?.replace(/^@/,"")??null;
    this.call=call??(async(method,body)=>{
      try{
        const r=await fetch(`https://api.telegram.org/bot${this.token}/${method}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
        const data=await r.json() as {ok:boolean;result?:unknown;description?:string};
        if(!r.ok||!data.ok){if(method==="refundStarPayment"&&/ALREADY_REFUNDED/i.test(data.description??""))return true;throw new Error("Bot operation failed");}return data.result;
      }catch{throw new RaidError("Платёжный шлюз временно недоступен. Повторите позже.",503);}
    });
    raid.db.exec(`CREATE TABLE IF NOT EXISTS raid_orders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,sku TEXT NOT NULL,amount INTEGER NOT NULL,state TEXT NOT NULL,expires_at INTEGER NOT NULL,invoice_url TEXT,precheckout_id TEXT);
      CREATE TABLE IF NOT EXISTS raid_payments(charge_id TEXT PRIMARY KEY,order_id TEXT NOT NULL UNIQUE,user_id TEXT NOT NULL,sku TEXT NOT NULL,amount INTEGER NOT NULL,state TEXT NOT NULL,at INTEGER NOT NULL);`);
    const columns=raid.db.prepare("PRAGMA table_info(raid_orders)").all() as {name:string}[];
    if(!columns.some(c=>c.name==="precheckout_id"))raid.db.exec("ALTER TABLE raid_orders ADD COLUMN precheckout_id TEXT");
    raid.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS raid_one_open_invoice ON raid_orders(user_id,sku) WHERE state IN ('created','prechecked')");
  }
  async initialize(){
    if(this.config.enabled&&this.token&&this.config.secret&&this.config.secret.length>=24&&this.config.appURL?.startsWith("https://")){
      try{const webhook=await this.call("getWebhookInfo",{});this.enabled=webhook.url===this.webhookURL;}catch{this.enabled=false;}
    }
    this.raid.shop={enabled:this.enabled,botUsername:this.cachedUsername};
  }
  get webhookURL(){return this.config.appURL?.replace(/\/$/,"")+"/api/raid/payments/telegram";}
  async username(){
    if(!this.cachedUsername&&this.token){try{const me=await this.call("getMe",{});if(typeof me.username==="string"&&/^[a-zA-Z0-9_]{5,32}$/.test(me.username))this.cachedUsername=me.username;}catch{}}
    this.raid.shop.botUsername=this.cachedUsername;return this.cachedUsername;
  }
  private order(id:string){return this.raid.db.prepare("SELECT * FROM raid_orders WHERE id=?").get(id) as {id:string;user_id:string;sku:Offer;amount:number;state:string;expires_at:number;invoice_url:string|null;precheckout_id:string|null}|undefined;}
  invoice(user:number,sku:string,now=Date.now()):Promise<{url:string}>{
    const key=`${user}:${sku}`,previous=this.invoiceJobs.get(key);if(previous)return previous;
    const job=this.createInvoice(user,sku,now).finally(()=>this.invoiceJobs.delete(key));this.invoiceJobs.set(key,job);return job;
  }
  private async createInvoice(user:number,sku:string,now:number){
    if(!this.enabled)throw new RaidError("Покупки за Stars пока не открыты.",503);
    if(!Object.hasOwn(RAID_OFFERS,sku))throw new RaidError("Предложение не найдено.");
    const offer=RAID_OFFERS[sku as Offer],profile=this.raid.mutate(user,()=>{},now);
    if(profile.skins.includes(offer.skin))throw new RaidError("Этот образ уже открыт.");
    this.raid.db.prepare("UPDATE raid_orders SET state='expired' WHERE user_id=? AND sku=? AND state='created' AND expires_at<?").run(String(user),sku,now);
    if(this.raid.db.prepare("SELECT id FROM raid_orders WHERE user_id=? AND sku=? AND state='prechecked'").get(String(user),sku))throw new RaidError("Предыдущая покупка ещё обрабатывается. Проверьте историю покупок.",409);
    const pending=this.raid.db.prepare("SELECT invoice_url FROM raid_orders WHERE user_id=? AND sku=? AND state='created' AND expires_at>? AND invoice_url IS NOT NULL LIMIT 1").get(String(user),sku,now) as {invoice_url:string}|undefined;
    if(pending)return{url:pending.invoice_url};
    const id=randomUUID();
    this.raid.db.prepare("INSERT INTO raid_orders(id,user_id,sku,amount,state,expires_at,invoice_url) VALUES(?,?,?,?,?,?,NULL)").run(id,String(user),sku,offer.stars,"created",now+15*60000);
    try{
      const url=await this.call("createInvoiceLink",{title:offer.title,description:offer.description,payload:`rr:${id}`,provider_token:"",currency:"XTR",prices:[{label:offer.title,amount:offer.stars}]});
      if(typeof url!=="string"||!url.startsWith("https://t.me/"))throw new RaidError("Не удалось открыть оплату.",503);
      this.raid.db.prepare("UPDATE raid_orders SET invoice_url=? WHERE id=?").run(url,id);this.raid.event(user,"invoice_created",{sku,stars:offer.stars},now);return{url};
    }catch(error){this.raid.db.prepare("UPDATE raid_orders SET state='failed' WHERE id=?").run(id);throw error;}
  }
  async webhook(secret:string|undefined,raw:unknown,now=Date.now()){
    if(!this.enabled||!this.config.secret||!secret||!timingSafeEqual(createHash("sha256").update(secret).digest(),createHash("sha256").update(this.config.secret).digest()))throw new RaidError("Forbidden",403);
    const update=raw as any;
    if(!update||!Number.isSafeInteger(update.update_id))throw new RaidError("Bad update");
    const query=update.pre_checkout_query;
    if(query){
      const id=typeof query.invoice_payload==="string"&&query.invoice_payload.startsWith("rr:")?query.invoice_payload.slice(3):"";
      const order=this.order(id);
      const valid=!!order&&order.user_id===String(query.from?.id)&&order.amount===query.total_amount&&query.currency==="XTR"&&order.expires_at>=now&&(order.state==="created"||(order.state==="prechecked"&&order.precheckout_id===query.id))&&typeof query.id==="string"&&!this.raid.profile(Number(order.user_id)).skins.includes(RAID_OFFERS[order.sku].skin);
      if(valid)this.raid.db.prepare("UPDATE raid_orders SET state='prechecked',precheckout_id=? WHERE id=?").run(query.id,id);
      await this.call("answerPreCheckoutQuery",{pre_checkout_query_id:query.id,ok:valid,...(!valid?{error_message:"Заказ устарел или образ уже открыт. Откройте магазин заново."}:{})});return{ok:true};
    }
    const message=update.message,payment=message?.successful_payment;
    if(payment){
      const id=typeof payment.invoice_payload==="string"&&payment.invoice_payload.startsWith("rr:")?payment.invoice_payload.slice(3):"";
      const order=this.order(id);
      if(!order||order.user_id!==String(message.from?.id)||order.amount!==payment.total_amount||payment.currency!=="XTR"||typeof payment.telegram_payment_charge_id!=="string"||!["prechecked","paid"].includes(order.state))throw new RaidError("Payment receipt rejected");
      this.raid.db.exec("BEGIN IMMEDIATE");
      try{
        const charge=this.raid.db.prepare("SELECT order_id FROM raid_payments WHERE charge_id=?").get(payment.telegram_payment_charge_id) as {order_id:string}|undefined;
        if(charge&&charge.order_id!==order.id)throw new RaidError("Charge already used");
        const inserted=this.raid.db.prepare("INSERT OR IGNORE INTO raid_payments VALUES(?,?,?,?,?,'paid',?)").run(payment.telegram_payment_charge_id,order.id,order.user_id,order.sku,order.amount,now);
        if(inserted.changes){
          const profile=this.raid.profile(Number(order.user_id),undefined,now),skin=RAID_OFFERS[order.sku].skin;
          if(!profile.skins.includes(skin))profile.skins.push(skin);
          this.raid.db.prepare("UPDATE raid_profiles SET profile=? WHERE user_id=?").run(JSON.stringify(profile),order.user_id);
          this.raid.db.prepare("UPDATE raid_orders SET state='paid' WHERE id=?").run(order.id);
          this.raid.event(Number(order.user_id),"purchase",{sku:order.sku,stars:order.amount},now);
        }
        this.raid.db.exec("COMMIT");return{ok:true};
      }catch(error){this.raid.db.exec("ROLLBACK");throw error;}
    }
    if(message?.text==="/paysupport"&&Number.isSafeInteger(message.chat?.id))await this.call("sendMessage",{chat_id:message.chat.id,text:"Поддержка покупок RIFT RAID: откройте «Образы → Мои покупки» в Mini App. Для каждого оплаченного образа доступен возврат Stars; после возврата образ отключается."});
    return{ok:true};
  }
  purchases(user:number){return this.raid.db.prepare("SELECT charge_id AS id,sku,amount,state,at FROM raid_payments WHERE user_id=? ORDER BY at DESC LIMIT 30").all(String(user));}
  refund(user:number,id:string,now=Date.now()):Promise<{ok:boolean}>{
    const key=`${user}:${id}`,previous=this.refundJobs.get(key);if(previous)return previous;
    const job=this.doRefund(user,id,now).finally(()=>this.refundJobs.delete(key));this.refundJobs.set(key,job);return job;
  }
  private async doRefund(user:number,id:string,now:number){
    if(!this.enabled)throw new RaidError("Возвраты сейчас недоступны.",503);
    const payment=this.raid.db.prepare("SELECT * FROM raid_payments WHERE charge_id=? AND user_id=?").get(id,String(user)) as {state:string;sku:Offer}|undefined;
    if(!payment)throw new RaidError("Покупка не найдена.");if(payment.state==="refunded")return{ok:true};
    this.raid.db.prepare("UPDATE raid_payments SET state='refund_pending' WHERE charge_id=? AND user_id=?").run(id,String(user));
    await this.call("refundStarPayment",{user_id:user,telegram_payment_charge_id:id});
    this.raid.db.exec("BEGIN IMMEDIATE");
    try{
      const profile=this.raid.profile(user,undefined,now),skin=RAID_OFFERS[payment.sku].skin;
      profile.skins=profile.skins.filter(s=>s!==skin);if(profile.skin===skin)profile.skin="ghost";
      this.raid.db.prepare("UPDATE raid_profiles SET profile=? WHERE user_id=?").run(JSON.stringify(profile),String(user));
      this.raid.db.prepare("UPDATE raid_payments SET state='refunded' WHERE charge_id=? AND user_id=?").run(id,String(user));
      this.raid.event(user,"refund",{sku:payment.sku,stars:RAID_OFFERS[payment.sku].stars},now);this.raid.db.exec("COMMIT");return{ok:true};
    }catch(error){this.raid.db.exec("ROLLBACK");throw error;}
  }
}
