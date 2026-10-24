import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, resample } from '@gltf-transform/functions';
import { readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const folder = fileURLToPath(new URL('../public/models/', import.meta.url));
const keep = new Set([
  'Idle',
  'Running_A',
  'Walking_A',
  '1H_Melee_Attack_Chop',
  '1H_Melee_Attack_Slice_Horizontal',
  '1H_Melee_Attack_Slice_Diagonal',
  '1H_Melee_Attack_Stab',
  '2H_Melee_Attack_Chop',
  '2H_Melee_Attack_Slice',
  '2H_Melee_Attack_Spin',
  '2H_Melee_Attack_Stab',
  '2H_Ranged_Shoot',
  '1H_Ranged_Shoot',
  'Dualwield_Melee_Attack_Slice',
  'Block_Attack',
  'Spellcast_Long',
  'Spellcast_Raise',
  'Spellcast_Shoot',
  'Dodge_Forward',
  'Hit_A',
  'Death_A',
  'Cheer',
]);
const io = new NodeIO();
let before = 0,
  after = 0;
for (const file of (await readdir(folder)).filter((f) =>
  /^(Knight|Mage|Rogue|Barbarian|Skeleton_).*\.glb$/.test(f),
)) {
  const path = `${folder}/${file}`,
    doc = await io.read(path);
  before += (await stat(path)).size;
  for (const animation of doc.getRoot().listAnimations())
    if (!keep.has(animation.getName())) animation.dispose();
  await doc.transform(
    resample({ tolerance: 0.0001 }),
    dedup(),
    prune({ keepAttributes: true, keepLeaves: true }),
  );
  await io.write(path, doc);
  after += (await stat(path)).size;
  console.log(`${file}: ${doc.getRoot().listAnimations().length} retained clips`);
}
console.log(`Animated assets: ${(before / 1e6).toFixed(2)} MB → ${(after / 1e6).toFixed(2)} MB`);
