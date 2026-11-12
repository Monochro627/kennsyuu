// サーバー側（Code.js / Setup.js）の動作確認
const assert = require('assert');
const { createContext } = require('./fake_gas');
const examSheets = require('./exam_fixture');

const flowRows = [
  ['', 'カテゴリ', 'タスク', '進捗', 'ポイント'],
  ['入社前', 'セットアップ研修', '', false, 'Monochroルール・行動指針の説明'],
  ['', 'セットアップタスク', '■業務契約締結      ', false],
  ['入社後'],
  ['依頼コンサル', 'コンサルティング', '■SNSアカウント戦略　※諸本', false, 'インスタアカウント設計'],
  ['', 'コンサルティング', '■数値化設定行動戦略　※伊藤', false],
  ['諸々の処理', 'ワーク', '■課題図書3冊発表', false, '１週間後に試験ある'],
  ['※ひたすらロープレ', 'ロールプレイング', '①ヒアリング', false],
  ['※黄色優先', 'ロールプレイング', '②物件提案', false, 'メラビアンも練習'],
  ['物件用語・現地', 'ワーク', '■賃貸用語＆物件資料ワーク', false],
  ['事務処理関連', 'ワーク', '■①初期費用見積作成', false],
  ['2週間後試験\n→インスタ開始', '効果測定', '■ワーク試験', false],
  ['', '', '★インスタ開始', false, '★１件成約まで上長同席'],
  ['1カ月間', 'コンサルティング', '■カレンダー徹底させる', false],
  ['', 'ロールプレイング', '■とにかくロープレ', false],
  ['', 'コンサルティング', '■マイビジョン設定', false],
  ['1～3ヵ月目最終日\n→研修生から\nルームアドバイザーへ', '卒業検定', '■原状回復の知識試験', false],
  ['主任要件目指す', '', '', false],
  ['', '', '', false],
];
const materials = [
  ['VID-001', 'eラーニング', '★①はじめに', 'オリエンテーション', '動画', 'https://youtu.be/qeg_oLPjo-8', '必須', '', '', 1],
  ['VID-002', 'eラーニング', '⑦契約手続き編', '審査について', '動画', 'https://youtu.be/kcxlu_qepkk', '任意', 'ライフライン変更', '', 2],
  ['MAN-01', 'マニュアル', 'マニュアル', '社内ルールについて', 'ドキュメント', 'https://docs.google.com/document/d/X/edit', '', '', '', 1000],
];
const ctx = createContext({ userEmail: 'owner@monochro-inc.com', sourceFlowRows: flowRows, siteImportRows: materials, examSheets,
  promoRows: [['伊藤竣哉', '役職', '主任', '', '2025/04', '小嶋勇輝', '2025/04/01 10:00'], ['伊藤竣哉', 'クリア', 'コンサルティングルームアドバイザー', 'FP3級の合格', 'TRUE', '小嶋勇輝', '2025/06/01 10:00']] });
const run = (code) => { const v = require('vm').runInContext(code, ctx); return v === undefined ? v : JSON.parse(JSON.stringify(v)); };
const as = (email) => { ctx.state.userEmail = email; };

// setup
run('setup()');
const tasks = run('buildTaskMaster_()');
assert.strictEqual(tasks.length, 15);
assert.strictEqual(tasks[0][1], '1. 入社前');
// setup では今の形に並べ替えてタスクマスターに入れる
const shaped = run(`transformTasks_(buildTaskMaster_().map(function (r) { return r.concat(['']); }))`);
assert.deepStrictEqual(shaped.map((t) => t[0] + '|' + t[1] + '|' + t[5]), [
  'T001|セットアップ研修|チェック', 'T002|セットアップ研修|チェック', 'T005|セットアップ研修|チェック',
  'T012|セットアップ研修|チェック', 'T013|セットアップ研修|チェック',
  'T003|依頼コンサル|メモ', 'T004|依頼コンサル|メモ', 'T014|依頼コンサル|メモ',
  'T010|2週間後試験 →インスタ開始|チェック', 'T011|2週間後試験 →インスタ開始|チェック',
  'T008|事務作業ワーク|G04', 'T009|事務作業ワーク|G04',
  'T006|ロープレの種類|ロープレ一覧', 'T007|ロープレの種類|ロープレ一覧',
  'M001|入社からの目安|目安：〜2週間', 'M002|入社からの目安|目安：〜2週間',
  'M003|入社からの目安|目安：〜1ヶ月', 'M004|入社からの目安|目安：〜1ヶ月', 'M005|入社からの目安|目安：〜1ヶ月',
  'M006|入社からの目安|目安：1〜3ヶ月（卒業検定）',
]);
assert.strictEqual(shaped.find((t) => t[0] === 'T004')[3], '数値化設定行動戦略　※小嶋', '伊藤 → 小嶋');
assert.deepStrictEqual(run(`transformTasks_(${JSON.stringify(shaped)})`), shaped, 'idempotent');
assert.throws(() => run('setup()'), /すでに初期設定済み/);

