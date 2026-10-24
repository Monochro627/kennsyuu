// 保存済みのサイトHTMLで SiteImport.js の取り込みロジックを確認する
// 使い方: node test/site_import.test.js <保存したページのフォルダ> <出力フォルダ>
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const pagesDir = process.argv[2];
const outDir = process.argv[3];
const files = fs.readdirSync(pagesDir);
const pageFor = (p) => {
  const key = p.replace(/[^\w　-鿿＀-￯]/g, '_').slice(-80);
  const f = files.find((x) => x === key + '.html');
  if (!f) throw new Error('missing page ' + p);
  return fs.readFileSync(path.join(pagesDir, f), 'utf8');
};
const created = [];
let reuse = false;
const ctx = {
  console,
  UrlFetchApp: { fetch: (url) => {
    const p = decodeURI(url.replace('https://sites.google.com', ''));
    return { getResponseCode: () => 200, getContentText: () => pageFor(p) };
  } },
  Drive: { Files: { create: (meta, blob) => { created.push({ meta, html: blob.html }); return { id: 'DOC' + created.length }; } } },
  Utilities: { newBlob: (html) => ({ html }) },
  DriveApp: { getFolderById: () => ({ getFilesByName: (name) => {
    const hit = created.filter((c) => c.meta.name === name && reuse);
    let i = 0;
    return { hasNext: () => i < hit.length, next: () => ({ getMimeType: () => 'application/vnd.google-apps.document', isTrashed: () => false, getId: () => 'DOC-REUSED' + i++ }) };
  } }) },
  MimeType: { GOOGLE_DOCS: 'application/vnd.google-apps.document' },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../gas/SiteImport.js'), 'utf8'), ctx);
const rows = vm.runInContext('importSite_("FOLDER")', ctx);

const videos = rows.filter((r) => r[1] === 'eラーニング');
const manuals = rows.filter((r) => r[1] === 'マニュアル');
assert.strictEqual(videos.length, 111, 'video count');
assert.strictEqual(videos.filter((r) => r[6] === '必須').length, 46, 'required count');
const byUrl = Object.fromEntries(videos.map((r) => [r[5].slice(-11), r]));
assert.strictEqual(byUrl['kkAIzbavfJ8'][3], 'レインズの使い方');
assert.strictEqual(byUrl['qnEaRKIZcsQ'][3], 'GoogleMeetの使い方');
assert.strictEqual(byUrl['C_6MrwtoISo'][3], '保証会社について徹底解説');
assert.strictEqual(byUrl['qeg_oLPjo-8'][3], 'オリエンテーション');
assert.strictEqual(byUrl['qeg_oLPjo-8'][7], '', 'no stray subtitle in note');
assert.strictEqual(byUrl['WdlT2AOiy-A'][3], '管理会社について徹底解説③');
assert.ok(byUrl['ktmeIJaBTjw'][7].includes('LSTEP'), 'correction note kept');
assert.ok(byUrl['uWzliFm6dD0'][7].includes('更新されております'), 'note on 初回電話');
assert.strictEqual(byUrl['0Mmgx5oM6DY'][3], '経営理念・ブランディング（1）');
assert.strictEqual(manuals.length, 26, 'manual count');
assert.strictEqual(created.length, 20, 'docs created');
assert.ok(created.every((c) => !/jsslot|jsaction/.test(c.html)), 'no leftover markup');
const ur = manuals.find((r) => r[3] === 'UR案件について');
assert.ok(ur[5].startsWith('https://docs.google.com/document/d/1B4InfA2'), 'wrapped doc link');
const tool = created.find((c) => c.meta.name === '不動産業務ツールの入力方法');
assert.ok((tool.html.match(/<img /g) || []).length >= 20, 'images kept');
assert.ok(!/<script/i.test(tool.html));

// 再実行するとドキュメントは作り直さずに再利用する
reuse = true;
const again = vm.runInContext('importSite_("FOLDER")', ctx);
assert.strictEqual(created.length, 20, 'no duplicate docs on rerun');
assert.ok(again.find((r) => r[3] === '社用車について')[5].includes('DOC-REUSED'));

fs.mkdirSync(outDir, { recursive: true });
created.forEach((c) => fs.writeFileSync(path.join(outDir, c.meta.name.replace(/[\\/]/g, '_') + '.html'), c.html));
fs.writeFileSync(path.join(outDir, 'rows.json'), JSON.stringify(rows, null, 1));
console.log('ok', videos.length, 'videos,', manuals.length, 'manuals,', created.length, 'docs');
