// Apps Script のサービスを最小限まねたフェイク。サーバー側コードをNodeで動かして確認するためのもの。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class FakeRange {
  constructor(sheet, row, col, rows, cols) { Object.assign(this, { sheet, row, col, rows, cols }); }
  setValues(v) {
    v.forEach((r, i) => r.forEach((x, j) => this.sheet.set(this.row + i, this.col + j, x)));
    return this;
  }
  setValue(x) { this.sheet.set(this.row, this.col, x); return this; }
  getValues() {
    const out = [];
    for (let i = 0; i < this.rows; i++) {
      const r = [];
      for (let j = 0; j < this.cols; j++) r.push(this.sheet.get(this.row + i, this.col + j));
      out.push(r);
    }
    return out;
  }
  clearContent() {
    for (let i = 0; i < this.rows; i++) for (let j = 0; j < this.cols; j++) this.sheet.set(this.row + i, this.col + j, '');
    return this;
  }
  insertCheckboxes() {
    for (let i = 0; i < this.rows; i++) if (this.sheet.get(this.row + i, this.col) === '') this.sheet.set(this.row + i, this.col, false);
    return this;
  }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setDataValidation() { return this; }
}

class FakeSheet {
  constructor(name) { this.name = name; this.cells = []; }
  setName(n) { this.name = n; return this; }
  getName() { return this.name; }
  get(r, c) { return (this.cells[r - 1] || [])[c - 1] ?? ''; }
  set(r, c, v) {
    while (this.cells.length < r) this.cells.push([]);
    const row = this.cells[r - 1];
    while (row.length < c) row.push('');
    row[c - 1] = v;
  }
  getLastRow() {
    for (let i = this.cells.length; i > 0; i--) if (this.cells[i - 1].some((x) => x !== '')) return i;
    return 0;
  }
  getLastColumn() { return Math.max(0, ...this.cells.map((r) => r.length)); }
  getRange(a, b, c, d) {
    if (typeof a === 'string') {
      const m = a.match(/^([A-Z])(\d+)/);
      return new FakeRange(this, Number(m[2]), m[1].charCodeAt(0) - 64, 1000, 1);
    }
    return new FakeRange(this, a, b, c || 1, d || 1);
  }
  getDataRange() { return new FakeRange(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
  appendRow(r) { const row = this.getLastRow() + 1; r.forEach((x, j) => this.set(row, j + 1, x)); return this; }
  setFrozenRows() {}
  setColumnWidth() {}
}

class FakeSpreadsheet {
  constructor(id, name) { this.id = id; this.name = name; this.sheets = [new FakeSheet('シート1')]; }
  getId() { return this.id; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id + '/edit'; }
  getSheets() { return this.sheets; }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
  insertSheet(n) { const s = new FakeSheet(n); this.sheets.push(s); return s; }
  setSpreadsheetTimeZone() {}
}

function createContext({ userEmail, sourceFlowRows, siteImportRows }) {
  const store = {};
  const books = {};
  let seq = 0;
  const flow = new FakeSpreadsheet('SRC', 'flow');
  flow.sheets[0].setName('（新）研修フローフォーマット ');
  sourceFlowRows.forEach((r) => flow.sheets[0].appendRow(r));
  books.SRC = flow;
  books['1l7mVwKFQkYglFTEDeHB-UfazxIj_GHTK14BfsjyW92c'] = flow;
  const folder = (id) => ({
    getId: () => id,
    createFolder: () => folder('F' + ++seq),
    setSharing: () => {},
    createFile: (blob) => ({ getUrl: () => 'https://drive.google.com/file/d/FILE' + ++seq + '/view', blob }),
  });
  const ctx = {
    console,
    state: { userEmail },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => store[k] ?? null,
      setProperties: (o) => Object.assign(store, o),
    }) },
    SpreadsheetApp: {
      create: (n) => { const ss = new FakeSpreadsheet('SS' + ++seq, n); books[ss.id] = ss; return ss; },
      openById: (id) => books[id],
      newDataValidation: () => ({ requireValueInList() { return this; }, build() { return {}; } }),
    },
    DriveApp: {
      createFolder: () => folder('ROOT'),
      getFileById: () => ({ moveTo() {} }),
      getFolderById: (id) => folder(id),
      Access: {}, Permission: {},
    },
    Session: {
      getActiveUser: () => ({ getEmail: () => ctx.state.userEmail }),
      getEffectiveUser: () => ({ getEmail: () => 'owner@monochro-inc.com' }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      formatDate: (d, tz, f) => {
        const p = (n) => String(n).padStart(2, '0');
        return f.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate()))
          .replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes())).replace('ss', p(d.getSeconds()));
      },
      base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
      newBlob: (bytes, type, name) => ({ bytes, type, name }),
    },
    Logger: { log: () => {} },
    HtmlService: {},
    importSite_: () => siteImportRows,
  };
  vm.createContext(ctx);
  for (const f of ['Code.js', 'Setup.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../gas', f), 'utf8'), ctx, { filename: f });
  }
  // SiteImport.js はフェイクの importSite_ を使うので読み込まない
  ctx.books = books;
  return ctx;
}

module.exports = { createContext };
