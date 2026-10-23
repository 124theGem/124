import { Telegram } from "./platform/Telegram";
async function start(){
  if(new URLSearchParams(location.search).get("mode")==="colony"){await import("./legacy");return;}
  try{const {RaidApp}=await import("./raid/RaidApp");new RaidApp(new Telegram());}
  catch(error){document.querySelector("#app")!.innerHTML='<main class="rr-error"><h1>RIFT RAID</h1><p id="rr-error-message"></p><button onclick="location.reload()">Переподключиться</button></main>';document.querySelector("#rr-error-message")!.textContent=error instanceof Error?error.message:"Не удалось открыть игру.";}
}
void start();
