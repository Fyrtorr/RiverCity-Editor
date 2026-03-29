# River City Ransom (USA) - ROM Technical Documentation

## ROM Structure

River City Ransom uses the standard iNES ROM format for NES cartridges.

| Section | Size | Description |
|---------|------|-------------|
| Header | 16 bytes | iNES header (`NES\x1A` magic + bank counts + flags) |
| PRG ROM | 8 x 16,384 bytes (128 KB) | Program banks (code + data) |
| CHR ROM | 16 x 8,192 bytes (128 KB) | Character/tile graphics banks |
| **Total** | **262,160 bytes** | |

### iNES Header

```
Offset  Value   Meaning
0x00    4E 45 53 1A   "NES" + EOF marker
0x04    08            8 PRG banks (16 KB each)
0x05    10            16 CHR banks (8 KB each)
0x06    40            Mapper flags (mapper 4 - MMC3)
0x07-0F 00...         Padding
```

### Bank Absolute Offsets

To convert a bank-relative address to an absolute ROM file offset:

```
PRG bank N, offset X  ->  ROM offset = 16 + (N * 16384) + X
CHR bank N, offset X  ->  ROM offset = 16 + (8 * 16384) + (N * 8192) + X
```

| Bank | ROM Start | ROM End |
|------|-----------|---------|
| PRG 0 | 0x000010 | 0x004010 |
| PRG 1 | 0x004010 | 0x008010 |
| PRG 2 | 0x008010 | 0x00C010 |
| PRG 3 | 0x00C010 | 0x010010 |
| PRG 4 | 0x010010 | 0x014010 |
| PRG 5 | 0x014010 | 0x018010 |
| PRG 6 | 0x018010 | 0x01C010 |
| PRG 7 | 0x01C010 | 0x020010 |

---

## Text Encoding

RCR does **not** use ASCII. It has a custom character encoding where each byte maps to a display character. Strings are terminated with byte `0x05`.

### Character Map

| Byte Range | Characters |
|------------|-----------|
| 0x00 | Space |
| 0x3A | `'` (apostrophe) |
| 0xB0-0xBD | Punctuation: `* " ! ? - % . : ; & , > # _` |
| 0xC0-0xCF | `A B C D E F G H I J K L M N O P` |
| 0xD0-0xD9 | `Q R S T U V W X Y Z` |
| 0xDA-0xDF | `a b c d e f` |
| 0xE0-0xEF | `g h i j k l m n o p q r s t u v` |
| 0xF0-0xF3 | `w x y z` |
| 0xF4-0xFD | `0 1 2 3 4 5 6 7 8 9` |
| 0xFE | `$` |

### Control Codes

