// 画面（index.html）を Chromium で開き、google.script.run をフェイクのサーバー（本物の Code.js）につないで確認する
// 使い方: node test/ui.test.js <資料マスター rows.json> <スクショ出力フォルダ>
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { chromium } = require('playwright');
const { createContext } = require('./fake_gas');
const examSheets = require('./exam_fixture');

const materials = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const outDir = process.argv[3];
const docExportHtml = process.argv[4] ? fs.readFileSync(process.argv[4], 'utf8') : undefined;
fs.mkdirSync(outDir, { recursive: true });
const flowRows = [
  ['', 'カテゴリ', 'タスク', '進捗', 'ポイント'],
  ['入社前', 'セットアップ研修', '', false, 'Monochroルール・行動指針の説明'],
  ['', 'セットアップタスク', '■業務契約締結', false],
  ['', 'セットアップタスク', '■Gmail登録', false],
  ['依頼コンサル', 'コンサルティング', '■SNSアカウント戦略　※諸本', false, 'インスタアカウント設計'],
  ['※ひたすらロープレ', 'ロールプレイング', '①ヒアリング', false],
  ['', 'ロールプレイング', '②物件提案', false, 'メラビアンも練習のため、動画撮影後モニターに移す'],
  ['物件用語・現地', 'ワーク', '■賃貸用語＆物件資料ワーク', false, '設備の動画の不明点も同時に確認'],
  ['事務処理関連', 'ワーク', '■①初期費用見積作成', false],
  ['', 'ワーク', '■②申込書記入', false],
  ['2週間後試験\n→インスタ開始', '効果測定', '■ワーク試験', false],
  ['', '効果測定', '■路線図試験実施　100%', false],
  ['', '', '★インスタ開始', false, '★１件成約まで上長同席'],
  ['1カ月間', 'コンサルティング', '■カレンダー徹底させる', false],
  ['', 'ロールプレイング', '■とにかくロープレ', false],
  ['', 'コンサルティング', '■マイビジョン設定', false],
  ['1～3ヵ月目最終日\n→研修生から\nルームアドバイザーへ', '卒業検定', '■原状回復の知識試験', false],
  ['', '卒業検定', '■新人評価（人物評価シート）', false],
];
const ctx = createContext({ userEmail: 'owner@monochro-inc.com', sourceFlowRows: flowRows, siteImportRows: materials, docExportHtml, examSheets });
const run = (code) => vm.runInContext(code, ctx);
run('setup()');
run(`api_addMember({name:'小田天誠', email:'t.oda@monochro-inc.com', role:'研修生', joined:'2026/10/01'})`);
run(`api_addMember({name:'宮川大輝', email:'miyagawa@monochro-inc.com', role:'研修生', joined:'2026/09/01'})`);
run(`api_addMember({name:'伊藤竣哉', email:'ito@monochro-inc.com', role:'教育担当'})`);
ctx.state.userEmail = 'miyagawa@monochro-inc.com';
run(`api_setCheck('宮川大輝','T001',true); api_setCheck('宮川大輝','T002',true); api_setCheck('宮川大輝','T013',true); api_setCheck('宮川大輝','T014',true); api_setCheck('宮川大輝','G01',true)`);

