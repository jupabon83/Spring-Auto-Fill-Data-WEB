/* ═══════════════════════════════════════════════════════════════
   app.js  —  Spring Auto Fill Data
   ═══════════════════════════════════════════════════════════════ */

/* ── State ─────────────────────────────────────────────────── */
const state = {
  springFiles:    [],    // [{ name, text, size }]
  eledataFile:    null,  // { name, text, size }
  restraintFile:  null,  // { name, text, size }
  springs:        [],
  eledata:        null,
  restraint:      null,
  activeSheetIdx: 0
};

const $ = id => document.getElementById(id);

/* ── Init ──────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  setupDropZone('spring-drop',    'spring-files-input',   true,  handleSpringFiles);
  setupDropZone('eledata-drop',   'eledata-file-input',   false, handleEledataFile);
  setupDropZone('restraint-drop', 'restraint-file-input', false, handleRestraintFile);

  $('process-btn').addEventListener('click', processFiles);
  $('back-to-upload').addEventListener('click', () => goToStep(1));
  $('generate-sheets-btn').addEventListener('click', generateSheets);
  $('back-to-table').addEventListener('click', () => goToStep(2));
  $('export-pdf-btn').addEventListener('click', () => window.print());

  $('sheet-date').value = new Date().toISOString().slice(0, 10);

  const addBtn = $('add-spring-row-btn');
  if (addBtn) addBtn.addEventListener('click', () => addPreviewRow());
  initPreviewTable(5);
});

/* ── Spring Preview Table ──────────────────────────────────── */
const TYPE_OPTIONS = ['Hanger', 'Can'];

function initPreviewTable(rows) {
  const tbody = $('spring-preview-body');
  tbody.innerHTML = '';
  for (let i = 0; i < rows; i++) addPreviewRow();
}

function addPreviewRow(data = {}) {
  const tbody = $('spring-preview-body');
  const idx   = tbody.rows.length + 1;
  const tr    = document.createElement('tr');

  const typeOpts = TYPE_OPTIONS.map(t =>
    `<option value="${t}" ${data.arrangement === t ? 'selected' : ''}>${t}</option>`
  ).join('');

  tr.innerHTML = `
    <td class="row-label">Spring ${idx}</td>
    <td><input type="text" placeholder="SPR-${String(idx).padStart(3,'0')}" value="${escHtml(data.tag || '')}"></td>
    <td><select>${typeOpts}</select></td>
    <td><input type="text" placeholder="e.g. 1070" value="${escHtml(data.node || '')}"></td>
    <td class="col-del-cell"><button class="btn-del-row" title="Eliminar fila" onclick="this.closest('tr').remove()">✕</button></td>`;
  tbody.appendChild(tr);
}

function getPreviewTableData() {
  const tbody = $('spring-preview-body');
  return Array.from(tbody.rows).map(row => ({
    tag:         row.cells[1].querySelector('input').value.trim(),
    arrangement: row.cells[2].querySelector('select').value,
    node:        row.cells[3].querySelector('input').value.trim(),
  })).filter(r => r.tag || r.node);
}

/* ── Drop zone setup ───────────────────────────────────────── */
function setupDropZone(zoneId, inputId, multiple, handler) {
  const zone  = $(zoneId);
  const input = $(inputId);
  const label = zone.querySelector('.btn-browse');

  // Single function that opens the picker — guarded against concurrent calls
  let picking = false;
  function openPicker() {
    if (picking) return;
    picking = true;
    input.click();
    setTimeout(() => { picking = false; }, 500);
  }

  // Label click → open picker (label has no `for`, so we handle it here)
  if (label) {
    label.addEventListener('click', e => {
      e.stopPropagation();
      openPicker();
    });
  }

  // Zone click → open picker only when clicking the zone background
  zone.addEventListener('click', e => {
    if (label && label.contains(e.target)) return;
    openPicker();
  });

  input.addEventListener('change', () => {
    if (input.files && input.files.length) handler(input.files);
  });

  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    handler(e.dataTransfer.files);
  });
}

/* ── File handlers ─────────────────────────────────────────── */
function handleSpringFiles(fileList) {
  const newFiles = Array.from(fileList).filter(f => f.name.endsWith('.txt'));
  if (!newFiles.length) return;
  Promise.all(newFiles.map(f => readFile(f).then(text => ({ name: f.name, text, size: f.size }))))
    .then(loaded => {
      state.springFiles.push(...loaded);
      renderSpringFileList();
      updateProcessBtn();
    });
}

