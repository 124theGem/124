export function legacySave() {
  const save: any = {
    version: 1,
    revision: 12,
    planet: "listoria",
    position: { x: 8, z: 11 },
    inventory: { wood: 45, stone: 18, "seed:carrot": 5, "crop:sunflower": 9 },
    updatedAt: 1000,
    worlds: {},
  };
  for (const p of ["listoria", "mycelia", "pyros"])
    save.worlds[p] = {
      crops: {},
      depleted: {},
      buildings: [
        { id: "starter-home", kind: "house", x: 3, z: 3, rotation: 0 },
      ],
    };
  save.worlds.listoria.crops["6,9"] = { plant: "carrot", plantedAt: 100 };
  save.worlds.mycelia.depleted["node-1"] = 500;
  save.worlds.pyros.buildings.push({
    id: "built-house",
    kind: "warehouse",
    x: 7,
    z: 5,
    rotation: 1,
  });
  return save;
}
