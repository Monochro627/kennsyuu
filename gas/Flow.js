/**
 * 研修フロー（タスクマスター）の整理。
 * タスクマスターの「扱い」列で、タスクの見せ方を決める。
 *   チェック（空欄も同じ）… チェックボックス。進捗に数える
 *   メモ                 … チェックボックス＋実施日。全部終わらせなくてよい（進捗に数えない）
 *   G01〜G09             … その卒業要件を開いたときに出る項目（例：G04 事務作業ワーク）
 *   ロープレ一覧         … ロープレのページに「ロープレの種類」として並べるだけ
 *   目安：〇〇           … 「入社からの目安」の表に、〇〇の列として並べるだけ
 */

var MODE = { CHECK: 'チェック', MEMO: 'メモ', ROLEPLAY: 'ロープレ一覧', GUIDE_PREFIX: '目安：' };
var TASK_HEADERS = ['ID', 'フェーズ', 'カテゴリ', 'タスク', 'ポイント', '扱い'];

/** 進捗シートに行を持つ（チェックや日付を付ける）扱いか */
function hasProgressRow_(mode) {
  mode = String(mode || '');
  return mode !== MODE.ROLEPLAY && mode.indexOf(MODE.GUIDE_PREFIX) !== 0;
}

/** 進捗率に数える扱いか */
function countsForProgress_(mode) {
  mode = String(mode || '');
  return !mode || mode === MODE.CHECK;
}

/** 元の研修フローのフェーズ名から、どのまとまりかを決める */
function flowGroup_(phase) {
  var p = String(phase || '');
  if (/入社前|セットアップ/.test(p)) return 'setup';
  if (/依頼コンサル/.test(p)) return 'consult';
  if (/諸々/.test(p)) return 'misc';
  if (/ひたすら/.test(p)) return 'roleplay';
  if (/物件用語/.test(p)) return 'work';
  if (/事務処理/.test(p)) return 'office';
  if (/2週間/.test(p)) return 'twoWeeks';
  if (/1[～〜~]3/.test(p) || /卒業/.test(p)) return 'graduation';
  if (/1[カヶヵか]月/.test(p)) return 'oneMonth';
  return 'other';
}

/**
 * 元の研修フロー（[ID, フェーズ, カテゴリ, タスク, ポイント, 扱い?] の行）を、今の形に並べ替える。
 * すでに「扱い」が入っている行はそのまま残す（何度実行しても同じ結果になる）。
 */
function transformTasks_(rows) {
  var done = [];
  var groups = { setup: [], consult: [], twoWeeks: [], work: [], roleplay: [], guide: [], other: [] };
  var guides = { twoWeeks: [], oneMonth: [], graduation: [] };
  var phaseName = { twoWeeks: '' };
  rows.forEach(function (r) {
    if (r[5]) { done.push(r.slice(0, 6)); return; }
    var id = r[0], phase = String(r[1] || ''), cat = r[2], task = String(r[3] || ''), point = String(r[4] || '');
    var g = flowGroup_(phase);
    var name = phase.replace(/^\d+\.\s*/, '');
    if (g === 'setup' || g === 'misc') groups.setup.push([id, 'セットアップ研修', cat, task, point, MODE.CHECK]);
    else if (g === 'consult') groups.consult.push([id, '依頼コンサル', cat, task.replace(/※伊藤/g, '※小嶋'), point.replace(/※伊藤/g, '※小嶋'), MODE.MEMO]);
    else if (g === 'roleplay') groups.roleplay.push([id, 'ロープレの種類', cat, task, point, MODE.ROLEPLAY]);
    else if (g === 'work' || g === 'office') groups.work.push([id, '事務作業ワーク', cat, task, point, 'G04']);
    else if (g === 'twoWeeks') {
      phaseName.twoWeeks = name;
      groups.twoWeeks.push([id, name, cat, task, point, MODE.CHECK]);
      guides.twoWeeks.push(task);
    } else if (g === 'oneMonth') {
      guides.oneMonth.push(task);
      // カレンダーとロープレは毎日意識することなのでセットアップ研修へ、ほかは依頼コンサルへ
      if (/カレンダー|ロープレ/.test(task)) groups.setup.push([id, 'セットアップ研修', cat, task, point, MODE.CHECK]);
      else groups.consult.push([id, '依頼コンサル', cat, task.replace(/※伊藤/g, '※小嶋'), point.replace(/※伊藤/g, '※小嶋'), MODE.MEMO]);
    } else if (g === 'graduation') guides.graduation.push(task);
    else groups.other.push([id, name, cat, task, point, MODE.CHECK]);
  });
  // 目安の行のIDは、すでにある M〇〇〇 の続きから振る
  var n = done.reduce(function (max, r) {
    var m = String(r[0]).match(/^M(\d+)$/);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  var guide = function (label, list) {
    list.forEach(function (t) { n++; groups.guide.push(['M' + ('00' + n).slice(-3), '入社からの目安', '', t, '', MODE.GUIDE_PREFIX + label]); });
  };
  guide('〜2週間', guides.twoWeeks);
  guide('〜1ヶ月', guides.oneMonth);
  guide('1〜3ヶ月（卒業検定）', guides.graduation);
  return done.concat(groups.setup, groups.consult, groups.twoWeeks, groups.other, groups.work, groups.roleplay, groups.guide);
}

/**
 * タスクマスター（と「タスクマスター（保留）」）を今の形に整理する（管理者のみ）。
 * IDはそのままなので、研修生のチェックは消えない。
 */
function api_restructureFlow() {
  var me = currentUser_();
  requireAdmin_(me);
  return withLock_(function () {
    var ss = db_();
    var sh = sheet_(SHEET.TASKS);
    var read = function (s) {
      var v = s.getDataRange().getValues();
      v.shift();
      return v.filter(function (r) { return r.join('') !== ''; }).map(function (r) { return [r[0], r[1], r[2], r[3], r[4], r[5] || '']; });
    };
    var rows = read(sh);
    var hold = ss.getSheetByName('タスクマスター（保留）');
    if (hold && hold.getLastRow() > 1) {
      rows = rows.concat(read(hold));
      hold.getRange(2, 1, hold.getLastRow() - 1, hold.getLastColumn()).clearContent();
    }
    var out = transformTasks_(rows);
    var oldRows = Math.max(sh.getLastRow() - 1, 0);
    if (oldRows) sh.getRange(2, 1, oldRows, Math.max(sh.getLastColumn(), TASK_HEADERS.length)).clearContent();
    sh.getRange(1, 1, 1, TASK_HEADERS.length).setValues([TASK_HEADERS]);
    if (out.length) sh.getRange(2, 1, out.length, TASK_HEADERS.length).setValues(out);
    var count = {};
    out.forEach(function (r) { count[r[5]] = (count[r[5]] || 0) + 1; });
    return { total: out.length, byMode: count };
  });
}

// ---------- アプリからの項目の編集・並び替え（管理者のみ） ----------
// 書き換えるのはアプリのデータ用スプレッド（研修アプリデータ）の「タスクマスター」「卒業条件」だけ。
// 元の「（新）研修フローフォーマット」や試験の元シートには一切書き込まない。

var HOLD_SHEET = 'タスクマスター（保留）';

/** 見出しの次の行から、空でない行を [行の値...] で読む */
function readRows_(sh, width) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, width).getValues().filter(function (r) { return r.join('') !== ''; });
}

