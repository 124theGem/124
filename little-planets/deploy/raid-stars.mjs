import 'dotenv/config';
// Operator tool. Default is read-only. Never prints tokens or webhook secrets.
const token=process.env.BOT_TOKEN,secret=process.env.RAID_STARS_WEBHOOK_SECRET,base=process.env.RAID_APP_URL?.replace(/\/$/,'');
if(!token||!base?.startsWith('https://')||!secret||!/^[A-Za-z0-9_-]{24,256}$/.test(secret))throw new Error('Set BOT_TOKEN, HTTPS RAID_APP_URL and RAID_STARS_WEBHOOK_SECRET (24–256 URL-safe characters) in the operator environment.');
const url=new URL(base+'/api/raid/payments/telegram');if(url.search||url.hash||url.username||url.password)throw new Error('RAID_APP_URL must be a public HTTPS app URL without query, fragment or credentials.');
async function bot(method,body){
 try{const response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});const data=await response.json();if(!response.ok||!data.ok)throw new Error();return data.result;}
 catch{throw new Error('Telegram Bot API request failed. No credentials have been logged.');}
}
const info=await bot('getWebhookInfo',{}),expected=url.href;
if(info.url&&info.url!==expected)throw new Error('Another bot webhook is already installed. Refusing to replace it. A dedicated game bot or deliberate webhook integration is required.');
if(process.argv.includes('--apply')){
 await bot('setWebhook',{url:expected,secret_token:secret,allowed_updates:['message','pre_checkout_query'],drop_pending_updates:false});
 console.log('Game webhook registered. Existing pending messages were retained. Enable RAID_STARS_ENABLED=true and restart the application only after checkout/refund review.');
}else console.log(info.url===expected?'Game webhook URL matches. Secret delivery still needs a signed test checkout. No changes made.':'No webhook installed. Review the game endpoint before running with --apply. No changes made.');