// 管理者で起動
as('owner@monochro-inc.com');
let boot = run('api_bootstrap()');
assert.strictEqual(boot.me.role, '管理者');
assert.strictEqual(boot.me.name, '小嶋勇輝');
assert.strictEqual(boot.goals.length, 11);
// 「あり方」は卒業要件の一番上。中身はカテゴリつきのタスク（扱い＝要件のID）
assert.strictEqual(boot.goals[0].id, 'G10');
assert.ok(/^あり方/.test(boot.goals[0].title));
const arikata = boot.tasks.filter((t) => t.mode === 'G10');
assert.strictEqual(arikata.length, 20);
// 2番目は「実務スキル」
assert.ok(/^実務スキル/.test(boot.goals[1].title));
assert.strictEqual(boot.tasks.filter((t) => t.mode === boot.goals[1].id).length, 5);
assert.ok(arikata.every((t) => t.category && t.point.endsWith('状態')));
// 応用編：売買（扱い「応用：売買」）。進捗率には入らない
const baibai = boot.tasks.filter((t) => t.mode === '応用：売買');
assert.strictEqual(baibai.length, 39);
assert.deepStrictEqual([...new Set(baibai.map((t) => t.category))], ['マンション', '戸建て', '売却・媒介', '契約・宅建業法', '住宅ローン', 'お金・税金']);
const chintai = boot.tasks.filter((t) => t.mode === '応用：賃貸');
assert.strictEqual(chintai.length, 14);
assert.ok(boot.tasks.indexOf(chintai[0]) < boot.tasks.indexOf(baibai[0]), '賃貸編が先');
assert.strictEqual(boot.tasks.length, 20 + 25 + 53);
// 何度開いても増えない
assert.strictEqual(run('api_bootstrap()').tasks.length, 20 + 25 + 53);
assert.strictEqual(boot.materials.length, 3);

// メンバー追加
run(`api_addMember({name:'小田天誠', email:'T.Oda@monochro-inc.com', role:'研修生', joined:'2024/07/01'})`);
run(`api_addMember({name:'伊藤竣哉', email:'ito@monochro-inc.com', role:'教育担当'})`);
assert.throws(() => run(`api_addMember({name:'小田天誠', email:'x@monochro-inc.com', role:'研修生'})`), /すでに/);
boot = run('api_bootstrap()');
assert.strictEqual(boot.summaries.length, 1);
assert.strictEqual(boot.summaries[0].percent, 0);
assert.strictEqual(boot.summaries[0].phase, 'セットアップ研修');
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
assert.strictEqual(boot.summaries[0].phase, 'セットアップ研修');

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