/** 見出しの下をまるごと書き直す（行が減ったときは残りを消す） */
function writeRows_(sh, headers, rows) {
  var old = Math.max(sh.getLastRow() - 1, 0);
  if (old) sh.getRange(2, 1, old, Math.max(sh.getLastColumn(), headers.length)).clearContent();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

/** ids の順に並べ替える。ids にない行（ほかの人が足した行など）は元の順で後ろに残す */
function orderRows_(rows, ids) {
  var byId = {};
  rows.forEach(function (r) { byId[String(r[0])] = r; });
  var out = [];
  var used = {};
  (ids || []).forEach(function (id) {
    id = String(id);
    if (byId[id] && !used[id]) { out.push(byId[id]); used[id] = true; }
  });
  rows.forEach(function (r) { if (!used[String(r[0])]) out.push(r); });
  return out;
}

function cleanText_(v, label, required) {
  var s = String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim();
  if (required && !s) throw new Error(label + 'を入力してください。');
  if (s.length > 500) throw new Error(label + 'が長すぎます（500文字まで）。');
  return s;
}

/** 研修生の進捗シートの「内容」列も、新しい文言にそろえる（チェックの記録はそのまま） */
function renameInProgressSheets_(id, title) {
  db_().getSheets().forEach(function (sh) {
    if (sh.getName().indexOf(PROGRESS_PREFIX) !== 0) return;
    var rows = readTable_(sh);
    rows.forEach(function (r) { if (String(r['ID']) === String(id)) sh.getRange(r._row, 5).setValue(title); });
  });
}

/** タスクの並び順を保存する。ids はタスクマスター全体の新しい並び（画面の S.data.tasks の順） */
function api_saveTaskOrder(ids) {
  requireAdmin_(currentUser_());
  return withLock_(function () {
    var sh = sheet_(SHEET.TASKS);
    writeRows_(sh, TASK_HEADERS, orderRows_(readRows_(sh, TASK_HEADERS.length), ids));
    return { ok: true };
  });
}

/** 卒業要件の並び順を保存する */
function api_saveGoalOrder(ids) {
  requireAdmin_(currentUser_());
  return withLock_(function () {
    var sh = sheet_(SHEET.GOALS);
    writeRows_(sh, ['ID', '条件', '詳細'], orderRows_(readRows_(sh, 3), ids));
    return { ok: true };
  });
}

/** タスクの文言・ポイント・まとまり（フェーズ）を直す */
function api_updateTask(id, patch) {
  requireAdmin_(currentUser_());
  var title = cleanText_(patch.title, '項目名', true);
  var point = cleanText_(patch.point, 'ポイント', false);
  return withLock_(function () {
    var sh = sheet_(SHEET.TASKS);
    var row = readTable_(sh).filter(function (r) { return String(r['ID']) === String(id); })[0];
    if (!row) throw new Error('項目が見つかりません: ' + id);
    var phase = patch.phase ? cleanText_(patch.phase, 'まとまり', true) : String(row['フェーズ']);
    sh.getRange(row._row, 2, 1, 4).setValues([[phase, row['カテゴリ'], title, point]]);
    if (title !== String(row['タスク'])) renameInProgressSheets_(id, title);
    return { id: String(id), phase: phase, title: title, point: point };
  });
}

/** 卒業要件の文言・詳細を直す */
function api_updateGoal(id, patch) {
  requireAdmin_(currentUser_());
  var title = cleanText_(patch.title, '要件名', true);
  var detail = cleanText_(patch.detail, '詳細', false);
  return withLock_(function () {
    var sh = sheet_(SHEET.GOALS);
    var row = readTable_(sh).filter(function (r) { return String(r['ID']) === String(id); })[0];
    if (!row) throw new Error('要件が見つかりません: ' + id);
    sh.getRange(row._row, 2, 1, 2).setValues([[title, detail]]);
    if (title !== String(row['条件'])) renameInProgressSheets_(id, title);
    return { id: String(id), title: title, detail: detail };
  });
}

/**
 * 項目を足す。task は {phase, title, point, mode, after}。after のIDの直後（なければ同じまとまりの最後）に入る。
 * 研修生の進捗シートには、次に開いたときに自動で行が足される。
 */
function api_addTask(task) {
  requireAdmin_(currentUser_());
  var title = cleanText_(task.title, '項目名', true);
  var point = cleanText_(task.point, 'ポイント', false);
  var phase = cleanText_(task.phase, 'まとまり', true);
  var mode = String(task.mode || '');
  return withLock_(function () {
    var ss = db_();
    var sh = sheet_(SHEET.TASKS);
    var rows = readRows_(sh, TASK_HEADERS.length);
    var hold = ss.getSheetByName(HOLD_SHEET);
    var all = rows.concat(hold ? readRows_(hold, TASK_HEADERS.length) : []);
    var prefix = mode.indexOf(MODE.GUIDE_PREFIX) === 0 ? 'M' : 'T';
    var n = all.reduce(function (max, r) {
      var m = String(r[0]).match(new RegExp('^' + prefix + '(\\d+)$'));
      return m ? Math.max(max, Number(m[1])) : max;
    }, 0);
    var id = prefix + ('00' + (n + 1)).slice(-3);
    var row = [id, phase, '', title, point, mode];
    var at = -1;
    rows.forEach(function (r, i) {
      if (task.after && String(r[0]) === String(task.after)) at = i;
      else if (!task.after && String(r[1]) === phase && String(r[5] || '') === mode) at = i;
    });
    if (at < 0) rows.push(row); else rows.splice(at + 1, 0, row);
    writeRows_(sh, TASK_HEADERS, rows);
    return { id: id, phase: phase, category: '', title: title, point: point, mode: mode };
  });
}

/**
 * 項目を外す。消さずに「タスクマスター（保留）」へ移すので、研修生のチェック記録も残る。
 * 保留シートの行をタスクマスターに戻せば、元どおり表示される。
 */
function api_holdTask(id) {
  requireAdmin_(currentUser_());
  return withLock_(function () {
    var ss = db_();
    var sh = sheet_(SHEET.TASKS);
    var rows = readRows_(sh, TASK_HEADERS.length);
    var target = rows.filter(function (r) { return String(r[0]) === String(id); })[0];
    if (!target) throw new Error('項目が見つかりません: ' + id);
    var hold = ss.getSheetByName(HOLD_SHEET);
    if (!hold) {
      hold = ss.insertSheet(HOLD_SHEET);
      hold.getRange(1, 1, 1, TASK_HEADERS.length).setValues([TASK_HEADERS]).setFontWeight('bold').setBackground('#e8eaf6');
      hold.setFrozenRows(1);
    }
    hold.getRange(hold.getLastRow() + 1, 1, 1, TASK_HEADERS.length).setValues([target]);
    writeRows_(sh, TASK_HEADERS, rows.filter(function (r) { return r !== target; }));
    return { id: String(id) };
  });
}

/** 研修フローのまとまり（フェーズ）の名前を変える。卒業要件の「やること」など、ほかの扱いの行は変えない */
function api_renamePhase(oldName, newName) {
  requireAdmin_(currentUser_());
  var name = cleanText_(newName, 'まとまりの名前', true);
  return withLock_(function () {
    var sh = sheet_(SHEET.TASKS);
    var n = 0;
    readTable_(sh).forEach(function (r) {
      var mode = String(r['扱い'] || '');
      var isFlow = !mode || mode === MODE.CHECK || mode === MODE.MEMO;
      if (isFlow && String(r['フェーズ']) === String(oldName)) { sh.getRange(r._row, 2).setValue(name); n++; }
    });
    if (!n) throw new Error('まとまり「' + oldName + '」が見つかりません。');
    return { name: name, count: n };
  });
}
