/**
 * 初期設定。Apps Script エディタで setup を選んで「実行」する（管理者のみ・初回1回）。
 * 1. ドライブに「新人研修アプリ ※社外秘」フォルダ一式を作る
 * 2. データ用スプレッドシートを作り、卒業条件・タスクマスターを入れる
 * 3. 旧Googleサイトから動画一覧とマニュアルを取り込む（サイトを一般公開にしておくこと）
 */

// 最初の管理者として登録する名前（実行した人のメールで登録される）
var ADMIN_NAME = '小嶋勇輝';

// 既存の研修フロー（タスクの元データ）
var SOURCE_FLOW_SPREADSHEET_ID = '1l7mVwKFQkYglFTEDeHB-UfazxIj_GHTK14BfsjyW92c';
var SOURCE_FLOW_SHEET = '（新）研修フローフォーマット ';

var GOALS = [
  ['G01', '課題図書3冊のレポート提出', '入社前の課題。3冊分のレポートを提出する'],
  ['G02', 'eラーニング必須動画（★①〜⑥）をすべて視聴', 'アプリのeラーニングで、必須動画すべてに気づきを入力すると達成'],
  ['G03', 'OJT 10件', 'OJT用レポートの入力件数でカウントする'],
  ['G04', '事務作業ワーク合格', '概算見積・申込書・重説・契約処理のワーク。依頼は山田さんまで'],
  ['G05', '賃貸用語試験合格', '賃貸用語集から出題'],
  ['G06', '路線図試験 100%', '大阪の道路名称、大阪市24区、大阪メトロ路線図、大阪環状線路線図'],
  ['G07', 'ロープレ試験合格（【試験①】〜【試験⑦】）', 'カウンセリング面談、ヒアリング物件提案、初期費用＆申込後の流れ、アウトトーク、初回LINE〜初回電話、バリュートーク、マイストーリー'],
  ['G08', '原状回復の知識試験', '卒業検定'],
  ['G09', '新人評価（人物評価シート）', '卒業検定']
];

var HEADERS = {
  'メンバー': ['名前', 'メール', '役割', '入社日', '状態', 'メモ'],
  '卒業条件': ['ID', '条件', '詳細'],
  'タスクマスター': ['ID', 'フェーズ', 'カテゴリ', 'タスク', 'ポイント'],
  '資料マスター': ['ID', '区分', 'セクション', 'タイトル', '種別', 'URL', '必須', '補足', 'AI参照', '並び順'],
  'ロープレ記録': ['ID', '日付', '所要時間（分）', '話し手', '聞き手', '内容', '意識するポイント', 'フィードバック', '録音', '文字起こし', '要約', '登録者', '登録日時'],
  'eラーニング記録': ['日時', 'メール', '名前', '資料ID', 'タイトル', '気づき・学び', '質問', 'AI仮回答']
};

function setup() {
  var p = PropertiesService.getScriptProperties();
  if (p.getProperty('DATA_SPREADSHEET_ID')) {
    throw new Error('すでに初期設定済みです。資料だけ取り込み直す場合は reimportSite を実行してください。');
  }
  var email = Session.getEffectiveUser().getEmail();

  var root = DriveApp.createFolder('新人研修アプリ ※社外秘');
  var manuals = root.createFolder('研修マニュアル');
  var recordings = root.createFolder('ロープレ録音');
  // マニュアルと録音は社内の全員が見られるようにする（データのスプレッドシートは共有しない）
  [manuals, recordings].forEach(function (f) {
    try {
      f.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {
      Logger.log('フォルダの共有設定に失敗しました（手動で社内共有してください）: ' + e);
    }
  });

  var ss = SpreadsheetApp.create('研修アプリデータ ※社外秘');
  DriveApp.getFileById(ss.getId()).moveTo(root);
  ss.setSpreadsheetTimeZone('Asia/Tokyo');

  var first = ss.getSheets()[0];
  Object.keys(HEADERS).forEach(function (name, i) {
    var sh = i === 0 ? first.setName(name) : ss.insertSheet(name);
    var h = HEADERS[name];
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#e8eaf6');
    sh.setFrozenRows(1);
  });

  ss.getSheetByName('メンバー').appendRow([ADMIN_NAME, email, '管理者', '', '在籍', '']);
  ss.getSheetByName('メンバー').getRange('C2:C').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['管理者', '教育担当', '研修生']).build());
  ss.getSheetByName('卒業条件').getRange(2, 1, GOALS.length, 3).setValues(GOALS);

  var tasks = buildTaskMaster_();
  ss.getSheetByName('タスクマスター').getRange(2, 1, tasks.length, 5).setValues(tasks);

  p.setProperties({
    DATA_SPREADSHEET_ID: ss.getId(),
    ROOT_FOLDER_ID: root.getId(),
    MANUAL_FOLDER_ID: manuals.getId(),
    ROLEPLAY_FOLDER_ID: recordings.getId(),
    OWNER_EMAIL: email
  });

  writeMaterials_(ss, importSite_(manuals.getId()));
  Logger.log('初期設定が完了しました。データ: ' + ss.getUrl());
}

/** サイトから資料マスターを作り直す（マニュアルのドキュメントは新しく作られる） */
function reimportSite() {
  var p = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.openById(p.getProperty('DATA_SPREADSHEET_ID'));
  writeMaterials_(ss, importSite_(p.getProperty('MANUAL_FOLDER_ID')));
}

function writeMaterials_(ss, rows) {
  var sh = ss.getSheetByName('資料マスター');
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  sh.getRange(2, 9, Math.max(rows.length, 1), 1).insertCheckboxes();
  sh.setColumnWidth(4, 320);
  sh.setColumnWidth(8, 320);
}

/**
 * 既存の研修フローシートからタスクマスターを作る。
 * A列のフェーズは結合セルのように最初の行にしかないので、下に引き継ぐ。
 */
function buildTaskMaster_() {
  var values = SpreadsheetApp.openById(SOURCE_FLOW_SPREADSHEET_ID).getSheetByName(SOURCE_FLOW_SHEET)
    .getDataRange().getValues();
  var phase = '';
  var phaseNo = 0;
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var a = String(values[i][0] || '').replace(/\s*\n\s*/g, ' ').trim();
    var category = String(values[i][1] || '').trim();
    var task = String(values[i][2] || '').replace(/^■\s*/, '').trim();
    var point = [values[i][4], values[i][5]].filter(function (x) { return x; }).join(' ').trim();
    if (a === '主任要件目指す') break;
    if (a && a.indexOf('※黄色') !== 0 && a !== '入社後') {
      phaseNo++;
      phase = phaseNo + '. ' + a.replace(/^※/, '');
    }
    if (!task && !category) continue;
    if (!task) task = category;
    out.push(['T' + ('00' + (out.length + 1)).slice(-3), phase, category, task, point]);
  }
  return out;
}
