import './ui/styles.css';
import { Game } from './game/Game';
try { new Game(); }
catch(error){console.error(error);document.querySelector('#app')!.innerHTML='<main class="fatal"><h1>Не удалось запустить гонку</h1><p>Для игры нужен браузер с WebGL 2. Включите аппаратное ускорение и обновите страницу.</p></main>';}
