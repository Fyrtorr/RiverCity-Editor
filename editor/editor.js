/**
 * River City Ransom Editor - UI Controller
 */
(() => {
    let rom = null;
    let npcNames = [];
    let npcDialogue = [];
    let shopItems = [];
    let shopStock = [];
    let bossStats = [];
    let bossCash = [];
    let gangCash = [];
    let gangTurfCodes = [];
    let shopNames = [];
    let miscText = [];
    let locations = [];
    let romPalettes = [];
    let spriteSets = [];

    // --- DOM refs ---
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const btnLoad = $('#btn-load');
    const btnSave = $('#btn-save');
    const fileInput = $('#file-input');
    const romInfo = $('#rom-info');
    const statusEl = $('#status');
    const noRom = $('#no-rom');
    const editorArea = $('#editor-area');

    // --- Tab switching ---
    const tabs = $$('.tab');
    const tabContents = $$('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (!rom) return;
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            tabContents.forEach(tc => tc.style.display = 'none');
            $(`#tab-${tab.dataset.tab}`).style.display = 'block';
        });
    });

    // --- File loading ---
    btnLoad.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) loadFile(e.target.files[0]);
    });

    // Drag and drop
    document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('drag-over'); });
    document.addEventListener('dragleave', () => document.body.classList.remove('drag-over'));
    document.addEventListener('drop', (e) => {
        e.preventDefault();
        document.body.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.nes')) loadFile(file);
    });

    function loadFile(file) {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                romArrayBuffer = reader.result.slice(0); // keep a copy for the emulator
                rom = RCR.parseROM(reader.result);
                onROMLoaded(file.name);
            } catch (err) {
                alert('Error loading ROM: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function onROMLoaded(filename) {
        romInfo.textContent = `${filename} (${rom.prgCount} PRG, ${rom.chrCount} CHR)`;
        btnSave.disabled = false;
        noRom.style.display = 'none';
        status('ROM loaded successfully');

        // Snapshot original bank data for hex diff view
        originalPrg = rom.prg.map(bank => Uint8Array.from(bank));
        originalChr = rom.chr.map(bank => Uint8Array.from(bank));

        try {
            // Parse all data
            npcNames = RCR.readNPCNames(rom);
            npcDialogue = RCR.readNPCDialogue(rom);
            shopItems = RCR.readShopItems(rom);
            shopStock = RCR.readShopStock(rom);
            bossStats = RCR.readBossStats(rom);
            bossCash = RCR.readBossCash(rom);
            gangCash = RCR.readGangCash(rom);
            gangTurfCodes = RCR.readGangTurfCodes(rom);
            shopNames = RCR.readShopNames(rom);
            miscText = RCR.readMiscText(rom);
            locations = RCR.readLocations(rom);
            romPalettes = RCR.readROMPalettes(rom);
            spriteSets = RCR.readSpriteCollection(rom);

            // Populate editors
            populateNPCNames();
            populateNPCDialogue();
            populateShopItems();
            populateShopStock();
            populateBosses();
            populateShopNames();
            populateMiscText();
            populateLocations();
            populateCHRViewer();
            populateSpriteViewer();
            initEmulator();
        } catch (err) {
            console.error('Error parsing ROM data:', err);
            status('Error parsing ROM: ' + err.message);
            return;
        }

        // Show first tab
        tabs.forEach(t => t.classList.remove('active'));
        tabs[0].classList.add('active');
        tabContents.forEach(tc => tc.style.display = 'none');
        $('#tab-npc-names').style.display = 'block';
    }

    // --- Save ROM ---
    btnSave.addEventListener('click', () => {
        if (!rom) return;
        try {
            // Write back current data
            RCR.writeNPCNames(rom, npcNames);
            RCR.writeNPCDialogue(rom, npcDialogue);
            RCR.writeShopItems(rom, shopItems);
            RCR.writeBossStats(rom, bossStats);
            RCR.writeBossCash(rom, bossCash);
            RCR.writeGangCash(rom, gangCash);
            RCR.writeGangTurfCodes(rom, gangTurfCodes);
            RCR.writeShopNames(rom, shopNames);
            RCR.writeMiscText(rom, miscText);
            RCR.writeLocations(rom, locations);

            const buffer = RCR.buildROM(rom);
            const blob = new Blob([buffer], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'River City Ransom (Modified).nes';
            a.click();
            URL.revokeObjectURL(url);
            status('ROM saved!');
        } catch (err) {
            alert('Error saving ROM: ' + err.message);
        }
    });

    // --- Status ---
    function status(msg) {
        statusEl.textContent = msg;
    }

    // =============================================
    // Hex Viewer (split: Original vs Current)
    // =============================================
    const hexOriginal = $('#hex-original');
    const hexCurrent = $('#hex-current');
    const hexLocation = $('#hex-location');

    // Snapshots of original bank data, taken at ROM load time
    let originalPrg = [];
    let originalChr = [];

    // Sync scroll between the two panes
    let scrollSyncing = false;
    hexOriginal.addEventListener('scroll', () => {
        if (scrollSyncing) return;
        scrollSyncing = true;
        hexCurrent.scrollTop = hexOriginal.scrollTop;
        hexCurrent.scrollLeft = hexOriginal.scrollLeft;
        scrollSyncing = false;
    });
    hexCurrent.addEventListener('scroll', () => {
        if (scrollSyncing) return;
        scrollSyncing = true;
        hexOriginal.scrollTop = hexCurrent.scrollTop;
        hexOriginal.scrollLeft = hexCurrent.scrollLeft;
        scrollSyncing = false;
    });

    // Render hex for one pane.
    // bankData: the Uint8Array of bank bytes to display
    // compareData: the other pane's bytes (to detect diffs), or null
    function renderHexPane(bankData, compareData, bankIndex, viewStart, viewEnd, hlMap, absBaseOverride) {
        const absBase = absBaseOverride != null ? absBaseOverride : (RCR.HEADER_SIZE + bankIndex * RCR.PRG_BANK_SIZE);
        let html = '';

        for (let row = viewStart; row < viewEnd; row += 16) {
            const romAddr = absBase + row;
            html += '<div class="hex-row">';

            // Address
            html += `<span class="hex-addr">${romAddr.toString(16).padStart(6, '0').toUpperCase()}</span>`;

            // Hex bytes
            html += '<span class="hex-bytes">';
            for (let col = 0; col < 16; col++) {
                const off = row + col;
                const b = off < bankData.length ? bankData[off] : 0;
                const cmp = compareData && off < compareData.length ? compareData[off] : b;
                const changed = (b !== cmp);
                const hl = hlMap[off] || '';
                let cls = hl ? ` hl-${hl}` : '';
                if (changed) cls += ' hl-changed';
                const gap = col === 7 ? ' gap' : '';
                html += `<span class="hex-byte${cls}${gap}">${b.toString(16).padStart(2, '0').toUpperCase()}</span>`;
            }
            html += '</span>';

            // ASCII
            html += '<span class="hex-ascii">';
            for (let col = 0; col < 16; col++) {
                const off = row + col;
                const b = off < bankData.length ? bankData[off] : 0;
                const cmp = compareData && off < compareData.length ? compareData[off] : b;
                const changed = (b !== cmp);
                const hl = hlMap[off] || '';
                const ch = (b >= 0x20 && b <= 0x7E) ? String.fromCharCode(b) : '.';
                const hlCls = changed ? 'hl-changed' : (hl ? `hl-${hl}` : '');
                if (hlCls) {
                    html += `<span class="${hlCls}">${escHtml(ch)}</span>`;
                } else {
                    html += escHtml(ch);
                }
            }
            html += '</span>';

            html += '</div>';
        }

        return html;
    }

    // Show hex for both panes
    function showHex(bankIndex, centerOffset, highlights, label) {
        if (!rom) return;
        const currentBank = rom.prg[bankIndex];
        const origBank = originalPrg[bankIndex];

        // Determine view range
        let viewStart = centerOffset;
        let viewEnd = centerOffset;
        for (const h of highlights) {
            if (h.start < viewStart) viewStart = h.start;
            if (h.end > viewEnd) viewEnd = h.end;
        }
        viewStart = Math.max(0, viewStart - 32) & ~0xF;
        viewEnd = Math.min(currentBank.length, viewEnd + 32);
        viewEnd = ((viewEnd + 15) & ~0xF);

        // Highlight map
        const hlMap = {};
        for (const h of highlights) {
            for (let off = h.start; off < h.end; off++) {
                hlMap[off] = h.type;
            }
        }

        hexLocation.textContent = label || '';

        // Legend (shared, show above the panes via location area)
        const legend = '<div class="hex-legend">'
            + '<span class="hex-legend-item"><span class="hex-legend-swatch ptr"></span> Pointer</span>'
            + '<span class="hex-legend-item"><span class="hex-legend-swatch str"></span> String Data</span>'
            + '<span class="hex-legend-item"><span class="hex-legend-swatch term"></span> Terminator</span>'
            + '<span class="hex-legend-item"><span class="hex-legend-swatch changed"></span> Changed</span>'
            + '</div>';

        // Original pane: original bytes, highlight diffs vs current
        hexOriginal.innerHTML = legend + renderHexPane(origBank, currentBank, bankIndex, viewStart, viewEnd, hlMap);

        // Current pane: current bytes, highlight diffs vs original
        hexCurrent.innerHTML = legend + renderHexPane(currentBank, origBank, bankIndex, viewStart, viewEnd, hlMap);
    }

    function clearHex() {
        const ph = '<div class="hex-placeholder">Select an item to view its ROM data</div>';
        hexOriginal.innerHTML = ph;
        hexCurrent.innerHTML = ph;
        hexLocation.textContent = '';
    }

    // Build highlights for a string table entry (pointer + string data)
    function stringEntryHighlights(info, entryIndex, entries) {
        const entry = entries[entryIndex];
        const ptrStart = info.start + entryIndex * 2;
        const highlights = [
            { start: ptrStart, end: ptrStart + 2, type: 'ptr' },
        ];
        if (entry.ptr >= 0) {
            highlights.push({ start: entry.ptr, end: entry.ptr + entry.origLen, type: 'string' });
            highlights.push({ start: entry.ptr + entry.origLen, end: entry.ptr + entry.origLen + 1, type: 'terminator' });
        }
        return highlights;
    }

    // =============================================
    // NPC Names Editor
    // =============================================
    function populateNPCNames() {
        const list = $('#npc-names-list');
        const countEl = $('#tab-npc-names .count');
        const input = $('#npc-name-input');
        const counter = $('#npc-name-counter');
        const btnUpdate = $('#npc-name-update');
        const btnRevert = $('#npc-name-revert');

        list.innerHTML = '';
        countEl.textContent = `(${npcNames.length})`;

        let selectedIdx = -1;
        let maxLen = 0;

        npcNames.forEach((name, i) => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="index">${i + 1}</span><span class="label">${escHtml(name)}</span>`;
            li.addEventListener('click', () => selectName(i));
            list.appendChild(li);
        });

        function updateCounter() {
            const len = input.value.length;
            counter.textContent = `${len} / ${maxLen}`;
            counter.classList.toggle('over', len > maxLen);
        }

        function selectName(i) {
            selectedIdx = i;
            list.querySelectorAll('li').forEach((li, j) => li.classList.toggle('selected', j === i));
            input.disabled = false;
            input.value = npcNames[i];
            input.dataset.original = npcNames[i];
            btnUpdate.disabled = true;
            btnRevert.disabled = true;

            const entries = RCR.getNPCNameEntries();
            maxLen = entries[i].origLen;
            input.maxLength = maxLen;
            updateCounter();
            input.focus();

            // Hex view
            const info = RCR.addresses.npcs.names;
            if (entries && entries[i]) {
                const hl = stringEntryHighlights(info, i, entries);
                const entry = entries[i];
                const romAddr = RCR.absOffset(info.bank, entry.ptr >= 0 ? entry.ptr : info.start);
                showHex(info.bank, entry.ptr >= 0 ? entry.ptr : info.start, hl,
                    `PRG Bank ${info.bank} | Pointer: 0x${(info.start + i * 2).toString(16).toUpperCase()} | String: 0x${entry.ptr >= 0 ? entry.ptr.toString(16).toUpperCase() : 'N/A'} | ROM: 0x${romAddr.toString(16).toUpperCase()}`
                );
            }
        }

        input.addEventListener('input', () => {
            const changed = input.value !== input.dataset.original;
            btnUpdate.disabled = !changed;
            btnRevert.disabled = !changed;
            updateCounter();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') btnUpdate.click();
            if (e.key === 'Escape') btnRevert.click();
        });

        btnUpdate.addEventListener('click', () => {
            if (selectedIdx < 0) return;
            const val = input.value;
            // Validate characters
            for (const ch of val) {
                if (!RCR.isValidChar(ch)) {
                    alert(`Invalid character: '${ch}'`);
                    return;
                }
            }
            npcNames[selectedIdx] = val;
            try { RCR.writeNPCNames(rom, npcNames); } catch (e) { alert(e.message); return; }
            const li = list.children[selectedIdx];
            li.querySelector('.label').textContent = val;
            input.dataset.original = val;
            btnUpdate.disabled = true;
            btnRevert.disabled = true;
            status(`Updated NPC name #${selectedIdx + 1}: "${val}"`);
            selectName(selectedIdx); // refresh hex view
        });

        btnRevert.addEventListener('click', () => {
            if (selectedIdx < 0) return;
            input.value = input.dataset.original;
            btnUpdate.disabled = true;
            btnRevert.disabled = true;
            updateCounter();
        });
    }

    // =============================================
    // NPC Dialogue Editor
    // =============================================
    function populateNPCDialogue() {
        const list = $('#npc-dialogue-list');
        const countEl = $('#tab-npc-dialogue .count');
        const input = $('#npc-dialogue-input');
        const counter = $('#npc-dialogue-counter');
        const btnUpdate = $('#npc-dialogue-update');
        const btnRevert = $('#npc-dialogue-revert');

        list.innerHTML = '';
        countEl.textContent = `(${npcDialogue.length})`;

        let selectedIdx = -1;
        let maxLen = 0;

        npcDialogue.forEach((text, i) => {
            const li = document.createElement('li');
            const preview = text.length > 50 ? text.substring(0, 50) + '...' : text;
            li.innerHTML = `<span class="index">${i + 1}</span><span class="label">${escHtml(preview)}</span>`;
            li.addEventListener('click', () => selectDialogue(i));
            list.appendChild(li);
        });

        function updateCounter() {
            const len = input.value.length;
            counter.textContent = `${len} / ${maxLen}`;
            counter.classList.toggle('over', len > maxLen);
        }

        function selectDialogue(i) {
            selectedIdx = i;
            list.querySelectorAll('li').forEach((li, j) => li.classList.toggle('selected', j === i));
            input.disabled = false;
            input.value = npcDialogue[i];
            input.dataset.original = npcDialogue[i];
            btnUpdate.disabled = true;
            btnRevert.disabled = true;

            const entries = RCR.getNPCDialogueEntries();
            maxLen = entries[i].origLen;
            input.maxLength = maxLen;
            updateCounter();
            input.focus();

            // Hex view
            const info = RCR.addresses.npcs.conversation;
            if (entries && entries[i]) {
                const hl = stringEntryHighlights(info, i, entries);
                const entry = entries[i];
                const romAddr = RCR.absOffset(info.bank, entry.ptr >= 0 ? entry.ptr : info.start);
                showHex(info.bank, entry.ptr >= 0 ? entry.ptr : info.start, hl,
                    `PRG Bank ${info.bank} | Pointer: 0x${(info.start + i * 2).toString(16).toUpperCase()} | String: 0x${entry.ptr >= 0 ? entry.ptr.toString(16).toUpperCase() : 'N/A'} | ROM: 0x${romAddr.toString(16).toUpperCase()}`
                );
            }
        }

        input.addEventListener('input', () => {
            const changed = input.value !== input.dataset.original;
            btnUpdate.disabled = !changed;
            btnRevert.disabled = !changed;
            updateCounter();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') btnRevert.click();
        });

        btnUpdate.addEventListener('click', () => {
            if (selectedIdx < 0) return;
            const val = input.value;
            for (const ch of val) {
                if (!RCR.isValidChar(ch)) {
                    alert(`Invalid character: '${ch}'`);
                    return;
                }
            }
            npcDialogue[selectedIdx] = val;
            try { RCR.writeNPCDialogue(rom, npcDialogue); } catch (e) { alert(e.message); return; }
            const li = list.children[selectedIdx];
            const preview = val.length > 50 ? val.substring(0, 50) + '...' : val;
            li.querySelector('.label').textContent = preview;
            input.dataset.original = val;
            btnUpdate.disabled = true;
            btnRevert.disabled = true;
            status(`Updated dialogue #${selectedIdx + 1}`);
            selectDialogue(selectedIdx); // refresh hex view
        });

        btnRevert.addEventListener('click', () => {
            if (selectedIdx < 0) return;
            input.value = input.dataset.original;
            btnUpdate.disabled = true;
            btnRevert.disabled = true;
            updateCounter();
        });
    }

    // =============================================
    // Shop Items Editor
    // =============================================
    function populateShopItems() {
        const list = $('#shop-items-list');
        const countEl = $('#tab-shop-items .count');
        const nameInput = $('#item-name-input');
        const nameCounter = $('#item-name-counter');
        const costInput = $('#item-cost-input');
        const btnUpdate = $('#item-update');
        const btnRevert = $('#item-revert');
        const statInputs = {};
        $$('.stat-input').forEach(el => { statInputs[el.dataset.stat] = el; });

        list.innerHTML = '';
        countEl.textContent = `(${shopItems.length})`;

        let selectedIdx = -1;
        let nameMaxLen = 0;

        shopItems.forEach((item, i) => {
            const li = document.createElement('li');
            const costStr = item.cents != null ? RCR.formatCost(item.cents) : '';
            li.innerHTML = `<span class="index">${i + 1}</span><span class="label">${escHtml(item.name)}</span>${costStr ? `<span class="cost">${costStr}</span>` : ''}`;
            li.addEventListener('click', () => selectItem(i));
            list.appendChild(li);
        });

        function updateNameCounter() {
            const len = nameInput.value.length;
            nameCounter.textContent = `${len} / ${nameMaxLen}`;
            nameCounter.classList.toggle('over', len > nameMaxLen);
        }

        function selectItem(i) {
            selectedIdx = i;
            const item = shopItems[i];
            list.querySelectorAll('li').forEach((li, j) => li.classList.toggle('selected', j === i));

            nameMaxLen = item.nameMaxLen || 11;
            nameInput.maxLength = nameMaxLen;

            nameInput.disabled = false;
            nameInput.value = item.name;
            updateNameCounter();

            if (item.cents != null) {
                costInput.disabled = false;
                costInput.value = RCR.formatCost(item.cents);
                for (const [key, el] of Object.entries(statInputs)) {
                    const hasStat = item.stats && item.stats[key] != null;
                    el.disabled = !hasStat;
                    el.value = hasStat ? item.stats[key] : '';
                    el.title = hasStat ? '' : 'This item has no ' + key + ' stat in the ROM';
                }
            } else {
                costInput.disabled = true;
                costInput.value = '';
                nameInput.disabled = true;
                nameCounter.textContent = '';
                for (const el of Object.values(statInputs)) {
                    el.disabled = true;
                    el.value = '';
                    el.title = '';
                }
            }

            btnUpdate.disabled = true;
            btnRevert.disabled = true;

            // Hex view — show the item's pointer and full data record
            const info = RCR.addresses.shops.items;
            const bank = rom.prg[info.bank];
            const ptrStart = info.start + i * 2;
            const ptrRaw = bank[ptrStart] + (bank[ptrStart + 1] << 8);
            const dataStart = ptrRaw & ~info.ptrOR;

            // Find data extent: scan to terminator for name, then fixed bytes for cost/stats
            let dataEnd = dataStart;
            // Skip name
            while (dataEnd < bank.length && bank[dataEnd] !== 0x05) dataEnd++;
            dataEnd++; // include terminator
            // If it has cost/stats, include those too
            if (i > 0 && i < 126) {
                dataEnd += 3;  // cost (3 bytes BCD)
                dataEnd += 1;  // unknown
                dataEnd += 2;  // action1, action2
                const sf1 = bank[dataEnd];
                const sf2 = bank[dataEnd + 1];
                dataEnd += 2;  // stat flags
                // Count stat bytes
                for (const bit of [0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x01]) {
                    if (sf1 & bit) dataEnd++;
                }
                if (sf2 & 0x80) dataEnd++;
            }

            const highlights = [
                { start: ptrStart, end: ptrStart + 2, type: 'ptr' },
                { start: dataStart, end: dataEnd, type: 'string' },
            ];

            const romAddr = RCR.absOffset(info.bank, dataStart);
            showHex(info.bank, dataStart, highlights,
                `PRG Bank ${info.bank} | Pointer: 0x${ptrStart.toString(16).toUpperCase()} | Data: 0x${dataStart.toString(16).toUpperCase()} | ROM: 0x${romAddr.toString(16).toUpperCase()}`
            );
        }

        function enableButtons() {
            btnUpdate.disabled = false;
            btnRevert.disabled = false;
        }

        nameInput.addEventListener('input', () => { enableButtons(); updateNameCounter(); });
        costInput.addEventListener('input', enableButtons);
        for (const el of Object.values(statInputs)) {
            el.addEventListener('input', enableButtons);
        }

        btnUpdate.addEventListener('click', () => {
            if (selectedIdx < 0) return;
            const item = shopItems[selectedIdx];

            // Validate name
            for (const ch of nameInput.value) {
                if (!RCR.isValidChar(ch)) {
                    alert(`Invalid character in name: '${ch}'`);
                    return;
                }
            }
            item.name = nameInput.value;

            if (item.cents != null) {
                const cents = RCR.parseCost(costInput.value);
                if (cents == null) {
                    alert('Invalid cost value');
                    costInput.focus();
                    return;
                }
                item.cents = cents;
                costInput.value = RCR.formatCost(cents);

                if (!item.stats) item.stats = {};
                for (const [key, el] of Object.entries(statInputs)) {
                    if (el.disabled) continue; // skip stats not present in ROM
                    const val = el.value.trim();
                    if (val === '') continue; // leave as-is
                    const num = parseInt(val, 10);
                    if (isNaN(num) || num < 0 || num > 255) {
                        alert(`Invalid stat value for ${key} (must be 0-255)`);
                        el.focus();
                        return;
                    }
                    item.stats[key] = num;
                }
            }

            // Write to ROM immediately for hex diff
            try { RCR.writeShopItems(rom, shopItems); } catch (e) { alert(e.message); return; }

            // Update list display
            const li = list.children[selectedIdx];
            li.querySelector('.label').textContent = item.name;
            const costSpan = li.querySelector('.cost');
            if (costSpan && item.cents != null) costSpan.textContent = RCR.formatCost(item.cents);

            btnUpdate.disabled = true;
            btnRevert.disabled = true;
            status(`Updated item #${selectedIdx + 1}: "${item.name}"`);
            selectItem(selectedIdx); // refresh hex view
        });

        btnRevert.addEventListener('click', () => {
            if (selectedIdx < 0) return;
            selectItem(selectedIdx);
        });
    }

    // =============================================
    // Shop Stock Editor
    // =============================================
    function populateShopStock() {
        const tree = $('#shop-stock-tree');
        const countEl = $('#tab-shop-stock .count');

        tree.innerHTML = '';
        countEl.textContent = `(${shopStock.length} shops)`;

        shopStock.forEach((list, i) => {
            const shop = document.createElement('div');
            shop.className = 'stock-shop';

            const header = document.createElement('div');
            header.className = 'stock-shop-header';
            header.innerHTML = `<span class="arrow">&#9654;</span> Stock List #${i + 1} (${list.length} items)`;
            header.addEventListener('click', () => {
                shop.classList.toggle('open');

                // Hex view — show this stock list's pointer and item ID bytes
                const info = RCR.addresses.shops.stock;
                const bank = rom.prg[info.bank];
                const ptrStart = info.start + i * 2;
                const ptrRaw = bank[ptrStart] + (bank[ptrStart + 1] << 8);
                const dataStart = ptrRaw & ~info.ptrOR;
                // Stock list: item IDs until 0xFF
                let dataEnd = dataStart;
                while (dataEnd < bank.length && bank[dataEnd] !== 0xFF) dataEnd++;
                dataEnd++; // include the 0xFF terminator

                const highlights = [
                    { start: ptrStart, end: ptrStart + 2, type: 'ptr' },
                    { start: dataStart, end: dataEnd - 1, type: 'string' },
                    { start: dataEnd - 1, end: dataEnd, type: 'terminator' },
                ];

                const romAddr = RCR.absOffset(info.bank, dataStart);
                showHex(info.bank, dataStart, highlights,
                    `PRG Bank ${info.bank} | Pointer: 0x${ptrStart.toString(16).toUpperCase()} | Data: 0x${dataStart.toString(16).toUpperCase()} | ROM: 0x${romAddr.toString(16).toUpperCase()}`
                );
            });

            const items = document.createElement('div');
            items.className = 'stock-items';

            list.forEach(itemId => {
                const div = document.createElement('div');
                div.className = 'stock-item';
                const name = shopItems[itemId] ? shopItems[itemId].name : `Item #${itemId}`;
                div.textContent = `#${itemId}: ${name}`;
                items.appendChild(div);
            });

            shop.appendChild(header);
            shop.appendChild(items);
            tree.appendChild(shop);
        });
    }

    // =============================================
    // Bosses & Gangs Editor
    // =============================================
    function populateBosses() {
        const list = $('#bosses-list');
        const fields = $('#boss-fields');
        const btnUpdate = $('#boss-update');
        const btnRevert = $('#boss-revert');
        list.innerHTML = '';

        const GANG_NAMES = ['The Generic Dudes','The Frat Guys','The Jocks','The Hackers','The Internationals','The Squids','The Eagles','The Plague','The Home Boys'];

        // Build combined list: 9 bosses then 9 gangs
        const allItems = [];
        for (let i = 0; i < 9; i++) allItems.push({ type: 'boss', index: i, label: `Boss: ${RCR.BOSS_NAMES[i]}` });
        for (let i = 0; i < 9; i++) allItems.push({ type: 'gang', index: i, label: `Gang ${i + 1}: ${GANG_NAMES[i]}` });

        allItems.forEach((item, i) => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="index">${item.type === 'boss' ? 'B' : 'G'}${item.index + 1}</span><span class="label">${escHtml(item.label)}</span>`;
            li.addEventListener('click', () => selectBossGang(i));
            list.appendChild(li);
        });

        let selectedIdx = -1;
        let inputEls = {};

        function selectBossGang(i) {
            selectedIdx = i;
            list.querySelectorAll('li').forEach((li, j) => li.classList.toggle('selected', j === i));
            const item = allItems[i];
            fields.innerHTML = '';
            inputEls = {};

            if (item.type === 'boss') {
                const boss = bossStats[item.index];
                // Cash
                const cashVal = bossCash[item.index];
                addField('Cash', 'cash', '$' + (cashVal / 100).toFixed(2));
                // Stats
                for (const stat of RCR.BOSS_STAT_NAMES) {
                    addField(stat, stat, boss[stat]);
                }
                // Hex view
                const info = RCR.addresses.bosses.stats;
                const off = info.start + item.index * 9;
                showHex(info.bank, off, [{ start: off, end: off + 9, type: 'string' }],
                    `PRG Bank ${info.bank} | Boss Stats: 0x${off.toString(16).toUpperCase()} | ROM: 0x${RCR.absOffset(info.bank, off).toString(16).toUpperCase()}`);
            } else {
                addField('Cash', 'cash', '$' + (gangCash[item.index] / 100).toFixed(2));
                addField('Turf Code', 'turfCode', gangTurfCodes[item.index]);
                const info = RCR.addresses.gangs.cash;
                const off = info.start + item.index * 2;
                showHex(info.bank, off, [{ start: off, end: off + 2, type: 'string' }],
                    `PRG Bank ${info.bank} | Gang Cash: 0x${off.toString(16).toUpperCase()}`);
            }
            btnUpdate.disabled = true;
            btnRevert.disabled = true;
        }

        function addField(label, key, value) {
            const lbl = document.createElement('label');
            lbl.textContent = label + ':';
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.value = value;
            inp.dataset.key = key;
            inp.addEventListener('input', () => { btnUpdate.disabled = false; btnRevert.disabled = false; });
            lbl.appendChild(inp);
            fields.appendChild(lbl);
            inputEls[key] = inp;
        }

        btnUpdate.addEventListener('click', () => {
            if (selectedIdx < 0) return;
            const item = allItems[selectedIdx];
            if (item.type === 'boss') {
                const cashStr = inputEls.cash.value.replace(/[^0-9.]/g, '');
                const cents = RCR.parseCost(cashStr);
                if (cents == null) { alert('Invalid cash'); return; }
                bossCash[item.index] = cents;
                for (const stat of RCR.BOSS_STAT_NAMES) {
                    const v = parseInt(inputEls[stat].value, 10);
                    if (isNaN(v) || v < 0 || v > 255) { alert(`Invalid ${stat} (0-255)`); return; }
                    bossStats[item.index][stat] = v;
                }
                RCR.writeBossStats(rom, bossStats);
                RCR.writeBossCash(rom, bossCash);
            } else {
                const cashStr = inputEls.cash.value.replace(/[^0-9.]/g, '');
                const cents = RCR.parseCost(cashStr);
                if (cents == null) { alert('Invalid cash'); return; }
                gangCash[item.index] = cents;
                const tc = parseInt(inputEls.turfCode.value, 10);
                if (isNaN(tc) || tc < 0 || tc > 255) { alert('Invalid turf code (0-255)'); return; }
                gangTurfCodes[item.index] = tc;
                RCR.writeGangCash(rom, gangCash);
                RCR.writeGangTurfCodes(rom, gangTurfCodes);
            }
            btnUpdate.disabled = true;
            btnRevert.disabled = true;
            status(`Updated ${item.label}`);
            selectBossGang(selectedIdx);
        });

        btnRevert.addEventListener('click', () => {
            if (selectedIdx < 0) return;
            selectBossGang(selectedIdx);
        });
    }

    // =============================================
    // Shop Names Editor
    // =============================================
    function populateShopNames() {
        const list = $('#shop-names-list');
        const countEl = $('#tab-shop-names .count');
        const input = $('#shop-name-input');
        const counter = $('#shop-name-counter');
        const btnUpdate = $('#shop-name-update');
        const btnRevert = $('#shop-name-revert');
        list.innerHTML = '';
        countEl.textContent = `(${shopNames.length})`;

        let selectedIdx = -1;
        let maxLen = 0;

        shopNames.forEach((name, i) => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="index">${i + 1}</span><span class="label">${escHtml(name)}</span>`;
            li.addEventListener('click', () => selectShopName(i));
            list.appendChild(li);
        });

        function updateCounter() {
            counter.textContent = `${input.value.length} / ${maxLen}`;
            counter.classList.toggle('over', input.value.length > maxLen);
        }

        function selectShopName(i) {
            selectedIdx = i;
            list.querySelectorAll('li').forEach((li, j) => li.classList.toggle('selected', j === i));
            const entries = RCR.getShopNameEntries();
            maxLen = entries[i].origLen;
            input.disabled = false;
            input.maxLength = maxLen;
            input.value = shopNames[i];
            input.dataset.original = shopNames[i];
            updateCounter();
            btnUpdate.disabled = true;
            btnRevert.disabled = true;
            input.focus();

            // Hex view
            const info = RCR.addresses.shops.names;
            const entry = entries[i];
            const ptrStart = info.start + i * 2;
            const hl = [
                { start: ptrStart, end: ptrStart + 2, type: 'ptr' },
                { start: entry.ptr, end: entry.ptr + entry.origLen, type: 'string' },
                { start: entry.ptr + entry.origLen, end: entry.ptr + entry.origLen + 1, type: 'terminator' },
            ];
            showHex(info.bank, entry.ptr, hl,
                `PRG Bank ${info.bank} | Pointer: 0x${ptrStart.toString(16).toUpperCase()} | String: 0x${entry.ptr.toString(16).toUpperCase()}`);
        }

        input.addEventListener('input', () => {
            btnUpdate.disabled = input.value === input.dataset.original;
            btnRevert.disabled = btnUpdate.disabled;
            updateCounter();
        });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnUpdate.click(); if (e.key === 'Escape') btnRevert.click(); });

        btnUpdate.addEventListener('click', () => {
            if (selectedIdx < 0) return;
            for (const ch of input.value) { if (!RCR.isValidChar(ch)) { alert(`Invalid char: '${ch}'`); return; } }
            shopNames[selectedIdx] = input.value;
            try { RCR.writeShopNames(rom, shopNames); } catch (e) { alert(e.message); return; }
            list.children[selectedIdx].querySelector('.label').textContent = input.value;
            input.dataset.original = input.value;
            btnUpdate.disabled = true; btnRevert.disabled = true;
            status(`Updated shop name #${selectedIdx + 1}`);
            selectShopName(selectedIdx);
        });

        btnRevert.addEventListener('click', () => { if (selectedIdx >= 0) { input.value = input.dataset.original; btnUpdate.disabled = true; btnRevert.disabled = true; updateCounter(); } });
    }

    // =============================================
    // Misc Text Editor
    // =============================================
    function populateMiscText() {
        const list = $('#misc-text-list');
        const countEl = $('#tab-misc-text .count');
        const input = $('#misc-text-input');
        const counter = $('#misc-text-counter');
        const btnUpdate = $('#misc-text-update');
        const btnRevert = $('#misc-text-revert');
        list.innerHTML = '';
        countEl.textContent = `(${miscText.length})`;

        let selectedIdx = -1;
        let maxLen = 0;

        miscText.forEach((text, i) => {
            const li = document.createElement('li');
            const preview = text.length > 50 ? text.substring(0, 50) + '...' : (text || '(empty)');
            li.innerHTML = `<span class="index">${i + 1}</span><span class="label">${escHtml(preview)}</span>`;
            li.addEventListener('click', () => selectMiscText(i));
            list.appendChild(li);
        });

        function updateCounter() {
            counter.textContent = `${input.value.length} / ${maxLen}`;
            counter.classList.toggle('over', input.value.length > maxLen);
        }

        function selectMiscText(i) {
            selectedIdx = i;
            list.querySelectorAll('li').forEach((li, j) => li.classList.toggle('selected', j === i));
            const entries = RCR.getMiscTextEntries();
            const entry = entries[i];
            maxLen = entry.origLen;
            input.disabled = entry.ptr < 0;
            input.maxLength = maxLen || 999;
            input.value = miscText[i];
            input.dataset.original = miscText[i];
            updateCounter();
            btnUpdate.disabled = true; btnRevert.disabled = true;
            if (!input.disabled) input.focus();

            if (entry.ptr >= 0) {
                const info = RCR.addresses.miscText;
                const ptrStart = info.start + i * 2;
                const hl = [
                    { start: ptrStart, end: ptrStart + 2, type: 'ptr' },
                    { start: entry.ptr, end: entry.ptr + entry.origLen, type: 'string' },
                    { start: entry.ptr + entry.origLen, end: entry.ptr + entry.origLen + 1, type: 'terminator' },
                ];
                showHex(info.bank, entry.ptr, hl,
                    `PRG Bank ${info.bank} | Pointer: 0x${ptrStart.toString(16).toUpperCase()} | String: 0x${entry.ptr.toString(16).toUpperCase()}`);
            }
        }

        input.addEventListener('input', () => {
            btnUpdate.disabled = input.value === input.dataset.original;
            btnRevert.disabled = btnUpdate.disabled;
            updateCounter();
        });

        btnUpdate.addEventListener('click', () => {
            if (selectedIdx < 0) return;
            for (const ch of input.value) { if (!RCR.isValidChar(ch)) { alert(`Invalid char: '${ch}'`); return; } }
            miscText[selectedIdx] = input.value;
            try { RCR.writeMiscText(rom, miscText); } catch (e) { alert(e.message); return; }
            const preview = input.value.length > 50 ? input.value.substring(0, 50) + '...' : (input.value || '(empty)');
            list.children[selectedIdx].querySelector('.label').textContent = preview;
            input.dataset.original = input.value;
            btnUpdate.disabled = true; btnRevert.disabled = true;
            status(`Updated misc text #${selectedIdx + 1}`);
            selectMiscText(selectedIdx);
        });

        btnRevert.addEventListener('click', () => { if (selectedIdx >= 0) { input.value = input.dataset.original; btnUpdate.disabled = true; btnRevert.disabled = true; updateCounter(); } });
    }

    // =============================================
    // Locations Editor
    // =============================================
    function populateLocations() {
        const list = $('#locations-list');
        const countEl = $('#tab-locations .count');
        const fields = $('#location-fields');
        const btnUpdate = $('#loc-update');
        const btnRevert = $('#loc-revert');
        list.innerHTML = '';
        countEl.textContent = `(${locations.length})`;

        let selectedIdx = -1;
        let inputEls = {};

        // Try to get location names from misc text via name codes
        function locName(i) {
            const loc = locations[i];
            if (loc.nameCode > 0 && miscText[loc.nameCode - 1]) {
                return miscText[loc.nameCode - 1].replace(/\^/g, ' ');
            }
            return `Location ${i}`;
        }

        locations.forEach((loc, i) => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="index">${i}</span><span class="label">${escHtml(locName(i))}</span>`;
            li.addEventListener('click', () => selectLocation(i));
            list.appendChild(li);
        });

        function selectLocation(i) {
            selectedIdx = i;
            list.querySelectorAll('li').forEach((li, j) => li.classList.toggle('selected', j === i));
            const loc = locations[i];
            fields.innerHTML = '';
            inputEls = {};

            addLocField('Music Track', 'musicTrack', loc.musicTrack);
            addLocField('Pacifist Mode', 'pacifistMode', loc.pacifistMode ? 'on' : 'off');
            addLocField('Reincarnation', 'reincarnation', loc.reincarnation);
            addLocField('Boundary Min', 'boundaryMin', loc.boundaryMin);
            addLocField('Boundary Max', 'boundaryMax', loc.boundaryMax);

            btnUpdate.disabled = true; btnRevert.disabled = true;

            // Hex view - show boundary data
            const bInfo = RCR.addresses.locations.boundaries;
            const bOff = bInfo.start + i * 4;
            showHex(bInfo.bank, bOff, [{ start: bOff, end: bOff + 4, type: 'string' }],
                `PRG Bank ${bInfo.bank} | Location ${i} Boundaries: 0x${bOff.toString(16).toUpperCase()}`);
        }

        function addLocField(label, key, value) {
            const lbl = document.createElement('label');
            lbl.textContent = label + ':';
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.value = value;
            inp.dataset.key = key;
            inp.addEventListener('input', () => { btnUpdate.disabled = false; btnRevert.disabled = false; });
            lbl.appendChild(inp);
            fields.appendChild(lbl);
            inputEls[key] = inp;
        }

        btnUpdate.addEventListener('click', () => {
            if (selectedIdx < 0) return;
            const loc = locations[selectedIdx];

            const mt = parseInt(inputEls.musicTrack.value, 10);
            if (isNaN(mt) || mt < 0 || mt > 255) { alert('Music track must be 0-255'); return; }

            const pm = inputEls.pacifistMode.value.trim().toLowerCase();
            if (pm !== 'on' && pm !== 'off') { alert('Pacifist mode must be "on" or "off"'); return; }

            const ri = parseInt(inputEls.reincarnation.value, 10);
            if (isNaN(ri) || ri < 0 || ri > 255) { alert('Reincarnation must be 0-255'); return; }

            const bMin = parseInt(inputEls.boundaryMin.value, 10);
            const bMax = parseInt(inputEls.boundaryMax.value, 10);
            if (isNaN(bMin) || isNaN(bMax) || bMin < 0 || bMax < bMin + 256) { alert('Invalid boundaries (max must be >= min + 256)'); return; }

            loc.musicTrack = mt;
            loc.pacifistMode = pm === 'on' ? 1 : 0;
            loc.reincarnation = ri;
            loc.boundaryMin = bMin;
            loc.boundaryMax = bMax;

            RCR.writeLocations(rom, locations);
            btnUpdate.disabled = true; btnRevert.disabled = true;
            status(`Updated location ${selectedIdx}`);
            selectLocation(selectedIdx);
        });

        btnRevert.addEventListener('click', () => { if (selectedIdx >= 0) selectLocation(selectedIdx); });
    }

    // =============================================
    // CHR Tile Viewer
    // =============================================
    function populateCHRViewer() {
        const bankSelect = $('#chr-bank-select');
        const paletteSelect = $('#chr-palette-select');
        const gridCanvas = $('#chr-grid-canvas');
        const detailCanvas = $('#chr-detail-canvas');
        const tileInfo = $('#chr-tile-info');
        const palPreview = $('#chr-palette-preview');

        const gridCtx = gridCanvas.getContext('2d');
        const detailCtx = detailCanvas.getContext('2d');

        const COLS = 16;
        const ROWS = 32;
        const SCALE = 2;
        gridCanvas.width = COLS * 8 * SCALE;
        gridCanvas.height = ROWS * 8 * SCALE;
        detailCanvas.width = 256;
        detailCanvas.height = 256;

        let selectedTile = -1;
        let currentPalette = RCR.GRAYSCALE_PALETTE;

        // Populate bank selector
        bankSelect.innerHTML = '';
        for (let i = 0; i < rom.chrCount; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `Bank ${i}`;
            bankSelect.appendChild(opt);
        }

        // Populate palette selector
        paletteSelect.innerHTML = '<option value="-1">Grayscale</option>';
        romPalettes.forEach((pal, i) => {
            if (!pal) return;
            const opt = document.createElement('option');
            opt.value = i;
            // Show sub-palette groups: each ROM palette has 4 sub-palettes of 4 colors
            opt.textContent = `Palette ${i}`;
            paletteSelect.appendChild(opt);
        });

        // Get the current 4-color sub-palette for rendering
        // ROM palettes have 16 colors (4 sub-palettes of 4). We use sub-palette 0 by default,
        // but let the user cycle through with the swatch clicks.
        let subPaletteIndex = 0;

        function getCurrentPalette() {
            const palIdx = parseInt(paletteSelect.value);
            if (palIdx < 0 || !romPalettes[palIdx]) return RCR.GRAYSCALE_PALETTE;
            const pal = romPalettes[palIdx];
            const base = subPaletteIndex * 4;
            return [pal.colors[base], pal.colors[base + 1], pal.colors[base + 2], pal.colors[base + 3]];
        }

        function renderGrid() {
            const bankIdx = parseInt(bankSelect.value);
            const chrBank = rom.chr[bankIdx];
            const pal = getCurrentPalette();

            gridCtx.imageSmoothingEnabled = false;

            // Render all 512 tiles to an offscreen canvas at 1x, then scale
            const offscreen = new OffscreenCanvas(COLS * 8, ROWS * 8);
            const offCtx = offscreen.getContext('2d');
            const imgData = offCtx.createImageData(COLS * 8, ROWS * 8);
            const data = imgData.data;

            for (let t = 0; t < 512; t++) {
                const pixels = RCR.decodeTile(chrBank, t);
                const tileCol = t % COLS;
                const tileRow = Math.floor(t / COLS);
                const baseX = tileCol * 8;
                const baseY = tileRow * 8;

                for (let y = 0; y < 8; y++) {
                    for (let x = 0; x < 8; x++) {
                        const colorIdx = pixels[y * 8 + x];
                        const [r, g, b] = pal[colorIdx];
                        const px = ((baseY + y) * COLS * 8 + (baseX + x)) * 4;
                        data[px] = r;
                        data[px + 1] = g;
                        data[px + 2] = b;
                        data[px + 3] = colorIdx === 0 ? 40 : 255;
                    }
                }
            }

            offCtx.putImageData(imgData, 0, 0);
            gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
            gridCtx.drawImage(offscreen, 0, 0, gridCanvas.width, gridCanvas.height);

            // Draw selection highlight
            if (selectedTile >= 0) {
                const col = selectedTile % COLS;
                const row = Math.floor(selectedTile / COLS);
                gridCtx.strokeStyle = '#e94560';
                gridCtx.lineWidth = 2;
                gridCtx.strokeRect(col * 8 * SCALE, row * 8 * SCALE, 8 * SCALE, 8 * SCALE);
            }
        }

        function renderDetail() {
            detailCtx.imageSmoothingEnabled = false;
            detailCtx.clearRect(0, 0, 256, 256);

            if (selectedTile < 0) return;

            const bankIdx = parseInt(bankSelect.value);
            const chrBank = rom.chr[bankIdx];
            const pal = getCurrentPalette();
            const pixels = RCR.decodeTile(chrBank, selectedTile);

            const imgData = detailCtx.createImageData(8, 8);
            for (let i = 0; i < 64; i++) {
                const colorIdx = pixels[i];
                const [r, g, b] = pal[colorIdx];
                imgData.data[i * 4] = r;
                imgData.data[i * 4 + 1] = g;
                imgData.data[i * 4 + 2] = b;
                imgData.data[i * 4 + 3] = colorIdx === 0 ? 40 : 255;
            }

            // Draw at 32x scale
            const tmp = new OffscreenCanvas(8, 8);
            const tmpCtx = tmp.getContext('2d');
            tmpCtx.putImageData(imgData, 0, 0);
            detailCtx.drawImage(tmp, 0, 0, 256, 256);

            // Draw grid lines
            detailCtx.strokeStyle = 'rgba(255,255,255,0.1)';
            detailCtx.lineWidth = 1;
            for (let i = 1; i < 8; i++) {
                const pos = i * 32;
                detailCtx.beginPath();
                detailCtx.moveTo(pos, 0); detailCtx.lineTo(pos, 256);
                detailCtx.moveTo(0, pos); detailCtx.lineTo(256, pos);
                detailCtx.stroke();
            }
        }

        function updatePalettePreview() {
            const pal = getCurrentPalette();
            palPreview.innerHTML = '';
            for (let i = 0; i < 4; i++) {
                const swatch = document.createElement('div');
                swatch.className = 'pal-swatch' + (i === subPaletteIndex % 4 ? '' : '');
                swatch.style.background = `rgb(${pal[i][0]},${pal[i][1]},${pal[i][2]})`;
                swatch.title = `Color ${i}: NES #${pal[i].map(v => v.toString(16).padStart(2, '0')).join('')}`;
                palPreview.appendChild(swatch);
            }
        }

        function updateTileInfo() {
            if (selectedTile < 0) {
                tileInfo.textContent = 'Click a tile to inspect it';
                return;
            }
            const bankIdx = parseInt(bankSelect.value);
            const chrOffset = selectedTile * 16;
            const romOffset = RCR.HEADER_SIZE + rom.prgCount * RCR.PRG_BANK_SIZE + bankIdx * RCR.CHR_BANK_SIZE + chrOffset;
            tileInfo.innerHTML =
                `Tile #${selectedTile} (0x${selectedTile.toString(16).toUpperCase()})<br>` +
                `CHR Bank ${bankIdx}, Offset 0x${chrOffset.toString(16).toUpperCase()}<br>` +
                `ROM: 0x${romOffset.toString(16).toUpperCase()}`;
        }

        function refresh() {
            currentPalette = getCurrentPalette();
            renderGrid();
            renderDetail();
            updatePalettePreview();
            updateTileInfo();
        }

        // Events
        bankSelect.addEventListener('change', () => { selectedTile = -1; refresh(); });
        paletteSelect.addEventListener('change', refresh);

        gridCanvas.addEventListener('click', (e) => {
            const rect = gridCanvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / (rect.width / (COLS * 8));
            const y = (e.clientY - rect.top) / (rect.height / (ROWS * 8));
            const col = Math.floor(x / 8);
            const row = Math.floor(y / 8);
            selectedTile = row * COLS + col;
            if (selectedTile >= 512) selectedTile = 511;
            refresh();

            // Show hex view of the tile's 16 bytes
            const bankIdx = parseInt(bankSelect.value);
            const chrOffset = selectedTile * 16;
            const hl = [{ start: chrOffset, end: chrOffset + 8, type: 'ptr' },
                        { start: chrOffset + 8, end: chrOffset + 16, type: 'string' }];
            // Use a special hex view for CHR banks
            showCHRHex(bankIdx, chrOffset, hl);
        });

        // Sub-palette cycling: click the palette preview area to cycle 0-3
        palPreview.addEventListener('click', () => {
            subPaletteIndex = (subPaletteIndex + 1) % 4;
            refresh();
        });

        refresh();
    }

    // =============================================
    // Sprite Viewer
    // =============================================
    function populateSpriteViewer() {
        const list = $('#sprite-set-list');
        const countEl = $('#sprite-set-count');
        const bankSelect = $('#sprite-chr-bank-select');
        const paletteSelect = $('#sprite-palette-select');
        const canvas = $('#sprite-canvas');
        const infoEl = $('#sprite-info');
        const ctx = canvas.getContext('2d');

        list.innerHTML = '';
        countEl.textContent = `(${spriteSets.length})`;

        // Populate bank/palette selectors
        bankSelect.innerHTML = '';
        for (let i = 0; i < rom.chrCount; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `Bank ${i}`;
            bankSelect.appendChild(opt);
        }
        // Default to bank 8 which typically has character sprites
        bankSelect.value = '8';

        paletteSelect.innerHTML = '<option value="-1">Grayscale</option>';
        romPalettes.forEach((pal, i) => {
            if (!pal) return;
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `Palette ${i}`;
            paletteSelect.appendChild(opt);
        });

        let selectedSet = -1;
        let subPalIdx = 0;

        function getSprPalette() {
            const palIdx = parseInt(paletteSelect.value);
            if (palIdx < 0 || !romPalettes[palIdx]) return RCR.GRAYSCALE_PALETTE;
            const pal = romPalettes[palIdx];
            const base = subPalIdx * 4;
            return [pal.colors[base], pal.colors[base + 1], pal.colors[base + 2], pal.colors[base + 3]];
        }

        // Build sprite set list
        spriteSets.forEach((set, i) => {
            const li = document.createElement('li');
            const count = set ? set.length : 0;
            const label = set ? `Set ${i} (${count} sprites)` : `Set ${i} (empty)`;
            li.innerHTML = `<span class="index">${i}</span><span class="label">${label}</span>`;
            if (!set) li.style.opacity = '0.4';
            li.addEventListener('click', () => selectSet(i));
            list.appendChild(li);
        });

        function selectSet(i) {
            selectedSet = i;
            list.querySelectorAll('li').forEach((li, j) => li.classList.toggle('selected', j === i));
            renderSpriteSet();
        }

        function renderSpriteSet() {
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (selectedSet < 0 || !spriteSets[selectedSet]) {
                infoEl.textContent = 'Select a sprite set';
                return;
            }

            const set = spriteSets[selectedSet];
            const chrBankIdx = parseInt(bankSelect.value);
            const chrBank = rom.chr[chrBankIdx];
            const pal = getSprPalette();

            // Each sprite entry has flags and tileCount
            // tileCount indicates how many 8x8 tiles this sprite uses
            // Render each sprite's tiles in a grid layout
            const SCALE = 4;
            const TILE_PX = 8 * SCALE;
            const COLS = Math.min(8, set.length);
            const GAP = 4;

            let x = 0, y = 0;
            let maxRowH = 0;

            // Resize canvas to fit
            const totalW = Math.min(set.length, COLS) * (TILE_PX + GAP);
            canvas.width = Math.max(256, totalW);
            canvas.height = Math.max(256, Math.ceil(set.length / COLS) * (TILE_PX * 2 + GAP));
            ctx.imageSmoothingEnabled = false;

            // Draw a checkerboard background
            ctx.fillStyle = '#222';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            for (let si = 0; si < set.length; si++) {
                const sprite = set[si];
                if (!sprite) {
                    x += TILE_PX + GAP;
                    if ((si + 1) % COLS === 0) { x = 0; y += TILE_PX * 2 + GAP; }
                    continue;
                }

                // The flags byte contains sprite rendering info
                // The tileCount byte is the starting tile index in the CHR bank
                // Render the tile at the given index
                const tileIdx = sprite.tileCount;

                // In 8x16 sprite mode (common for RCR), each sprite is 2 tiles stacked
                // Render the tile and the one below it
                for (let t = 0; t < 2; t++) {
                    const idx = tileIdx + t;
                    if (idx >= 512) break;
                    const pixels = RCR.decodeTile(chrBank, idx);

                    const tmp = new OffscreenCanvas(8, 8);
                    const tmpCtx = tmp.getContext('2d');
                    const imgData = tmpCtx.createImageData(8, 8);
                    for (let p = 0; p < 64; p++) {
                        const ci = pixels[p];
                        const [r, g, b] = pal[ci];
                        imgData.data[p * 4] = r;
                        imgData.data[p * 4 + 1] = g;
                        imgData.data[p * 4 + 2] = b;
                        imgData.data[p * 4 + 3] = ci === 0 ? 20 : 255;
                    }
                    tmpCtx.putImageData(imgData, 0, 0);

                    // Apply flip based on flags
                    ctx.save();
                    const dx = x;
                    const dy = y + t * TILE_PX;
                    const flipH = sprite.flags & 0x40;
                    const flipV = sprite.flags & 0x80;

                    if (flipH || flipV) {
                        ctx.translate(dx + (flipH ? TILE_PX : 0), dy + (flipV ? TILE_PX : 0));
                        ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
                        ctx.drawImage(tmp, 0, 0, TILE_PX, TILE_PX);
                    } else {
                        ctx.drawImage(tmp, dx, dy, TILE_PX, TILE_PX);
                    }
                    ctx.restore();
                }

                x += TILE_PX + GAP;
                if ((si + 1) % COLS === 0) { x = 0; y += TILE_PX * 2 + GAP; }
            }

            infoEl.innerHTML = `Set ${selectedSet}: ${set.length} sprites | CHR Bank ${chrBankIdx}<br>` +
                `Flags byte encodes: bit6=H-flip, bit7=V-flip, bits0-1=palette`;
        }

        bankSelect.addEventListener('change', renderSpriteSet);
        paletteSelect.addEventListener('change', renderSpriteSet);
    }

    // =============================================
    // NES Emulator (JSNES)
    // =============================================
    let nes = null;
    let emuRunning = false;
    let emuRafId = null;
    let romArrayBuffer = null; // store the raw ROM for the emulator

    function initEmulator() {
        const emuCanvas = $('#emu-canvas');
        const emuCtx = emuCanvas.getContext('2d');
        const emuImgData = emuCtx.createImageData(256, 240);
        const btnPlay = $('#emu-play');
        const btnPause = $('#emu-pause');
        const btnReset = $('#emu-reset');
        const btnCapture = $('#emu-capture');
        const emuStatus = $('#emu-status');
        const oamCanvas = $('#oam-canvas');
        const oamCtx = oamCanvas.getContext('2d');
        const oamInfo = $('#oam-info');

        // Frame buffer from JSNES (256x240 pixels, each a 24-bit color)
        let frameBuffer = null;

        function onFrame(buffer) {
            frameBuffer = buffer;
            // JSNES buffer is 256*240 ints but with R/B channels swapped (0xBBGGRR)
            for (let i = 0; i < 256 * 240; i++) {
                const c = buffer[i];
                emuImgData.data[i * 4] = c & 0xFF;           // R (from low byte)
                emuImgData.data[i * 4 + 1] = (c >> 8) & 0xFF; // G
                emuImgData.data[i * 4 + 2] = (c >> 16) & 0xFF; // B (from high byte)
                emuImgData.data[i * 4 + 3] = 255;
            }
            emuCtx.putImageData(emuImgData, 0, 0);
        }

        // Audio stub (required by JSNES but we don't need sound)
        function onAudioSample(left, right) {}

        function createNES() {
            nes = new jsnes.NES({
                onFrame: onFrame,
                onAudioSample: onAudioSample,
            });
        }

        function loadROM() {
            if (!romArrayBuffer) return false;
            createNES();
            // JSNES expects a string where each char is a byte
            const data = new Uint8Array(romArrayBuffer);
            let romStr = '';
            for (let i = 0; i < data.length; i++) {
                romStr += String.fromCharCode(data[i]);
            }
            nes.loadROM(romStr);
            return true;
        }

        let emuFrameCount = 0;
        function emuLoop() {
            if (!emuRunning || !nes) return;
            nes.frame();
            emuFrameCount++;
            if (emuFrameCount % 10 === 0) updateRAMDisplay();
            emuRafId = requestAnimationFrame(emuLoop);
        }

        btnPlay.addEventListener('click', () => {
            if (!nes) {
                if (!loadROM()) {
                    emuStatus.textContent = 'No ROM loaded';
                    return;
                }
            }
            emuRunning = true;
            btnPlay.disabled = true;
            btnPause.disabled = false;
            btnReset.disabled = false;
            btnCapture.disabled = false;
            emuStatus.textContent = 'Running';
            emuLoop();
        });

        btnPause.addEventListener('click', () => {
            emuRunning = false;
            if (emuRafId) cancelAnimationFrame(emuRafId);
            btnPlay.disabled = false;
            btnPause.disabled = true;
            emuStatus.textContent = 'Paused';
        });

        btnReset.addEventListener('click', () => {
            emuRunning = false;
            if (emuRafId) cancelAnimationFrame(emuRafId);
            if (loadROM()) {
                emuRunning = true;
                btnPlay.disabled = true;
                btnPause.disabled = false;
                emuStatus.textContent = 'Running';
                emuLoop();
            }
        });

        // Keyboard input
        const keyMap = {
            'ArrowUp':    [1, jsnes.Controller.BUTTON_UP],
            'ArrowDown':  [1, jsnes.Controller.BUTTON_DOWN],
            'ArrowLeft':  [1, jsnes.Controller.BUTTON_LEFT],
            'ArrowRight': [1, jsnes.Controller.BUTTON_RIGHT],
            'z':          [1, jsnes.Controller.BUTTON_A],
            'Z':          [1, jsnes.Controller.BUTTON_A],
            'x':          [1, jsnes.Controller.BUTTON_B],
            'X':          [1, jsnes.Controller.BUTTON_B],
            'Enter':      [1, jsnes.Controller.BUTTON_START],
            'Shift':      [1, jsnes.Controller.BUTTON_SELECT],
        };

        document.addEventListener('keydown', (e) => {
            if (!nes || !emuRunning) return;
            const mapping = keyMap[e.key];
            if (mapping) {
                nes.buttonDown(mapping[0], mapping[1]);
                e.preventDefault();
            }
        });

        document.addEventListener('keyup', (e) => {
            if (!nes || !emuRunning) return;
            const mapping = keyMap[e.key];
            if (mapping) {
                nes.buttonUp(mapping[0], mapping[1]);
                e.preventDefault();
            }
        });

        // OAM Capture
        btnCapture.addEventListener('click', () => {
            if (!nes) return;

            // Pause for capture
            emuRunning = false;
            if (emuRafId) cancelAnimationFrame(emuRafId);
            btnPlay.disabled = false;
            btnPause.disabled = true;
            emuStatus.textContent = 'Paused (OAM captured)';

            const spriteSize = nes.ppu.f_spriteSize ? 16 : 8;
            const SCALE = 2;

            // --- Helper: get palette for a sprite ---
            function getSprPal(palIdx) {
                const pal = [];
                for (let c = 0; c < 4; c++) {
                    const bgr32 = (c === 0) ? nes.ppu.imgPalette[0] : nes.ppu.sprPalette[palIdx * 4 + c];
                    pal.push([bgr32 & 0xFF, (bgr32 >> 8) & 0xFF, (bgr32 >> 16) & 0xFF]);
                }
                return pal;
            }

            // --- Helper: render one sprite tile to an offscreen canvas ---
            function renderSpriteTile(spr, tileOffset) {
                let tileAddr;
                if (spriteSize === 16) {
                    const bank = (spr.tile & 1) * 0x1000;
                    tileAddr = bank + (spr.tile & 0xFE) * 16 + tileOffset * 16;
                } else {
                    const bank = nes.ppu.f_spPatternTable * 0x1000;
                    tileAddr = bank + spr.tile * 16;
                }
                const pal = getSprPal(spr.attr & 0x03);
                const tmp = new OffscreenCanvas(8, 8);
                const tmpCtx = tmp.getContext('2d');
                const imgData = tmpCtx.createImageData(8, 8);
                for (let py = 0; py < 8; py++) {
                    const lo = nes.ppu.vramMem[tileAddr + py];
                    const hi = nes.ppu.vramMem[tileAddr + 8 + py];
                    for (let px = 0; px < 8; px++) {
                        const bit0 = (lo >> (7 - px)) & 1;
                        const bit1 = (hi >> (7 - px)) & 1;
                        const ci = (bit1 << 1) | bit0;
                        const [r, g, b] = pal[ci];
                        const idx = (py * 8 + px) * 4;
                        imgData.data[idx] = r;
                        imgData.data[idx + 1] = g;
                        imgData.data[idx + 2] = b;
                        imgData.data[idx + 3] = ci === 0 ? 0 : 255;
                    }
                }
                tmpCtx.putImageData(imgData, 0, 0);
                return tmp;
            }

            // --- Helper: draw a sprite onto a context with flip ---
            function drawSpriteToCtx(ctx, spr, dx, dy, scale) {
                const flipH = spr.attr & 0x40;
                const flipV = spr.attr & 0x80;
                const tileCount = spriteSize === 16 ? 2 : 1;
                for (let t = 0; t < tileCount; t++) {
                    const tmp = renderSpriteTile(spr, t);
                    const tileY = flipV ? (tileCount - 1 - t) : t;
                    const sx = dx;
                    const sy = dy + tileY * 8 * scale;
                    ctx.save();
                    if (flipH || flipV) {
                        ctx.translate(sx + (flipH ? 8 * scale : 0), sy + (flipV ? 8 * scale : 0));
                        ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
                        ctx.drawImage(tmp, 0, 0, 8 * scale, 8 * scale);
                    } else {
                        ctx.drawImage(tmp, sx, sy, 8 * scale, 8 * scale);
                    }
                    ctx.restore();
                }
            }

            // --- Read OAM ---
            const oam = nes.ppu.spriteMem;
            const sprites = [];
            for (let i = 0; i < 64; i++) {
                const y = oam[i * 4];
                const tile = oam[i * 4 + 1];
                const attr = oam[i * 4 + 2];
                const x = oam[i * 4 + 3];
                if (y >= 0xEF) continue;
                sprites.push({ y: y + 1, tile, attr, x, index: i });
            }

            // --- Render all sprites on OAM canvas ---
            oamCtx.imageSmoothingEnabled = false;
            oamCanvas.width = 512;
            oamCanvas.height = 480;
            oamCtx.fillStyle = '#111';
            oamCtx.fillRect(0, 0, 512, 480);

            for (const spr of sprites) {
                drawSpriteToCtx(oamCtx, spr, spr.x * SCALE, spr.y * SCALE, SCALE);
            }

            // --- Cluster sprites into characters ---
            // Two sprites belong to the same character if they're within threshold pixels
            const CLUSTER_THRESHOLD = 12; // pixels gap tolerance
            const clusters = [];
            const assigned = new Set();

            for (let i = 0; i < sprites.length; i++) {
                if (assigned.has(i)) continue;
                const cluster = [i];
                assigned.add(i);
                // BFS to find connected sprites
                const queue = [i];
                while (queue.length > 0) {
                    const ci = queue.shift();
                    const cs = sprites[ci];
                    for (let j = 0; j < sprites.length; j++) {
                        if (assigned.has(j)) continue;
                        const os = sprites[j];
                        const dx = Math.abs(cs.x - os.x);
                        const dy = Math.abs(cs.y - os.y);
                        if (dx <= CLUSTER_THRESHOLD && dy <= CLUSTER_THRESHOLD + spriteSize) {
                            cluster.push(j);
                            assigned.add(j);
                            queue.push(j);
                        }
                    }
                }
                clusters.push(cluster.map(idx => sprites[idx]));
            }

            // Sort clusters by X position
            clusters.sort((a, b) => {
                const ax = Math.min(...a.map(s => s.x));
                const bx = Math.min(...b.map(s => s.x));
                return ax - bx;
            });

            // --- Draw bounding boxes on OAM canvas ---
            const clusterColors = ['#e94560', '#4ecca3', '#ffd700', '#a0e0ff', '#ff6b81', '#b0f0b0', '#d0b0f0', '#f0cf af'];
            for (let ci = 0; ci < clusters.length; ci++) {
                const cl = clusters[ci];
                const minX = Math.min(...cl.map(s => s.x));
                const minY = Math.min(...cl.map(s => s.y));
                const maxX = Math.max(...cl.map(s => s.x)) + 8;
                const maxY = Math.max(...cl.map(s => s.y)) + spriteSize;
                oamCtx.strokeStyle = clusterColors[ci % clusterColors.length];
                oamCtx.lineWidth = 1;
                oamCtx.strokeRect(minX * SCALE - 1, minY * SCALE - 1, (maxX - minX) * SCALE + 2, (maxY - minY) * SCALE + 2);
            }

            oamInfo.textContent = `Captured ${sprites.length} sprites -> ${clusters.length} characters (${spriteSize === 16 ? '8x16' : '8x8'} mode)`;

            // --- Read entity slots from RAM ---
            const mem = nes.cpu.mem;
            const STAT_BASES = [
                { name: 'Punch', base: 0x049F },
                { name: 'Kick', base: 0x04A3 },
                { name: 'Weapon', base: 0x04A7 },
                { name: 'Throw', base: 0x04AB },
                { name: 'Agility', base: 0x04AF },
                { name: 'Defence', base: 0x04B3 },
                { name: 'Strength', base: 0x04B7 },
                { name: 'WillPower', base: 0x04BB },
                { name: 'Stamina', base: 0x04BF },
                { name: 'MaxPower', base: 0x04C3 },
            ];

            const entities = [];
            for (let slot = 0; slot < 4; slot++) {
                const charId = mem[0x04F5 + slot];
                const charType = mem[0x04F9 + slot];
                const stats = {};
                for (const s of STAT_BASES) {
                    stats[s.name] = mem[s.base + slot];
                }

                // Determine name
                let name = 'Unknown';
                const slotLabel = slot === 0 ? 'Player 1' : slot === 1 ? 'Player 2' : `Enemy ${slot - 1}`;
                if (charType >= 9 && charType <= 22) {
                    // Boss: NPC name index = charType + 54
                    const nameIdx = charType + 54;
                    if (nameIdx < npcNames.length) name = npcNames[nameIdx];
                } else if (charType <= 8) {
                    // Gang member: charId might give us the actual NPC name
                    // charId for gang members maps into the NPC name table differently
                    // We can use charId directly if it's in the valid range
                    if (charId < npcNames.length) name = npcNames[charId];
                }

                // Check if entity is active (non-zero stamina or type)
                const active = stats.Stamina > 0 || stats.MaxPower > 0 || charType > 0;

                entities.push({ slot, slotLabel, charId, charType, name, stats, active });
            }

            // --- Render character cards ---
            const charLabel = $('#char-detect-label');
            const charList = $('#char-detect-list');
            charLabel.style.display = clusters.length > 0 ? 'block' : 'none';
            charList.innerHTML = '';

            for (let ci = 0; ci < clusters.length; ci++) {
                const cl = clusters[ci];
                const minX = Math.min(...cl.map(s => s.x));
                const minY = Math.min(...cl.map(s => s.y));
                const maxX = Math.max(...cl.map(s => s.x)) + 8;
                const maxY = Math.max(...cl.map(s => s.y)) + spriteSize;
                const w = maxX - minX;
                const h = maxY - minY;

                // Render isolated character
                const charScale = 4;
                const charCanvas = document.createElement('canvas');
                charCanvas.width = w * charScale;
                charCanvas.height = h * charScale;
                const charCtx = charCanvas.getContext('2d');
                charCtx.imageSmoothingEnabled = false;

                for (const spr of cl) {
                    drawSpriteToCtx(charCtx, spr, (spr.x - minX) * charScale, (spr.y - minY) * charScale, charScale);
                }

                // Collect unique tile IDs
                const tileIds = [...new Set(cl.map(s => s.tile))].sort((a, b) => a - b);
                const palettes = [...new Set(cl.map(s => s.attr & 0x03))];

                // Try to match this cluster to an entity slot
                // We can't directly map OAM to entity by position without knowing
                // entity screen coordinates, so show all active entities as context
                // and let the user match by visual appearance

                // Build card
                const card = document.createElement('div');
                card.className = 'char-card';
                card.style.borderLeftColor = clusterColors[ci % clusterColors.length];
                card.style.borderLeftWidth = '3px';

                const header = document.createElement('div');
                header.className = 'char-card-header';
                header.appendChild(charCanvas);

                const info = document.createElement('div');
                info.innerHTML =
                    `<div class="char-card-title">Character ${ci + 1}</div>` +
                    `<div class="char-card-meta">` +
                    `Position: (${minX}, ${minY})<br>` +
                    `Size: ${w}x${h} px (${cl.length} sprites)<br>` +
                    `Palette: ${palettes.map(p => '#' + p).join(', ')}` +
                    `</div>`;
                header.appendChild(info);
                card.appendChild(header);

                // Tile badges
                const tilesDiv = document.createElement('div');
                tilesDiv.className = 'char-card-tiles';
                for (const tid of tileIds) {
                    const badge = document.createElement('span');
                    badge.className = 'tile-badge';
                    badge.textContent = '0x' + tid.toString(16).toUpperCase().padStart(2, '0');
                    badge.title = `Tile $${tid.toString(16).toUpperCase()} — click to view in CHR Tiles tab`;
                    tilesDiv.appendChild(badge);
                }
                card.appendChild(tilesDiv);

                charList.appendChild(card);
            }

            // --- Active Entities panel ---
            const activeEntities = entities.filter(e => e.active);
            if (activeEntities.length > 0) {
                const entLabel = document.createElement('div');
                entLabel.className = 'chr-preview-label';
                entLabel.style.marginTop = '12px';
                entLabel.textContent = `Active Entities (${activeEntities.length} slots)`;
                charList.appendChild(entLabel);

                for (const ent of activeEntities) {
                    const entCard = document.createElement('div');
                    entCard.className = 'char-card';

                    // Header with name and slot
                    let typeDesc = '';
                    if (ent.charType >= 9 && ent.charType <= 22) {
                        typeDesc = `Boss (type ${ent.charType})`;
                    } else if (ent.charType <= 8) {
                        typeDesc = `Gang slot ${ent.charType}`;
                    } else {
                        typeDesc = `Type ${ent.charType}`;
                    }

                    let html = `<div class="char-card-title">${escHtml(ent.slotLabel)}: ${escHtml(ent.name)}</div>`;
                    html += `<div class="char-card-meta">`;
                    html += `ID: ${ent.charId} | ${typeDesc}<br>`;

                    // Stats in a compact format
                    const statParts = [];
                    for (const s of STAT_BASES) {
                        const v = ent.stats[s.name];
                        if (v > 0 || s.name === 'Stamina' || s.name === 'MaxPower') {
                            statParts.push(`${s.name}: <strong>${v}</strong>`);
                        }
                    }
                    html += statParts.join(' | ');
                    html += `</div>`;
                    entCard.innerHTML = html;
                    charList.appendChild(entCard);
                }
            }
        });

        // --- Side panel tab switching ---
        const sideTabs = document.querySelectorAll('.emu-side-tab');
        sideTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                sideTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.querySelectorAll('.emu-side-content').forEach(p => p.style.display = 'none');
                $('#' + tab.dataset.panel).style.display = 'flex';
            });
        });

        // --- RAM Viewer ---
        const KNOWN_WATCHES = {
            'ram-p1-stats': [
                { addr: 0x049F, label: 'Punch' },
                { addr: 0x04A3, label: 'Kick' },
                { addr: 0x04A7, label: 'Weapon' },
                { addr: 0x04AB, label: 'Throw' },
                { addr: 0x04AF, label: 'Agility' },
                { addr: 0x04B3, label: 'Defence' },
                { addr: 0x04B7, label: 'Strength' },
                { addr: 0x04BB, label: 'WillPower' },
                { addr: 0x04BF, label: 'Stamina' },
                { addr: 0x04C3, label: 'MaxPower' },
            ],
            'ram-p2-stats': [
                { addr: 0x04A0, label: 'Punch' },
                { addr: 0x04A4, label: 'Kick' },
                { addr: 0x04A8, label: 'Weapon' },
                { addr: 0x04AC, label: 'Throw' },
                { addr: 0x04B0, label: 'Agility' },
                { addr: 0x04B4, label: 'Defence' },
                { addr: 0x04B8, label: 'Strength' },
                { addr: 0x04BC, label: 'WillPower' },
                { addr: 0x04C0, label: 'Stamina' },
                { addr: 0x04C4, label: 'MaxPower' },
            ],
            'ram-p1-money': [
                { addr: 0x04C7, label: 'Cents', fmt: 'bcd' },
                { addr: 0x04C8, label: 'Dollars', fmt: 'bcd' },
                { addr: 0x04C9, label: 'Hundreds' },
            ],
            'ram-p2-money': [
                { addr: 0x04CA, label: 'Cents', fmt: 'bcd' },
                { addr: 0x04CB, label: 'Dollars', fmt: 'bcd' },
                { addr: 0x04CC, label: 'Hundreds' },
            ],
            'ram-game-state': [
                { addr: 0x04F5, label: 'P1 Char ID' },
                { addr: 0x04F6, label: 'P2 Char ID' },
                { addr: 0x04F9, label: 'P1 Char Type' },
                { addr: 0x04FA, label: 'P2 Char Type' },
                { addr: 0x04E1, label: 'Location' },
                { addr: 0x0519, label: 'Enemy Config' },
                { addr: 0x064C, label: 'Difficulty' },
            ],
        };

        const customWatches = [];
        let prevRAMValues = {};

        // Build static watch grids
        for (const [gridId, watches] of Object.entries(KNOWN_WATCHES)) {
            const grid = $('#' + gridId);
            grid.innerHTML = '';
            for (const w of watches) {
                const el = document.createElement('div');
                el.className = 'ram-entry';
                el.innerHTML = `<span class="ram-label">${w.label}</span><span class="ram-value" data-addr="${w.addr}" data-fmt="${w.fmt || ''}">--</span>`;
                grid.appendChild(el);
            }
        }

        function updateRAMDisplay() {
            if (!nes) return;
            const mem = nes.cpu.mem;
            document.querySelectorAll('.ram-value[data-addr]').forEach(el => {
                const addr = parseInt(el.dataset.addr);
                const val = mem[addr];
                const prevKey = 'a' + addr;
                const changed = prevRAMValues[prevKey] !== undefined && prevRAMValues[prevKey] !== val;
                el.classList.toggle('changed', changed);
                prevRAMValues[prevKey] = val;

                if (el.dataset.fmt === 'bcd') {
                    el.textContent = val.toString(16).padStart(2, '0');
                } else {
                    el.textContent = val + ' (0x' + val.toString(16).toUpperCase().padStart(2, '0') + ')';
                }
            });
        }

        // Custom watch
        $('#ram-custom-add').addEventListener('click', () => {
            const input = $('#ram-custom-addr');
            const addrStr = input.value.trim().replace(/^0x/i, '').replace(/^\$/, '');
            const addr = parseInt(addrStr, 16);
            if (isNaN(addr) || addr < 0 || addr > 0xFFFF) { alert('Invalid address'); return; }
            customWatches.push(addr);
            const grid = $('#ram-custom');
            const el = document.createElement('div');
            el.className = 'ram-entry';
            el.innerHTML = `<span class="ram-label">$${addr.toString(16).toUpperCase().padStart(4, '0')}</span><span class="ram-value" data-addr="${addr}">--</span>`;
            grid.appendChild(el);
            input.value = '';
        });

        $('#ram-custom-addr').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') $('#ram-custom-add').click();
        });

        // RAM Search
        let searchSnapshot = null;
        let searchCandidates = null;
        const btnSnapshot = $('#ram-search-snapshot');
        const btnChanged = $('#ram-search-changed');
        const btnUnchanged = $('#ram-search-unchanged');
        const btnSearchReset = $('#ram-search-reset');
        const searchInfo = $('#ram-search-info');
        const searchResults = $('#ram-search-results');

        btnSnapshot.addEventListener('click', () => {
            if (!nes) return;
            searchSnapshot = new Uint8Array(0x800);
            for (let i = 0; i < 0x800; i++) searchSnapshot[i] = nes.cpu.mem[i];
            if (!searchCandidates) {
                searchCandidates = [];
                for (let i = 0; i < 0x800; i++) searchCandidates.push(i);
            }
            btnChanged.disabled = false;
            btnUnchanged.disabled = false;
            btnSearchReset.disabled = false;
            searchInfo.textContent = `Snapshot taken. ${searchCandidates.length} candidates. Now act in-game and click Find Changed/Unchanged.`;
        });

        btnChanged.addEventListener('click', () => {
            if (!nes || !searchSnapshot) return;
            searchCandidates = searchCandidates.filter(addr => nes.cpu.mem[addr] !== searchSnapshot[addr]);
            showSearchResults();
            // Take a new snapshot for the next comparison
            for (let i = 0; i < 0x800; i++) searchSnapshot[i] = nes.cpu.mem[i];
        });

        btnUnchanged.addEventListener('click', () => {
            if (!nes || !searchSnapshot) return;
            searchCandidates = searchCandidates.filter(addr => nes.cpu.mem[addr] === searchSnapshot[addr]);
            showSearchResults();
            for (let i = 0; i < 0x800; i++) searchSnapshot[i] = nes.cpu.mem[i];
        });

        btnSearchReset.addEventListener('click', () => {
            searchSnapshot = null;
            searchCandidates = null;
            searchResults.innerHTML = '';
            btnChanged.disabled = true;
            btnUnchanged.disabled = true;
            btnSearchReset.disabled = true;
            searchInfo.textContent = 'Take a snapshot, then perform an action in-game, then search.';
        });

        function showSearchResults() {
            searchInfo.textContent = `${searchCandidates.length} candidates remaining.`;
            searchResults.innerHTML = '';
            const show = searchCandidates.slice(0, 50);
            for (const addr of show) {
                const el = document.createElement('div');
                el.className = 'ram-entry';
                const val = nes.cpu.mem[addr];
                el.innerHTML = `<span class="ram-label">$${addr.toString(16).toUpperCase().padStart(4, '0')}</span><span class="ram-value">${val} (0x${val.toString(16).toUpperCase().padStart(2, '0')})</span>`;
                el.style.cursor = 'pointer';
                el.title = 'Click to add as custom watch';
                el.addEventListener('click', () => {
                    customWatches.push(addr);
                    const grid = $('#ram-custom');
                    const we = document.createElement('div');
                    we.className = 'ram-entry';
                    we.innerHTML = `<span class="ram-label">$${addr.toString(16).toUpperCase().padStart(4, '0')}</span><span class="ram-value" data-addr="${addr}">--</span>`;
                    grid.appendChild(we);
                });
                searchResults.appendChild(el);
            }
            if (searchCandidates.length > 50) {
                searchInfo.textContent += ` Showing first 50.`;
            }
        }
    }

    // Hex view for CHR banks (similar to showHex but for CHR data)
    function showCHRHex(chrBankIndex, centerOffset, highlights) {
        if (!rom) return;
        const currentBank = rom.chr[chrBankIndex];
        const origBank = originalPrg.length > 0 ? originalChr[chrBankIndex] : currentBank;
        const absBase = RCR.HEADER_SIZE + rom.prgCount * RCR.PRG_BANK_SIZE + chrBankIndex * RCR.CHR_BANK_SIZE;

        let viewStart = Math.max(0, centerOffset - 16) & ~0xF;
        let viewEnd = Math.min(currentBank.length, centerOffset + 32);
        viewEnd = ((viewEnd + 15) & ~0xF);

        const hlMap = {};
        for (const h of highlights) {
            for (let off = h.start; off < h.end; off++) hlMap[off] = h.type;
        }

        hexLocation.textContent = `CHR Bank ${chrBankIndex} | Tile Offset: 0x${centerOffset.toString(16).toUpperCase()} | ROM: 0x${(absBase + centerOffset).toString(16).toUpperCase()}`;

        const legend = '<div class="hex-legend">'
            + '<span class="hex-legend-item"><span class="hex-legend-swatch ptr"></span> Low Bitplane</span>'
            + '<span class="hex-legend-item"><span class="hex-legend-swatch str"></span> High Bitplane</span>'
            + '<span class="hex-legend-item"><span class="hex-legend-swatch changed"></span> Changed</span>'
            + '</div>';

        hexOriginal.innerHTML = legend + renderHexPane(origBank, currentBank, chrBankIndex, viewStart, viewEnd, hlMap, absBase);
        hexCurrent.innerHTML = legend + renderHexPane(currentBank, origBank, chrBankIndex, viewStart, viewEnd, hlMap, absBase);
    }

    // --- Utility ---
    function escHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
})();
