# Sprite/Tile Viewing & Editing — Implementation Plan

## Phase 1: CHR Tile Viewer

**Goal:** Render all 8x8 pixel tiles from any CHR bank in a browsable grid with palette selection.

**Status:** Not started

### What it does
- Dropdown to select CHR bank (0-15, 512 tiles each)
- Tile grid canvas rendering all 512 tiles at 2x scale (16 columns x 32 rows)
- Click a tile to see it enlarged in the edit panel
- Dropdown to select from 92 ROM palettes or a default grayscale
- Hex view of the selected tile's 16 raw bytes
- Read-only (no modification)

### Technical notes
- CHR tile format: 16 bytes per tile, planar (bytes 0-7 = low bitplane, 8-15 = high bitplane)
- Each pixel = 2 bits (4 color indices), decoded MSB-first left to right
- Color 0 = transparent/background
- NES system palette: 64 colors with fixed RGB values
- Canvas `putImageData()` for pixel rendering, CSS `image-rendering: pixelated` for scaling

---

## Phase 2: Sprite Assembly Viewer

**Goal:** Parse sprite metadata from PRG3 and display assembled multi-tile character sprites.

**Status:** Not started

### What it does
- Left panel: tree of 39 sprite sets, expandable to show individual sprites
- Canvas rendering assembled sprites (multiple tiles composited with flags)
- CHR bank selector (sprites source tiles from specific banks via MMC3 bank switching)
- Read-only

### Technical notes
- Sprite metadata in PRG3 0x0000-0x3200 (pointer table to sprite sets)
- Each sprite = 2 bytes: flags + tile reference
- Flags encode: horizontal/vertical flip, palette selection, priority
- Port SpriteCollection.read() logic from barf-master chunks.py
- Need to handle null pointers, inline sprites, data_start tracking

---

## Phase 3: Tile Editor

**Goal:** Allow pixel-level editing of CHR tile data with live preview.

**Status:** Not started

### What it does
- Selected tile rendered at 32x scale (256x256 px) for pixel editing
- 4-color palette shown as clickable swatches
- Click/drag on canvas to paint pixels
- Live preview in tile grid
- Hex diff view (original vs modified bytes)
- Single-level undo
- Changes written to ROM on save

### Technical notes
- Encoding: build two bitplanes from 2-bit pixel indices (reverse of decoding)
- CHR banks are mutable Uint8Arrays, buildROM() copies them to output
- Reuse existing split hex diff viewer for showing tile byte changes
