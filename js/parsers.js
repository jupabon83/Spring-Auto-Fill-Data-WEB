/* ═══════════════════════════════════════════════════════════════
   parsers.js
   Caesar II .txt file parsers
   ─ parseSpringFiles(fileArray)            → { springs[], warnings[] }
   ─ parseEledata(text)                     → { elements[], warnings[] }
   ─ parseRestraintReport(text)             → { nodes{}, warnings[] }
   ─ crossReference(springs, eledata, restraint, settings)
   ═══════════════════════════════════════════════════════════════ */


/* ────────────────────────────────────────────────────────────
   SPRING DATA PARSER
   Parses Caesar II Hanger Report (.txt) files.

   Fixed-width format delimited by '+' in separator line:
     NODE  | RQD | FIG.NO | SIZE | VERT.MOV | HOT LOAD | THEO INST | ACT INST | RATE | HOR.MOV
   ──────────────────────────────────────────────────────────── */

function parseSpringFiles(files) {
  const allSprings = [];
  const warnings   = [];
  let tagCounter   = 1;

  for (const { name, text } of files) {
    const result = _parseOneSpringFile(text, name);
    warnings.push(...result.warnings);
    for (const s of result.springs) {
      s.tag = `SPR-${String(tagCounter).padStart(3, '0')}`;
      tagCounter++;
      allSprings.push(s);
    }
  }
  return { springs: allSprings, warnings };
}

function _parseOneSpringFile(text, filename) {
  const lines    = text.split(/\r?\n/);
  const springs  = [];
  const warnings = [];

  // Find separator line (---+--- pattern)
  let sepIndex = -1;
  let colPos   = null;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('---+---')) {
      colPos = _getSepPositions(lines[i]);
      if (colPos.length >= 5) { sepIndex = i; break; }
    }
  }

  if (!colPos) {
    warnings.push(`${filename}: Cannot detect column layout — file skipped.`);
    return { springs, warnings };
  }

  let lastSpring = null;

  for (let i = sepIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (/^={5,}/.test(line.trim()) || /^-{30,}/.test(line.trim())) {
      lastSpring = null; continue;
    }

    // Node data line: starts with spaces then 3-6 digit number
    const nodeMatch = line.match(/^\s{2,10}(\d{3,6})\s/);
    if (nodeMatch) {
      const node         = nodeMatch[1];
      const numRqd       = _fNum(_fld(line, colPos, 1)) || 1;  // RQD column (pos 1)
      const size         = _fld(line, colPos, 2).trim();
      const vertMov      = _fNum(_fld(line, colPos, 3));
      const hotLoad      = _fNum(_fld(line, colPos, 4));
      const theoInstLoad = _fNum(_fld(line, colPos, 5));
      const actInstLoad  = _fNum(_fld(line, colPos, 6));
      const springRate   = _fNum(_fld(line, colPos, 7));
      const horMov       = _fNum(_fld(line, colPos, 8));

      let type = 'Variable';
      if (line.includes('CONSTANT EFFORT SUPPORT'))  type = 'Constant';
      else if (/USER\s+SPECIFIED/i.test(line))       type = 'Variable (User)';

      lastSpring = {
        tag: '', node, numRqd, figNo: '', catalogType: '', arrangement: '', size,
        vertMov, hotLoad, theoInstLoad, actInstLoad,
        springRate, horMov, type,
        manufacturer: null, variability: null,
        // filled later from Restraint Report
        hydroLoad: null,
        // filled later from Element Data
        diameter: null, insulThick: null,
        temp1: null, temp2: null, temp3: null,
        material: null, lineNo: null,
        source: filename
      };
      springs.push(lastSpring);
      continue;
    }

    // Continuation lines after a node line
    if (lastSpring) {
      const varMatch = line.match(/LOAD\s+VARIATION\s*=\s*([\d.]+)\s*%/i);
      if (varMatch) lastSpring.variability = parseFloat(varMatch[1]) / 100;

      const mfgMatch = line.match(/^\s{4,16}([A-Z][A-Z0-9\s&\-\.]+[A-Z0-9])\s*$/);
      if (mfgMatch && !/LOAD|MOVEMENT|CONSTANT|SUPPORT|NODE|CAESAR/i.test(mfgMatch[1]))
        lastSpring.manufacturer = mfgMatch[1].trim();
    }
  }

  return { springs, warnings };
}

