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

/** Complete the real introductory rules before unrelated flight regression fixtures. */
export function prologueActions(): import("../shared/model").Action[] {
  return [
    { type: "story", step: "begin" },
    ...[
      { x: 8, z: 13 },
      { x: 7, z: 14 },
      { x: 9, z: 15 },
    ].flatMap((at, index): import("../shared/model").Action[] => [
      { type: "move", ...at },
      { type: "story", step: "plant", index },
    ]),
    { type: "move", x: 6.5, z: 11 },
    { type: "story", step: "meteor" },
    { type: "move", x: 11.5, z: 11.5 },
    { type: "story", step: "repair" },
    { type: "story", step: "launch" },
    { type: "story", step: "finish" },
  ];
}
