import * as T from "three";
import {
  SHIP_LIVERIES,
  shipRegistration,
  shipConfiguration,
  type Starship,
} from "../../shared/ships";
/** Original fictional insignia and maintenance stencils, rendered at 2048×512. */
export function liveryTexture(input: Starship) {
  if (typeof document === "undefined") return null;
  const s = shipConfiguration(input),
    l = SHIP_LIVERIES[s.livery],
    canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 512;
  const c = canvas.getContext("2d")!;
  const accent = "#" + l.accent.toString(16).padStart(6, "0");
  const ink = s.color === "graphite" ? "#d8ddd8" : "#354044";
  c.fillStyle = accent;
  c.fillRect(0, 20, 2048, 25);
  c.fillRect(0, 58, 2048, 8);
  c.fillStyle = ink;
  c.beginPath();
  if (s.livery === "helix") {
    c.moveTo(45, 130);
    c.lineTo(145, 130);
    c.lineTo(175, 230);
    c.lineTo(75, 230);
    c.closePath();
    c.fill();
    c.clearRect(85, 150, 45, 55);
  } else if (s.livery === "polar") {
    c.fillRect(80, 115, 45, 135);
    c.fillRect(35, 160, 135, 45);
  } else if (s.livery === "obsidian") {
    c.moveTo(105, 110);
    c.lineTo(175, 240);
    c.lineTo(35, 240);
    c.closePath();
    c.fill();
    c.clearRect(85, 175, 42, 17);
  } else {
    c.moveTo(105, 105);
    c.lineTo(183, 245);
    c.lineTo(150, 245);
    c.lineTo(105, 165);
    c.lineTo(60, 245);
    c.lineTo(25, 245);
    c.closePath();
    c.fill();
    c.fillRect(90, 220, 30, 25);
  }
  c.font = "600 43px sans-serif";
  c.fillText(l.corporation, 220, 150);
  c.font = "500 95px sans-serif";
  c.fillText(s.name.toLocaleUpperCase("ru").slice(0, 23), 216, 260, 1580);
  c.font = "38px monospace";
  c.fillText(`${shipRegistration(s)}  /  MK 0${s.model}`, 220, 330);
  c.font = "26px monospace";
  c.fillText("SERVICE PANEL 07   •   CAUTION / PRESSURISED", 220, 405);
  c.strokeStyle = ink;
  c.lineWidth = 4;
  c.strokeRect(1640, 300, 235, 125);
  for (let i = 0; i < 14; i++) c.fillRect(1660 + i * 14, 320, 3 + (i % 3), 62);
  c.font = "20px monospace";
  c.fillText("INSPECT BEFORE FLIGHT", 1645, 415);
  c.fillStyle = "#c09a51";
  for (let i = 0; i < 26; i++) {
    c.save();
    c.translate(i * 82, 477);
    c.rotate(-0.6);
    c.fillRect(0, -10, 45, 35);
    c.restore();
  }
  // Fine deterministic chips make the printed coating share the hull's wear.
  for (let i = 0; i < 220; i++)
    c.clearRect((i * 997) % 2048, (i * 137) % 460, 2 + (i % 6), 1 + (i % 2));
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}
