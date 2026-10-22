import * as T from "three";
import { shipFrame } from "../../shared/shipFrames";
import {
  SHIP_CLASS_NAMES,
  SHIP_ENGINES,
  SHIP_MODULES,
  SHIP_FINISHES,
  SHIP_STATS,
  shipConfiguration,
  shipRegistration,
  type Starship,
} from "../../shared/ships";

/** Five cameras render the actual shared model. No placeholder illustration or separate ship asset. */
export function drawShipBlueprint(
  renderer: T.WebGLRenderer,
  model: T.Group,
  input: Starship,
  environment?: T.Texture,
) {
  const ship = shipConfiguration(input),
    frame = shipFrame(ship),
    stats = SHIP_STATS(ship);
  const sheet = document.createElement("canvas");
  sheet.width = 1400;
  sheet.height = 1780;
  sheet.className = "blueprint-sheet";
  sheet.setAttribute(
    "aria-label",
    `Инженерный чертёж ${ship.name}: перспектива и четыре ортографических вида`,
  );
  const c = sheet.getContext("2d")!;
  c.fillStyle = "#e9e2cf";
  c.fillRect(0, 0, sheet.width, sheet.height);
  // Original deterministic paper grain. All lettering is real, readable Russian text.
  for (let i = 0; i < 13000; i++) {
    c.fillStyle = i % 2 ? "#302e2410" : "#ffffff20";
    c.fillRect((i * 997) % 1400, (i * 613) % 1780, 1, 1);
  }
  c.strokeStyle = "#8d8978";
  c.lineWidth = 1;
  c.strokeRect(25, 25, 1350, 1730);
  const text = (
    s: string,
    x: number,
    y: number,
    size = 17,
    color = "#414640",
  ) => {
    c.fillStyle = color;
    c.font = `${size >= 26 ? "600 " : ""}${size}px sans-serif`;
    c.fillText(s, x, y);
  };
  const rule = (x: number, y: number, w: number) => {
    c.strokeStyle = "#969381";
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + w, y);
    c.stroke();
  };
  text("AURORA / КОНСТРУКТОРСКОЕ БЮРО", 52, 63, 17);
  text(`${ship.name.toLocaleUpperCase("ru").slice(0, 32)}`, 52, 108, 32);
  text(`${frame.name} / ${SHIP_CLASS_NAMES[ship.class]}`, 52, 138, 18);
  text(shipRegistration(ship), 1115, 70, 22);
  text("ОБЩИЙ ВИД / ЛИСТ 01", 1115, 100, 14);
  rule(50, 157, 1300);
  const scene = new T.Scene();
  scene.background = new T.Color(0xe9e2cf);
  const surface = new T.MeshBasicMaterial({
    color: 0xeee8d8,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const ink = new T.LineBasicMaterial({
    color: 0x434a45,
    transparent: true,
    opacity: 0.75,
  });
  const solids: T.InstancedMesh[] = [];
  const edgeCache = new Map<string, T.EdgesGeometry>();
  const edgePositions: number[] = [];
  const matrix = new T.Matrix4(),
    m = new T.Matrix4(),
    v = new T.Vector3();
  model.updateWorldMatrix(true, true);
  model.traverse((o) => {
    if (!(o instanceof T.Mesh)) return;
    const material = Array.isArray(o.material) ? o.material[0] : o.material;
    // Printed transparent decals are described in the title block; avoid their rectangular backing in line art.
    if (
      (material as T.MeshStandardMaterial).map &&
      material.transparent &&
      !((material as T.MeshPhysicalMaterial).transmission > 0)
    )
      return;
    const count = o instanceof T.InstancedMesh ? o.count : 1;
    const solid = new T.InstancedMesh(o.geometry, surface, count);
    let edges = edgeCache.get(o.geometry.uuid);
    if (!edges) {
      edges = new T.EdgesGeometry(o.geometry, 8);
      edgeCache.set(o.geometry.uuid, edges);
    }
    const pos = edges.getAttribute("position");
    for (let i = 0; i < count; i++) {
      if (o instanceof T.InstancedMesh) {
        o.getMatrixAt(i, m);
        matrix.multiplyMatrices(o.matrixWorld, m);
      } else matrix.copy(o.matrixWorld);
      solid.setMatrixAt(i, matrix);
      for (let j = 0; j < pos.count; j++) {
        v.fromBufferAttribute(pos, j).applyMatrix4(matrix);
        edgePositions.push(v.x, v.y, v.z);
      }
    }
    solids.push(solid);
    scene.add(solid);
  });
  const linesGeo = new T.BufferGeometry();
  linesGeo.setAttribute(
    "position",
    new T.Float32BufferAttribute(edgePositions, 3),
  );
  scene.add(new T.LineSegments(linesGeo, ink));
  const realScene = new T.Scene();
  realScene.background = new T.Color(0xe9e2cf);
  realScene.environment = environment ?? null;
  realScene.environmentIntensity = 0.8;
  const realModel = model.clone(true);
  realScene.add(realModel);
  realScene.add(new T.HemisphereLight(0xf0efe4, 0x555b50, 1.4));
  const sun = new T.DirectionalLight(0xfff4de, 2.7);
  sun.position.set(-4, 7, 6);
  realScene.add(sun);
  const bounds = new T.Box3().setFromObject(model),
    size = bounds.getSize(new T.Vector3()),
    center = bounds.getCenter(new T.Vector3());
  const previousSize = renderer.getSize(new T.Vector2()),
    pixelRatio = renderer.getPixelRatio(),
    tone = renderer.toneMapping,
    shadow = renderer.shadowMap.enabled;
  const clear = renderer.getClearColor(new T.Color()),
    alpha = renderer.getClearAlpha();
  renderer.setPixelRatio(1);
  renderer.toneMapping = T.NoToneMapping;
  renderer.shadowMap.enabled = false;
  const views = [
    {
      name: "01 / ПЕРСПЕКТИВА",
      x: 50,
      y: 180,
      w: 1300,
      h: 535,
      dir: new T.Vector3(1.25, 0.85, 1.65),
      up: new T.Vector3(0, 1, 0),
    },
    {
      name: "02 / СЛЕВА",
      x: 50,
      y: 745,
      w: 630,
      h: 320,
      dir: new T.Vector3(1, 0, 0),
      up: new T.Vector3(0, 1, 0),
    },
    {
      name: "03 / СПЕРЕДИ",
      x: 720,
      y: 745,
      w: 630,
      h: 320,
      dir: new T.Vector3(0, 0, 1),
      up: new T.Vector3(0, 1, 0),
    },
    {
      name: "04 / СВЕРХУ",
      x: 50,
      y: 1110,
      w: 630,
      h: 320,
      dir: new T.Vector3(0, 1, 0),
      up: new T.Vector3(0, 0, -1),
    },
    {
      name: "05 / СЗАДИ",
      x: 720,
      y: 1110,
      w: 630,
      h: 320,
      dir: new T.Vector3(0, 0, -1),
      up: new T.Vector3(0, 1, 0),
    },
  ];
  try {
    for (let i = 0; i < views.length; i++) {
      const view = views[i],
        aspect = view.w / view.h,
        radius = Math.max(size.x, size.y, size.z);
      const horizontal = i === 1 ? size.z : size.x,
        vertical = i === 3 ? size.z : size.y;
      const extent = Math.max(vertical * 1.3, (horizontal / aspect) * 1.3);
      const camera =
        i === 0
          ? new T.PerspectiveCamera(34, aspect, 0.05, 100)
          : new T.OrthographicCamera(
              (-extent * aspect) / 2,
              (extent * aspect) / 2,
              extent / 2,
              -extent / 2,
              0.05,
              100,
            );
      camera.position
        .copy(center)
        .addScaledVector(
          view.dir.clone().normalize(),
          i === 0 ? radius * 1.9 : radius * 2,
        );
      camera.up.copy(view.up);
      camera.lookAt(center);
      camera.updateMatrixWorld(true);
      renderer.setSize(view.w, view.h, false);
      renderer.toneMapping =
        i === 0 ? T.ACESFilmicToneMapping : T.NoToneMapping;
      renderer.render(i === 0 ? realScene : scene, camera);
      c.drawImage(renderer.domElement, view.x, view.y, view.w, view.h);
      text(view.name, view.x + 10, view.y + 24, 16);
      if (i === 0) {
        const anchors = (model.userData.anchors ?? []) as {
          label: string;
          point: number[];
        }[];
        for (let j = 0; j < anchors.length; j++) {
          const a = anchors[j],
            p = new T.Vector3(...a.point).project(camera);
          const px = view.x + ((p.x + 1) * view.w) / 2,
            py = view.y + ((1 - p.y) * view.h) / 2;
          const right = j % 2 === 0,
            tx = right ? view.x + view.w - 255 : view.x + 20,
            ty = view.y + 95 + Math.floor(j / 2) * 83;
          c.strokeStyle = "#8d7753";
          c.beginPath();
          c.moveTo(px, py);
          c.lineTo(right ? tx - 12 : tx + 220, ty - 6);
          c.lineTo(right ? tx + 230 : tx, ty - 6);
          c.stroke();
          c.fillStyle = "#a07838";
          c.beginPath();
          c.arc(px, py, 3, 0, Math.PI * 2);
          c.fill();
          text(a.label, tx, ty - 15, 14);
        }
      } else {
        const len = i === 1 ? size.z : size.x;
        const unit = view.h / extent;
        const x = view.x + view.w / 2 - (len * unit) / 2,
          y = view.y + view.h - 13,
          w = len * unit;
        c.strokeStyle = "#686d62";
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + w, y);
        c.moveTo(x, y - 8);
        c.lineTo(x, y + 8);
        c.moveTo(x + w, y - 8);
        c.lineTo(x + w, y + 8);
        c.stroke();
        text(
          `${len.toFixed(2)} м  ·  1 м = ${unit.toFixed(0)} px`,
          view.x + view.w / 2 - 95,
          y - 8,
          14,
        );
      }
      rule(view.x, view.y + view.h + 8, view.w);
    }
    const y = 1490;
    text("СПЕЦИФИКАЦИЯ / ФАКТИЧЕСКАЯ КОНФИГУРАЦИЯ", 52, y, 21);
    const rows = [
      [
        `Габариты: ${size.z.toFixed(2)} × ${size.x.toFixed(2)} × ${size.y.toFixed(2)} м`,
        `Масса: ${stats.mass} т / Броня: ${stats.armor}`,
      ],
      [
        `Корпус: ${ship.hull} / Крылья: ${ship.wings}`,
        `Скорость: ${stats.speed} / Груз: ${stats.cargo}`,
      ],
      [SHIP_ENGINES[ship.engine].name, SHIP_MODULES[ship.module].name],
      [
        SHIP_FINISHES[ship.finish].name,
        `Дальность: ${stats.range} / Опоры: ${frame.legs}`,
      ],
    ];
    rows.forEach((row, i) => {
      text(row[0], 55, y + 38 + i * 34, 17);
      text(row[1], 735, y + 38 + i * 34, 17);
    });
    rule(50, 1682, 1300);
    text(
      "Размеры сняты с 3D-модели. Ортографические виды имеют указанную пиксельную шкалу.",
      55,
      1710,
      15,
    );
    text(
      "LP / ENGINEERING   •   REV 16   •   КОНФИГУРАЦИЯ СОХРАНЯЕТСЯ В ПРОЕКТЕ",
      55,
      1738,
      14,
    );
  } finally {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(previousSize.x, previousSize.y, false);
    renderer.toneMapping = tone;
    renderer.shadowMap.enabled = shadow;
    renderer.setClearColor(clear, alpha);
    realModel.traverse((o) => {
      if (o instanceof T.InstancedMesh) o.dispose();
    });
    realScene.clear();
    solids.forEach((s) => s.dispose());
    edgeCache.forEach((g) => g.dispose());
    linesGeo.dispose();
    surface.dispose();
    ink.dispose();
    scene.clear();
  }
  return { canvas: sheet, dimensions: size.toArray() };
}

