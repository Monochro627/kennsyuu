/**
 * ロープレ試験（【試験①】〜【試験⑦】）の実施と評価。
 * 評価項目は既存の「ロープレ フィードバック＆評価ポイント＆設定事例」の試験シートから読み込む。
 * 「実施」を押すと実施記録ができ、評価者がそれぞれアプリで採点する。全員が合格なら合格。
 */

var EXAM_SOURCE_SPREADSHEET_ID = '1R4jsSl-KLH2oclLekjZtfiHJJSjjv93JrfCAFyvb8tc';
var EXAM_SHEET = {
  EXAMS: 'ロープレ試験',
  ITEMS: 'ロープレ評価項目',
  SESSIONS: 'ロープレ試験実施',
  EVALS: 'ロープレ評価'
};
var EXAM_HEADERS = {
  'ロープレ試験': ['試験ID', '試験名', '内容', '評価補足'],
  'ロープレ評価項目': ['試験ID', '並び順', '項目', '満点'],
  'ロープレ試験実施': ['実施ID', '実施日時', '試験ID', '試験名', '実践者', '評価者', '設定No', '作成者', '状態', '判定', '平均点', '満点'],
  'ロープレ評価': ['実施ID', '評価者', '提出日時', '合否', '合計点', '満点', '点数', '根拠', '良かった点', '改善した方がよい点']
};
var EXAM_PASS = '合格';
var EXAM_FAIL = '不合格';

/**
 * 試験シート1枚を読み取る。項目は「チェックポイント」の行から「気づいた点／フィードバック欄」の手前まで。
 * 「20点」を含む項目は20点満点、「※」で始まる項目は点数を付けない参考項目（満点0）。
 */
function parseExamSheet_(sheetName, values) {
  var no = sheetName.match(/【試験(.)】/)[1];
  var first = String((values[0] || [])[0] || '');
  var guide = '';
  var items = [];
  var inItems = false;
  for (var i = 0; i < values.length; i++) {
    var a = String(values[i][0] || '').trim();
    if (a === '評価補足') guide = String((values[i + 1] || [])[0] || '').trim();
    if (a.indexOf('チェックポイント') >= 0) { inItems = true; continue; }
    if (!inItems) continue;
    if (a === '気づいた点' || a === 'フィードバック欄' || a.indexOf('良かった点') === 0) break;
    if (!a) continue;
    var max = a.indexOf('※') === 0 ? 0 : (/20点/.test(a) ? 20 : 10);
    var text = a.replace(/[\s　]*(ここだけ)?20点(満点)?\s*$/, '').trim();
    items.push([text, max]);
  }
  return {
    id: 'EX' + ('0' + ('①②③④⑤⑥⑦⑧⑨⑩'.indexOf(no) + 1)).slice(-2),
    name: sheetName.trim(),
    subtitle: first.replace(/^ロールプレイング[\s　]*評価シート[\s　]*/, '').trim(),
    guide: guide,
    items: items
  };
}

/** 試験の定義をデータのスプレッドシートに用意する（なければ作り、元シートから読み込む） */
function ensureExamSheets_() {
  var ss = db_();
  Object.keys(EXAM_HEADERS).forEach(function (name) {
    if (ss.getSheetByName(name)) return;
    var sh = ss.insertSheet(name);
    var h = EXAM_HEADERS[name];
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#e8eaf6');
    sh.setFrozenRows(1);
  });
  if (ss.getSheetByName(EXAM_SHEET.EXAMS).getLastRow() < 2) importExams_(ss);
}

function importExams_(ss) {
  var exams = [];
  SpreadsheetApp.openById(EXAM_SOURCE_SPREADSHEET_ID).getSheets().forEach(function (sh) {
    if (/^【試験.】/.test(sh.getName())) exams.push(parseExamSheet_(sh.getName(), sh.getDataRange().getValues()));
  });
  exams.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
  var examRows = exams.map(function (e) { return [e.id, e.name, e.subtitle, e.guide]; });
  var itemRows = [];
  exams.forEach(function (e) {
    e.items.forEach(function (it, i) { itemRows.push([e.id, i + 1, it[0], it[1]]); });
  });
  var exSh = ss.getSheetByName(EXAM_SHEET.EXAMS);
  var itSh = ss.getSheetByName(EXAM_SHEET.ITEMS);
  // 元シートから来ていない試験（Monochro試験など）はそのまま残す
  var keep = function (sh) {
    if (sh.getLastRow() < 2) return [];
    return sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().filter(function (r) { return r[0] !== '' && !/^EX\d+$/.test(String(r[0])); });
  };
  examRows = examRows.concat(keep(exSh));
  itemRows = itemRows.concat(keep(itSh));
  if (exSh.getLastRow() > 1) exSh.getRange(2, 1, exSh.getLastRow() - 1, 4).clearContent();
  if (itSh.getLastRow() > 1) itSh.getRange(2, 1, itSh.getLastRow() - 1, 4).clearContent();
  if (examRows.length) exSh.getRange(2, 1, examRows.length, 4).setValues(examRows);
  if (itemRows.length) itSh.getRange(2, 1, itemRows.length, 4).setValues(itemRows);
}