function _getSepPositions(line) {
  const pos = [0];
  for (let i = 0; i < line.length; i++)
    if (line[i] === '+') pos.push(i + 1);
  return pos;
}

function _fld(line, pos, n) {
  const start = pos[n]     || 0;
  const end   = pos[n + 1] ? pos[n + 1] - 1 : undefined;
  return line.substring(start, end) || '';
}

function _fNum(s) {
  const v = parseFloat((s || '').trim());
  return isNaN(v) ? null : v;
}


/* ────────────────────────────────────────────────────────────
   ELEMENT DATA PARSER
   Parses Caesar II Input Listing / Element Data (.txt).

   Format: semicolon-delimited rows under "ELEMENT DATA" header.
   Header row (row 13 in file):
     FROM_NODE; FROM_NODE_NAME; TO_NODE; TO_NODE_NAME; DX; DY; DZ;
     DIAMETER; WALL_THICKNESS; INSUL_THICK; CORR_ALL;
     TEMP1; TEMP2; TEMP3; ...; MATERIAL; ...; LINE_NUMBER

   Key column indices (0-based):
     0  = FROM_NODE
     2  = TO_NODE
     7  = DIAMETER
     9  = INSUL_THICK
     11 = TEMP1
     12 = TEMP2
     13 = TEMP3
     50 = MATERIAL  (index varies — detected from header)
     last = LINE_NUMBER
   ──────────────────────────────────────────────────────────── */

