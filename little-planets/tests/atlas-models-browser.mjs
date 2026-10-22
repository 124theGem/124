import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /shader|program|WebGL/i.test(m.text()))
      errors.push(m.text());
  });
  await page.route("**/outpost-studio", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><style>body{margin:0;background:#8c9997}canvas{display:block}#label{position:absolute;left:40px;top:35px;color:#eef2e9;font:14px monospace;letter-spacing:2px}</style><div id="label"></div></html>',
    }),
  );
  await page.goto(
    (process.env.GAME_URL || "http://127.0.0.1:5174") + "/outpost-studio",
  );
  const inventory = await page.evaluate(async () => {
    const source = await (await fetch("/src/world/Models.ts")).text();
    const path = source.match(
      /import\s+\*\s+as\s+T\s+from\s+["']([^"']+)/,
    )?.[1];
    if (!path) throw new Error("Cannot resolve the exact renderer module");
    const T = await import(path),
      { Models } = await import("/src/world/Models.ts"),
      { studioEnvironment } = await import("/src/world/Graphics.ts");
    const renderer = new T.WebGLRenderer({ antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(1);
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    document.body.append(renderer.domElement);
    const scene = new T.Scene();
    scene.background = new T.Color(0x899693);
    const env = studioEnvironment(renderer);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.75;
    scene.add(new T.HemisphereLight(0xe5e9df, 0x394446, 1.25));
    const sun = new T.DirectionalLight(0xffeed7, 2.8);
    sun.position.set(-4, 8, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -8;
    sun.shadow.camera.right = 8;
    sun.shadow.camera.top = 8;
    sun.shadow.camera.bottom = -8;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    const fill = new T.DirectionalLight(0xc6d9d6, 1);
    fill.position.set(5, 3, -3);
    scene.add(fill);
    const ground = new T.Mesh(
      new T.PlaneGeometry(100, 100),
      new T.MeshStandardMaterial({ color: 0x65716d, roughness: 0.9 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    ground.receiveShadow = true;
    scene.add(ground);
    const camera = new T.PerspectiveCamera(
      38,
      innerWidth / innerHeight,
      0.1,
      150,
    );
    const kit = new Models();
    window.studio = {
      renderer,
      scene,
      camera,
      kit,
      T,
      sun,
      fill,
      hemi: scene.children.find((o) => o.isHemisphereLight),
    };
    return true;
  });
  assert(inventory);
  const masks = new Set();
  const fleet = [];
  for (const cls of ["exploration", "cargo", "combat"])
    for (const model of [1, 2, 3]) {
      const result = await page.evaluate(
        async ({ cls, model }) => {
          const s = window.studio,
            T = s.T;
          if (s.model) {
            s.scene.remove(s.model);
            s.model.traverse((o) => {
              if (o.isInstancedMesh) o.dispose();
            });
          }
          const design = {
            id: "studio",
            name: cls === "exploration" ? "КЕСТРЕЛ" : "АТЛАС 07",
            class: cls,
            model,
            hull: "needle",
            wings: "swept",
            color: cls === "exploration" && model === 1 ? "ochre" : "ivory",
            engine: "ion",
            module: "standard",
            finish: "ceramic",
            livery: cls === "combat" ? "obsidian" : "helix",
          };
          s.model = s.kit.ship(design);
          s.scene.add(s.model);
          const box = new T.Box3().setFromObject(s.model),
            center = box.getCenter(new T.Vector3()),
            size = box.getSize(new T.Vector3()),
            r = Math.max(size.x, size.y, size.z);
          s.camera.position
            .copy(center)
            .add(new T.Vector3(r * 1.0, r * 0.72, r * 1.25));
          s.camera.lookAt(center);
          s.renderer.render(s.scene, s.camera);
          const capture = document.createElement("canvas");
          capture.width = 1200;
          capture.height = 900;
          capture.getContext("2d").drawImage(s.renderer.domElement, 0, 0);
          const png = capture.toDataURL();
          // Pure black top silhouette, fixed orthographic scale for all nine frames.
          const flat = new T.MeshBasicMaterial({ color: 0x000000 }),
            bg = s.scene.background;
          s.scene.overrideMaterial = flat;
          s.scene.background = new T.Color(0xffffff);
          s.scene.remove(
            s.scene.children.find((o) => o.isMesh && o !== s.model),
          );
          const camera = new T.OrthographicCamera(
            -3.5,
            3.5,
            3.5,
            -3.5,
            0.1,
            30,
          );
          camera.position.set(0, 15, 0);
          camera.up.set(0, 0, -1);
          camera.lookAt(0, 0, 0);
          s.renderer.render(s.scene, camera);
          const mask = document.createElement("canvas");
          mask.width = 48;
          mask.height = 48;
          const c = mask.getContext("2d");
          c.drawImage(s.renderer.domElement, 0, 0, 48, 48);
          const pixels = c.getImageData(0, 0, 48, 48).data;
          const bits = Array.from({ length: 48 * 48 }, (_, i) =>
            pixels[i * 4] < 128 ? "1" : "0",
          ).join("");
          s.scene.overrideMaterial = null;
          s.scene.background = bg;
          flat.dispose();
          return {
            png,
            bits,
            name: s.model.userData.frameName,
            triangles: s.renderer.info.render.triangles,
          };
        },
        { cls, model },
      );
      masks.add(result.bits);
      fleet.push({ name: result.name, png: result.png });
      await writeFile(
        `test-results/atlas-${cls}-${model}.png`,
        Buffer.from(result.png.split(",")[1], "base64"),
      );
      console.log("PASS distinct real frame", result.name, result.triangles);
    }
  assert.equal(
    masks.size,
    9,
    "all nine untextured top silhouettes differ at the same scale",
  );
  const grid = await page.evaluate(async (fleet) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1440;
    canvas.height = 1160;
    const c = canvas.getContext("2d");
    c.fillStyle = "#263632";
    c.fillRect(0, 0, 1440, 1160);
    for (let i = 0; i < fleet.length; i++) {
      const img = new Image();
      img.src = fleet[i].png;
      await img.decode();
      const x = (i % 3) * 480,
        y = Math.floor(i / 3) * 385;
      c.drawImage(img, x, y, 480, 360);
      c.fillStyle = "#eef1e5";
      c.font = "16px sans-serif";
      c.fillText(fleet[i].name, x + 12, y + 378, 455);
    }
    return canvas.toDataURL();
  }, fleet);
  await writeFile(
    "test-results/atlas-fleet.png",
    Buffer.from(grid.split(",")[1], "base64"),
  );
  for (const kind of [
    "house",
    "headquarters",
    "warehouse",
    "refinery",
    "shipyard",
    "scanner",
    "planetdrill",
  ]) {
    for (const night of [false, true]) {
      const metrics = await page.evaluate(
        async ({ kind, night }) => {
          const s = window.studio,
            T = s.T;
          if (s.model) {
            s.scene.remove(s.model);
            s.model.traverse((o) => {
              if (o.isInstancedMesh) o.dispose();
            });
          }
          s.model =
            kind === "refinery"
              ? s.kit.architecture.build(kind)
              : s.kit.building(kind, "home", kind === "scanner" ? 3 : 1);
          s.scene.add(s.model);
          const box = new T.Box3().setFromObject(s.model),
            center = box.getCenter(new T.Vector3()),
            size = box.getSize(new T.Vector3()),
            r = Math.max(size.x, size.y, size.z);
          s.camera.position
            .copy(center)
            .add(new T.Vector3(r * 1.0, r * 0.65, r * 1.35));
          s.camera.lookAt(center);
          s.scene.background = new T.Color(night ? 0x18252b : 0x899693);
          s.scene.environmentIntensity = night ? 0.16 : 0.75;
          s.sun.intensity = night ? 0.12 : 2.8;
          s.fill.intensity = night ? 0.2 : 1;
          s.hemi.intensity = night ? 0.22 : 1.25;
          const { updateIndustrialLights } = await import(
            "/src/world/IndustrialLighting.ts"
          );
          updateIndustrialLights(
            s.scene,
            center,
            night ? 0 : 1,
            "high",
            performance.now() / 1000 + 2,
          );
          s.renderer.render(s.scene, s.camera);
          await new Promise(requestAnimationFrame);
          s.renderer.render(s.scene, s.camera);
          return {
            triangles: s.renderer.info.render.triangles,
            calls: s.renderer.info.render.calls,
          };
        },
        { kind, night },
      );
      await page.screenshot({
        path: `test-results/atlas-${kind}-${night ? "night" : "day"}.png`,
      });
      console.log(
        "PASS building",
        kind,
        night ? "night" : "day",
        JSON.stringify(metrics),
      );
    }
  }
  assert.deepEqual(errors, []);
  await page.close();
} finally {
  await browser.close();
}
