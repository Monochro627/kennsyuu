/**
 * 編集モード：卒業要件とタスク（研修フロー）を、アプリの画面から直す（管理者・教育担当）。
 * 直すのは「研修アプリデータ」の「卒業条件」「タスクマスター」だけ。元の研修フローのスプレッドは触らない。
 * 削除は消さずに「（保留）」のシートへ移すので、行を戻せば元に戻る。
 */

var GOAL_HEADERS = ['ID', '条件', '詳細'];
var EDIT_TARGET = {
  task: { sheet: 'タスクマスター', hold: 'タスクマスター（保留）', headers: ['ID', 'フェーズ', 'カテゴリ', 'タスク', 'ポイント', '扱い'], prefix: 'T' },
  goal: { sheet: '卒業条件', hold: '卒業条件（保留）', headers: GOAL_HEADERS, prefix: 'G' }
};

function requireStaff_(user) {
  if (!isStaff_(user)) throw new Error('この操作は管理者・教育担当だけができます。');
}

function editTarget_(kind) {
  var t = EDIT_TARGET[kind];
  if (!t) throw new Error('種類が正しくありません: ' + kind);
  return t;
}

/** 見出しを除いた行（空行は飛ばす）を、列数をそろえて読む */
function readRows_(t) {
  var sh = sheet_(t.sheet);
  var values = sh.getDataRange().getValues();
  values.shift();
  return values.filter(function (r) { return r.join('') !== ''; }).map(function (r) {
    var row = r.slice(0, t.headers.length);
    while (row.length < t.headers.length) row.push('');
    return row;
  });
}

/** 行を丸ごと書き直す（並び替え・追加・削除のあと） */
function writeRows_(t, rows) {
  var sh = sheet_(t.sheet);
  var old = Math.max(sh.getLastRow() - 1, 0);
  if (old) sh.getRange(2, 1, old, Math.max(sh.getLastColumn(), t.headers.length)).clearContent();
  sh.getRange(1, 1, 1, t.headers.length).setValues([t.headers]);
  if (rows.length) sh.getRange(2, 1, rows.length, t.headers.length).setValues(rows);
}

/** まだ使われていない ID（T018、G10 のように、今ある番号と保留中の番号の続き） */
function nextId_(t, rows) {
  var holdSh = db_().getSheetByName(t.hold);
  var ids = rows.map(function (r) { return String(r[0]); });
  if (holdSh && holdSh.getLastRow() > 1) {
    holdSh.getRange(2, 1, holdSh.getLastRow() - 1, 1).getValues().forEach(function (r) { ids.push(String(r[0])); });
  }
  var re = new RegExp('^' + t.prefix + '(\\d+)$');
  var max = ids.reduce(function (m, id) { var x = id.match(re); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  var width = t.prefix === 'T' ? 3 : 2;
  return t.prefix + ('000' + (max + 1)).slice(-width);
}

/** 画面から来た値を、その種類の行にする（ID は別に入れる） */
function rowFromFields_(kind, id, f, base) {
  f = f || {};
  var pick = function (key, i) { return f[key] !== undefined ? String(f[key]).trim() : (base ? base[i] : ''); };
  if (kind === 'goal') return [id, pick('title', 1), pick('detail', 2)];
  return [id, pick('phase', 1), pick('category', 2), pick('title', 3), pick('point', 4), pick('mode', 5)];
}

/** 項目を直す。fields は {title, detail}（卒業要件）か {title, point, phase, category, mode}（タスク） */
function api_updateItem(kind, id, fields) {
  requireStaff_(currentUser_());
  var t = editTarget_(kind);
  return withLock_(function () {
    var rows = readRows_(t);
    var i = rows.map(function (r) { return String(r[0]); }).indexOf(String(id));
    if (i < 0) throw new Error('項目が見つかりません: ' + id);
    var row = rowFromFields_(kind, rows[i][0], fields, rows[i]);
    if (!row[kind === 'goal' ? 1 : 3]) throw new Error('項目名を入れてください。');
    rows[i] = row;
    writeRows_(t, rows);
    return { id: String(id) };
  });
}

/** 項目を足す。afterId の次に入れる（なければ最後）。新しい ID を返す */
function api_addItem(kind, fields, afterId) {
  requireStaff_(currentUser_());
  var t = editTarget_(kind);
  return withLock_(function () {
    var rows = readRows_(t);
    var id = nextId_(t, rows);
    var row = rowFromFields_(kind, id, fields, null);
    if (!row[kind === 'goal' ? 1 : 3]) throw new Error('項目名を入れてください。');
    var at = afterId ? rows.map(function (r) { return String(r[0]); }).indexOf(String(afterId)) : -1;
    if (at < 0) rows.push(row);
    else rows.splice(at + 1, 0, row);
    writeRows_(t, rows);
    return { id: id };
  });
}

/** 項目を外す（「（保留）」のシートへ移す。研修生のチェックはそのまま残り、戻せば復活する） */
function api_removeItem(kind, id) {
  requireStaff_(currentUser_());
  var t = editTarget_(kind);
  return withLock_(function () {
    var rows = readRows_(t);
    var i = rows.map(function (r) { return String(r[0]); }).indexOf(String(id));
    if (i < 0) throw new Error('項目が見つかりません: ' + id);
    var ss = db_();
    var hold = ss.getSheetByName(t.hold);
    if (!hold) {
      hold = ss.insertSheet(t.hold);
      hold.getRange(1, 1, 1, t.headers.length).setValues([t.headers]).setFontWeight('bold').setBackground('#e8eaf6');
      hold.setFrozenRows(1);
    }
    hold.getRange(hold.getLastRow() + 1, 1, 1, t.headers.length).setValues([rows[i]]);
    rows.splice(i, 1);
    writeRows_(t, rows);
    return { id: String(id) };
  });
}

/** 並び順を保存する。ids に入っていない行は、元の順のまま後ろに付ける */
function api_saveOrder(kind, ids) {
  requireStaff_(currentUser_());
  var t = editTarget_(kind);
  return withLock_(function () {
    var rows = readRows_(t);
    var byId = {};
    rows.forEach(function (r) { byId[String(r[0])] = r; });
    var used = {};
    var out = [];
    (ids || []).forEach(function (id) {
      id = String(id);
      if (byId[id] && !used[id]) { out.push(byId[id]); used[id] = true; }
    });
    rows.forEach(function (r) { if (!used[String(r[0])]) out.push(r); });
    writeRows_(t, out);
    return { count: out.length };
  });
}

/** まとまり（フェーズ）の名前を変える。そのまとまりのタスクすべてのフェーズを書き換える */
function api_renamePhase(oldName, newName) {
  requireStaff_(currentUser_());
  newName = String(newName || '').trim();
  if (!newName) throw new Error('名前を入れてください。');
  var t = editTarget_('task');
  return withLock_(function () {
    var rows = readRows_(t);
    var n = 0;
    rows.forEach(function (r) { if (String(r[1]) === String(oldName)) { r[1] = newName; n++; } });
    if (!n) throw new Error('「' + oldName + '」が見つかりません。');
    writeRows_(t, rows);
    return { count: n };
  });
}