/** 評価シートを直したあとに、試験の定義を読み込み直す（エディタから実行） */
function reimportExams() {
  ensureExamSheets_();
  importExams_(db_());
}

function exams_() {
  ensureExamSheets_();
  var items = readTable_(sheet_(EXAM_SHEET.ITEMS));
  return readTable_(sheet_(EXAM_SHEET.EXAMS)).map(function (e) {
    var id = String(e['試験ID']);
    var its = items.filter(function (it) { return String(it['試験ID']) === id; })
      .sort(function (a, b) { return Number(a['並び順']) - Number(b['並び順']); })
      .map(function (it) { return { no: Number(it['並び順']), text: String(it['項目']), max: Number(it['満点']) || 0 }; });
    return {
      id: id, name: String(e['試験名']), subtitle: String(e['内容'] || ''), guide: String(e['評価補足'] || ''), items: its,
      max: its.reduce(function (s, it) { return s + it.max; }, 0)
    };
  });
}

function splitNames_(s) {
  return String(s || '').split(/[,、]/).map(function (x) { return x.trim(); }).filter(function (x) { return x; });
}

function parseJson_(s) {
  try { return JSON.parse(s || '{}'); } catch (e) { return {}; }
}

/** 実施記録と評価をまとめて読む */
function examSessions_() {
  var evals = readTable_(sheet_(EXAM_SHEET.EVALS));
  return readTable_(sheet_(EXAM_SHEET.SESSIONS)).map(function (s) {
    var id = String(s['実施ID']);
    var mine = evals.filter(function (e) { return String(e['実施ID']) === id; });
    return {
      _row: s._row,
      id: id,
      at: fmtDate_(s['実施日時']),
      day: fmtDay_(s['実施日時']),
      examId: String(s['試験ID']),
      examName: String(s['試験名']),
      trainee: String(s['実践者']),
      evaluators: splitNames_(s['評価者']),
      settingNo: String(s['設定No'] || ''),
      by: String(s['作成者'] || ''),
      status: String(s['状態'] || '評価中'),
      result: String(s['判定'] || ''),
      average: s['平均点'] === '' ? null : Number(s['平均点']),
      max: Number(s['満点']) || 0,
      evaluations: mine.map(function (e) {
        return {
          _row: e._row,
          evaluator: String(e['評価者']),
          at: fmtDate_(e['提出日時']),
          pass: e['合否'] === EXAM_PASS,
          total: Number(e['合計点']) || 0,
          max: Number(e['満点']) || 0,
          scores: parseJson_(e['点数']),
          comments: parseJson_(e['根拠']),
          good: String(e['良かった点'] || ''),
          improve: String(e['改善した方がよい点'] || '')
        };
      })
    };
  });
}

function publicSession_(s, withDetail) {
  var out = {
    id: s.id, at: s.at, examId: s.examId, examName: s.examName, trainee: s.trainee, evaluators: s.evaluators,
    settingNo: s.settingNo, by: s.by, status: s.status, result: s.result, average: s.average, max: s.max,
    submitted: s.evaluations.map(function (e) { return e.evaluator; })
  };
  if (withDetail) {
    out.evaluations = s.evaluations.map(function (e) {
      return { evaluator: e.evaluator, at: e.at, pass: e.pass, total: e.total, max: e.max, scores: e.scores,
        comments: e.comments, good: e.good, improve: e.improve };
    });
  }
  return out;
}

/** 研修生ごとの合格済み試験ID */
function passedExamsByTrainee_() {
  var map = {};
  examSessions_().forEach(function (s) {
    if (s.result === EXAM_PASS) (map[s.trainee] = map[s.trainee] || {})[s.examId] = true;
  });
  return map;
}

// ---------- 画面から呼ばれる関数 ----------

function api_listExamSessions() {
  currentUser_();
  ensureExamSheets_();
  return examSessions_().map(function (s) { return publicSession_(s, false); }).reverse();
}

function api_getExamSession(sessionId) {
  currentUser_();
  ensureExamSheets_();
  var s = examSessions_().filter(function (x) { return x.id === String(sessionId); })[0];
  if (!s) throw new Error('試験の記録が見つかりません。');
  return publicSession_(s, true);
}

