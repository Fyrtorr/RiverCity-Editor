/**
 * River City Ransom ROM Parser / Writer
 * Handles NES ROM format, RCR-specific addresses, and character encoding.
 */
const RCR = (() => {
    // --- NES Constants ---
    const HEADER_SIZE = 16;
    const PRG_BANK_SIZE = 0x4000; // 16384
    const CHR_BANK_SIZE = 0x2000; // 8192
    const STRING_TERMINATOR = 0x05;

    // --- RCR Character Map ---
    const charmap = {
        0x00: ' ',
        0x3A: "'",
        0xB0: '*', 0xB1: '"', 0xB2: '!', 0xB3: '?', 0xB4: '-', 0xB5: '%',
        0xB6: '.', 0xB7: ':', 0xB8: ';', 0xB9: '&', 0xBA: ',', 0xBB: '>',
        0xBC: '#', 0xBD: '_',
        0xC0: 'A', 0xC1: 'B', 0xC2: 'C', 0xC3: 'D', 0xC4: 'E', 0xC5: 'F',
        0xC6: 'G', 0xC7: 'H', 0xC8: 'I', 0xC9: 'J', 0xCA: 'K', 0xCB: 'L',
        0xCC: 'M', 0xCD: 'N', 0xCE: 'O', 0xCF: 'P',
        0xD0: 'Q', 0xD1: 'R', 0xD2: 'S', 0xD3: 'T', 0xD4: 'U', 0xD5: 'V',
        0xD6: 'W', 0xD7: 'X', 0xD8: 'Y', 0xD9: 'Z', 0xDA: 'a', 0xDB: 'b',
        0xDC: 'c', 0xDD: 'd', 0xDE: 'e', 0xDF: 'f',
        0xE0: 'g', 0xE1: 'h', 0xE2: 'i', 0xE3: 'j', 0xE4: 'k', 0xE5: 'l',
        0xE6: 'm', 0xE7: 'n', 0xE8: 'o', 0xE9: 'p', 0xEA: 'q', 0xEB: 'r',
        0xEC: 's', 0xED: 't', 0xEE: 'u', 0xEF: 'v',
        0xF0: 'w', 0xF1: 'x', 0xF2: 'y', 0xF3: 'z', 0xF4: '0', 0xF5: '1',
        0xF6: '2', 0xF7: '3', 0xF8: '4', 0xF9: '5', 0xFA: '6', 0xFB: '7',
        0xFC: '8', 0xFD: '9', 0xFE: '$',
        // Control codes
        0x06: '^',  // Newline
        0x0A: '\\', // No indent after newline
        0x01: '@',  // Character name 1
        0x04: '~',  // Character name 2
        0x02: '|',  // Object name
        0x03: '[',
    };

    // Reverse map: char -> byte
    const reverseCharmap = {};
    for (const [byte, char] of Object.entries(charmap)) {
        reverseCharmap[char] = parseInt(byte);
    }

    // Valid characters for input validation
    const validChars = new Set(Object.values(charmap));

    // --- RCR ROM Addresses ---
    const addresses = {
        npcs: {
            names: { rom: 'prg', bank: 0, start: 0x3D48, length: 0x4000 - 0x3D48, count: 77, ptrOR: 0x8000 },
            conversation: { rom: 'prg', bank: 1, start: 0x0020, length: 0x1C00 - 0x0020, count: 170, ptrOR: 0x8000 },
        },
        shops: {
            conversation: { rom: 'prg', bank: 2, start: 0x1F46, length: 0x21D2 - 0x1F46, count: (0x1F9E - 0x1F46) / 2, ptrOR: 0x8000 },
            actions: { rom: 'prg', bank: 3, start: 0x3200, length: 0x3E00 - 0x3200, count: 130, ptrOR: 0x8000 },
            submenus: { rom: 'prg', bank: 2, start: 0x2351, length: 0x23E1 - 0x2351, count: (0x2357 - 0x2351) / 2, ptrOR: 0x8000 },
            items: { rom: 'prg', bank: 2, start: 0x24F9, length: 0x2FA3 - 0x24F9, count: (0x25F9 - 0x24F9) / 2, ptrOR: 0x8000 },
            stock: { rom: 'prg', bank: 2, start: 0x23F5, length: 0x24F9 - 0x23F5, count: (0x2431 - 0x23F5) / 2, ptrOR: 0x8000 },
            names: { rom: 'prg', bank: 2, start: 0x1C0C, end: 0x1DBE, count: 24, ptrOR: 0, base: 'data_start' },
        },
        bosses: {
            stats: { bank: 4, start: 0x3A27, end: 0x3AA5, count: 14 },
            cash:  { bank: 7, start: 0x2C3C, end: 0x2C58, count: 14 },
        },
        gangs: {
            cash:       { bank: 7, start: 0x2C2A, end: 0x2C3C, count: 9 },
            turfCodes:  { bank: 6, start: 0x35D0, end: 0x35D9, count: 9 },
        },
        locations: {
            count: 35,
            nameCodes:    { bank: 1, start: 0x1CBB, end: 0x1CDE },
            musicTracks:  { bank: 7, start: 0x3057, end: 0x307A },
            pacifistMode: { bank: 7, start: 0x10CC, end: 0x10EF },
            boundaries:   { bank: 0, start: 0x39EC, end: 0x3A78 },
            reincarnation:{ bank: 7, start: 0x349A, end: 0x34BD },
        },
        miscText: {
            rom: 'prg', bank: 3, start: 0x3200, end: 0x3E00, ptrOR: 0x8000,
        },
    };

    // --- Character Encoding ---
    function decodeString(bank, pos) {
        let s = '';
        while (pos < bank.length && bank[pos] !== STRING_TERMINATOR) {
            const b = bank[pos];
            s += charmap[b] !== undefined ? charmap[b] : `[${b.toString(16).padStart(2, '0')}]`;
            pos++;
        }
        return s;
    }

    function encodeString(str) {
        const bytes = [];
        for (const ch of str) {
            if (reverseCharmap[ch] !== undefined) {
                bytes.push(reverseCharmap[ch]);
            } else {
                throw new Error(`Invalid character: '${ch}'`);
            }
        }
        return bytes;
    }

    function isValidChar(ch) {
        return validChars.has(ch);
    }

    // --- ROM Parsing ---
    function parseROM(buffer) {
        const data = new Uint8Array(buffer);

        // Validate NES header
        if (data[0] !== 0x4E || data[1] !== 0x45 || data[2] !== 0x53 || data[3] !== 0x1A) {
            throw new Error('Not a valid NES ROM file');
        }

        const prgCount = data[4];
        const chrCount = data[5];
        const header = data.slice(0, HEADER_SIZE);

        // Extract PRG banks (copy into own arrays so they're independently mutable)
        const prg = [];
        let offset = HEADER_SIZE;
        for (let i = 0; i < prgCount; i++) {
            prg.push(data.slice(offset, offset + PRG_BANK_SIZE));
            offset += PRG_BANK_SIZE;
        }

        // Extract CHR banks
        const chr = [];
        for (let i = 0; i < chrCount; i++) {
            chr.push(data.slice(offset, offset + CHR_BANK_SIZE));
            offset += CHR_BANK_SIZE;
        }

        return {
            buffer: data,
            header,
            prg,
            chr,
            prgCount,
            chrCount,
        };
    }

    // --- ROM Data Reading ---
    function readUint16LE(bank, pos) {
        return bank[pos] + (bank[pos + 1] << 8);
    }

    function writeUint16LE(bank, pos, value) {
        bank[pos] = value & 0xFF;
        bank[pos + 1] = (value >> 8) & 0xFF;
    }

    function readPointerString(rom, info, index) {
        const bank = rom.prg[info.bank];
        const ptrRaw = readUint16LE(bank, info.start + index * 2);
        if (ptrRaw === 0) return '';
        const ptr = ptrRaw & ~info.ptrOR;
        return decodeString(bank, ptr);
    }

    // Read a string table and record original pointer locations for safe write-back
    function readStringTable(rom, info) {
        const bank = rom.prg[info.bank];
        const entries = [];
        for (let i = 0; i < info.count; i++) {
            const ptrRaw = readUint16LE(bank, info.start + i * 2);
            const ptr = ptrRaw === 0 ? -1 : (ptrRaw & ~info.ptrOR);
            const text = ptr < 0 ? '' : decodeString(bank, ptr);
            const origLen = ptr < 0 ? 0 : encodedLength(bank, ptr);
            entries.push({ text, ptr, origLen });
        }
        return entries;
    }

    // --- NPC Names ---
    let npcNameEntries = null;
    function readNPCNames(rom) {
        npcNameEntries = readStringTable(rom, addresses.npcs.names);
        return npcNameEntries.map(e => e.text);
    }

    function writeNPCNames(rom, names) {
        writeStringTableSafe(rom, addresses.npcs.names, names, npcNameEntries);
    }

    // --- NPC Dialogue ---
    let npcDialogueEntries = null;
    function readNPCDialogue(rom) {
        npcDialogueEntries = readStringTable(rom, addresses.npcs.conversation);
        return npcDialogueEntries.map(e => e.text);
    }

    function writeNPCDialogue(rom, strings) {
        writeStringTableSafe(rom, addresses.npcs.conversation, strings, npcDialogueEntries);
    }

    // --- Safe in-place string write-back ---
    // Only overwrites bytes that are actually part of strings.
    // Strings that haven't changed are skipped entirely.
    // Modified strings must fit in their original space (same length or shorter).
    function writeStringTableSafe(rom, info, strings, originalEntries) {
        const bank = rom.prg[info.bank];

        for (let i = 0; i < strings.length; i++) {
            const orig = originalEntries[i];
            const newText = strings[i];

            // Skip unchanged strings
            if (newText === orig.text) continue;

            const encoded = encodeString(newText);

            if (encoded.length > orig.origLen) {
                throw new Error(
                    `String #${i + 1} is too long! Max ${orig.origLen} chars, got ${encoded.length}. ` +
                    `Original: "${orig.text}" (${orig.origLen}), New: "${newText}" (${encoded.length})`
                );
            }

            // Write the new string bytes at the original position
            let pos = orig.ptr;
            for (let j = 0; j < encoded.length; j++) {
                bank[pos++] = encoded[j];
            }
            // Pad remainder with terminators
            const remaining = orig.origLen - encoded.length;
            for (let j = 0; j < remaining; j++) {
                bank[pos++] = STRING_TERMINATOR;
            }
            // The original terminator byte stays in place
        }
    }

    // --- Shop Items ---
    const STAT_DEFS = [
        { short: 'SG', full: 'Strength',   flag1Bit: 0x02 },
        { short: 'D',  full: 'Defence',    flag1Bit: 0x04 },
        { short: 'AG', full: 'Agility',    flag1Bit: 0x08 },
        { short: 'TH', full: 'Throw',      flag1Bit: 0x10 },
        { short: 'WP', full: 'Will Power', flag1Bit: 0x20 },
        { short: 'K',  full: 'Kick',       flag1Bit: 0x40 },
        { short: 'P',  full: 'Punch',      flag1Bit: 0x80 },
        { short: 'WP2',full: 'Will Power', flag1Bit: 0x01 }, // duplicate WP slot
        { short: 'ST', full: 'Stamina',    flag2Bit: 0x80 },
    ];

    function decAsHex(h) {
        return parseInt(h.toString(16).padStart(2, '0'), 10);
    }

    // Stat read/write order — the order bytes appear in the ROM after the flags
    // WP appears twice (bit 0x20 and bit 0x01) — use unique keys internally
    const STAT_ORDER = [
        { key: 'SG',  uiKey: 'SG', flagByte: 1, bit: 0x02 },
        { key: 'D',   uiKey: 'D',  flagByte: 1, bit: 0x04 },
        { key: 'AG',  uiKey: 'AG', flagByte: 1, bit: 0x08 },
        { key: 'TH',  uiKey: 'TH', flagByte: 1, bit: 0x10 },
        { key: 'WP',  uiKey: 'WP', flagByte: 1, bit: 0x20 },
        { key: 'K',   uiKey: 'K',  flagByte: 1, bit: 0x40 },
        { key: 'P',   uiKey: 'P',  flagByte: 1, bit: 0x80 },
        { key: 'WP2', uiKey: 'WP', flagByte: 1, bit: 0x01 }, // second WP slot
        { key: 'ST',  uiKey: 'ST', flagByte: 2, bit: 0x80 },
    ];

    let shopItemEntries = null;

    function readShopItems(rom) {
        const info = addresses.shops.items;
        const bank = rom.prg[info.bank];
        const items = [];
        shopItemEntries = [];

        for (let i = 0; i < info.count; i++) {
            const ptrRaw = readUint16LE(bank, info.start + i * 2);
            const dataStart = ptrRaw & ~info.ptrOR;
            let ptr = dataStart;
            const name = decodeString(bank, ptr);
            const nameLen = encodedLength(bank, ptr);
            const item = { name, index: i, nameMaxLen: nameLen };

            // Items 1-125 (0-indexed: 1 to 125) have cost + stats
            if (i > 0 && i < 126) {
                ptr += nameLen + 1; // skip name + terminator

                item.costOffset = ptr; // remember where cost bytes start

                // Cost: 3 bytes, BCD encoded
                const b0 = decAsHex(bank[ptr]);
                const b1 = decAsHex(bank[ptr + 1]);
                const b2 = decAsHex(bank[ptr + 2]);
                item.cents = b0 + b1 * 100 + b2 * 10000;
                ptr += 3;

                // Unknown byte (consumed vs equipped)
                item.unknown = bank[ptr];
                ptr += 1;

                // Action strings
                item.action1 = bank[ptr];
                item.action2 = bank[ptr + 1];
                ptr += 2;

                // Stat flags and values
                item.statFlagsOffset = ptr; // remember where flags are
                const statFlags1 = bank[ptr];
                const statFlags2 = bank[ptr + 1];
                item.statFlags1 = statFlags1;
                item.statFlags2 = statFlags2;
                ptr += 2;

                item.stats = {};
                item._rawStats = {}; // internal: key -> value, preserving WP vs WP2
                item._statOffsets = {}; // internal: key -> byte offset
                for (const s of STAT_ORDER) {
                    const flag = s.flagByte === 1 ? statFlags1 : statFlags2;
                    if (flag & s.bit) {
                        item._rawStats[s.key] = bank[ptr];
                        item._statOffsets[s.key] = ptr;
                        // For UI: merge WP and WP2 into a single WP display
                        // (use the first one found; WP2 is a secondary slot)
                        if (!(s.uiKey in item.stats)) {
                            item.stats[s.uiKey] = bank[ptr];
                        }
                        ptr++;
                    }
                }
            }

            // Record the full data extent for this item
            shopItemEntries.push({ dataStart, dataEnd: ptr, nameLen });
            items.push(item);
        }

        return items;
    }

    // Write shop item changes back to ROM (in-place, safe)
    // Uses original recorded offsets so name length changes don't shift cost/stats.
    function writeShopItems(rom, items) {
        const info = addresses.shops.items;
        const bank = rom.prg[info.bank];

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const entry = shopItemEntries[i];

            // Write name at original position (must fit in original name length)
            const encoded = encodeString(item.name);
            if (encoded.length > entry.nameLen) {
                throw new Error(
                    `Item #${i + 1} "${item.name}" name is too long! ` +
                    `Max ${entry.nameLen} chars, got ${encoded.length}.`
                );
            }
            let ptr = entry.dataStart;
            for (let j = 0; j < encoded.length; j++) {
                bank[ptr + j] = encoded[j];
            }
            // Pad remainder with spaces (0x00) so the game reads the full original
            // name length before hitting the terminator at the original position.
            // Using spaces instead of terminators keeps cost/stat offsets aligned.
            for (let j = encoded.length; j < entry.nameLen; j++) {
                bank[ptr + j] = 0x00; // space character in RCR charmap
            }

            // Write cost + stats for items 1-125, using the saved offsets
            if (i > 0 && i < 126 && item.cents != null && item.costOffset != null) {
                // Cost: 3 bytes BCD at the original cost offset
                const costStr = item.cents.toString().padStart(6, '0');
                bank[item.costOffset]     = parseInt(costStr.slice(4, 6), 16);
                bank[item.costOffset + 1] = parseInt(costStr.slice(2, 4), 16);
                bank[item.costOffset + 2] = parseInt(costStr.slice(0, 2), 16);

                // Stat values — write at their original byte offsets.
                // Keep the original flag bytes and slot assignments intact.
                // Use _rawStats for values and _statOffsets for positions.
                // Only update the primary stat slot from the UI; preserve secondary slots.
                if (item._statOffsets) {
                    const writtenUiKeys = new Set();
                    for (const s of STAT_ORDER) {
                        if (!(s.key in item._statOffsets)) continue;
                        const offset = item._statOffsets[s.key];
                        if (!writtenUiKeys.has(s.uiKey) && item.stats && item.stats[s.uiKey] != null) {
                            // Write the UI-edited value to the primary slot
                            bank[offset] = item.stats[s.uiKey] & 0xFF;
                            writtenUiKeys.add(s.uiKey);
                        } else {
                            // Preserve the original raw value for secondary slots
                            bank[offset] = item._rawStats[s.key] & 0xFF;
                        }
                    }
                }
            }
        }
    }

    function getShopItemEntries() { return shopItemEntries; }

    function encodedLength(bank, pos) {
        let len = 0;
        while (pos + len < bank.length && bank[pos + len] !== STRING_TERMINATOR) len++;
        return len;
    }

    // --- Shop Stock ---
    function readShopStock(rom) {
        const info = addresses.shops.stock;
        const bank = rom.prg[info.bank];
        const stockLists = [];

        for (let i = 0; i < info.count; i++) {
            const ptrRaw = readUint16LE(bank, info.start + i * 2);
            let ptr = ptrRaw & ~info.ptrOR;
            const list = [];
            while (ptr < bank.length && bank[ptr] !== 0xFF) {
                list.push(bank[ptr]);
                ptr++;
            }
            stockLists.push(list);
        }

        return stockLists;
    }

    function getItemName(rom, itemId) {
        const info = addresses.shops.items;
        return readPointerString(rom, info, itemId);
    }

    // --- Boss Stats ---
    const BOSS_STAT_NAMES = ['Punch','Kick','Weapon','Throw','Agility','Defence','Strength','WillPower','Stamina'];
    const BOSS_NAMES = ['Moose','Mojo','Turk','Rocko','Benny','Clyde','Blade','Thor','Otis','Ivan','Tex','Randy','Andy','Simon'];

    function readBossStats(rom) {
        const info = addresses.bosses.stats;
        const bank = rom.prg[info.bank];
        const bosses = [];
        for (let b = 0; b < info.count; b++) {
            const off = info.start + b * 9;
            const stats = {};
            for (let s = 0; s < 9; s++) {
                stats[BOSS_STAT_NAMES[s]] = bank[off + s];
            }
            bosses.push(stats);
        }
        return bosses;
    }

    function writeBossStats(rom, bosses) {
        const info = addresses.bosses.stats;
        const bank = rom.prg[info.bank];
        for (let b = 0; b < info.count; b++) {
            const off = info.start + b * 9;
            for (let s = 0; s < 9; s++) {
                bank[off + s] = bosses[b][BOSS_STAT_NAMES[s]] & 0xFF;
            }
        }
    }

    // --- Boss Cash (DecAsHexCouplets: 2 bytes per entry) ---
    function hex2dec(h) { return parseInt(h.toString(16).padStart(2, '0'), 10); }
    function dec2hex(d) { return parseInt(d.toString(), 16); }

    function readDecHexCouplets(rom, info) {
        const bank = rom.prg[info.bank];
        const values = [];
        for (let i = 0; i < info.count; i++) {
            const off = info.start + i * 2;
            values.push(hex2dec(bank[off]) + hex2dec(bank[off + 1]) * 100);
        }
        return values;
    }

    function writeDecHexCouplets(rom, info, values) {
        const bank = rom.prg[info.bank];
        for (let i = 0; i < info.count; i++) {
            const off = info.start + i * 2;
            bank[off] = dec2hex(values[i] % 100);
            bank[off + 1] = dec2hex(Math.floor(values[i] / 100) % 100);
        }
    }

    function readBossCash(rom) { return readDecHexCouplets(rom, addresses.bosses.cash); }
    function writeBossCash(rom, v) { writeDecHexCouplets(rom, addresses.bosses.cash, v); }
    function readGangCash(rom) { return readDecHexCouplets(rom, addresses.gangs.cash); }
    function writeGangCash(rom, v) { writeDecHexCouplets(rom, addresses.gangs.cash, v); }

    // --- Gang Turf Codes ---
    function readBytes(rom, info) {
        const bank = rom.prg[info.bank];
        const values = [];
        for (let i = info.start; i < info.end; i++) values.push(bank[i]);
        return values;
    }
    function writeBytes(rom, info, values) {
        const bank = rom.prg[info.bank];
        for (let i = 0; i < values.length; i++) bank[info.start + i] = values[i] & 0xFF;
    }

    function readGangTurfCodes(rom) { return readBytes(rom, addresses.gangs.turfCodes); }
    function writeGangTurfCodes(rom, v) { writeBytes(rom, addresses.gangs.turfCodes, v); }

    // --- Shop Names (24, special pointer format) ---
    let shopNameEntries = null;
    function readShopNames(rom) {
        const info = addresses.shops.names;
        const bank = rom.prg[info.bank];
        const dataStartOffset = info.start + info.count * 2;
        const entries = [];
        for (let i = 0; i < info.count; i++) {
            const ptrRaw = bank[info.start + i * 2] + (bank[info.start + i * 2 + 1] << 8);
            const ptr = (ptrRaw & 0x3FFF) + dataStartOffset;
            const text = decodeString(bank, ptr);
            const origLen = encodedLength(bank, ptr);
            entries.push({ text, ptr, origLen });
        }
        shopNameEntries = entries;
        return entries.map(e => e.text);
    }
    function writeShopNames(rom, names) {
        const info = addresses.shops.names;
        const bank = rom.prg[info.bank];
        for (let i = 0; i < names.length; i++) {
            const entry = shopNameEntries[i];
            if (names[i] === entry.text) continue;
            const encoded = encodeString(names[i]);
            if (encoded.length > entry.origLen) {
                throw new Error(`Shop name #${i+1} too long! Max ${entry.origLen}, got ${encoded.length}.`);
            }
            for (let j = 0; j < encoded.length; j++) bank[entry.ptr + j] = encoded[j];
            for (let j = encoded.length; j < entry.origLen; j++) bank[entry.ptr + j] = STRING_TERMINATOR;
        }
    }
    function getShopNameEntries() { return shopNameEntries; }

    // --- Misc Text (PRG3 pointer table) ---
    let miscTextEntries = null;
    function readMiscText(rom) {
        const info = addresses.miscText;
        const bank = rom.prg[info.bank];
        const entries = [];
        // Scan pointer table until we hit the data region
        let dataStart = info.end;
        const ptrs = [];
        for (let off = info.start; off < info.end; off += 2) {
            const ptrRaw = bank[off] + (bank[off + 1] << 8);
            if (ptrRaw === 0) { ptrs.push(-1); continue; }
            const ptr = ptrRaw & ~info.ptrOR;
            if (ptr < dataStart) dataStart = ptr;
            ptrs.push(ptr);
            if (off + 2 >= dataStart) break;
        }
        for (const ptr of ptrs) {
            if (ptr < 0) {
                entries.push({ text: '', ptr: -1, origLen: 0 });
            } else {
                entries.push({ text: decodeString(bank, ptr), ptr, origLen: encodedLength(bank, ptr) });
            }
        }
        miscTextEntries = entries;
        return entries.map(e => e.text);
    }
    function writeMiscText(rom, strings) {
        const info = addresses.miscText;
        const bank = rom.prg[info.bank];
        for (let i = 0; i < strings.length; i++) {
            const entry = miscTextEntries[i];
            if (strings[i] === entry.text) continue;
            if (entry.ptr < 0) continue;
            const encoded = encodeString(strings[i]);
            if (encoded.length > entry.origLen) {
                throw new Error(`Misc text #${i+1} too long! Max ${entry.origLen}, got ${encoded.length}.`);
            }
            for (let j = 0; j < encoded.length; j++) bank[entry.ptr + j] = encoded[j];
            for (let j = encoded.length; j < entry.origLen; j++) bank[entry.ptr + j] = STRING_TERMINATOR;
        }
    }
    function getMiscTextEntries() { return miscTextEntries; }

    // --- Location Data ---
    function readLocations(rom) {
        const loc = addresses.locations;
        const locs = [];
        for (let i = 0; i < loc.count; i++) {
            locs.push({
                nameCode:     rom.prg[loc.nameCodes.bank][loc.nameCodes.start + i],
                musicTrack:   rom.prg[loc.musicTracks.bank][loc.musicTracks.start + i],
                pacifistMode: rom.prg[loc.pacifistMode.bank][loc.pacifistMode.start + i],
                reincarnation:rom.prg[loc.reincarnation.bank][loc.reincarnation.start + i],
                boundaryMin:  readUint16LE(rom.prg[loc.boundaries.bank], loc.boundaries.start + i * 4),
                boundaryMax:  readUint16LE(rom.prg[loc.boundaries.bank], loc.boundaries.start + i * 4 + 2) + 256,
            });
        }
        return locs;
    }
    function writeLocations(rom, locs) {
        const loc = addresses.locations;
        for (let i = 0; i < loc.count; i++) {
            const l = locs[i];
            rom.prg[loc.musicTracks.bank][loc.musicTracks.start + i] = l.musicTrack & 0xFF;
            rom.prg[loc.pacifistMode.bank][loc.pacifistMode.start + i] = l.pacifistMode & 0xFF;
            rom.prg[loc.reincarnation.bank][loc.reincarnation.start + i] = l.reincarnation & 0xFF;
            writeUint16LE(rom.prg[loc.boundaries.bank], loc.boundaries.start + i * 4, l.boundaryMin);
            writeUint16LE(rom.prg[loc.boundaries.bank], loc.boundaries.start + i * 4 + 2, l.boundaryMax - 256);
        }
    }

    // --- NES System Palette (64 colors, RGB) ---
    const NES_PALETTE = [
        [0x78,0x80,0x84],[0x00,0x00,0xFC],[0x00,0x00,0xC4],[0x40,0x28,0xC4],
        [0x94,0x00,0x8C],[0xAC,0x00,0x28],[0xAC,0x10,0x00],[0x8C,0x18,0x00],
        [0x50,0x39,0x00],[0x00,0x78,0x00],[0x00,0x68,0x00],[0x00,0x58,0x00],
        [0x00,0x40,0x58],[0x00,0x00,0x00],[0x00,0x00,0x00],[0x00,0x00,0x00],
        [0xBF,0xBF,0xBF],[0x00,0x6F,0xF0],[0x00,0x4F,0xF0],[0x60,0x3F,0xFF],
        [0xDF,0x00,0xE3],[0xE0,0x00,0x50],[0xF0,0x2F,0x00],[0xE0,0x50,0x0F],
        [0xAF,0x70,0x00],[0x00,0xAF,0x00],[0x00,0xAF,0x00],[0x00,0xAF,0x3F],
        [0x00,0x8F,0x8F],[0x00,0x00,0x00],[0x00,0x00,0x00],[0x00,0x00,0x00],
        [0xF0,0xF0,0xF0],[0x30,0xBF,0xFF],[0x60,0x80,0xFF],[0x90,0x6F,0xF0],
        [0xF0,0x6F,0xF0],[0xF0,0x4F,0x90],[0xF0,0x6F,0x4F],[0xFF,0xA0,0x3F],
        [0xF0,0x80,0x00],[0xB0,0xF0,0x0F],[0x50,0xDF,0x4F],[0x4F,0xF0,0x90],
        [0x00,0xEF,0xE9],[0x6F,0x6F,0x6F],[0x00,0x00,0x00],[0x00,0x00,0x00],
        [0xFF,0xFF,0xFF],[0xA0,0xE0,0xFF],[0xB0,0xB0,0xF0],[0xD0,0xB0,0xF0],
        [0xF0,0xB0,0xF0],[0xFF,0xA0,0xC0],[0xEF,0xCF,0xAF],[0xFF,0xE0,0xAF],
        [0xE1,0xDF,0x70],[0xD0,0xF0,0x6F],[0xB0,0xF0,0xB0],[0xB0,0xF0,0xD0],
        [0x00,0xFF,0xFF],[0xF0,0xD0,0xF0],[0x00,0x00,0x00],[0x00,0x00,0x00],
    ];

    // Default grayscale palette for when no ROM palette is selected
    const GRAYSCALE_PALETTE = [
        [0x00, 0x00, 0x00], // color 0: black (transparent)
        [0x6F, 0x6F, 0x6F], // color 1: dark gray
        [0xBF, 0xBF, 0xBF], // color 2: light gray
        [0xFF, 0xFF, 0xFF], // color 3: white
    ];

    // --- CHR Tile Decoding ---
    // Decode a single 8x8 tile from CHR bank data.
    // Returns a 64-element array of 2-bit color indices (row-major, 8x8).
    function decodeTile(chrBank, tileIndex) {
        const offset = tileIndex * 16;
        const pixels = new Uint8Array(64);
        for (let y = 0; y < 8; y++) {
            const lo = chrBank[offset + y];
            const hi = chrBank[offset + 8 + y];
            for (let x = 0; x < 8; x++) {
                const bit0 = (lo >> (7 - x)) & 1;
                const bit1 = (hi >> (7 - x)) & 1;
                pixels[y * 8 + x] = (bit1 << 1) | bit0;
            }
        }
        return pixels;
    }

    // Read ROM palettes from PRG7 pointer table at 0x26F1-0x2B9D.
    // Each palette is 16 bytes: four 4-color sub-palettes.
    // Returns array of palette objects: { colors: [[r,g,b], ...] (16 entries) }
    function readROMPalettes(rom) {
        const bank = rom.prg[7];
        const start = 0x26F1;
        const end = 0x2B9D;
        let dataStart = end;
        const ptrs = [];

        for (let off = start; off < end; off += 2) {
            const raw = bank[off] + (bank[off + 1] << 8);
            if (raw === 0) { ptrs.push(-1); continue; }
            const ptr = raw & 0x3FFF;
            if (ptr < dataStart) dataStart = ptr;
            ptrs.push(ptr);
            if (off + 2 >= dataStart) break;
        }

        return ptrs.map(ptr => {
            if (ptr < 0) return null;
            const colors = [];
            for (let i = 0; i < 16; i++) {
                const nesIdx = bank[ptr + i] & 0x3F;
                colors.push(NES_PALETTE[nesIdx]);
            }
            return { colors };
        });
    }

    // --- ROM Save ---
    function buildROM(rom) {
        const totalSize = HEADER_SIZE + rom.prgCount * PRG_BANK_SIZE + rom.chrCount * CHR_BANK_SIZE;
        const out = new Uint8Array(totalSize);

        // Copy header
        out.set(rom.header, 0);

        // Copy PRG banks
        let offset = HEADER_SIZE;
        for (const bank of rom.prg) {
            out.set(bank, offset);
            offset += PRG_BANK_SIZE;
        }

        // Copy CHR banks
        for (const bank of rom.chr) {
            out.set(bank, offset);
            offset += CHR_BANK_SIZE;
        }

        return out.buffer;
    }

    // --- Format Helpers ---
    function formatCost(cents) {
        if (cents == null) return '--';
        return '$' + (cents / 100).toFixed(2);
    }

    function parseCost(str) {
        const m = str.replace(/^\s*\$?/, '').match(/^(\d+)(?:\.(\d{0,2}))?$/);
        if (!m) return null;
        const dollars = parseInt(m[1], 10);
        if (dollars > 9999) return null;
        const cents = m[2] ? parseInt(m[2].padEnd(2, '0'), 10) : 0;
        return dollars * 100 + cents;
    }

    // --- Hex Viewer Helpers ---

    // Convert a bank-relative offset to an absolute ROM file offset
    function bankOffsetToROM(bankType, bankIndex, offset) {
        let base = HEADER_SIZE;
        if (bankType === 'prg') {
            base += bankIndex * PRG_BANK_SIZE;
        } else {
            base += rom => rom.prgCount * PRG_BANK_SIZE + bankIndex * CHR_BANK_SIZE;
        }
        return base + offset;
    }

    function absOffset(bankIndex, pos) {
        return HEADER_SIZE + bankIndex * PRG_BANK_SIZE + pos;
    }

    // Get entry metadata for hex viewer (pointer table location + string data location)
    function getNPCNameEntries() { return npcNameEntries; }
    function getNPCDialogueEntries() { return npcDialogueEntries; }

    return {
        HEADER_SIZE,
        PRG_BANK_SIZE,
        CHR_BANK_SIZE,
        addresses,
        charmap,
        reverseCharmap,
        validChars,
        parseROM,
        buildROM,
        decodeString,
        encodeString,
        isValidChar,
        readNPCNames,
        writeNPCNames,
        readNPCDialogue,
        writeNPCDialogue,
        readShopItems,
        writeShopItems,
        getShopItemEntries,
        readShopStock,
        getItemName,
        formatCost,
        parseCost,
        absOffset,
        getNPCNameEntries,
        getNPCDialogueEntries,
        BOSS_STAT_NAMES,
        BOSS_NAMES,
        readBossStats,
        writeBossStats,
        readBossCash,
        writeBossCash,
        readGangCash,
        writeGangCash,
        readGangTurfCodes,
        writeGangTurfCodes,
        readShopNames,
        writeShopNames,
        getShopNameEntries,
        readMiscText,
        writeMiscText,
        getMiscTextEntries,
        readLocations,
        writeLocations,
        NES_PALETTE,
        GRAYSCALE_PALETTE,
        decodeTile,
        readROMPalettes,
    };
})();
