/**
 * 新人営業研修アプリ（Google Apps Script Webアプリ）
 * データはスクリプトプロパティ DATA_SPREADSHEET_ID のスプレッドシートに保存する。
 * 初回は Setup.js の setup() を実行すること。
 */

var SHEET = {
  MEMBERS: 'メンバー',
  GOALS: '卒業条件',
  TASKS: 'タスクマスター',
  MATERIALS: '資料マスター',
  ROLEPLAY: 'ロープレ記録',
  ELEARNING: 'eラーニング記録'
};
var PROGRESS_PREFIX = '進捗_';
var PROGRESS_HEADERS = ['ID', '種類', 'フェーズ', 'カテゴリ', '内容', '完了', 'チェックした人', '日時'];
var ROLE = { ADMIN: '管理者', TRAINER: '教育担当', TRAINEE: '研修生' };
var MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate()
    .setTitle('Monochro 新人研修')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

// ---------- 共通 ----------

function props_() {
  return PropertiesService.getScriptProperties();
}

function db_() {
  var id = props_().getProperty('DATA_SPREADSHEET_ID');
  if (!id) throw new Error('初期設定がまだです。管理者が setup() を実行してください。');
  return SpreadsheetApp.openById(id);
}

function sheet_(name) {
  var sh = db_().getSheetByName(name);
  if (!sh) throw new Error('シート「' + name + '」が見つかりません。');
  return sh;
}

/** 見出し行をキーにしたオブジェクトの配列で返す（_row は1始まりの行番号） */
function readTable_(sh) {
  var values = sh.getDataRange().getValues();
  var headers = values.shift() || [];
  return values.map(function (r, i) {
    var o = { _row: i + 2 };
    headers.forEach(function (h, j) { o[h] = r[j]; });
    return o;
  }).filter(function (o) {
    return headers.some(function (h) { return o[h] !== '' && o[h] !== null; });
  });
}

function fmtDate_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
  }
  return String(v);
}

function fmtDay_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy/MM/dd');
  }
  return String(v);
}

function members_() {
  return readTable_(sheet_(SHEET.MEMBERS)).map(function (m) {
    return {
      name: String(m['名前']).trim(),
      email: String(m['メール']).trim().toLowerCase(),
      role: String(m['役割']).trim(),
      joined: fmtDay_(m['入社日']),
      status: String(m['状態'] || '在籍').trim()
    };
  }).filter(function (m) { return m.name; });
}

/** アクセスしている人をメンバー表から特定する。表にいなければ例外 */
function currentUser_() {
  var email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  var me = members_().filter(function (m) { return m.email && m.email === email && m.status !== '退職'; })[0];
  if (me) return me;
  var owner = String(props_().getProperty('OWNER_EMAIL') || '').toLowerCase();
  if (email && email === owner) return { name: '管理者', email: email, role: ROLE.ADMIN, joined: '', status: '在籍' };
  throw new Error('このアプリを使う権限がありません（' + (email || 'メール不明') + '）。管理者にメンバー表への登録を依頼してください。');
}

function isStaff_(user) {
  return user.role === ROLE.ADMIN || user.role === ROLE.TRAINER;
}

function requireAdmin_(user) {
  if (user.role !== ROLE.ADMIN) throw new Error('この操作は管理者だけができます。');
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ---------- 進捗シート ----------

function progressSheetName_(traineeName) {
  return PROGRESS_PREFIX + traineeName;
}

/** 卒業条件とタスクマスターから、研修生の進捗シートを作る */
function createProgressSheet_(traineeName) {
  var ss = db_();
  var name = progressSheetName_(traineeName);
  if (ss.getSheetByName(name)) return ss.getSheetByName(name);
  var rows = [PROGRESS_HEADERS];
  readTable_(sheet_(SHEET.GOALS)).forEach(function (g) {
    rows.push([g['ID'], '卒業条件', '卒業条件', '', g['条件'], false, '', '']);
  });
  readTable_(sheet_(SHEET.TASKS)).forEach(function (t) {
    rows.push([t['ID'], 'タスク', t['フェーズ'], t['カテゴリ'], t['タスク'], false, '', '']);
  });
  var sh = ss.insertSheet(name);
  sh.getRange(1, 1, rows.length, PROGRESS_HEADERS.length).setValues(rows);
  sh.getRange(2, 6, rows.length - 1, 1).insertCheckboxes();
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, PROGRESS_HEADERS.length).setFontWeight('bold').setBackground('#e8eaf6');
  sh.setColumnWidth(5, 420);
  return sh;
}

function readProgress_(traineeName) {
  var sh = db_().getSheetByName(progressSheetName_(traineeName));
  if (!sh) return [];
  return readTable_(sh).map(function (r) {
    return {
      id: String(r['ID']),
      kind: r['種類'],
      done: r['完了'] === true,
      by: r['チェックした人'] || '',
      at: fmtDate_(r['日時'])
    };
  });
}