/** 試験を実施する。日時は押した時点で自動で入る */
function api_createExamSession(req) {
  var me = currentUser_();
  ensureExamSheets_();
  var exam = exams_().filter(function (e) { return e.id === String(req && req.examId); })[0];
  if (!exam) throw new Error('試験を選んでください。');
  var members = members_();
  var trainee = members.filter(function (m) { return m.name === req.trainee; })[0];
  if (!trainee) throw new Error(isMonochroExam_(exam.id) ? '受験者を選んでください。' : '実践者を選んでください。');
  if (isMonochroExam_(exam.id) && !monochroExamSteps_().some(function (s) { return s.title === req.settingNo; })) {
    throw new Error('受ける段階を選んでください。');
  }
  var evaluators = (req.evaluators || []).filter(function (n, i, a) { return a.indexOf(n) === i && n !== trainee.name; });
  if (!evaluators.length) throw new Error('評価者を1人以上選んでください。');
  evaluators.forEach(function (n) {
    if (!members.some(function (m) { return m.name === n; })) throw new Error('評価者「' + n + '」がメンバー表にいません。');
  });
  return withLock_(function () {
    var now = new Date();
    var sh = sheet_(EXAM_SHEET.SESSIONS);
    // 同じ秒に2つ実施しても重ならないよう、行番号を付ける
    var id = 'EXS-' + Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMddHHmmss') + '-' + (sh.getLastRow() + 1);
    sh.appendRow([id, now, exam.id, exam.name, trainee.name, evaluators.join(','),
      String(req.settingNo || ''), me.name, '評価中', '', '', exam.max]);
    return { id: id, at: fmtDate_(now) };
  });
}

/**
 * 評価を提出する（判定が出るまでは出し直せる）。
 * 全員がそろったら判定し、ロープレ記録にも1行残す。
 */
function api_submitExamEvaluation(sessionId, ev) {
  var me = currentUser_();
  ensureExamSheets_();
  return withLock_(function () {
    var s = examSessions_().filter(function (x) { return x.id === String(sessionId); })[0];
    if (!s) throw new Error('試験の記録が見つかりません。');
    if (s.evaluators.indexOf(me.name) < 0) throw new Error('この試験の評価者ではありません。');
    if (s.status === '完了') throw new Error('この試験はすでに判定が出ています。');
    if (!ev || (ev.pass !== true && ev.pass !== false)) throw new Error('合格・不合格を選んでください。');
    var exam = exams_().filter(function (e) { return e.id === s.examId; })[0];
    var scores = {};
    var comments = {};
    var total = 0;
    exam.items.forEach(function (it) {
      var c = String((ev.comments || {})[it.no] || '').trim();
      if (c) comments[it.no] = c;
      if (!it.max) return;
      var v = Number((ev.scores || {})[it.no]);
      if (!(v >= 1 && v <= it.max)) throw new Error('「' + it.text.slice(0, 24) + '」の点数を1〜' + it.max + 'で入力してください。');
      scores[it.no] = Math.round(v);
      total += Math.round(v);
    });
    var row = [s.id, me.name, new Date(), ev.pass ? EXAM_PASS : EXAM_FAIL, total, exam.max, JSON.stringify(scores),
      JSON.stringify(comments), String(ev.good || '').trim(), String(ev.improve || '').trim()];
    var evSh = sheet_(EXAM_SHEET.EVALS);
    var prev = s.evaluations.filter(function (e) { return e.evaluator === me.name; })[0];
    if (prev) evSh.getRange(prev._row, 1, 1, row.length).setValues([row]);
    else evSh.appendRow(row);

    var done = s.evaluations.filter(function (e) { return e.evaluator !== me.name; })
      .concat([{ evaluator: me.name, pass: !!ev.pass, total: total, good: row[8], improve: row[9] }]);
    var result = '';
    if (s.evaluators.every(function (n) { return done.some(function (e) { return e.evaluator === n; }); })) {
      result = done.every(function (e) { return e.pass; }) ? EXAM_PASS : EXAM_FAIL;
      var avg = Math.round(done.reduce(function (sum, e) { return sum + e.total; }, 0) / done.length * 10) / 10;
      sheet_(EXAM_SHEET.SESSIONS).getRange(s._row, 9, 1, 3).setValues([['完了', result, avg]]);
      var fb = done.map(function (e) {
        return e.evaluator + '（' + (e.pass ? EXAM_PASS : EXAM_FAIL) + '・' + e.total + '/' + exam.max + '点）' +
          (e.good ? '\n良かった点：' + e.good : '') + (e.improve ? '\n改善点：' + e.improve : '');
      }).join('\n\n');
      sheet_(SHEET.ROLEPLAY).appendRow(['RP-' + s.id, s.day, '', s.trainee, s.evaluators.join('、'), s.examName,
        '判定：' + result + '（平均 ' + avg + ' / ' + exam.max + '点）', fb, '', '', '', '試験', new Date()]);
    }
    // Monochro試験に合格したら、成績ダッシュボードの昇格要件にもクリアを付ける
    var reflected = result === EXAM_PASS && isMonochroExam_(s.examId) ? reflectMonochroPass_(s, me.name) : '';
    return { id: s.id, result: result, submitted: done.length, total: total, reflected: reflected };
  });
}