| Byte | Symbol | Meaning |
|------|--------|---------|
| 0x01 | `@` | Insert player 1 name |
| 0x02 | `\|` | Insert object/item name |
| 0x03 | `[` | Insert numeric value |
| 0x04 | `~` | Insert player 2 name |
| 0x05 | — | String terminator |
| 0x06 | `^` | Newline |
| 0x0A | `\` | Newline without indent |

---

## Pointer Tables

Most variable-length data (strings, item records) is stored via **pointer tables**. A pointer table is an array of 2-byte little-endian addresses, each pointing to the actual data within the same bank.

### Pointer OR Mask

Stored pointers typically have `0x8000` OR'd into them (a CPU addressing artifact). To get the bank-relative offset:

```
actual_offset = stored_pointer & ~0x8000
actual_offset = stored_pointer & 0x3FFF
```

Some data types (shop names) use `ptr_OR = 0` with a `data_start` base offset instead.

### String Deduplication

Multiple pointer entries can reference the same string data. The game uses this to save space — identical strings share one copy in ROM. The original BARF project also implemented **suffix sharing**, where a shorter string can point into the middle of a longer one if it matches the tail.

---

## Data Map (English / USA Version)

### PRG Bank 0 — NPC Names + Location Boundaries

| Address | End | Type | Count | Description |
|---------|-----|------|-------|-------------|
| 0x39EC | 0x3A78 | Boundary pairs | 35 | Location scroll boundaries (min, max-256 as uint16 LE pairs) |
| 0x3D48 | 0x4000 | Pointer table + strings | 77 | NPC names |

**NPC Names** — 77 character names used throughout the game. Pointer table at 0x3D48 (77 x 2 = 154 bytes), string data at 0x3DE4+. Names include: Larry, Barry, Terry, Jerry, Cary, Gary, Harry, Perry, Ralph, Slash, Edge, Blaze, etc.

**Location Boundaries** — 35 entries, 4 bytes each. Two uint16 LE values per location: minimum camera scroll position and (maximum - 256). The 256 offset accounts for the screen width.

### PRG Bank 1 — NPC Dialogue + Location Data

| Address | End | Type | Count | Description |
|---------|-----|------|-------|-------------|
| 0x0020 | 0x1C00 | Pointer table + strings | 170 | NPC dialogue |
| 0x1CBB | 0x1CDE | Byte array | 35 | Location name codes (index into misc text) |
| 0x243D | 0x2748 | Entrance points | varies | Location entry/spawn points |
| 0x2748 | 0x2C39 | Exit zones | varies | Location exit zone definitions |

**NPC Dialogue** — 170 conversation strings. These include boss taunts, NPC hints, and story dialogue. Example: `MOOSE: "Hold it! Rocko says^punks can't pass."`

**Location Name Codes** — Each byte is an index into the misc text table (PRG 3). Value 0 = unnamed location.

**Entrance Points** — Complex structure: 5-byte entries (location ID, camera position pointer, player position pointer) with referenced position data containing player 1/2 spawn coordinates and camera position.

**Exit Zones** — Hierarchical pointer structure defining trigger rectangles for location transitions. Each zone includes: target type (shop/location), target ID, bounding box coordinates, direction flags, locked status, and optional door index.

### PRG Bank 2 — Shops (Names, Items, Stock, Dialogue)

| Address | End | Type | Count | Description |
|---------|-----|------|-------|-------------|
| 0x1C0C | 0x1DBE | Pointer table + strings | 24 | Shop names (ptr_OR=0, data_start base) |
| 0x1F46 | 0x21D2 | Pointer table + strings | 44 | Shop dialogue |
| 0x2339 | 0x2351 | Byte array | 24 | Shop submenu codes |
| 0x2351 | 0x23E2 | Pointer table + strings | 3 | Shop submenu names |
| 0x23F5 | 0x24F9 | Pointer table + byte lists | 30 | Shop inventories (item ID lists, 0xFF terminated) |
| 0x24F9 | 0x2FA3 | Pointer table + item records | 128 | Buyable items |

**Shop Names** — 24 shops with multi-line names using `^` for newlines. Uses a special pointer format with `ptr_OR = 0` and `base = data_start`. Examples: "Grotto^Book^Store", "Merv's^Burger^Joint", "Merlin's^Mystery^Shop".

**Shop Inventories** — 30 stock lists. Each is a sequence of item ID bytes terminated by `0xFF`. Maps which items are available at each shop.

#### Buyable Item Record Format

Items 1-125 have a variable-length record structure:

```
[name bytes...] [0x05 terminator]     — Item name (custom encoding)
[cost_lo] [cost_mid] [cost_hi]        — Price in BCD (Decimal-as-Hex, 3 bytes)
[unknown]                              — Consumed (0x80) vs equipped behavior
[action1] [action2]                    — Action string indices (0xFF = none)
[stat_flags_1] [stat_flags_2]          — Bitmask indicating which stats follow
[stat values...]                       — One byte per flagged stat (0-255)
```

**Stat Flag Bits** (stat_flags_1):

| Bit | Stat |
|-----|------|
| 0x01 | Will Power (secondary slot) |
| 0x02 | Strength |
| 0x04 | Defence |
| 0x08 | Agility |
| 0x10 | Throw |
| 0x20 | Will Power (primary slot) |
| 0x40 | Kick |
| 0x80 | Punch |

**Stat Flag Bits** (stat_flags_2):

| Bit | Stat |
|-----|------|
| 0x80 | Stamina |

Stat value bytes appear in the ROM in the order the flags are checked (SG, D, AG, TH, WP, K, P, WP2, ST). Some items have both WP slots active with different values.

### PRG Bank 3 — Misc Text + Sprites

| Address | End | Type | Count | Description |
|---------|-----|------|-------|-------------|
| 0x0000 | 0x3200 | Sprite collection | varies | Sprite sets (read-only, complex pointer structure) |
| 0x3200 | 0x3E00 | Pointer table + strings | ~131 | Misc/UI text strings |

**Misc Text** — 131 strings including action descriptions ("@ ate the |."), stat-up messages ("PUNCH is up by[."), location names, and UI text. The `@` `|` `[` characters are variable placeholders.

### PRG Bank 4 — Gang Member Templates + Boss Stats + Gang Probability

| Address | End | Type | Count | Description |
|---------|-----|------|-------|-------------|
| 0x35F1 | 0x36A9 | Pointer table + dec-as-hex lists | 35 | Gang spawn probability per location |
| 0x39D6 | 0x3A27 | Stat templates | 9 x 9 bytes | Gang member specialization templates (unconfirmed) |
| 0x3A27 | 0x3AA5 | Stats block | 9 x 9 bytes | Boss combat stats |

**Boss Stats** — 9 stat blocks of 9 bytes each. The stat byte order used by the barf-master project is: Punch, Kick, Weapon, Throw, Agility, Defence, Strength, WillPower, Stamina. Raw ROM values are shown below.

| Index | Byte 0 | Byte 1 | Byte 2 | Byte 3 | Byte 4 | Byte 5 | Byte 6 | Byte 7 | Byte 8 |
|-------|--------|--------|--------|--------|--------|--------|--------|--------|--------|
| 0 | 26 | 35 | 23 | 28 | 25 | 25 | 22 | 24 | 52 |
| 1 | 39 | 38 | 45 | 33 | 39 | 39 | 36 | 36 | 74 |
| 2 | 40 | 39 | 36 | 34 | 47 | 40 | 35 | 35 | 72 |
| 3 | 34 | 34 | 31 | 45 | 32 | 33 | 31 | 31 | 70 |
| 4 | 28 | 27 | 29 | 26 | 39 | 29 | 25 | 26 | 46 |
| 5 | 28 | 27 | 29 | 27 | 30 | 37 | 25 | 25 | 48 |
| 6 | 39 | 39 | 37 | 35 | 38 | 39 | 45 | 34 | 72 |
| 7 | 42 | 41 | 38 | 37 | 40 | 50 | 37 | 36 | 78 |
| 8 | 45 | 46 | 42 | 40 | 43 | 44 | 42 | 42 | 104 |

> **Stat byte order — CONFIRMED by disassembly.** The game code at PRG4 $B83E-$B883 loads
> each template byte sequentially and stores them to RAM addresses that the cheating guide
> independently identified. The mapping is: byte 0 -> $049F (Punch), byte 1 -> $04A3 (Kick),
> byte 2 -> $04A7 (Weapon), byte 3 -> $04AB (Throw), byte 4 -> $04AF (Agility),
> byte 5 -> $04B3 (Defence), byte 6 -> $04B7 (Strength), byte 7 -> $04BB (WillPower),
> byte 8 -> $04BF (Stamina). The barf-master project's stat order is correct.
> The EnemyStatusList fan document had Throw and Strength values transposed in its listings.

> **Open question: Boss index-to-name mapping.** The ROM stores 9 anonymous stat blocks. The
> barf-master project labels them: Rocko, Blade, Turk, Mojo, Thor, Ivan, Otis, Tex, Simon.
> The EnemyStatusList suggests a different mapping (index 0 = Moose, 1 = Mojo, 3 = Rocko, etc.)
> based on stat value matching. The game has 14 named bosses but only 9 stat blocks, suggesting
> some bosses share stats or derive them at runtime. Confirming this requires game code disassembly.

**Gang Member Specialization Templates (unconfirmed)** — At 0x39D6, immediately before the boss stats, there appear to be 9 blocks of 9 bytes each (81 bytes total). Each block has one stat value elevated to 14 while others are in the 4-6 range, with the elevated stat rotating across blocks:

| Block | Elevated Stat (position) | Pattern |
|-------|--------------------------|---------|
| 0 | Byte 0 = 14 | Punch specialist |
| 1 | Byte 1 = 14 | Kick specialist |
| 2 | Byte 2 = 14 | Weapon specialist |
| 3 | Byte 3 = 14 | Byte 3 specialist |
| 4 | Byte 4 = 14 | Byte 4 specialist |
| 5 | Byte 5 = 14 | Byte 5 specialist |
| 6 | Byte 6 = 14 | Byte 6 specialist |
| 7 | Byte 7 = 14 | WillPower specialist |
| 8 | Byte 8 = 28 | Stamina specialist (leader) |

This pattern matches the in-game behavior where each gang has 9 members, each specializing
in one stat. The "14" value is a base template that the game scales per-gang through a
subroutine at PRG4 $B900. The 9th member (gang leader) always has the highest stamina.

**Confirmed by disassembly.** The code at PRG4 $B832-$B88C calculates a member's stat slot
index as `(gang_member_type * 8) + gang_member_type` (i.e., `* 9`) and uses it as Y-index
into the template table at $B9D6. Each template byte is passed through the scaling subroutine
at $B900, which adds a difficulty modifier (from $B946,Y indexed by a game progression value
at RAM $064C) and clamps stats to max 63 (0x3F), or max 127 (0x7F) for stamina.

**Additional data tables in the region:**

| Address | End | Description |
|---------|-----|-------------|
| 0x3946 | 0x3999 | Difficulty scaling offsets (indexed by progression level) |
| 0x3999 | 0x39A2 | Enemy configuration data (referenced at $B820) |
| 0x39A2 | 0x39D6 | Additional enemy/gang lookup tables |
| 0x39D6 | 0x3A27 | Gang member stat templates (9 x 9 bytes, confirmed) |
| 0x3A27 | 0x3AA5 | Boss stat blocks (9 x 9 bytes) |

**Gang Spawn Probability** — Per-location arrays of percentages (one per gang, stored as Decimal-as-Hex). Terminated by value 99 (byte `0x63`).

### PRG Bank 6 — Gang Turf Codes

| Address | End | Type | Count | Description |
|---------|-----|------|-------|-------------|
| 0x35D0 | 0x35D9 | Byte array | 9 | Gang turf title codes |

### PRG Bank 7 — Location Properties + Cash + Palettes

| Address | End | Type | Count | Description |
|---------|-----|------|-------|-------------|
| 0x10CC | 0x10EF | Byte array | 35 | Location pacifist mode (0=off, nonzero=on) |
| 0x26F1 | 0x2B9D | Pointer table + palettes | varies | NES color palettes (16 bytes each) |
| 0x2C2A | 0x2C3C | DecAsHex couplets | 9 | Gang cash rewards (2 bytes each) |
| 0x2C3C | 0x2C54 | DecAsHex couplets | 9 | Boss cash rewards (2 bytes each) |
| 0x3057 | 0x307A | Byte array | 35 | Location music track IDs |
| 0x349A | 0x34BD | Byte array | 35 | Location reincarnation point IDs |

---

## Decimal-as-Hex Encoding

RCR stores many numeric values using a "decimal-as-hex" scheme (also called BCD — Binary Coded Decimal). The hex representation of a byte IS the decimal value.

```
Byte 0x80 = decimal 80
Byte 0x36 = decimal 36
Byte 0x09 = decimal 9
```

### Couplets (2 bytes) — values 0-9999

Used for cash rewards (gang/boss cash). Two bytes: low byte = ones/tens, high byte = hundreds/thousands.

```
$2.25 = 225 cents -> byte 0: 0x25, byte 1: 0x02
$12.50 = 1250 cents -> byte 0: 0x50, byte 1: 0x12
```

### Triplets (3 bytes) — values 0-999999

Used for shop item prices. Three bytes: cents, dollars-low, dollars-high.

```
$0.80 = 80 cents -> bytes: 0x80, 0x00, 0x00
$1.50 = 150 cents -> bytes: 0x50, 0x01, 0x00
$99.95 = 9995 cents -> bytes: 0x95, 0x99, 0x00
```

---

## RAM Layout (from Cheating Guide + Disassembly)

The NES RAM addresses for player/NPC stats were documented in the "Ultimate Cheating Guide" by proVEREN (2002) and confirmed by disassembly of the stat-loading code at PRG4 $B83E-$B88C.

### Player Stats (RAM)

| Stat | Player 1 | Player 2 | Max Value |
|------|----------|----------|-----------|
| Punch | $049F | $04A0 | 63 |
| Kick | $04A3 | $04A4 | 63 |
| Weapon | $04A7 | $04A8 | 63 |
| Throwing | $04AB | $04AC | 63 |
| Agility | $04AF | $04B0 | 63 |
| Defense | $04B3 | $04B4 | 63 |
| Strength | $04B7 | $04B8 | 63 |
| Will Power | $04BB | $04BC | 63 |
| Stamina | $04BF | $04C0 | 126 |
| Max Power | $04C3 | $04C4 | 126 |

Note: Stats are 4 bytes apart (P1 and P2 are adjacent, with 2 unused bytes between stat groups). Max stat value is 63 (0x3F) for combat stats, enforced by the scaling subroutine at PRG4 $B900 via `CMP #$40`. Stamina max is 127 (0x7F), enforced via `CMP #$80` in the parallel subroutine at $B923.

### Money (RAM)

| Digits | Player 1 | Player 2 | Max Value | Encoding |
|--------|----------|----------|-----------|----------|
| Cents ($0.xx) | $04C7 | $04CA | 153 (= hex 0x99) | Decimal-as-hex |
| Dollars ($xx.00) | $04C8 | $04CB | 153 (= hex 0x99) | Decimal-as-hex |
| Hundreds ($x00.00) | $04C9 | $04CC | 9 | Plain decimal |

Maximum in-game money: $999.99. The cents and dollar digits use decimal-as-hex encoding (byte 0x99 = 99 in decimal, stored as raw value 153).

---

## Known ROM Versions

| Title | Region | MD5 Hash |
|-------|--------|----------|
| River City Ransom | USA | `294e4fa092db8e29d83f71e137d1f99f` |
| Street Gangs | Europe | `85b04422036fe18c0e91eae39c8a95b7` |
| Downtown Nekketsu Monogatari | Japan | `36d2761cdb328ca87777d4ee3ba02324` |

The Japanese version has different ROM addresses for most data. The English (USA/Europe) versions share the same layout.

### Version Detection

Check PRG bank 7 at offsets 0x0AFD-0x0AFF. If the bytes are `E8 8A 29`, it's the English version. Otherwise, it's Japanese.

---

## Game Data Summary

| Data Type | Count | Editable |
|-----------|-------|----------|
| NPC Names | 77 | Yes (in-place, max length constrained) |
| NPC Dialogue | 170 | Yes (in-place, max length constrained) |
| Shop Names | 24 | Yes (in-place) |
| Shop Items | 128 | Yes (name, price, stat values) |
| Shop Stock Lists | 30 | Read-only |
| Boss Stats | 9 bosses x 9 stats | Yes |
| Boss Cash Rewards | 9 | Yes |
| Gang Member Templates | 9 slots x 9 stats | Not yet (confirmed by disassembly) |
| Gang Cash Rewards | 9 | Yes |
| Gang Turf Codes | 9 | Yes |
| Locations | 35 | Yes (music, boundaries, pacifist, reincarnation) |
| Location Entry Points | varies | Read-only |
| Location Exit Zones | varies | Read-only |
| Misc/UI Text | ~131 | Yes (in-place) |
| Sprites | varies | Not yet supported |
| Palettes | varies | Not yet supported |

---

## References

- **BARF! v0.2** (2009) — Original Lua/wxLua ROM editor by the RCR hacking community
- **barf-master** — Python rewrite with expanded data support, Japanese version support, and location editing
