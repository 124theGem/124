import * as T from "three";

/** A permanent, double-sided sign beside the original home landing site. */
export class HomeSign {
  readonly root = new T.Group();
  private box = new T.BoxGeometry(1, 1, 1);
  private face = new T.PlaneGeometry(2.6, 0.95);
  private frame = new T.MeshStandardMaterial({ color: 0x35464c, roughness: 0.75 });
  private texture?: T.CanvasTexture;
  private lettering = new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });

  constructor() {
    this.root.name = "home-earth-sign";
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 384;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#26383d";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#a7c9c5";
      ctx.lineWidth = 6;
      ctx.strokeRect(18, 18, 988, 348);
      ctx.fillStyle = "#f2f4e9";
      ctx.beginPath();
      ctx.moveTo(70, 192);
      ctx.lineTo(180, 92);
      ctx.lineTo(180, 152);
      ctx.lineTo(300, 152);
      ctx.lineTo(300, 232);
      ctx.lineTo(180, 232);
      ctx.lineTo(180, 292);
      ctx.closePath();
      ctx.fill();
      ctx.font = "600 138px sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText("Земля", 355, 198, 590);
      this.texture = new T.CanvasTexture(canvas);
      this.texture.colorSpace = T.SRGBColorSpace;
      this.lettering.map = this.texture;
    }
    const part = (x: number, y: number, w: number, h: number, d: number) => {
      const mesh = new T.Mesh(this.box, this.frame);
      mesh.position.set(x, y, 0);
      mesh.scale.set(w, h, d);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
    };
    part(-0.95, 0.9, 0.11, 1.8, 0.11);
    part(0.95, 0.9, 0.11, 1.8, 0.11);
    part(0, 1.9, 2.72, 1.07, 0.12);
    for (const side of [-1, 1]) {
      const label = new T.Mesh(this.face, this.lettering);
      label.position.set(0, 1.9, side * 0.062);
      if (side < 0) label.rotation.y = Math.PI;
      this.root.add(label);
    }
  }

  dispose() {
    this.box.dispose();
    this.face.dispose();
    this.frame.dispose();
    this.lettering.dispose();
    this.texture?.dispose();
  }
}
