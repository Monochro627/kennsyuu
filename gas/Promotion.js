/**
 * 昇格要件（ルームアドバイザーになったあとの道）と Monochro試験。
 * 要件の中身は見込みボードの成績ダッシュボード（AnalysisCode.gs の PROMO_STEPS）と同じものを持つ。
 * 今の役職と「クリア」は、成績ダッシュボードが書く「昇格チェック」シート（顧客管理のスプレッドシート）を読む。
 * Monochro試験はロープレ試験と同じ仕組み（評価シート・評価者全員合格で合格）で、合格すると昇格チェックにもクリアを書く。
 */

// 成績ダッシュボードと同じ「昇格チェック」シート
var PROMO_SOURCE_SPREADSHEET_ID = '1-F5ckS4tNKnHXTrE4jUB2Tcz804lx2vdMQkJvNANvRo';
var PROMO_CHECK_SHEET = '昇格チェック';
var PROMO_CHECK_HEAD = ['担当者', '種類', '段階', '項目', '値', '更新者', '更新日時'];
var DASHBOARD_URL = 'https://script.google.com/a/macros/monochro-inc.com/s/AKfycbwiKky_VwXamgG7unXLfLq_MyMrc99ftKEz0U6kM2nqMgXAgwhNBMov3CUWp4ydLu8U/exec?page=analysis';

// 見込みボードの AnalysisCode.gs の PROMO_STEPS と合わせる（要件を変えたら両方直す）
//   metric：rev＝売上、selfRev＝自己集客元売上。minusSale：売買の売上を除く。from：ひとつ前の段階の番号
var PROMO_STEPS = [
  { title: '主任', short: '主任', from: -1, path: '', metric: 'rev', minusSale: true, target: 6000000, insta: 3, reviews: 30,
    checks: ['人物評価', 'ロープレ試験', '原状回復試験の合格'] },
  { title: 'エージェントマネージャー', short: 'エージェントマネージャー', from: 0, path: 'エージェントマネージャーの道', metric: 'selfRev', target: 6000000,
    chiefOthers: true,
    checks: ['リファラル2人以上（ルームアドバイザー認定を受けた者）', 'エージェントアドバイザー研修の受講＆試験', '経営陣の最終判断', 'インボイス登録'],
    demoteNotes: ['2年間採用0人', 'リファラルが2人未満になった場合', '3ヵ月連続で売上30万未満'] },
  { title: 'コンサルティングルームアドバイザー', short: '課長代理', from: 0, path: '営業を極める道', metric: 'selfRev', target: 10000000, reviews: 50,
    checks: ['FP3級の合格', '人物評価', 'Monochro試験', '経営陣の最終判断', 'インボイス登録・源泉徴収10%'], demote: 5500000 },
  { title: 'プレジデントルームアドバイザー', short: '課長', from: 2, path: '営業を極める道', metric: 'rev', target: 30000000, reviews: 100,
    checks: ['敷金診断士', '人物評価', 'Monochro試験', '経営陣の最終判断', 'インボイス登録・源泉徴収10%（支払調書）'], demote: 6000000 },
  { title: 'エグゼクティブルームアドバイザー', short: '次長', from: 3, path: '営業を極める道', metric: 'selfRev', target: 40000000, reviews: 150,
    checks: ['宅地建物取引士の合格＆専任登録', '人物評価', 'Monochro試験', '経営陣の最終判断', 'インボイス登録・源泉徴収10%'], demote: 6500000 },
  { title: 'トップ・オブ・ザ・エグゼクティブルームアドバイザー', short: 'トップ', from: 4, path: '営業を極める道', metric: 'selfRev', target: 50000000, reviews: 200,
    checks: ['人物評価', 'Monochro試験', '経営陣の最終判断', 'インボイス登録・源泉徴収10%'], demote: 7000000 }
];
var MONOCHRO_EXAM_CHECK = 'Monochro試験';

// Monochro試験（昇格のたびに受け直す）。ロープレ試験のシートに MX01 として入れる。[項目, 満点]（満点0は点数なしの参考項目）
var MONOCHRO_EXAM = {
  id: 'MX01',
  name: '【Monochro試験】',
  subtitle: 'コアバリュー・理念・期待値調整',
  guide: '昇格の段階が上がるたびに受け直す。評価者全員が合格で合格。合格すると成績ダッシュボードの昇格要件の「Monochro試験」もクリアになる。',
  items: [
    ['コアバリューを一つずつ自分の言葉で説明し、日々の行動の例を挙げられる', 10],
    ['理念（目指していること）を、お客様にも仲間にも伝わる言葉で説明できる', 10],
    ['創業の思いを、自分の言葉で語れる', 10],
    ['Monochroが他社と何が違うのかを、お客様に説明できる', 10],
    ['期待値調整：審査・入居日・初期費用・物件の状態について、先にお客様の期待をそろえるトークができる', 20],
    ['期待値調整：期待とずれたとき（審査落ち・入居日の遅れなど）に、信頼を落とさずに伝え直せる', 10],
    ['なぜMonochroで働くのか（マイストーリー）を、理念とつなげて語れる', 10],
    ['後輩に、理念やあり方をどう伝え、どう手本を見せているかを話せる', 10],
    ['※ 評価者から出した質問と、その答え（メモ）', 0]
  ]
};