// 進捗に数えるのは卒業要件とチェック扱いのタスクだけ（メモ・事務作業ワークの中身は数えない）
let pr = run(`api_getProgress('小田天誠')`);
assert.strictEqual(pr.rows.length, 11 + 12 + 25 + 53, 'goals + tasks with progress rows');
assert.strictEqual(pr.rows.filter((r) => r.counts).length, 11 + 7);
// メモのタスク：チェックすると実施日に今日が入り、日付は直せる。進捗率は変わらない
as('t.oda@monochro-inc.com');
const pct0 = run('api_bootstrap()').summaries[0].percent;
const memo = run(`api_setCheck('小田天誠', 'T003', true)`);
assert.ok(/^\d{4}\/\d{2}\/\d{2}$/.test(memo.date));
assert.strictEqual(run(`api_setItemDate('小田天誠', 'T003', '2026-11-01')`).date, '2026/11/01');
assert.strictEqual(run(`api_getProgress('小田天誠')`).rows.find((r) => r.id === 'T003').date, '2026/11/01');
assert.throws(() => run(`api_setItemDate('小田天誠', 'T003', 'あした')`), /日付/);
assert.strictEqual(run('api_bootstrap()').summaries[0].percent, pct0);
// 整理し直しても同じ（すでに扱いが入っている）。保留シートの古い行も取り込む
as('owner@monochro-inc.com');
const ss = ctx.books[Object.keys(ctx.books).find((k) => ctx.books[k].name === '研修アプリデータ ※社外秘')];
const hold = ss.insertSheet('タスクマスター（保留）');
hold.appendRow(['ID', 'フェーズ', 'カテゴリ', 'タスク', 'ポイント']);
hold.appendRow(['T150', '8. 1カ月間', 'コンサルティング', 'ブランドマップ信念', '']);
const re = run('api_restructureFlow()');
assert.strictEqual(re.total, 22 + 25 + 53, '20 + the held row + its guide row + あり方');
const t2 = run('api_bootstrap()').tasks;
assert.strictEqual(t2.find((t) => t.id === 'T150').mode, 'メモ');
assert.strictEqual(new Set(t2.map((t) => t.id)).size, t2.length, 'no duplicate ids');
assert.ok(t2.some((t) => t.id === 'M007'));
// タスクを足すと、研修生の進捗シートにも自動で足される
ss.getSheetByName('タスクマスター').appendRow(['T199', 'セットアップ研修', '', '新しいタスク', '', 'チェック']);
as('t.oda@monochro-inc.com');
assert.ok(run(`api_getProgress('小田天誠')`).rows.some((r) => r.id === 'T199'));
assert.strictEqual(run(`api_setCheck('小田天誠', 'T199', true)`).done, true);

// 編集モード：研修生はできない、教育担当はできる
as('t.oda@monochro-inc.com');
assert.throws(() => run(`api_updateItem('task', 'T001', {title:'x'})`), /管理者・教育担当/);
as('ito@monochro-inc.com');
run(`api_updateItem('task', 'T001', {title:'セットアップ研修（初日）', point:'行動指針の説明'})`);
let tk = run('api_bootstrap()').tasks;
assert.strictEqual(tk.find((t) => t.id === 'T001').title, 'セットアップ研修（初日）');
assert.strictEqual(tk.find((t) => t.id === 'T001').phase, 'セットアップ研修', 'other fields kept');
assert.throws(() => run(`api_updateItem('task', 'T001', {title:'  '})`), /項目名/);
// 追加（T002 の次に）。番号は保留中も含めて続きから
const added = run(`api_addItem('task', {title:'名刺を受け取る', phase:'セットアップ研修', mode:'チェック'}, 'T002')`);
assert.strictEqual(added.id, 'T200');
tk = run('api_bootstrap()').tasks;
assert.strictEqual(tk[tk.findIndex((t) => t.id === 'T002') + 1].id, 'T200');
// 並び替え
const setupIds = tk.filter((t) => t.phase === 'セットアップ研修').map((t) => t.id);
const reversed = setupIds.slice().reverse();
const full = reversed.concat(tk.filter((t) => t.phase !== 'セットアップ研修').map((t) => t.id));
run(`api_saveOrder('task', ${JSON.stringify(full)})`);
tk = run('api_bootstrap()').tasks;
assert.deepStrictEqual(tk.filter((t) => t.phase === 'セットアップ研修').map((t) => t.id), reversed);
assert.strictEqual(tk.length, full.length, 'nothing lost');
// 削除は保留へ。進捗の数からも外れる
run(`api_removeItem('task', 'T200')`);
assert.ok(!run('api_bootstrap()').tasks.some((t) => t.id === 'T200'));
assert.ok(ss.getSheetByName('タスクマスター（保留）').getDataRange().getValues().some((r) => r[0] === 'T200'));
assert.strictEqual(run(`api_addItem('task', {title:'次のタスク', phase:'セットアップ研修'})`).id, 'T201', 'held ids not reused');
// フェーズ名の変更
assert.strictEqual(run(`api_renamePhase('依頼コンサル', 'コンサル（メモ）')`).count, 4);
assert.ok(run('api_bootstrap()').tasks.some((t) => t.phase === 'コンサル（メモ）' && t.mode === 'メモ'));
// 卒業要件
run(`api_updateItem('goal', 'G03', {title:'OJT 10件（レポート入力）'})`);
const g = run(`api_addItem('goal', {title:'インスタ初投稿', detail:'アカウント設計のあと'}, 'G03')`);
assert.strictEqual(g.id, 'G12');
let goals = run('api_bootstrap()').goals;
assert.strictEqual(goals[5].id, 'G12');
assert.strictEqual(goals.find((x) => x.id === 'G03').detail, 'OJT用レポートの入力件数でカウントする', 'detail kept');
// 新しい卒業要件は研修生の進捗にも足される
as('t.oda@monochro-inc.com');
assert.ok(run(`api_getProgress('小田天誠')`).rows.some((r) => r.id === 'G12'));
as('ito@monochro-inc.com');
run(`api_removeItem('goal', 'G12')`);
assert.strictEqual(run('api_bootstrap()').goals.length, 11);
// 「あり方」の項目を外しても、開き直したときに勝手に戻らない
const ari = run('api_bootstrap()').tasks.find((t) => t.mode === 'G10');
run(`api_removeItem('task', '${ari.id}')`);
assert.ok(!run('api_bootstrap()').tasks.some((t) => t.id === ari.id));

