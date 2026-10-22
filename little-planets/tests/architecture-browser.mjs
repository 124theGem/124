import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
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
    window.studio = { renderer, scene, camera, kit, T };
    return true;
  });
  assert(inventory);
  for (const kind of [
    "headquarters",
    "warehouse",
    "refinery",
    "shipyard",
    "scanner",
    "planetdrill",
    "ship",
  ]) {
    const metrics = await page.evaluate(async (kind) => {
      const s = window.studio,
        T = s.T;
      if (s.model) {
        s.scene.remove(s.model);
        s.model.traverse((o) => {
          if (o.isInstancedMesh) o.dispose();
        });
      }
      const model =
        kind === "ship"
          ? s.kit.ship({
              id: "studio",
              name: "АТЛАС 07",
              class: "cargo",
              model: 3,
              hull: "freighter",
              wings: "delta",
              color: "ivory",
              engine: "fusion",
              module: "hold",
              finish: "titanium",
              livery: "helix",
            })
          : kind === "refinery"
            ? s.kit.architecture.build(kind)
            : s.kit.building(kind, "home", kind === "scanner" ? 3 : 1);
      s.model = model;
      s.scene.add(model);
      const bounds = new T.Box3().setFromObject(model),
        size = bounds.getSize(new T.Vector3()),
        target = bounds.getCenter(new T.Vector3()),
        radius = Math.max(size.x, size.y, size.z);
      s.camera.position
        .copy(target)
        .add(new T.Vector3(radius * 1.25, radius * 0.8, radius * 1.65));
      s.camera.lookAt(target);
      document.querySelector("#label").textContent =
        "OUTPOST / " + kind.toUpperCase() + "  —  ACTUAL GAME MODEL";
      s.renderer.render(s.scene, s.camera);
      await new Promise(requestAnimationFrame);
      s.renderer.render(s.scene, s.camera);
      return {
        triangles: s.renderer.info.render.triangles,
        calls: s.renderer.info.render.calls,
        kind: model.userData.kind ?? kind,
      };
    }, kind);
    assert(metrics.triangles > 1000);
    await page.screenshot({ path: `test-results/outpost-${kind}.png` });
    console.log("PASS PBR building render", kind, JSON.stringify(metrics));
  }
  assert.deepEqual(errors, []);
  await page.close();
} finally {
  await browser.close();
}