function handleEledataFile(fileList) {
  const file = Array.from(fileList).find(f => f.name.endsWith('.txt'));
  if (!file) return;
  readFile(file).then(text => {
    state.eledataFile = { name: file.name, text, size: file.size };
    showSingleFile('eledata-file-name', file.name, file.size);
    updateProcessBtn();
  });
}

function handleRestraintFile(fileList) {
  const file = Array.from(fileList).find(f => f.name.endsWith('.txt'));
  if (!file) return;
  readFile(file).then(text => {
    state.restraintFile = { name: file.name, text, size: file.size };
    showSingleFile('restraint-file-name', file.name, file.size);
    updateProcessBtn();
  });
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsText(file, 'utf-8');
  });
}

function showSingleFile(elId, name, size) {
  const el = $(elId);
  el.textContent = `✓  ${name}  (${formatSize(size)})`;
  el.classList.add('visible');
}

function renderSpringFileList() {
  const ul = $('spring-file-list');
  ul.innerHTML = '';
  state.springFiles.forEach(f => {
    const li = document.createElement('li');
    li.innerHTML = `<span><span class="fname">${escHtml(f.name)}</span>
      <span class="fsize">${formatSize(f.size)}</span></span>
      <span class="fstatus">✓</span>`;
    ul.appendChild(li);
  });
}

function updateProcessBtn() {
  const btn  = $('process-btn');
  const hint = $('process-hint');
  const ready = state.springFiles.length > 0;
  btn.disabled = !ready;

  const lines = [];
  lines.push(`Spring files: ${state.springFiles.length > 0 ? state.springFiles.map(f => f.name).join(', ') : '❌ none'}`);
  lines.push(`Element data: ${state.eledataFile ? '✅ ' + state.eledataFile.name : '❌ not loaded'}`);
  lines.push(`Restraint:    ${state.restraintFile ? '✅ ' + state.restraintFile.name : '⚠️ not loaded (optional)'}`);
  hint.innerHTML = lines.join('<br>');
}