function requiredVideoIds_() {
  return readTable_(sheet_(SHEET.MATERIALS))
    .filter(function (m) { return m['区分'] === 'eラーニング' && m['必須'] === '必須'; })
    .map(function (m) { return String(m['ID']); });
}

function watchedByEmail_() {
  var map = {};
  readTable_(sheet_(SHEET.ELEARNING)).forEach(function (r) {
    var email = String(r['メール']).toLowerCase();
    (map[email] = map[email] || {})[String(r['資料ID'])] = true;
  });
  return map;
}

/** 全研修生の進捗サマリー */
function summaries_(members) {
  var tasks = readTable_(sheet_(SHEET.TASKS));
  var phaseOf = {};
  tasks.forEach(function (t) { phaseOf[String(t['ID'])] = t['フェーズ']; });
  var required = requiredVideoIds_();
  var watched = watchedByEmail_();
  return members.filter(function (m) { return m.role === ROLE.TRAINEE && m.status !== '退職'; }).map(function (m) {
    var rows = readProgress_(m.name);
    var done = rows.filter(function (r) { return r.done; });
    var goals = rows.filter(function (r) { return r.kind === '卒業条件'; });
    var nextTask = rows.filter(function (r) { return r.kind === 'タスク' && !r.done; })[0];
    var last = done.map(function (r) { return r.at; }).sort().pop() || '';
    var w = watched[m.email] || {};
    return {
      name: m.name,
      joined: m.joined,
      status: m.status,
      percent: rows.length ? Math.round(done.length * 100 / rows.length) : 0,
      goalsDone: goals.filter(function (r) { return r.done; }).length,
      goalsTotal: goals.length,
      phase: nextTask ? phaseOf[nextTask.id] : (rows.length ? 'タスク完了' : '進捗シートなし'),
      lastUpdate: last,
      videosWatched: required.filter(function (id) { return w[id]; }).length,
      videosRequired: required.length
    };
  });
}

// ---------- 画面から呼ばれる関数 ----------

/** 画面の初期表示に必要なデータをまとめて返す */
function api_bootstrap() {
  var me = currentUser_();
  var members = members_();
  var goals = readTable_(sheet_(SHEET.GOALS)).map(function (g) {
    return { id: String(g['ID']), title: g['条件'], detail: g['詳細'] || '' };
  });
  var tasks = readTable_(sheet_(SHEET.TASKS)).map(function (t) {
    return { id: String(t['ID']), phase: t['フェーズ'], category: t['カテゴリ'], title: t['タスク'], point: t['ポイント'] || '' };
  });
  var materials = readTable_(sheet_(SHEET.MATERIALS)).map(function (m) {
    return {
      id: String(m['ID']), group: m['区分'], section: m['セクション'], title: m['タイトル'], kind: m['種別'],
      url: m['URL'], required: m['必須'] === '必須', note: m['補足'] || '', order: Number(m['並び順']) || 0
    };
  }).sort(function (a, b) { return a.order - b.order; });
  return {
    me: me,
    members: members.map(function (m) { return { name: m.name, role: m.role, joined: m.joined, status: m.status }; }),
    goals: goals,
    tasks: tasks,
    materials: materials,
    summaries: summaries_(members)
  };
}

/** 研修生1人分のチェック状況と、視聴済みの動画ID */
function api_getProgress(traineeName) {
  currentUser_();
  var trainee = members_().filter(function (m) { return m.name === traineeName; })[0];
  if (!trainee) throw new Error('研修生「' + traineeName + '」が見つかりません。');
  var watched = watchedByEmail_()[trainee.email] || {};
  return { name: traineeName, rows: readProgress_(traineeName), watched: Object.keys(watched) };
}

/** チェックの付け外し。研修生は自分の分だけ、教育担当・管理者は全員分を操作できる */
function api_setCheck(traineeName, itemId, done) {
  var me = currentUser_();
  if (!isStaff_(me) && me.name !== traineeName) throw new Error('他の研修生のチェックは変更できません。');
  return withLock_(function () {
    var sh = db_().getSheetByName(progressSheetName_(traineeName));
    if (!sh) throw new Error('進捗シートがありません。');
    var row = readTable_(sh).filter(function (r) { return String(r['ID']) === String(itemId); })[0];
    if (!row) throw new Error('項目が見つかりません: ' + itemId);
    var now = new Date();
    sh.getRange(row._row, 6, 1, 3).setValues([[!!done, done ? me.name : '', done ? now : '']]);
    return { id: String(itemId), done: !!done, by: done ? me.name : '', at: done ? fmtDate_(now) : '' };
  });
}