/** Touch pan/pinch and wheel zoom on a readable, full-resolution engineering sheet. */
export class BlueprintViewport {
  readonly el = document.createElement("div");
  private canvas?: HTMLCanvasElement;
  private scale = 1;
  private x = 0;
  private y = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  constructor() {
    this.el.className = "blueprint-viewport";
    this.el.onwheel = (e) => {
      e.preventDefault();
      this.zoom(e.deltaY > 0 ? 1.12 : 0.89, e.offsetX, e.offsetY);
    };
    this.el.onpointerdown = (e) => {
      this.el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    this.el.onpointermove = (e) => {
      const old = this.pointers.get(e.pointerId);
      if (!old) return;
      if (this.pointers.size === 2) {
        const other = [...this.pointers.entries()].find(
          ([id]) => id !== e.pointerId,
        )![1];
        const before = Math.hypot(old.x - other.x, old.y - other.y),
          after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        if (before > 0 && after > 0)
          this.zoom(
            before / after,
            this.el.clientWidth / 2,
            this.el.clientHeight / 2,
          );
      } else {
        this.x += e.clientX - old.x;
        this.y += e.clientY - old.y;
        this.transform();
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    this.el.onpointerup = this.el.onpointercancel = (e) => {
      this.pointers.delete(e.pointerId);
    };
  }
  setCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.el.replaceChildren(canvas);
    this.reset();
  }
  reset() {
    this.scale = this.el.clientWidth / 1400;
    this.x = 0;
    this.y = 0;
    this.transform();
  }
  zoom(
    factor: number,
    cx = this.el.clientWidth / 2,
    cy = this.el.clientHeight / 2,
  ) {
    const old = this.scale;
    this.scale = T.MathUtils.clamp(old / factor, this.el.clientWidth / 1400, 3);
    this.x = cx - ((cx - this.x) * this.scale) / old;
    this.y = cy - ((cy - this.y) * this.scale) / old;
    this.transform();
  }
  private transform() {
    if (this.canvas) {
      this.x = T.MathUtils.clamp(
        this.x,
        Math.min(0, this.el.clientWidth - 1400 * this.scale),
        0,
      );
      this.y = T.MathUtils.clamp(
        this.y,
        Math.min(0, this.el.clientHeight - 1780 * this.scale),
        0,
      );
      this.canvas.style.transform = `translate(${this.x}px,${this.y}px) scale(${this.scale})`;
      this.el.dataset.scale = this.scale.toFixed(4);
    }
  }
  dispose() {
    this.pointers.clear();
    this.canvas = undefined;
    this.el.remove();
  }
}