const html = fs.readFileSync(path.join(__dirname, '../gas/index.html'), 'utf8');
const shim = `<script>
window.google = { script: { url: { getLocation: (cb) => setTimeout(() => cb({ parameter: window.__tab ? { tab: window.__tab } : {}, hash: '' }), 10) }, get run() {
  const handlers = {};
  const proxy = new Proxy({}, { get(_, name) {
    if (name === 'withSuccessHandler') return (f) => { handlers.ok = f; return proxy; };
    if (name === 'withFailureHandler') return (f) => { handlers.err = f; return proxy; };
    return (...args) => window.__gas(name, JSON.stringify(args)).then((r) => {
      const v = JSON.parse(r);
      setTimeout(() => v.error ? handlers.err(new Error(v.error)) : handlers.ok(v.value), 30);
    });
  } });
  return proxy;
} } };
</script>`;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  async function open(email, width, tab) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.exposeFunction('__gas', (name, argsJson) => {
      ctx.state.userEmail = email;
      ctx.__args = JSON.parse(argsJson);
      try {
        const v = vm.runInContext(name + '.apply(null, __args)', ctx);
        return JSON.stringify({ value: v === undefined ? null : JSON.parse(JSON.stringify(v)) });
      } catch (e) { return JSON.stringify({ error: e.message }); }
    });
    await page.route('**/*', (r) => r.request().url().startsWith('http://app.local') ? r.fulfill({ contentType: 'text/html', body: html.replace('<head>', '<head>' + shim) }) : r.abort());
    await page.addInitScript((t) => { window.__tab = t; }, tab || '');
    await page.goto('http://app.local/');
    return page;
  }

  // 研修生（スマホ幅）
  const p = await open('t.oda@monochro-inc.com', 390);
  await p.waitForSelector('text=ルームアドバイザー卒業要件');
  await p.screenshot({ path: path.join(outDir, '1_home_trainee.png'), fullPage: true });
  // 卒業要件のバッジを押すと詳細が開き、達成にできる
  // 質問の4大原則は現在地のすぐ下
  const order = await p.evaluate(() => [...document.querySelectorAll('main .card')].slice(0, 3).map((c) => c.textContent.slice(0, 20)));
  assert.ok(order[1].includes('質問の4大原則'), order.join(' / '));
  await p.click('button.goal:has-text("課題図書")');
  await p.waitForSelector('#goal-G01[open]:has-text("入社前の課題")');
  await p.click('#goal-G01 button:has-text("達成にする")');
  await p.waitForSelector('button.goal.on:has-text("課題図書")');
  await p.waitForTimeout(200);
  while (await p.locator('.celebrate').count()) await p.click('.celebrate');
  await p.click('#goal-G07 summary');
  await p.waitForSelector('#goal-G07 .exam-row');
  // メモのフェーズ：日付を入れられる
  await p.click('.phase.memo summary');
  await p.fill('.memo-date >> nth=0', '2026-11-05');
  await p.dispatchEvent('.memo-date >> nth=0', 'change');
  await p.waitForSelector('text=実施日を 2026/11/05 にしました');
  await p.screenshot({ path: path.join(outDir, '1b_goal_detail.png'), fullPage: true });
  await p.locator('label.check', { hasText: '業務契約締結' }).click();
  await p.waitForSelector('text=✓ 小田天誠');
  await p.waitForTimeout(200);
  while (await p.locator('.celebrate').count()) await p.click('.celebrate');
  assert.strictEqual(JSON.parse(JSON.stringify(run(`api_getProgress('小田天誠')`))).rows.find((r) => r.id === 'T002').done, true);

  await p.click('nav.tabs button:has-text("eラーニング")');
  await p.waitForSelector('.sec-card');
  await p.screenshot({ path: path.join(outDir, '2_elearning.png'), fullPage: false });
  await p.click('button.vid:has-text("オリエンテーション")');
  await p.waitForSelector('.modal iframe');
  await p.fill('.modal textarea >> nth=0', '仲介の仕事の全体像が分かった');
  await p.screenshot({ path: path.join(outDir, '3_video_modal.png') });
  await p.click('.modal button:has-text("送信して視聴済みにする")');
  await p.waitForSelector('text=記録しました');
  await p.waitForSelector('.vid:has-text("オリエンテーション") .done');

  await p.click('nav.tabs button:has-text("マニュアル")');
  await p.fill('input[type=search]', 'レインズ');
  assert.strictEqual(await p.locator('button.man').count(), 1);
  await p.fill('input[type=search]', '');
  await p.screenshot({ path: path.join(outDir, '4_manuals.png') });
  await p.click('button.man:has-text("保証会社")');
  await p.waitForSelector('.doc h2');
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(outDir, '4b_manual_reader.png') });
  await p.click('.reader button:has-text("一覧")');

  await p.click('nav.tabs button:has-text("ロープレ")');
  await p.click('.rp-kind:has-text("ヒアリング")');
  assert.strictEqual(await p.inputValue('#rp-topic'), 'ヒアリング');
  await p.selectOption('select >> nth=1', '伊藤竣哉');
  await p.fill('input[list=rp-topics]', '【試験①】カウンセリング面談');
  await p.fill('textarea >> nth=1', '結論から話す');
  await p.setInputFiles('input[type=file]', { name: 'memo.m4a', mimeType: 'audio/mp4', buffer: Buffer.from('test-audio') });
  await p.click('button:has-text("記録する")');
  await p.waitForSelector('text=ロープレを記録しました');
  await p.waitForSelector('text=🎧 録音を開く');
  await p.screenshot({ path: path.join(outDir, '5_roleplay.png'), fullPage: true });

  await p.click('nav.tabs button:has-text("みんな")');
  await p.waitForSelector('.leader');
  await p.screenshot({ path: path.join(outDir, '6_all.png') });
  assert.strictEqual(await p.locator('nav.tabs button:has-text("管理")').count(), 0, 'trainee has no admin tab');
  // 他の研修生の進捗は見るだけ
  await p.click('.leader:has-text("宮川大輝")');
  await p.waitForSelector('text=他の研修生の進捗は見るだけです');
  assert.ok(await p.locator('label.check input').first().isDisabled());

  // 管理者（PC幅）
  const a = await open('owner@monochro-inc.com', 1200);
  await a.waitForSelector('text=表示中の研修生');
  // 試験の実施画面で評価者をその場で登録できる
  await a.click('nav.tabs button:has-text("ロープレ")');
  await a.click('button:has-text("試験を実施")');
  await a.click('.modal summary:has-text("評価者がいないとき")');
  await a.fill('#ev-name', '諸本雅広');
  await a.fill('#ev-mail', 'morimoto@monochro-inc.com');
  await a.click('.modal button:has-text("登録して選ぶ")');
  await a.waitForSelector('.chk-list label:has-text("諸本雅広") input:checked');
  await a.screenshot({ path: path.join(outDir, '10b_exam_add_evaluator.png') });
  await a.click('.modal .close');
  await a.click('nav.tabs button:has-text("管理")');
  // まとめて登録
  await a.fill('#bulk-members', '山田園佳, yamada@monochro-inc.com\n佐光琴音, sakou@monochro-inc.com, 教育担当');
  await a.click('button:has-text("まとめて登録")');
  await a.waitForSelector('text=2人を登録しました');
  // 研修フローはsetupで整理済みなので、整理ボタンは出ない。マニュアル作り直しのボタンはある
  assert.strictEqual(await a.locator('text=研修フローを新しい形に整理する').count(), 0);
  await a.waitForSelector('button:has-text("マニュアルを作り直す")');
  await a.fill('input[placeholder="例：山田太郎"]', '新人 花子');
  await a.fill('input[type=email]', 'hanako@monochro-inc.com');
  await a.click('button:has-text("追加する")');
  await a.waitForSelector('text=新人 花子 さんを追加しました');
  await a.screenshot({ path: path.join(outDir, '7_admin.png'), fullPage: true });
  await a.click('nav.tabs button:has-text("卒業フロー")');
  await a.waitForSelector('text=NOW');
  await a.waitForSelector('.phase summary:has-text("セットアップ研修")');
  await a.click('#goal-G04 summary');
  await a.waitForSelector('#goal-G04 label.check:has-text("初期費用見積作成")');
  await a.locator('.guide').scrollIntoViewIfNeeded();
  await a.screenshot({ path: path.join(outDir, '8b_roadmap_pc.png'), fullPage: true });
  await a.screenshot({ path: path.join(outDir, '8_home_admin_pc.png'), fullPage: true });

  // ロープレ試験：研修生が実施 → 教育担当が評価 → 結果
  await p.click('nav.tabs button:has-text("ロープレ")');
  await p.click('button:has-text("試験を実施")');
  await p.waitForSelector('.modal select');
  await p.locator('.chk-list label', { hasText: '伊藤竣哉' }).click();
  await p.screenshot({ path: path.join(outDir, '10_exam_start.png') });
  await p.click('.modal button:has-text("実施する")');
  await p.waitForSelector('text=評価中 0/1');

  const t = await open('ito@monochro-inc.com', 390);
  await t.waitForSelector('nav.tabs .tab-dot');
  await t.click('nav.tabs button:has-text("ロープレ")');
  await t.click('.ses:has-text("評価する")');
  await t.waitForSelector('.exam-item');
  assert.strictEqual(await t.locator('.exam-item').count(), 4);
  await t.locator('.exam-item').nth(0).locator('.scores button').nth(7).click();
  await t.locator('.exam-item').nth(1).locator('.scores button').nth(6).click();
  await t.locator('.exam-item').nth(2).locator('.scores button').nth(15).click();
  await t.locator('.exam-item').nth(3).locator('input.why').fill('2択が使えていた');
  await t.click('.pf button:has-text("合格")');
  await t.fill('.reader textarea >> nth=0', '笑顔と間の取り方が良い');
  await t.waitForSelector('.total-bar b:text-is("31")');
  await t.screenshot({ path: path.join(outDir, '11_exam_sheet.png'), fullPage: true });
  await t.click('.total-bar button:has-text("提出する")');
  await t.waitForSelector('.celebrate:has-text("PASS")');
  await t.click('.celebrate');
  await t.click('.ses:has-text("小田天誠")');
  await t.waitForSelector('table.res');
  await t.screenshot({ path: path.join(outDir, '12_exam_result.png'), fullPage: true });
  assert.ok(JSON.parse(JSON.stringify(run(`api_getProgress('小田天誠')`))).examsPassed.includes('EX01'));

  // 編集モード：文言の修正・追加・並び替え（ドラッグと↑）・外す
  await a.click('nav.tabs button:has-text("卒業フロー")');
  await a.click('#edit-on');
  await a.waitForSelector('text=項目の編集');
  const firstSetup = a.locator('.card:has(h2:text-is("セットアップ研修")) .erow').first();
  await firstSetup.locator('button[title="直す"]').click();
  await a.fill('.eform input >> nth=0', 'セットアップ研修（初日）');
  await a.click('.eform button:has-text("保存")');
  await a.waitForSelector('text=保存しました');
  const setupCard = a.locator('.card:has(h2:text-is("セットアップ研修"))');
  await setupCard.locator('summary:has-text("項目を追加")').click();
  await setupCard.locator('.eadd input >> nth=0').fill('名刺を受け取る');
  await setupCard.locator('button:has-text("追加する")').click();
  await a.waitForSelector('text=追加しました');
  const ids = async () => a.locator('.card:has(h2:text-is("セットアップ研修")) .erow').evaluateAll((els) => els.map((e) => e.dataset.id));
  const before = await ids();
  // 最後の行を ⋮⋮ で一番上へドラッグ
  const rows = a.locator('.card:has(h2:text-is("セットアップ研修")) .erow');
  const lastHandle = rows.last().locator('.handle');
  const firstBox = await rows.first().boundingBox();
  const hb = await lastHandle.boundingBox();
  await a.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await a.mouse.down();
  await a.mouse.move(firstBox.x + 20, firstBox.y + 4, { steps: 8 });
  await a.mouse.up();
  await a.waitForSelector('text=並び順を保存しました');
  const afterDrag = await ids();
  assert.strictEqual(afterDrag[0], before[before.length - 1], 'dragged to top');
  // ↑ で2番目を1番目へ
  await rows.nth(1).locator('button[title="上へ"]').click();
  await a.waitForTimeout(200);
  const afterUp = await ids();
  assert.deepStrictEqual(afterUp.slice(0, 2), [afterDrag[1], afterDrag[0]]);
  const serverOrder = JSON.parse(JSON.stringify(run('api_bootstrap()'))).tasks.filter((t) => t.phase === 'セットアップ研修').map((t) => t.id);
  assert.deepStrictEqual(serverOrder, afterUp, 'order saved on server');
  await a.screenshot({ path: path.join(outDir, '13_edit_mode.png'), fullPage: true });
  // 外す（2回押す）
  const target = a.locator('.card:has(h2:text-is("セットアップ研修")) .erow:has-text("名刺を受け取る")');
  const tid = await target.getAttribute('data-id');
  await target.locator('button[title="外す"]').click();
  await target.locator('button:has-text("外す？")').click();
  await a.waitForSelector('text=保留シートに残っています');
  assert.ok(!JSON.parse(JSON.stringify(run('api_bootstrap()'))).tasks.some((t) => t.id === tid));
  await a.click('#edit-off');
  await a.waitForSelector('text=ルームアドバイザー卒業要件');
  await a.waitForSelector('label.check:has-text("セットアップ研修（初日）")');

  // 宮川さんが入社前フェーズを全部終えると PHASE CLEAR の演出
  const m = await open('miyagawa@monochro-inc.com', 390);
  await m.waitForSelector('text=黒から、白へ。');
  await m.screenshot({ path: path.join(outDir, '0_hero_miyagawa.png') });
  await m.locator('label.check', { hasText: 'Gmail登録' }).click();
  await m.waitForSelector('.celebrate');
  await m.waitForTimeout(600);
  await m.screenshot({ path: path.join(outDir, '9_celebrate.png') });

  // ?tab=roleplay で開くとロープレのタブから始まる
  const d = await open('t.oda@monochro-inc.com', 390, 'roleplay');
  await d.waitForSelector('nav.tabs button.active:has-text("ロープレ")');
  await d.waitForSelector('text=ロープレ試験');

  // メンバー表にいない人
  const s = await open('stranger@example.com', 390);
  await s.waitForSelector('text=権限がありません');

  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log('ui tests ok');
})().catch((e) => { console.error(e); process.exit(1); });
