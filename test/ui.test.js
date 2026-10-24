// 画面（index.html）を Chromium で開き、google.script.run をフェイクのサーバー（本物の Code.js）につないで確認する
// 使い方: node test/ui.test.js <資料マスター rows.json> <スクショ出力フォルダ>
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { chromium } = require('playwright');
const { createContext } = require('./fake_gas');

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
];
const ctx = createContext({ userEmail: 'owner@monochro-inc.com', sourceFlowRows: flowRows, siteImportRows: materials, docExportHtml });
const run = (code) => vm.runInContext(code, ctx);
run('setup()');
run(`api_addMember({name:'小田天誠', email:'t.oda@monochro-inc.com', role:'研修生', joined:'2026/10/01'})`);
run(`api_addMember({name:'宮川大輝', email:'miyagawa@monochro-inc.com', role:'研修生', joined:'2026/09/01'})`);
run(`api_addMember({name:'伊藤竣哉', email:'ito@monochro-inc.com', role:'教育担当'})`);
ctx.state.userEmail = 'miyagawa@monochro-inc.com';
run(`api_setCheck('宮川大輝','T001',true); api_setCheck('宮川大輝','T002',true); api_setCheck('宮川大輝','G01',true)`);

const html = fs.readFileSync(path.join(__dirname, '../gas/index.html'), 'utf8');
const shim = `<script>
window.google = { script: { get run() {
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
    await page.goto('http://app.local/');
    return page;
  }

  // 研修生（スマホ幅）
  const p = await open('t.oda@monochro-inc.com', 390);
  await p.waitForSelector('text=卒業条件');
  await p.screenshot({ path: path.join(outDir, '1_home_trainee.png'), fullPage: true });
  await p.locator('label.check', { hasText: '業務契約締結' }).click();
  await p.waitForSelector('text=✓ 小田天誠');
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
  await p.click('summary:has-text("ロープレを記録する")');
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
  await a.click('nav.tabs button:has-text("管理")');
  await a.fill('input[placeholder="例：山田太郎"]', '新人 花子');
  await a.fill('input[type=email]', 'hanako@monochro-inc.com');
  await a.click('button:has-text("追加する")');
  await a.waitForSelector('text=新人 花子 さんを追加しました');
  await a.screenshot({ path: path.join(outDir, '7_admin.png'), fullPage: true });
  await a.click('nav.tabs button:has-text("卒業フロー")');
  await a.waitForSelector('text=NOW');
  await a.screenshot({ path: path.join(outDir, '8_home_admin_pc.png'), fullPage: true });

  // 宮川さんが入社前フェーズを全部終えると PHASE CLEAR の演出
  const m = await open('miyagawa@monochro-inc.com', 390);
  await m.waitForSelector('text=黒から、白へ。');
  await m.screenshot({ path: path.join(outDir, '0_hero_miyagawa.png') });
  await m.locator('label.check', { hasText: 'Gmail登録' }).click();
  await m.waitForSelector('.celebrate:has-text("PHASE CLEAR")');
  await m.waitForTimeout(600);
  await m.screenshot({ path: path.join(outDir, '9_celebrate.png') });

  // メンバー表にいない人
  const s = await open('stranger@example.com', 390);
  await s.waitForSelector('text=権限がありません');

  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log('ui tests ok');
})().catch((e) => { console.error(e); process.exit(1); });