/** eラーニングの視聴記録（気づき・質問）を保存する */
function api_submitElearning(materialId, insight, question) {
  var me = currentUser_();
  if (!String(insight || '').trim()) throw new Error('気づき・学びを入力してください。');
  var m = readTable_(sheet_(SHEET.MATERIALS)).filter(function (x) { return String(x['ID']) === String(materialId); })[0];
  if (!m) throw new Error('動画が見つかりません。');
  withLock_(function () {
    sheet_(SHEET.ELEARNING).appendRow([new Date(), me.email, me.name, String(materialId), m['タイトル'],
      String(insight).trim(), String(question || '').trim() || 'なし', '']);
  });
  return { id: String(materialId) };
}

/** 自分の過去の気づき・質問 */
function api_myElearningNotes() {
  var me = currentUser_();
  return readTable_(sheet_(SHEET.ELEARNING))
    .filter(function (r) { return String(r['メール']).toLowerCase() === me.email; })
    .map(function (r) {
      return { at: fmtDate_(r['日時']), id: String(r['資料ID']), title: r['タイトル'], insight: r['気づき・学び'], question: r['質問'], answer: r['AI仮回答'] || '' };
    }).reverse();
}

function api_listRoleplays() {
  currentUser_();
  return readTable_(sheet_(SHEET.ROLEPLAY)).map(function (r) {
    return {
      id: String(r['ID']), date: fmtDay_(r['日付']), minutes: r['所要時間（分）'], speaker: r['話し手'], listener: r['聞き手'],
      topic: r['内容'], focus: r['意識するポイント'], feedback: r['フィードバック'], audio: r['録音'],
      transcript: r['文字起こし'] || '', summary: r['要約'] || '', by: r['登録者']
    };
  }).reverse();
}

/**
 * ロープレ記録を追加する。file は {name, mimeType, base64}（任意）。
 * 録音は ROLEPLAY_FOLDER_ID のフォルダに保存する。
 */
function api_addRoleplay(rec, file) {
  var me = currentUser_();
  if (!rec || !rec.speaker || !rec.topic) throw new Error('話し手と内容は必須です。');
  var audioUrl = '';
  if (file && file.base64) {
    var bytes = Utilities.base64Decode(file.base64);
    if (bytes.length > MAX_UPLOAD_BYTES) throw new Error('録音ファイルが大きすぎます（40MBまで）。');
    var folder = DriveApp.getFolderById(props_().getProperty('ROLEPLAY_FOLDER_ID'));
    var stamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmm');
    var blob = Utilities.newBlob(bytes, file.mimeType || 'application/octet-stream',
      stamp + '_' + rec.speaker + '_' + rec.topic + '_' + (file.name || 'recording'));
    audioUrl = folder.createFile(blob).getUrl();
  }
  return withLock_(function () {
    var sh = sheet_(SHEET.ROLEPLAY);
    var id = 'RP-' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMddHHmmss');
    sh.appendRow([id, rec.date || fmtDay_(new Date()), Number(rec.minutes) || '', rec.speaker, rec.listener || '',
      rec.topic, rec.focus || '', rec.feedback || '', audioUrl, '', '', me.name, new Date()]);
    return { id: id, audio: audioUrl };
  });
}

/** メンバーを追加する（管理者のみ）。研修生なら進捗シートも作る */
function api_addMember(m) {
  var me = currentUser_();
  requireAdmin_(me);
  var name = String(m.name || '').trim();
  var email = String(m.email || '').trim().toLowerCase();
  if (!name || !email) throw new Error('名前とメールは必須です。');
  if ([ROLE.ADMIN, ROLE.TRAINER, ROLE.TRAINEE].indexOf(m.role) < 0) throw new Error('役割が正しくありません。');
  return withLock_(function () {
    var exists = members_().some(function (x) { return x.email === email || x.name === name; });
    if (exists) throw new Error('同じ名前かメールのメンバーがすでにいます。');
    sheet_(SHEET.MEMBERS).appendRow([name, email, m.role, m.joined || '', '在籍', '']);
    if (m.role === ROLE.TRAINEE) createProgressSheet_(name);
    return { name: name };
  });
}

/** 管理画面用のリンク（管理者・教育担当のみ） */
function api_adminLinks() {
  var me = currentUser_();
  if (!isStaff_(me)) throw new Error('権限がありません。');
  var p = props_();
  return {
    spreadsheet: db_().getUrl(),
    root: 'https://drive.google.com/drive/folders/' + p.getProperty('ROOT_FOLDER_ID'),
    manuals: 'https://drive.google.com/drive/folders/' + p.getProperty('MANUAL_FOLDER_ID'),
    recordings: 'https://drive.google.com/drive/folders/' + p.getProperty('ROLEPLAY_FOLDER_ID')
  };
}
