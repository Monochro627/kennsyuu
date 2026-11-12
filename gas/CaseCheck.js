/**
 * 同席・書類チェック。新人の最初の案件は、5件まで上司が同席し、10件まで書類をチェックする。
 * 1件ごとに記録を残し、上司が感想・フィードバックを入れる。本人は振り返りを書ける。
 * 保存先は「研修アプリデータ」の「同席・書類チェック」シート。
 */

var CASE_SHEET = '同席・書類チェック';
var CASE_HEADERS = ['ID', '研修生', '日付', '案件', '同席', '書類チェック', '上司', 'フィードバック', 'フィードバックした人', 'フィードバック日時',
  '本人の振り返り', '登録者', '登録日時'];
var CASE_REQUIRED = { attend: 5, docs: 10 };

function caseSheet_() {
  var ss = db_();
  var sh = ss.getSheetByName(CASE_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CASE_SHEET);
    sh.getRange(1, 1, 1, CASE_HEADERS.length).setValues([CASE_HEADERS]).setFontWeight('bold').setBackground('#e8eaf6');
    sh.setFrozenRows(1);
  }
  return sh;
}

function caseDay_(v) {
  var d = String(v || '').trim().replace(/-/g, '/');
  if (!d) return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');
  var m = d.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) throw new Error('日付の形が正しくありません。');
  return m[1] + '/' + ('0' + m[2]).slice(-2) + '/' + ('0' + m[3]).slice(-2);
}

function readCases_(traineeName) {
  return readTable_(caseSheet_()).filter(function (r) { return !traineeName || String(r['研修生']) === traineeName; }).map(function (r) {
    return {
      _row: r._row,
      id: String(r['ID']),
      trainee: String(r['研修生']),
      date: fmtDay_(r['日付']),
      title: String(r['案件'] || ''),
      attend: r['同席'] === true || r['同席'] === 'TRUE',
      docs: r['書類チェック'] === true || r['書類チェック'] === 'TRUE',
      boss: String(r['上司'] || ''),
      feedback: String(r['フィードバック'] || ''),
      feedbackBy: String(r['フィードバックした人'] || ''),
      feedbackAt: fmtDate_(r['フィードバック日時']),
      reflection: String(r['本人の振り返り'] || ''),
      by: String(r['登録者'] || ''),
      at: fmtDate_(r['登録日時'])
    };
  });
}

/** 研修生1人分の記録と件数（新しい順） */
function caseSummary_(traineeName) {
  var list = readCases_(traineeName).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a._row < b._row ? 1 : -1); });
  return {
    required: CASE_REQUIRED,
    attend: list.filter(function (c) { return c.attend; }).length,
    docs: list.filter(function (c) { return c.docs; }).length,
    records: list.map(function (c) { var o = {}; Object.keys(c).forEach(function (k) { if (k !== '_row') o[k] = c[k]; }); return o; })
  };
}

function caseEditable_(me, traineeName) {
  if (!isStaff_(me) && me.name !== traineeName) throw new Error('他の研修生の記録は変更できません。');
}

/** 記録を足す。研修生は自分の分（フィードバックは入れられない）、上司は誰の分でも */
function api_addCaseCheck(rec) {
  var me = currentUser_();
  rec = rec || {};
  var trainee = String(rec.trainee || '');
  if (!members_().some(function (m) { return m.name === trainee; })) throw new Error('研修生を選んでください。');
  caseEditable_(me, trainee);
  var title = String(rec.title || '').trim();
  if (!title) throw new Error('案件（お客様・物件など）を入れてください。');
  if (!rec.attend && !rec.docs) throw new Error('「同席」か「書類チェック」のどちらかを選んでください。');
  var staff = isStaff_(me);
  var feedback = staff ? String(rec.feedback || '').trim() : '';
  var now = new Date();
  return withLock_(function () {
    var sh = caseSheet_();
    var id = 'CC-' + Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMddHHmmss') + '-' + (sh.getLastRow() + 1);
    var row = [id, trainee, caseDay_(rec.date), title, !!rec.attend, !!rec.docs, String(rec.boss || (staff ? me.name : '')).trim(),
      feedback, feedback ? me.name : '', feedback ? now : '', String(rec.reflection || '').trim(), me.name, now];
    sh.appendRow(row);
    return caseSummary_(trainee);
  });
}

/** 記録を直す。フィードバックは上司だけ。研修生が直せるのは自分の記録の中身と振り返り */
function api_updateCaseCheck(id, f) {
  var me = currentUser_();
  f = f || {};
  return withLock_(function () {
    var c = readCases_().filter(function (x) { return x.id === String(id); })[0];
    if (!c) throw new Error('記録が見つかりません。');
    caseEditable_(me, c.trainee);
    var sh = caseSheet_();
    var r = c._row;
    var title = f.title !== undefined ? String(f.title).trim() : c.title;
    if (!title) throw new Error('案件（お客様・物件など）を入れてください。');
    var attend = f.attend !== undefined ? !!f.attend : c.attend;
    var docs = f.docs !== undefined ? !!f.docs : c.docs;
    if (!attend && !docs) throw new Error('「同席」か「書類チェック」のどちらかを選んでください。');
    sh.getRange(r, 3, 1, 5).setValues([[f.date !== undefined ? caseDay_(f.date) : c.date, title, attend, docs,
      f.boss !== undefined ? String(f.boss).trim() : c.boss]]);
    if (f.reflection !== undefined) sh.getRange(r, 11).setValue(String(f.reflection).trim());
    if (f.feedback !== undefined && String(f.feedback).trim() !== c.feedback) {
      if (!isStaff_(me)) throw new Error('フィードバックは上司（管理者・教育担当）が入れます。');
      var fb = String(f.feedback).trim();
      sh.getRange(r, 8, 1, 3).setValues([[fb, fb ? me.name : '', fb ? new Date() : '']]);
    }
    return caseSummary_(c.trainee);
  });
}

/** 記録を消す（上司だけ） */
function api_removeCaseCheck(id) {
  var me = currentUser_();
  requireStaff_(me);
  return withLock_(function () {
    var c = readCases_().filter(function (x) { return x.id === String(id); })[0];
    if (!c) throw new Error('記録が見つかりません。');
    caseSheet_().deleteRow(c._row);
    return caseSummary_(c.trainee);
  });
}
