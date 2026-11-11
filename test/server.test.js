// サーバー側（Code.js / Setup.js）の動作確認
const assert = require('assert');
const { createContext } = require('./fake_gas');
const examSheets = require('./exam_fixture');

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
const ctx = createContext({ userEmail: 'owner@monochro-inc.com', sourceFlowRows: flowRows, siteImportRows: materials, examSheets });
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
assert.deepStrictEqual(st, { points: 35, streak: 1, week: 3, videos: 1, roleplays: 1, exams: 0 });
assert.strictEqual(run('api_bootstrap()').summaries[0].stats.points, 35);

// ロープレ試験：評価シートの読み込み
as('owner@monochro-inc.com');
run(`api_addMember({name:'諸本雅広', email:'morimoto@monochro-inc.com', role:'教育担当'})`);
const exams = run('api_bootstrap()').exams;
assert.deepStrictEqual(exams.map((e) => e.id + '|' + e.name + '|' + e.max), ['EX01|【試験①】カウンセリング面談|40', 'EX02|【試験②】ヒアリング物件提案|30']);
assert.deepStrictEqual(exams[0].items.map((i) => i.text + ':' + i.max), ['①メラビアン視覚:10', '②メラビアン聴覚:10', '⑦モノクロ感、モノクロっぽさ（意識）:20', '※優先順位の把握が出来ているか:0']);
assert.strictEqual(exams[0].subtitle, 'カウンセリング面談（リモート）');
assert.ok(exams[0].guide.includes('GOALは来社'));

// 研修生が試験を実施（評価者2人）
as('t.oda@monochro-inc.com');
assert.throws(() => run(`api_createExamSession({examId:'EX01', trainee:'小田天誠', evaluators:[]})`), /評価者/);
const ses = run(`api_createExamSession({examId:'EX01', trainee:'小田天誠', evaluators:['伊藤竣哉','諸本雅広','小田天誠'], settingNo:'3'})`);
let list2 = run('api_listExamSessions()');
assert.deepStrictEqual(list2[0].evaluators, ['伊藤竣哉', '諸本雅広'], 'trainee removed from evaluators');
assert.strictEqual(list2[0].status, '評価中');
// 評価者でない人は提出できない
assert.throws(() => run(`api_submitExamEvaluation('${ses.id}', {pass:true, scores:{1:5,2:5,3:10}})`), /評価者ではありません/);

as('ito@monochro-inc.com');
assert.strictEqual(run('api_bootstrap()').pendingExams, 1);
assert.throws(() => run(`api_submitExamEvaluation('${ses.id}', {pass:true, scores:{1:5,2:5,3:25}})`), /1〜20/);
assert.throws(() => run(`api_submitExamEvaluation('${ses.id}', {scores:{1:5,2:5,3:10}})`), /合格・不合格/);
let r = run(`api_submitExamEvaluation('${ses.id}', {pass:false, scores:{1:5,2:6,3:12}, comments:{4:'2択が使えていた'}, good:'笑顔', improve:'結論から'})`);
assert.deepStrictEqual([r.result, r.total], ['', 23]);
// 判定前なら出し直せる
r = run(`api_submitExamEvaluation('${ses.id}', {pass:true, scores:{1:7,2:6,3:15}, good:'笑顔が良い', improve:'結論から'})`);
assert.deepStrictEqual([r.result, r.total, r.submitted], ['', 28, 1]);
assert.strictEqual(run('api_bootstrap()').pendingExams, 0);

as('morimoto@monochro-inc.com');
r = run(`api_submitExamEvaluation('${ses.id}', {pass:true, scores:{1:8,2:8,3:16}})`);
assert.strictEqual(r.result, '合格');
const detail = run(`api_getExamSession('${ses.id}')`);
assert.strictEqual(detail.status, '完了');
assert.strictEqual(detail.average, 30);
assert.strictEqual(detail.evaluations.length, 2);
assert.strictEqual(detail.evaluations.find((e) => e.evaluator === '伊藤竣哉').scores['3'], 15);
assert.throws(() => run(`api_submitExamEvaluation('${ses.id}', {pass:true, scores:{1:8,2:8,3:16}})`), /判定が出ています/);
// ロープレ記録にも残り、ポイントに反映（試験合格30 + ロープレ20）
assert.ok(run('api_listRoleplays()').some((x) => x.topic === '【試験①】カウンセリング面談' && x.focus.includes('合格')));
const st2 = run(`api_getProgress('小田天誠')`);
assert.deepStrictEqual(st2.examsPassed, ['EX01']);
assert.strictEqual(st2.stats.points, 35 + 20 + 30);

// マニュアルのウェブ表示（研修生は編集ボタンなし）
as('t.oda@monochro-inc.com');
const man = run(`api_getManual('MAN-01')`);
assert.ok(man.html.includes('本文'));
assert.strictEqual(man.canEdit, false);

// まとめて登録（既にいる人は飛ばす）
as('owner@monochro-inc.com');
const bulk = run(`api_addMembers([{name:'山田園佳', email:'yamada@monochro-inc.com', role:'教育担当'}, {name:'伊藤竣哉', email:'ito@monochro-inc.com', role:'教育担当'}])`);
assert.deepStrictEqual(bulk.added, ['山田園佳']);
assert.strictEqual(bulk.skipped.length, 1);

// 研修フローをセットアップタスクだけにする（ほかは保留シートへ。進捗の数え方からも外れる）
const beforeRows = run(`api_getProgress('小田天誠')`).rows.length;
const held = run('api_useSetupTasksOnly()');
assert.deepStrictEqual(held, { kept: 2, held: 5 });
const tasksNow = run('api_bootstrap()').tasks;
assert.deepStrictEqual([...new Set(tasksNow.map((t) => t.phase))], ['セットアップタスク']);
const after = run(`api_getProgress('小田天誠')`);
assert.strictEqual(after.rows.length, beforeRows - 5);
assert.strictEqual(run('api_useSetupTasksOnly()').held, 0, 'idempotent');
// 保留から1行戻すと、進捗シートにも自動で足される
const ss = ctx.books[Object.keys(ctx.books).find((k) => ctx.books[k].name === '研修アプリデータ ※社外秘')];
const holdSh = ss.getSheetByName('タスクマスター（保留）');
ss.getSheetByName('タスクマスター').appendRow(holdSh.getRange(2, 1, 1, 5).getValues()[0]);
ss.getSheetByName('タスクマスター').appendRow(['T099', 'セットアップタスク', '', '新しいタスク', '']);
assert.strictEqual(run(`api_getProgress('小田天誠')`).rows.length, beforeRows - 5 + 2);
as('t.oda@monochro-inc.com');
assert.strictEqual(run(`api_setCheck('小田天誠', 'T099', true)`).done, true);

// メンバー表にいない人は使えない
as('stranger@example.com');
assert.throws(() => run('api_bootstrap()'), /権限がありません/);

console.log('server tests ok');
