import './ui/styles.css';
import { Game } from './game/Game';
import { loadCarConfig } from './vehicles/LoadCarConfig';
async function start(){
  const config=await loadCarConfig();
  try { new Game(config.warning); }
  catch(error){console.error(error);document.querySelector('#app')!.innerHTML='<main class="fatal"><h1>Не удалось запустить гонку</h1><p>Для игры нужен браузер с WebGL 2. Включите аппаратное ускорение и обновите страницу.</p></main>';}
}
void start();