// 昇格：成績ダッシュボードの昇格チェック（役職・クリア）を読み、段階と要件を出す
as('ito@monochro-inc.com');
let promo = run('api_promotion()');
assert.strictEqual(promo.steps.length, 6);
assert.strictEqual(promo.state.roles['伊藤竣哉'].step, 0);
assert.ok(promo.state.checks['伊藤竣哉']['コンサルティングルームアドバイザー']['FP3級の合格']);
assert.deepStrictEqual(promo.examSteps.map((x) => x.short), ['課長代理', '課長', '次長', 'トップ']);
// Monochro試験はロープレ試験と別に渡す（卒業要件のロープレ試験の数には入らない）
boot = run('api_bootstrap()');
assert.ok(!boot.exams.some((e) => e.id === 'MX01'));
assert.strictEqual(boot.promoExams[0].id, 'MX01');
assert.strictEqual(boot.promoExams[0].max, 90);
// 段階を選ばないと実施できない。合格すると成績ダッシュボードの昇格要件にクリアが付く
assert.throws(() => run(`api_createExamSession({examId:'MX01', trainee:'伊藤竣哉', evaluators:['小嶋勇輝']})`), /段階/);
as('owner@monochro-inc.com');
const mx = run(`api_createExamSession({examId:'MX01', trainee:'伊藤竣哉', evaluators:['小嶋勇輝'], settingNo:'コンサルティングルームアドバイザー'})`);
const mxScores = {}; boot.promoExams[0].items.forEach((it) => { if (it.max) mxScores[it.no] = it.max; });
const mxRes = run(`api_submitExamEvaluation('${mx.id}', {scores: ${JSON.stringify(mxScores)}, comments: {9: '理念の質問に即答'}, pass: true})`);
assert.strictEqual(mxRes.result, '合格');
assert.strictEqual(mxRes.reflected, 'コンサルティングルームアドバイザー');
promo = run('api_promotion()');
assert.ok(promo.state.checks['伊藤竣哉']['コンサルティングルームアドバイザー']['Monochro試験']);
assert.strictEqual(promo.sessions[0].result, '合格');
// 評価シートを取り込み直しても Monochro試験は消えない
run('reimportExams()');
assert.ok(run('api_bootstrap()').promoExams.some((e) => e.id === 'MX01'));
assert.ok(run('api_bootstrap()').exams.length > 0);

// メンバー表にいない人は使えない
as('stranger@example.com');
assert.throws(() => run('api_bootstrap()'), /権限がありません/);

console.log('server tests ok');