function isMonochroExam_(examId) { return /^MX/.test(String(examId)); }

/** Monochro試験の定義がなければ足す（ロープレ試験のシートの取り込み直しでも消えない） */
function ensureMonochroExam_() {
  var p = props_();
  if (p.getProperty('MONOCHRO_EXAM_ADDED')) return;
  var exSh = sheet_(EXAM_SHEET.EXAMS);
  var has = readTable_(exSh).some(function (e) { return String(e['試験ID']) === MONOCHRO_EXAM.id; });
  if (!has) {
    var e = MONOCHRO_EXAM;
    exSh.getRange(exSh.getLastRow() + 1, 1, 1, 4).setValues([[e.id, e.name, e.subtitle, e.guide]]);
    var itSh = sheet_(EXAM_SHEET.ITEMS);
    itSh.getRange(itSh.getLastRow() + 1, 1, e.items.length, 4).setValues(e.items.map(function (it, i) { return [e.id, i + 1, it[0], it[1]]; }));
  }
  p.setProperty('MONOCHRO_EXAM_ADDED', '1');
}

/** 成績ダッシュボードの昇格チェックシート（読めないときは null） */
function promoCheckSheet_(create) {
  var ss = SpreadsheetApp.openById(PROMO_SOURCE_SPREADSHEET_ID);
  if (!ss) return null;
  var sh = ss.getSheetByName(PROMO_CHECK_SHEET);
  if (!sh && create) {
    sh = ss.insertSheet(PROMO_CHECK_SHEET);
    sh.getRange(1, 1, 1, PROMO_CHECK_HEAD.length).setValues([PROMO_CHECK_HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** {roles: {名前: {step, month, by, at}}, checks: {名前: {段階: {項目: {by, at}}}}}（成績ダッシュボードの getPromoState と同じ形） */
function readPromoState_() {
  var out = { roles: {}, checks: {} };
  var sh = promoCheckSheet_(false);
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 7).getDisplayValues().forEach(function (r) {
    var x = r.map(function (v) { return String(v).trim(); });
    var name = x[0], type = x[1], step = x[2], item = x[3], val = x[4];
    if (!name) return;
    if (type === '役職') {
      var i = PROMO_STEPS.map(function (s) { return s.title; }).indexOf(step);
      out.roles[name] = { step: i, month: val, by: x[5], at: x[6] };
    } else if (type === 'クリア') {
      var byStep = (out.checks[name] = out.checks[name] || {});
      var items = (byStep[step] = byStep[step] || {});
      if (val === 'TRUE') items[item] = { by: x[5], at: x[6] };
      else delete items[item];
    }
  });
  return out;
}

/** 昇格チェックに「クリア」を書く（同じ担当者・種類・段階・項目の行は上書き）。成績ダッシュボードの writePromo_ と同じ形 */
function writePromoClear_(name, stepTitle, item, by) {
  var sh = promoCheckSheet_(true);
  var at = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
  var n = sh.getLastRow() - 1;
  var rows = n > 0 ? sh.getRange(2, 1, n, 4).getDisplayValues() : [];
  var i = -1;
  rows.forEach(function (r, k) { if (r[0] === name && r[1] === 'クリア' && r[2] === stepTitle && r[3] === item) i = k; });
  sh.getRange(i >= 0 ? i + 2 : n + 2, 1, 1, 7).setNumberFormat('@').setValues([[name, 'クリア', stepTitle, item, 'TRUE', by, at]]);
}

/** Monochro試験の合格を、成績ダッシュボードの昇格要件に反映する。失敗しても試験の判定は残す */
function reflectMonochroPass_(session, by) {
  var step = PROMO_STEPS.filter(function (s) { return s.title === session.settingNo || s.short === session.settingNo; })[0];
  if (!step || step.checks.indexOf(MONOCHRO_EXAM_CHECK) < 0) return '';
  try {
    writePromoClear_(session.trainee, step.title, MONOCHRO_EXAM_CHECK, by);
    return step.title;
  } catch (e) {
    return '';
  }
}

/** Monochro試験を受ける段階（要件に「Monochro試験」がある段階） */
function monochroExamSteps_() {
  return PROMO_STEPS.filter(function (s) { return s.checks.indexOf(MONOCHRO_EXAM_CHECK) >= 0; })
    .map(function (s) { return { title: s.title, short: s.short }; });
}

// ---------- 画面から呼ばれる関数 ----------

/** 昇格のページ：段階と要件、成績ダッシュボードの役職・クリア、Monochro試験の記録 */
function api_promotion() {
  currentUser_();
  ensureExamSheets_();
  ensureMonochroExam_();
  var state = null;
  var error = '';
  try { state = readPromoState_(); } catch (e) { error = '成績ダッシュボードの昇格チェックを読めませんでした。'; }
  var people = members_().filter(function (m) { return m.status !== '退職'; }).map(function (m) { return m.name; });
  var sessions = examSessions_().filter(function (s) { return isMonochroExam_(s.examId); })
    .map(function (s) { return publicSession_(s, false); }).reverse();
  return { steps: PROMO_STEPS, state: state, error: error, people: people, dashboardUrl: DASHBOARD_URL,
    examSteps: monochroExamSteps_(), sessions: sessions };
}