/* ── Step navigation ───────────────────────────────────────── */
function goToStep(n) {
  [1, 2, 3].forEach(i => $(`step-${i}`).classList.toggle('hidden', i !== n));
  ['ind-1','ind-2','ind-3'].forEach((id, i) => {
    const el = $(id);
    el.classList.remove('active', 'done');
    if (i + 1 < n)  el.classList.add('done');
    if (i + 1 === n) el.classList.add('active');
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── Process files ─────────────────────────────────────────── */
function processFiles() {
  // 1. Parse spring hanger reports
  const springResult = parseSpringFiles(state.springFiles);
  state.springs = springResult.springs;

  // 2. Parse element data
  state.eledata = state.eledataFile
    ? parseEledata(state.eledataFile.text)
    : null;

  // 3. Parse restraint report
  state.restraint = state.restraintFile
    ? parseRestraintReport(state.restraintFile.text)
    : null;

  // 3b. Apply preview table overrides + propagate global manufacturer
  const globalMfr = $('manufacturer').value.trim();
  if (globalMfr) state.springs.forEach(sp => { sp.manufacturer = globalMfr; });

  const overrides = getPreviewTableData();
  overrides.forEach((ov, i) => {
    if (!state.springs[i]) return;
    if (ov.tag)         state.springs[i].tag         = ov.tag;
    if (ov.arrangement) state.springs[i].arrangement = ov.arrangement;
    if (ov.node)        state.springs[i].node        = ov.node;
    // NOTE: s.type is never overridden here — it comes exclusively from the Caesar II parser
  });

  // 4. Cross-reference
  const settings = {
    hydroCase:  $('hydro-case').value.trim() || '3(OPE)',
    tempDesign: parseInt($('temp-design').value) || 1,
    tempOper:   parseInt($('temp-oper').value)   || 2,
    tempMin:    parseInt($('temp-min').value)     || 3,
  };
  crossReference(state.springs, state.eledata, state.restraint, settings);

  // 5. Log any warnings
  const allWarnings = [
    ...springResult.warnings,
    ...(state.eledata   ? state.eledata.warnings   : []),
    ...(state.restraint ? state.restraint.warnings  : []),
  ];
  if (allWarnings.length) console.warn('Parser warnings:', allWarnings);

  renderSpringTable();
  goToStep(2);
}

/* ── Spring Table ──────────────────────────────────────────── */
function renderSpringTable() {
  // Update table column headers to reflect selected units
  const uF = $('unit-force').value  || 'N';
  const uL = $('unit-length').value || 'mm';
  const uD = $('unit-diam').value   || 'mm';
  const uR = $('unit-rate').value   || 'N/cm';
  const uT = $('unit-temp').value   || '°C';
  $('th-vertmov').textContent  = `Vert. Mov. (${uL})`;
  $('th-hotload').textContent  = `Hot Load (${uF})`;
  $('th-instload').textContent = `Theo. Inst. Load (${uF})`;
  $('th-rate').textContent     = `Spring Rate (${uR})`;
  $('th-diam').textContent     = `Diameter (${uD})`;
  $('th-insul').textContent    = `Insul. Thick. (${uL})`;
  $('th-temp1').textContent    = `Design Temp (${uT})`;
  $('th-temp2').textContent    = `Oper. Temp (${uT})`;
  $('th-temp3').textContent    = `Min Temp (${uT})`;
  $('th-hydro').textContent    = `Hydro Load (${uF})`;

  const tbody = $('springtable-body');
  tbody.innerHTML = '';
  state.springs.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escHtml(s.tag)}</strong></td>
      <td>${escHtml(s.node)}</td>
      <td><span class="type-badge ${typeBadgeClass(s.type)}">${escHtml(s.type)}</span></td>
      <td>${escHtml(s.arrangement || '—')}</td>
      <td>${escHtml(s.catalogType || '—')}</td>
      <td>${escHtml(s.numRqd != null ? String(s.numRqd) : '—')}</td>
      <td>${escHtml(s.size  || '—')}</td>
      <td>${fmt(s.vertMov)}</td>
      <td>${fmt(s.hotLoad)}</td>
      <td>${fmt(s.theoInstLoad)}</td>
      <td>${fmt(s.springRate)}</td>
      <td>${escHtml(s.manufacturer || '—')}</td>
      <td>${fmt(s.diameter)}</td>
      <td>${fmt(s.insulThick)}</td>
      <td>${fmt(s.temp1)}</td>
      <td>${fmt(s.temp2)}</td>
      <td>${fmt(s.temp3)}</td>
      <td>${escHtml(s.material || '—')}</td>
      <td>${escHtml(s.lineNo   || '—')}</td>
      <td>${fmt(s.hydroLoad)}</td>`;
    tbody.appendChild(tr);
  });
}

function typeBadgeClass(type) {
  if (type === 'Constant')        return 'type-constant';
  if (type === 'Variable (User)') return 'type-variable-user';
  return 'type-variable';
}

/* ── Generate Sheets ───────────────────────────────────────── */
function generateSheets() {
  const tabsEl      = $('sheet-tabs');
  const containerEl = $('sheet-container');
  tabsEl.innerHTML      = '';
  containerEl.innerHTML = '';

  const units = {
    force:  $('unit-force').value  || 'N',
    length: $('unit-length').value || 'mm',
    diam:   $('unit-diam').value   || 'mm',
    rate:   $('unit-rate').value   || 'N/cm',
    temp:   $('unit-temp').value   || '°C',
  };

  const globals = {
    projectName:  $('project-name').value,
    calcTitle:    $('calc-title').value,
    designBy:     $('design-by').value,
    checkedBy:    $('checked-by').value,
    date:         $('sheet-date').value,
    fluid:        $('fluid').value || 'Crude Oil',
    manufacturer: $('manufacturer').value,
    units,
  };

  state.springs.forEach((spring, idx) => {
    // Tab
    const tab = document.createElement('div');
    tab.className = `sheet-tab${idx === 0 ? ' active' : ''}`;
    tab.textContent = spring.tag;
    tab.addEventListener('click', () => activateSheet(idx));
    tabsEl.appendChild(tab);

    // Sheet
    const sheet = document.createElement('div');
    sheet.className = `spring-sheet${idx === 0 ? ' active' : ''}`;
    sheet.id = `sheet-${idx}`;
    sheet.innerHTML = buildSheetHTML(spring, globals);
    containerEl.appendChild(sheet);
  });

  goToStep(3);
}

function activateSheet(idx) {
  state.activeSheetIdx = idx;
  document.querySelectorAll('.sheet-tab').forEach((t, i)   => t.classList.toggle('active', i === idx));
  document.querySelectorAll('.spring-sheet').forEach((s, i) => s.classList.toggle('active', i === idx));
}

/* ── Spring arrangement sketch SVGs ───────────────────────── */
function arrangementSVG(arrangement) {
  if (arrangement === 'Hanger') {
    return `<svg viewBox="0 0 110 220" width="110" height="220" xmlns="http://www.w3.org/2000/svg">
      <!-- Structural beam top -->
      <rect x="10" y="0" width="90" height="14" fill="#d6dbe8" stroke="#1a2744" stroke-width="1.2"/>
      <!-- Vertical centerline -->
      <line x1="55" y1="14" x2="55" y2="216" stroke="#1a2744" stroke-width="0.6" stroke-dasharray="5,3"/>
      <!-- Top attachment rod -->
      <rect x="51" y="14" width="8" height="20" fill="#b0bccc" stroke="#1a2744" stroke-width="1"/>
      <!-- Top adjustment nut -->
      <polygon points="43,34 67,34 70,40 40,40" fill="#8a9ab8" stroke="#1a2744" stroke-width="1"/>
      <!-- Rod between nut and spring body -->
      <rect x="52" y="40" width="6" height="18" fill="#c5cfe0" stroke="#1a2744" stroke-width="0.8"/>
      <!-- Spring hanger casing outer -->
      <rect x="28" y="58" width="54" height="88" rx="3" fill="#eef1f7" stroke="#1a2744" stroke-width="1.4"/>
      <!-- Casing inner panel -->
      <rect x="34" y="64" width="42" height="76" rx="2" fill="#f7f9fd" stroke="#1a2744" stroke-width="0.7"/>
      <!-- Spring coils (horizontal lines) -->
      <line x1="34" y1="76"  x2="76" y2="76"  stroke="#3a4f70" stroke-width="0.9"/>
      <line x1="34" y1="84"  x2="76" y2="84"  stroke="#3a4f70" stroke-width="0.9"/>
      <line x1="34" y1="92"  x2="76" y2="92"  stroke="#3a4f70" stroke-width="0.9"/>
      <line x1="34" y1="100" x2="76" y2="100" stroke="#3a4f70" stroke-width="0.9"/>
      <line x1="34" y1="108" x2="76" y2="108" stroke="#3a4f70" stroke-width="0.9"/>
      <line x1="34" y1="116" x2="76" y2="116" stroke="#3a4f70" stroke-width="0.9"/>
      <line x1="34" y1="124" x2="76" y2="124" stroke="#3a4f70" stroke-width="0.9"/>
      <!-- Bottom adjustment nut -->
      <polygon points="40,146 70,146 67,152 43,152" fill="#8a9ab8" stroke="#1a2744" stroke-width="1"/>
      <!-- Bottom rod -->
      <rect x="52" y="152" width="6" height="18" fill="#c5cfe0" stroke="#1a2744" stroke-width="0.8"/>
      <!-- Pipe cross section top ellipse -->
      <ellipse cx="55" cy="178" rx="22" ry="9" fill="#eef1f7" stroke="#1a2744" stroke-width="1.4"/>
      <ellipse cx="55" cy="178" rx="14" ry="6" fill="#dde3ee" stroke="#1a2744" stroke-width="0.8"/>
      <!-- Pipe walls -->
      <line x1="33" y1="178" x2="33" y2="216" stroke="#1a2744" stroke-width="1.4"/>
      <line x1="77" y1="178" x2="77" y2="216" stroke="#1a2744" stroke-width="1.4"/>
      <line x1="41" y1="183" x2="41" y2="216" stroke="#1a2744" stroke-width="0.8"/>
      <line x1="69" y1="183" x2="69" y2="216" stroke="#1a2744" stroke-width="0.8"/>
    </svg>`;
  }
  if (arrangement === 'Can') {
    return `<svg viewBox="0 0 110 220" width="110" height="220" xmlns="http://www.w3.org/2000/svg">
      <!-- Ball / rod-end joint at top -->
      <circle cx="55" cy="14" r="13" fill="#eef1f7" stroke="#1a2744" stroke-width="1.3"/>
      <circle cx="47" cy="9"  r="9"  fill="#eef1f7" stroke="#1a2744" stroke-width="1.3"/>
      <!-- Vertical centerline -->
      <line x1="55" y1="27" x2="55" y2="216" stroke="#1a2744" stroke-width="0.6" stroke-dasharray="5,3"/>
      <!-- Top rod -->
      <rect x="51" y="27" width="8" height="28" fill="#c5cfe0" stroke="#1a2744" stroke-width="1"/>
      <!-- Top flange plate -->
      <rect x="33" y="55" width="44" height="7" fill="#8a9ab8" stroke="#1a2744" stroke-width="1.3"/>
      <!-- Can body outer -->
      <rect x="37" y="62" width="36" height="78" fill="#eef1f7" stroke="#1a2744" stroke-width="1.4"/>
      <!-- Can body inner detail (spring mechanism window) -->
      <rect x="43" y="70" width="11" height="30" rx="1" fill="#dde3ee" stroke="#1a2744" stroke-width="0.8"/>
      <!-- Internal spring indicator lines -->
      <line x1="43" y1="78" x2="54" y2="78" stroke="#3a4f70" stroke-width="0.8"/>
      <line x1="43" y1="85" x2="54" y2="85" stroke="#3a4f70" stroke-width="0.8"/>
      <line x1="43" y1="92" x2="54" y2="92" stroke="#3a4f70" stroke-width="0.8"/>
      <line x1="43" y1="99" x2="54" y2="99" stroke="#3a4f70" stroke-width="0.8"/>
      <!-- Bottom flange plate -->
      <rect x="33" y="140" width="44" height="7" fill="#8a9ab8" stroke="#1a2744" stroke-width="1.3"/>
      <!-- Base plate -->
      <rect x="24" y="147" width="62" height="10" fill="#d6dbe8" stroke="#1a2744" stroke-width="1.3"/>
      <!-- Foundation line -->
      <line x1="14" y1="157" x2="96" y2="157" stroke="#1a2744" stroke-width="2"/>
      <!-- Foundation hatching -->
      <line x1="14" y1="164" x2="24" y2="157" stroke="#1a2744" stroke-width="0.9"/>
      <line x1="26" y1="164" x2="38" y2="157" stroke="#1a2744" stroke-width="0.9"/>
      <line x1="40" y1="164" x2="52" y2="157" stroke="#1a2744" stroke-width="0.9"/>
      <line x1="54" y1="164" x2="66" y2="157" stroke="#1a2744" stroke-width="0.9"/>
      <line x1="68" y1="164" x2="80" y2="157" stroke="#1a2744" stroke-width="0.9"/>
      <line x1="82" y1="164" x2="96" y2="157" stroke="#1a2744" stroke-width="0.9"/>
    </svg>`;
  }
  return ''; // no arrangement selected
}

/* ── Sheet HTML builder ────────────────────────────────────── */
function buildSheetHTML(s, g) {
  // Sheet layout driven solely by Caesar II parsed type — arrangement (Can/Hanger) is independent
  const isVariable = ['Variable', 'Variable (User)'].includes(s.type);
  const isConstant = s.type === 'Constant';
  const uF = g.units?.force  || 'N';
  const uL = g.units?.length || 'mm';
  const uD = g.units?.diam   || 'mm';
  const uR = g.units?.rate   || 'N/cm';
  const uT = g.units?.temp   || '°C';

  // Hydro load: from cross-reference; for constant springs default to -(hotLoad)
  const hydroLoad = s.hydroLoad !== null ? s.hydroLoad
    : (isConstant && s.hotLoad !== null ? -Math.abs(s.hotLoad) : null);

  // Variability: from VBA formula (theoInstLoad - hotLoad) / hotLoad, or from parsed %
  let varDisplay = '';
  if (s.variability !== null) {
    varDisplay = (s.variability * 100).toFixed(1) + ' %';
  } else if (!isConstant && s.theoInstLoad !== null && s.hotLoad && s.hotLoad !== 0) {
    const v = Math.abs((s.theoInstLoad - s.hotLoad) / s.hotLoad);
    varDisplay = (v * 100).toFixed(1) + ' %';
  }

  const manufacturer = g.manufacturer || s.manufacturer || '';

  return `
  <!-- ── Title Block ── -->
  <div class="sheet-title-block">
    <div>
      <div class="sheet-title-field"><label>Design By</label><input value="${escHtml(g.designBy)}" placeholder="—"></div>
      <div class="sheet-title-field" style="margin-top:8px"><label>Project Name</label><input value="${escHtml(g.projectName)}" placeholder="—"></div>
      <div class="sheet-title-field" style="margin-top:8px"><label>Calc. Title</label><input value="${escHtml(g.calcTitle)}" placeholder="—"></div>
    </div>
    <div class="sheet-title-center">
      <h3>SPRING HANGER DATA SHEET</h3>
      <p>${isConstant ? 'CONSTANT' : 'VARIABLE'}</p>
    </div>
    <div style="text-align:right">
      <div class="sheet-title-field"><label>Date</label><input value="${escHtml(g.date)}" placeholder="—"></div>
      <div class="sheet-title-field" style="margin-top:8px"><label>Checked By</label><input value="${escHtml(g.checkedBy)}" placeholder="—"></div>
    </div>
  </div>

  <!-- ── Arrangement sketch ── -->
  ${arrangementSVG(s.arrangement) ? `<div class="ds-arrangement-img">${arrangementSVG(s.arrangement)}</div>` : ''}

  <!-- ── Tag / Qty bar ── -->
  <div class="ds-tag-bar">
    <div class="ds-tag-item"><span class="ds-tag-lbl">Spring Tag No.</span><input class="ds-tag-inp" value="${escHtml(s.tag)}"></div>
    <div class="ds-tag-item"><span class="ds-tag-lbl">Q'ty of Assembly</span><input class="ds-tag-inp" value="${escHtml(String(s.numRqd != null ? s.numRqd : 1))}" style="width:60px"></div>
    <div class="ds-tag-item"><span class="ds-tag-lbl">Document No.</span><input class="ds-tag-inp" value="" style="width:180px"></div>
  </div>

  <!-- ── Main 12-column grid ── -->
  <div class="ds-grid">

    <!-- HEADERS -->
    <div class="ds-hdr" style="grid-column:1/7">SPRING&nbsp;&nbsp;DATA</div>
    <div class="ds-hdr ds-pd" style="grid-column:7/13">PIPING&nbsp;&nbsp;DATA</div>

    <!-- ROW 1: MANUFACTURER | REF. LINE No. | STRESS SKETCH NUMBER -->
    <div class="ds-cell" style="grid-column:1/7">
      <div class="ds-lbl">MANUFACTURER</div>
      <input value="${escHtml(manufacturer)}">
    </div>
    <div class="ds-cell ds-pd" style="grid-column:7/10">
      <div class="ds-lbl">REF. LINE No.</div>
      <input value="${escHtml(s.lineNo || '')}">
    </div>
    <div class="ds-cell" style="grid-column:10/13">
      <div class="ds-lbl">STRESS SKETCH NUMBER</div>
      <input value="">
    </div>

    <!-- ROW 2: FIG. No | TYPE | HYDRO-TEST LOAD | PIPE SIZE (NPS) | PIPE MATERIAL -->
    <div class="ds-cell" style="grid-column:1/3">
      <div class="ds-lbl">FIG. No</div>
      <input value="${escHtml(s.figNo || '')}">
    </div>
    <div class="ds-cell" style="grid-column:3/5">
      <div class="ds-lbl">TYPE</div>
      <input value="${escHtml(s.catalogType || '')}" placeholder="(catalog type)">
    </div>
    <div class="ds-cell" style="grid-column:5/7">
      <div class="ds-lbl">HYDRO-TEST LOAD</div>
      <div class="ds-ir"><input value="${fmtV(hydroLoad)}"><span>${escHtml(uF)}</span></div>
    </div>
    <div class="ds-cell ds-pd" style="grid-column:7/10">
      <div class="ds-lbl">PIPE SIZE (NPS)</div>
      <input value="${escHtml(s.size || '')}">
    </div>
    <div class="ds-cell" style="grid-column:10/13">
      <div class="ds-lbl">PIPE MATERIAL</div>
      <input value="${escHtml(s.material || '')}">
    </div>

    <!-- ROW 3: HOT LOAD [+INSTALLED LOAD] | PIPE OPER. TEMP | PIPE DESIGN/MIN TEMP -->
    ${isVariable ? `
    <div class="ds-cell" style="grid-column:1/4">
      <div class="ds-lbl">OPERATING (HOT) LOAD</div>
      <div class="ds-ir"><input value="${fmtV(s.hotLoad)}"><span>${escHtml(uF)}</span></div>
    </div>
    <div class="ds-cell" style="grid-column:4/7">
      <div class="ds-lbl">INSTALLED LOAD</div>
      <div class="ds-ir"><input value="${fmtV(s.theoInstLoad)}"><span>${escHtml(uF)}</span></div>
    </div>` : `
    <div class="ds-cell" style="grid-column:1/7">
      <div class="ds-lbl">OPERATING (HOT) LOAD</div>
      <div class="ds-ir"><input value="${fmtV(s.hotLoad)}"><span>${escHtml(uF)}</span></div>
    </div>`}
    <div class="ds-cell ds-pd" style="grid-column:7/10">
      <div class="ds-lbl">PIPE OPER. TEMPERATURE</div>
      <div class="ds-ir"><input value="${fmtV(s.temp2)}"><span>${escHtml(uT)}</span></div>
    </div>
    <div class="ds-cell" style="grid-column:10/13">
      <div class="ds-lbl">PIPE DESIGN / MIN TEMPERATURE</div>
      <div class="ds-ir">
        <input value="${fmtV(s.temp1)}" style="width:52px">
        <span>&nbsp;/&nbsp;</span>
        <input value="${fmtV(s.temp3)}" style="width:52px">
        <span>${escHtml(uT)}</span>
      </div>
    </div>

    <!-- ROW 4: SIZE [+SPRING RATE+VARIABILITY] | FLUID | INSULATION THICKNESS -->
    ${isVariable ? `
    <div class="ds-cell" style="grid-column:1/3">
      <div class="ds-lbl">SIZE</div>
      <input value="${escHtml(s.size || '')}">
    </div>
    <div class="ds-cell" style="grid-column:3/5">
      <div class="ds-lbl">SPRING RATE</div>
      <div class="ds-ir"><input value="${fmtV(s.springRate)}"><span>${escHtml(uR)}</span></div>
    </div>
    <div class="ds-cell" style="grid-column:5/7">
      <div class="ds-lbl">VARIABILITY</div>
      <input value="${escHtml(varDisplay)}">
    </div>` : `
    <div class="ds-cell" style="grid-column:1/7">
      <div class="ds-lbl">SIZE</div>
      <input value="${escHtml(s.size || '')}">
    </div>`}
    <div class="ds-cell ds-pd" style="grid-column:7/10">
      <div class="ds-lbl">FLUID</div>
      <input value="${escHtml(g.fluid)}">
    </div>
    <div class="ds-cell" style="grid-column:10/13">
      <div class="ds-lbl">INSULATION THICKNESS</div>
      <div class="ds-ir"><input value="${fmtV(s.insulThick)}"><span>${escHtml(uL)}</span></div>
    </div>

    <!-- ROW 5: ACTUAL TRAVEL VERT. | STRESS FILE NAME | NODE NO. -->
    <div class="ds-cell" style="grid-column:1/7">
      <div class="ds-lbl">ACTUAL TRAVEL</div>
      <div class="ds-ir">
        <span class="ds-il">VERT.:</span>
        <input value="${fmtV(s.vertMov)}" style="width:90px">
        <span>${escHtml(uL)}</span>
      </div>
    </div>
    <div class="ds-cell ds-pd" style="grid-column:7/11">
      <div class="ds-lbl">STRESS FILE NAME:</div>
      <input value="${escHtml(s.source || '')}">
    </div>
    <div class="ds-cell" style="grid-column:11/13">
      <div class="ds-lbl">NODE NO.</div>
      <input value="${escHtml(s.node)}">
    </div>

  </div><!-- /ds-grid -->

  <!-- Revision block -->
  <div class="ds-rev-block">
    <div class="ds-rev-cell"><label>Sht of</label><input value=""></div>
    <div class="ds-rev-cell"><label>Rev</label><input value=""></div>
    <div class="ds-rev-cell"><label>Date</label><input value="${escHtml(g.date)}"></div>
    <div class="ds-rev-cell"><label>Description</label><input value="Issued for Design"></div>
    <div class="ds-rev-cell"><label>By</label><input value="${escHtml(g.designBy)}"></div>
    <div class="ds-rev-cell"><label>Chk</label><input value="${escHtml(g.checkedBy)}"></div>
    <div class="ds-rev-cell"><label>App</label><input value=""></div>
  </div>
  `;
}

/* ── Helpers ───────────────────────────────────────────────── */
function fmt(v)  {
  if (v === null || v === undefined) return '—';
  return typeof v === 'number' ? v.toFixed(2) : String(v);
}
function fmtV(v) {
  if (v === null || v === undefined) return '';
  return typeof v === 'number' ? v.toFixed(2) : String(v);
}
function formatSize(b) {
  if (b < 1024)        return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