function parseEledata(text) {
  const lines    = text.split(/\r?\n/);
  const elements = [];
  const warnings = [];

  let headerIdx  = -1;
  let headers    = [];

  // Find header line — must contain FROM_NODE and have at least 8 delimiters (semicolon or spaces)
  for (let i = 0; i < lines.length; i++) {
    const upper = lines[i].toUpperCase();
    if (!upper.includes('FROM') && !upper.includes('NODE')) continue;
    if (upper.includes('FROM_NODE') || upper.includes('FROM NODE')) {
      const hasSemi = lines[i].includes(';');
      const cols = hasSemi
        ? lines[i].split(';').map(h => h.trim().toUpperCase())
        : lines[i].trim().split(/\s{2,}/).map(h => h.toUpperCase());
      if (cols.length >= 5) {
        headerIdx = i;
        headers   = cols;
        break;
      }
    }
  }

  if (headerIdx === -1) {
    warnings.push('Element data: Header row (FROM_NODE) not found — pipe data will not be populated.');
    return { elements, warnings };
  }

  const isSemicolon = lines[headerIdx].includes(';');

  // Multi-alias column finder — tries many variant names Caesar II uses across versions
  function findCol(...aliases) {
    for (const alias of aliases) {
      const stripped = alias.replace(/[\s_\-]/g, '').toUpperCase();
      const i = headers.findIndex(h => {
        const hs = h.replace(/[\s_\-]/g, '').toUpperCase();
        return hs === stripped;
      });
      if (i >= 0) return i;
    }
    return -1;
  }

  const COL = {
    fromNode:   findCol('FROM_NODE', 'FROMNODE', 'FROM NODE', 'NODE FROM'),
    toNode:     findCol('TO_NODE', 'TONODE', 'TO NODE', 'NODE TO'),
    diameter:   findCol('DIAMETER', 'OUTSIDE_DIAMETER', 'OUTSIDEDIAMETER', 'OD', 'PIPE_OD', 'PIPEOD', 'DIAM'),
    insulThick: findCol('INSUL_THICK', 'INSULATION_THICKNESS', 'INSULTHICK', 'INSULATIONTHICKNESS', 'INSUL_THICKNESS', 'INSULATION'),
    temp1:      findCol('TEMP1', 'T1', 'TEMPERATURE_1', 'TEMPERATURE1', 'DESIGN_TEMP', 'DESIGNTEMP', 'OPER_TEMP1', 'OPERTEMP1'),
    temp2:      findCol('TEMP2', 'T2', 'TEMPERATURE_2', 'TEMPERATURE2', 'OPER_TEMP2', 'OPERTEMP2'),
    temp3:      findCol('TEMP3', 'T3', 'TEMPERATURE_3', 'TEMPERATURE3', 'MIN_TEMP', 'MINTEMP'),
    temp4:      findCol('TEMP4', 'T4', 'TEMPERATURE_4', 'TEMPERATURE4'),
    temp5:      findCol('TEMP5', 'T5', 'TEMPERATURE_5', 'TEMPERATURE5'),
    temp6:      findCol('TEMP6', 'T6', 'TEMPERATURE_6', 'TEMPERATURE6'),
    temp7:      findCol('TEMP7', 'T7', 'TEMPERATURE_7', 'TEMPERATURE7'),
    temp8:      findCol('TEMP8', 'T8', 'TEMPERATURE_8', 'TEMPERATURE8'),
    temp9:      findCol('TEMP9', 'T9', 'TEMPERATURE_9', 'TEMPERATURE9'),
    material:   findCol('MATERIAL', 'MATERIAL_NUMBER', 'MATNO', 'MAT', 'MAT_NO', 'MATERIALNUMBER'),
    lineNo:     findCol('LINE_NUMBER', 'LINENO', 'LINE_NO', 'LINE NO', 'LINENUMBER'),
  };

  // Fallback to known fixed positions for critical columns when header name not recognised
  const FIXED = { fromNode: 0, toNode: 2, diameter: 7, insulThick: 9, temp1: 11, temp2: 12, temp3: 13 };
  for (const [key, pos] of Object.entries(FIXED)) {
    if (COL[key] < 0) {
      COL[key] = pos;
      console.warn(`[EleData] "${key}" not found by name — falling back to fixed position ${pos}`);
    }
  }

  console.log('[EleData Parser] Header at line', headerIdx, '| isSemicolon:', isSemicolon, '| cols:', headers.length);
  console.log('[EleData Parser] All headers:', headers.join(' | '));
  console.log('[EleData Parser] Column map:', COL);

  // Parse data rows
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^[=\-]{10,}/.test(line)) break;

    const parts = isSemicolon
      ? lines[i].split(';').map(p => p.trim())
      : lines[i].trim().split(/\s+/);

    if (!parts[COL.fromNode] || !/^\d/.test(parts[COL.fromNode])) continue;

    const get  = col => (col >= 0 && col < parts.length) ? parts[col] : '';
    const getDim = col => {
      const v = _fNum(get(col));
      return (v !== null && v > 0) ? v : null;   // physical dimensions must be positive
    };

    elements.push({
      fromNode:  _cleanNode(get(COL.fromNode)),
      toNode:    _cleanNode(get(COL.toNode)),
      diameter:  getDim(COL.diameter),
      insulThick: getDim(COL.insulThick),
      temp1:     _fNum(get(COL.temp1)),
      temp2:     _fNum(get(COL.temp2)),
      temp3:     _fNum(get(COL.temp3)),
      temp4:     _fNum(get(COL.temp4)),
      temp5:     _fNum(get(COL.temp5)),
      temp6:     _fNum(get(COL.temp6)),
      temp7:     _fNum(get(COL.temp7)),
      temp8:     _fNum(get(COL.temp8)),
      temp9:     _fNum(get(COL.temp9)),
      material:  get(COL.material) || null,
      lineNo:    COL.lineNo >= 0 ? get(COL.lineNo) : null,
    });
  }

  if (elements.length === 0)
    warnings.push('Element data: No data rows found after header.');

  console.log('[EleData Parser] Parsed', elements.length, 'elements');
  if (elements.length > 0) {
    console.log('[EleData Parser] Element[0]:', elements[0]);
    if (elements.length > 1) console.log('[EleData Parser] Element[1]:', elements[1]);
  }

  return { elements, warnings };
}

