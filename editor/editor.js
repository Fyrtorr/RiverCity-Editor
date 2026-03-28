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

            // Populate editors
            populateNPCNames();
            populateNPCDialogue();
            populateShopItems();
            populateShopStock();
            populateBosses();
            populateShopNames();
            populateMiscText();
            populateLocations();
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

    // Snapshot of original PRG banks, taken at ROM load time
    let originalPrg = [];

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
    function renderHexPane(bankData, compareData, bankIndex, viewStart, viewEnd, hlMap) {
        const absBase = RCR.HEADER_SIZE + bankIndex * RCR.PRG_BANK_SIZE;
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

    // --- Utility ---
    function escHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
})();
