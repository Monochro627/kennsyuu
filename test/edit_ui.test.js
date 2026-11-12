// 編集モード（管理者）の画面確認：文言修正・ドラッグで並び替え・追加・外す
// 使い方: node test/edit_ui.test.js <資料マスター rows.json> <スクショ出力フォルダ>
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

const srcBefore = JSON.stringify(ctx.books.SRC.sheets[0].cells);
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
  async function open(email, width) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width < 600 });
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
    await page.goto('http://app.local/');
    return page;
  }
  const tasks = () => JSON.parse(JSON.stringify(run('api_bootstrap()'))).tasks;
  const flowIds = (phase) => tasks().filter((t) => t.phase === phase && (!t.mode || t.mode === 'チェック' || t.mode === 'メモ')).map((t) => t.id);

  // 研修生・教育担当には編集ボタンが出ない
  const tr = await open('t.oda@monochro-inc.com', 390);
  await tr.waitForSelector('text=ルームアドバイザー卒業要件');
  assert.strictEqual(await tr.locator('.edit-toggle').count(), 0);
  const it = await open('ito@monochro-inc.com', 390);
  await it.waitForSelector('text=ルームアドバイザー卒業要件');
  assert.strictEqual(await it.locator('.edit-toggle').count(), 0);

  // 管理者（PC）
  const a = await open('owner@monochro-inc.com', 1200);
  await a.waitForSelector('.edit-toggle');
  await a.screenshot({ path: path.join(outDir, 'e0_home_button.png') });
  await a.click('.edit-toggle >> nth=0');
  await a.waitForSelector('text=項目の編集');
  await a.screenshot({ path: path.join(outDir, 'e1_edit_pc.png'), fullPage: true });

  // ドラッグで並び替え（セットアップ研修の3番目を先頭へ）
  const before = flowIds('セットアップ研修');
  const phase = a.locator('.ephase', { hasText: 'セットアップ研修' });
  const rows = phase.locator('.erow');
  await rows.nth(1).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const g = await rows.nth(2).locator('.grip').boundingBox();
  const top = await rows.nth(0).boundingBox();
  await a.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await a.mouse.down();
  await a.mouse.move(g.x + g.width / 2, top.y + 4, { steps: 8 });
  await a.screenshot({ path: path.join(outDir, 'e2_dragging.png') });
  await a.mouse.up();
  await a.waitForSelector('text=並び順を保存しました');
  const after = flowIds('セットアップ研修');
  assert.deepStrictEqual(after, [before[2], before[0], before[1]].concat(before.slice(3)));

  // キーボード（つまみにフォーカスして↓）
  await phase.locator('.erow').nth(0).locator('.grip').focus();
  await a.keyboard.press('ArrowDown');
  await a.waitForTimeout(200);
  assert.deepStrictEqual(flowIds('セットアップ研修').slice(0, 2), [before[0], before[2]]);

  // 文言の修正
  await phase.locator('.erow', { hasText: 'Gmail登録' }).locator('.epen').click();
  await a.fill('.modal textarea >> nth=0', 'Gmail・カレンダー登録');
  await a.fill('.modal textarea >> nth=1', '会社アカウントで');
  await a.screenshot({ path: path.join(outDir, 'e3_edit_dialog.png') });
  await a.click('.modal button:has-text("保存する")');
  await a.waitForSelector('.erow:has-text("Gmail・カレンダー登録")');
  assert.ok(tasks().some((t) => t.title === 'Gmail・カレンダー登録' && t.point === '会社アカウントで'));

  // 項目を追加
  await phase.locator('.eadd').click();
  await a.fill('.modal textarea >> nth=0', 'PCの初期設定');
  await a.click('.modal button:has-text("追加する")');
  await a.waitForSelector('.ephase:has-text("セットアップ研修") .erow:has-text("PCの初期設定")');
  assert.strictEqual(flowIds('セットアップ研修').slice(-1)[0], tasks().find((t) => t.title === 'PCの初期設定').id);

  // 外す（2回押して確定）
  await phase.locator('.erow', { hasText: 'PCの初期設定' }).locator('.epen').click();
  await a.click('.modal button:has-text("この項目を外す")');
  await a.click('.modal button:has-text("もう一度押すと実行します")');
  await a.waitForSelector('text=保留シートに残っています');
  assert.ok(!tasks().some((t) => t.title === 'PCの初期設定'));

  // まとまりを下へ
  const names = () => [...new Set(tasks().filter((t) => !t.mode || t.mode === 'チェック' || t.mode === 'メモ').map((t) => t.phase))];
  const n0 = names();
  await a.click('.ephase:has-text("セットアップ研修") button[aria-label="まとまりを下へ"]');
  await a.waitForSelector('text=並び順を保存しました');
  await a.waitForTimeout(100);
  assert.deepStrictEqual(names().slice(0, 2), [n0[1], n0[0]]);

  // 卒業要件の並び替え（キーボード）と、要件の中の「やること」の追加
  await a.locator('.egoal').nth(0).locator(':scope > .erow .grip').focus();
  await a.keyboard.press('ArrowDown');
  await a.waitForTimeout(200);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(run('api_bootstrap()'))).goals.map((x) => x.id).slice(0, 2), ['G02', 'G01']);
  await a.click('.egoal:has-text("事務作業ワーク") summary');
  await a.click('.egoal:has-text("事務作業ワーク") .eadd');
  await a.fill('.modal textarea >> nth=0', '③重説読み合わせ');
  await a.click('.modal button:has-text("追加する")');
  await a.waitForSelector('.egoal:has-text("事務作業ワーク") .erow:has-text("③重説読み合わせ")');
  assert.strictEqual(tasks().find((t) => t.title === '③重説読み合わせ').mode, 'G04');

  // 編集を終えると、ふだんの画面に戻って変更が出ている
  await a.click('button:has-text("編集を終える")');
  await a.waitForSelector('.phase summary:has-text("セットアップ研修")');
  if (!(await a.locator('#goal-G04[open]').count())) await a.click('#goal-G04 summary');
  await a.waitForSelector('#goal-G04 label.check:has-text("③重説読み合わせ")');

  // スマホ（指でドラッグ）
  const m = await open('owner@monochro-inc.com', 390);
  await m.waitForSelector('.edit-toggle');
  await m.click('.edit-toggle >> nth=0');
  await m.waitForSelector('text=項目の編集');
  await m.locator('.ephase').nth(0).scrollIntoViewIfNeeded();
  await m.screenshot({ path: path.join(outDir, 'e4_edit_phone.png') });
  const ph0 = await m.locator('.ephase').nth(0).locator('.ephase-head strong').textContent();
  const before2 = flowIds(tasks().find((t) => t.phase.replace(/^\d+\.\s*/, '') === ph0).phase);
  const mrows = m.locator('.ephase').nth(0).locator('.erow');
  await mrows.nth(0).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box0 = await mrows.nth(0).locator('.grip').boundingBox();
  const box1 = await mrows.nth(1).boundingBox();
  // Playwright にはタッチのドラッグがないので、ポインターイベント（pointerType: touch）を送る
  await m.evaluate(([x, y0, y1]) => {
    const grip = document.elementFromPoint(x, y0);
    const ev = (type, y, target) => (target || document).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, pointerId: 7 }));
    ev('pointerdown', y0, grip);
    for (let i = 1; i <= 6; i++) ev('pointermove', y0 + (y1 - y0) * i / 6);
    ev('pointerup', y1);
  }, [box0.x + box0.width / 2, box0.y + box0.height / 2, box1.y + box1.height - 2]);
  await m.waitForSelector('text=並び順を保存しました');
  assert.deepStrictEqual(flowIds(tasks().find((t) => t.phase.replace(/^\d+\.\s*/, '') === ph0).phase).slice(0, 2), [before2[1], before2[0]]);

  // 元の研修フローのスプレッドは変わっていない
  assert.strictEqual(JSON.stringify(ctx.books.SRC.sheets[0].cells), srcBefore);
  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log('edit ui tests ok');
})().catch((e) => { console.error(e); process.exit(1); });
