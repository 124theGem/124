HEAL BURST — animated healing VFX asset for Babylon.js / Telegram Mini App

Files:
- heal_vfx_atlas_6x6.png : transparent RGBA sprite sheet, 6 columns x 6 rows, 320x320 cell, 36 frames, one-shot.
- heal_vfx_transparent.webp : animated RGBA reference, 24 FPS, 1.5s.
- heal_vfx_preview.gif : dark-background animation preview (NOT a source texture).
- heal_vfx_keyframes.png : representative frames for visual review.
- heal_vfx_babylon.ts : Babylon.js renderer usage, call effect.play(worldPosition).

Visual language: rounded arcade spell shape, turquoise-green magic aura, elliptical expanding ground rings, rising particles, warm mint cross.
Skill is a single one-shot, NOT a looping aura.
Sprite billboards toward camera. Position about 0.7m above ground for player sized 1.6–2.0m.
Gameplay: healing amount and effect timing are controlled separately by game logic; VFX does not change HP.

License: new original VFX generated for this user; no third-party art or textures used.
