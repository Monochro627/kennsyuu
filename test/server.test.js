// サーバー側（Code.js / Setup.js）の動作確認
const assert = require('assert');
const { createContext } = require('./fake_gas');

const flowRows = [
  ['', 'カテゴリ', 'タスク', '進捗', 'ポイント'],
  ['入社前', 'セットアップ研修', '', false, '■Monochroルール・行動指針の説明'],
  ['', 'セットアップタスク', '■業務契約締結      ', false],
  ['入社後'],
  ['依頼コンサル', 'コンサルティング', '■SNSアカウント戦略　※諸本', false, 'インスタアカウント設計'],
  ['※ひたすらロープレ', 'ロールプレイング', '①ヒアリング', false],
  ['※黄色優先', 'ロールプレイング', '②物件提案', false],
  ['2週間後試験\n→インスタ開始', '効果測定', '■ワーク試験', false],
  ['', '', '★インスタ開始', false, '★１件成約まで上長同席'],
  ['主任要件目指す', '', '', false],
  ['', '', '', false],
];
const materials = [
  ['VID-001', 'eラーニング', '★①はじめに', 'オリエンテーション', '動画', 'https://youtu.be/qeg_oLPjo-8', '必須', '', '', 1],
  ['VID-002', 'eラーニング', '⑦契約手続き編', '審査について', '動画', 'https://youtu.be/kcxlu_qepkk', '任意', 'ライフライン変更', '', 2],
  ['MAN-01', 'マニュアル', 'マニュアル', '社内ルールについて', 'ドキュメント', 'https://docs.google.com/document/d/X/edit', '', '', '', 1000],
];
const ctx = createContext({ userEmail: 'owner@monochro-inc.com', sourceFlowRows: flowRows, siteImportRows: materials });
const run = (code) => { const v = require('vm').runInContext(code, ctx); return v === undefined ? v : JSON.parse(JSON.stringify(v)); };
const as = (email) => { ctx.state.userEmail = email; };

// setup
run('setup()');
const tasks = run('buildTaskMaster_()');
assert.deepStrictEqual(tasks.map((t) => t[1] + '|' + t[3]), [
  '1. 入社前|セットアップ研修',
  '1. 入社前|業務契約締結',
  '2. 依頼コンサル|SNSアカウント戦略　※諸本',
  '3. ひたすらロープレ|①ヒアリング',
  '3. ひたすらロープレ|②物件提案',
  '4. 2週間後試験 →インスタ開始|ワーク試験',
  '4. 2週間後試験 →インスタ開始|★インスタ開始',
]);
assert.throws(() => run('setup()'), /すでに初期設定済み/);

// 管理者で起動
as('owner@monochro-inc.com');
let boot = run('api_bootstrap()');
assert.strictEqual(boot.me.role, '管理者');
assert.strictEqual(boot.me.name, '小嶋勇輝');
assert.strictEqual(boot.goals.length, 9);
assert.strictEqual(boot.tasks.length, 7);
assert.strictEqual(boot.materials.length, 3);

// メンバー追加
run(`api_addMember({name:'小田天誠', email:'T.Oda@monochro-inc.com', role:'研修生', joined:'2024/07/01'})`);
run(`api_addMember({name:'伊藤竣哉', email:'ito@monochro-inc.com', role:'教育担当'})`);
assert.throws(() => run(`api_addMember({name:'小田天誠', email:'x@monochro-inc.com', role:'研修生'})`), /すでに/);
boot = run('api_bootstrap()');
assert.strictEqual(boot.summaries.length, 1);
assert.strictEqual(boot.summaries[0].percent, 0);
assert.strictEqual(boot.summaries[0].phase, '1. 入社前');
assert.strictEqual(boot.summaries[0].videosRequired, 1);

// 研修生本人のチェック
as('t.oda@monochro-inc.com');
const r1 = run(`api_setCheck('小田天誠', 'T001', true)`);
assert.strictEqual(r1.by, '小田天誠');
run(`api_setCheck('小田天誠', 'T002', true)`);
let prog = run(`api_getProgress('小田天誠')`);
assert.strictEqual(prog.rows.filter((r) => r.done).length, 2);
// 研修生は他人の進捗や管理操作はできない
assert.throws(() => run(`api_addMember({name:'a', email:'a@b', role:'研修生'})`), /管理者だけ/);
assert.throws(() => run(`api_adminLinks()`), /権限/);

// 教育担当は研修生のチェックを外せる
as('ito@monochro-inc.com');
const r2 = run(`api_setCheck('小田天誠', 'T002', false)`);
assert.strictEqual(r2.done, false);
assert.strictEqual(r2.by, '');
assert.ok(run('api_adminLinks()').spreadsheet.includes('/spreadsheets/d/'));

// eラーニングの記録
as('t.oda@monochro-inc.com');
assert.throws(() => run(`api_submitElearning('VID-001', '  ', '')`), /気づき/);
run(`api_submitElearning('VID-001', '仲介の役割が分かった', '')`);
prog = run(`api_getProgress('小田天誠')`);
assert.deepStrictEqual(prog.watched, ['VID-001']);
const notes = run('api_myElearningNotes()');
assert.strictEqual(notes[0].question, 'なし');
boot = run('api_bootstrap()');
assert.strictEqual(boot.summaries[0].videosWatched, 1);
assert.strictEqual(boot.summaries[0].phase, '1. 入社前');

// ロープレ記録（録音つき）
const rp = run(`api_addRoleplay({date:'2026/10/24', minutes:30, speaker:'小田天誠', listener:'伊藤竣哉', topic:'【試験①】カウンセリング面談', feedback:'抑揚を意識'}, {name:'a.m4a', mimeType:'audio/mp4', base64:'AAAA'})`);
assert.ok(rp.audio.startsWith('https://drive.google.com/file/d/'));
assert.throws(() => run(`api_addRoleplay({speaker:''}, null)`), /必須/);
const list = run('api_listRoleplays()');
assert.strictEqual(list.length, 1);
assert.strictEqual(list[0].topic, '【試験①】カウンセリング面談');

// やる気の指標：タスク1件(10) + 動画1本(5) + ロープレ1回(20)
const st = run(`api_getProgress('小田天誠')`).stats;
assert.deepStrictEqual(st, { points: 35, streak: 1, week: 3, videos: 1, roleplays: 1 });
assert.strictEqual(run('api_bootstrap()').summaries[0].stats.points, 35);

// マニュアルのウェブ表示
const man = run(`api_getManual('MAN-01')`);
assert.ok(man.html.includes('本文'));
assert.strictEqual(man.canEdit, false);

// メンバー表にいない人は使えない
as('stranger@example.com');
assert.throws(() => run('api_bootstrap()'), /権限がありません/);

console.log('server tests ok');
