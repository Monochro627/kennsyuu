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