// Caesar II stores nodes as floats (e.g. "1070.000000") — normalize to integer string
function _cleanNode(s) {
  const n = parseFloat(s);
  return isNaN(n) ? s : String(Math.round(n));
}


/* ────────────────────────────────────────────────────────────
   RESTRAINT SUMMARY EXTENDED PARSER
   Parses Caesar II Restraint Summary Extended Report (.txt).

   Format:
     Row 7:  Node | Load Case | FX | FY | FZ | MX | MY | MZ | DX | DY | DZ
     Row 24+: Node header lines (e.g. "1010   TYPE=Rigid ANC;")
              followed by load case rows (e.g. "  3(OPE)  507  -308  57 ...")

   Returns:
     nodes = { "1070": { "3(OPE)": { FX, FY, FZ, MX, MY, MZ, DX, DY, DZ }, ... }, ... }
   ──────────────────────────────────────────────────────────── */

function parseRestraintReport(text) {
  const lines    = text.split(/\r?\n/);
  const nodes    = {};
  const warnings = [];

  // Find the column header line (contains "Node" and "Load Case" and "FY")
  let headerIdx  = -1;
  let colNames   = [];

  for (let i = 0; i < lines.length; i++) {
    const upper = lines[i].toUpperCase();
    if (upper.includes('NODE') && upper.includes('LOAD CASE') && upper.includes('FY')) {
      headerIdx = i;
      colNames  = lines[i].trim().split(/\s{2,}/).map(c => c.trim());
      break;
    }
  }

  if (headerIdx === -1) {
    warnings.push('Restraint Report: Column header not found — hydro loads will not be populated.');
    return { nodes, warnings };
  }

  // Parse node blocks
  let currentNode = null;

  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Node header line: starts with a node number (possibly with decimal)
    // e.g. "1070   TYPE=Prog Design  CSH;"
    const nodeMatch = line.match(/^(\d{3,6}(?:\.\d+)?)\s+(?:TYPE=|$)/i)
                   || line.match(/^(\d{3,6}(?:\.\d+)?)\s*$/);
    if (nodeMatch) {
      currentNode = String(Math.round(parseFloat(nodeMatch[1])));
      if (!nodes[currentNode]) nodes[currentNode] = {};
      continue;
    }

    // Load case line: starts with spaces then case label like "  3(OPE)" or " 10(SUS)"
    if (currentNode) {
      const caseMatch = line.match(/^\s{1,5}(\d{1,3}\([A-Z]+\))\s+(.*)/i);
      if (caseMatch) {
        const caseLabel = caseMatch[1].trim();    // e.g. "3(OPE)"
        const values    = caseMatch[2].trim().split(/\s+/);
        nodes[currentNode][caseLabel] = {
          FX: _fNum(values[0]),
          FY: _fNum(values[1]),
          FZ: _fNum(values[2]),
          MX: _fNum(values[3]),
          MY: _fNum(values[4]),
          MZ: _fNum(values[5]),
          DX: _fNum(values[6]),
          DY: _fNum(values[7]),
          DZ: _fNum(values[8]),
        };
        continue;
      }

      // MAX line — skip
      if (/^\s+MAX\s/i.test(line)) continue;

      // If we hit a line that doesn't match, it might be a new node block
    }
  }

  if (Object.keys(nodes).length === 0)
    warnings.push('Restraint Report: No node data parsed — check file format.');

  return { nodes, warnings };
}


