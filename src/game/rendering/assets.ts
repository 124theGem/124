import { AssetContainer } from '@babylonjs/core/assetContainer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Scene } from '@babylonjs/core/scene';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import '@babylonjs/loaders/glTF/2.0/glTFLoader';
export const MODEL_FILES: Record<string, string> = {
  Knight: 'Knight.glb',
  Barbarian: 'Barbarian.glb',
  Mage: 'Mage.glb',
  Rogue: 'Rogue.glb',
  Rogue_Hooded: 'Rogue_Hooded.glb',
  Skeleton_Warrior: 'Skeleton_Warrior.glb',
  Skeleton_Rogue: 'Skeleton_Rogue.glb',
  Skeleton_Minion: 'Skeleton_Minion.glb',
  Skeleton_Mage: 'Skeleton_Mage.glb',
};
/** Replace entries with licensed, compatible GLB files. Rendering never owns gameplay state. */
export class AssetLibrary {
  private cache = new Map<string, Promise<AssetContainer>>();
  constructor(private scene: Scene) {}
  load(name: string) {
    let pending = this.cache.get(name);
    if (!pending) {
      pending = LoadAssetContainerAsync(
        `${import.meta.env.BASE_URL}models/${MODEL_FILES[name] ?? name + '.glb'}`,
        this.scene,
      ).then((container) => {
        if (!MODEL_FILES[name])
          for (const m of container.materials)
            if (m instanceof PBRMaterial) {
              m.albedoColor = new Color3(0.52, 0.67, 0.64);
              m.roughness = 0.95;
            }
        return container;
      });
      this.cache.set(name, pending);
    }
    return pending;
  }
  async dispose() {
    for (const promise of this.cache.values()) {
      try {
        (await promise).dispose();
      } catch {
        /* A rejected load has no GPU resources. */
      }
    }
    this.cache.clear();
  }
}