/* ────────────────────────────────────────────────────────────
   CROSS-REFERENCE
   Fills pipe data and hydro loads on each spring object.

   settings = {
     hydroCase: "3(OPE)",
     temp1Case: "3(OPE)",   // used to pick temp from restraint if needed
     temp2Case: "5(OPE)",
     temp3Case: "7(OPE)",
   }
   ──────────────────────────────────────────────────────────── */

function crossReference(springs, eledata, restraint, settings = {}) {
  const hydroCase = (settings.hydroCase || '3(OPE)').trim();

  // ── Element data cross-reference ──────────────────────────
  if (eledata && eledata.elements && eledata.elements.length > 0) {
    // Build node → [all elements] map — a node can appear as FROM_NODE or TO_NODE
    const nodeMap = new Map();
    const addToMap = (node, el) => {
      if (!node) return;
      if (!nodeMap.has(node)) nodeMap.set(node, []);
      nodeMap.get(node).push(el);
    };
    for (const el of eledata.elements) {
      addToMap(el.fromNode, el);
      if (el.toNode !== el.fromNode) addToMap(el.toNode, el);
    }

    // Score an element by how many valid (non-null) physical fields it has
    const score = el =>
      (el.diameter   != null ? 2 : 0) +   // weight diameter highest
      (el.insulThick != null ? 1 : 0) +
      (el.temp1      != null ? 1 : 0) +
      (el.temp2      != null ? 1 : 0) +
      (el.temp3      != null ? 1 : 0) +
      (el.material              ? 1 : 0) +
      (el.lineNo                ? 1 : 0);

    for (const s of springs) {
      const candidates = nodeMap.get(s.node) || [];
      if (!candidates.length) continue;
      // Pick the element with the most complete data
      const el = candidates.reduce((best, c) => score(c) > score(best) ? c : best, candidates[0]);
      if (el.diameter   != null) s.diameter   = el.diameter;
      if (el.insulThick != null) s.insulThick = el.insulThick;
      // Apply temperature column mapping (settings.tempDesign/tempOper/tempMin = 1..9)
      const tD = el[`temp${settings.tempDesign || 1}`];
      const tO = el[`temp${settings.tempOper   || 2}`];
      const tM = el[`temp${settings.tempMin    || 3}`];
      if (tD != null) s.temp1 = tD;
      if (tO != null) s.temp2 = tO;
      if (tM != null) s.temp3 = tM;
      if (el.material)           s.material   = el.material;
      if (el.lineNo)             s.lineNo     = el.lineNo;
    }
  }

  // ── Restraint Report cross-reference ──────────────────────
  if (restraint && restraint.nodes) {
    for (const s of springs) {
      const nodeCases = restraint.nodes[s.node];
      if (!nodeCases) continue;

      // Hydro test load = FY at hydrotest case
      const hydroRow = nodeCases[hydroCase];
      if (hydroRow && hydroRow.FY != null) s.hydroLoad = hydroRow.FY;

      // For Variable (User): hot load and vert movement come from the restraint report
      // The hanger report gives the installed load; the actual operating load
      // is FY at the operating case closest to W_inst + k*DY (Caesar logic).
      // For MVP: use FY of the first OPE case available as hot load.
      if (s.type === 'Variable (User)') {
        // Try to find the best matching OPE case using installed load
        const opeCases = Object.entries(nodeCases)
          .filter(([k]) => /OPE/i.test(k));

        if (opeCases.length > 0 && s.actInstLoad != null) {
          // Pick the case whose FY is closest to installed load
          let best = null, bestDiff = Infinity;
          for (const [caseLabel, row] of opeCases) {
            if (row.FY == null) continue;
            const diff = Math.abs(Math.abs(row.FY) - Math.abs(s.actInstLoad));
            if (diff < bestDiff) { bestDiff = diff; best = { caseLabel, row }; }
          }
          if (best) {
            s.hotLoad = best.row.FY;
            s.vertMov = best.row.DY;
          }
        }
      }
    }
  }
}
