// Googleドキュメントの書き出しHTMLをウェブ表示用に整える処理の確認
// 使い方: node test/manual.test.js <ドキュメントを text/html で書き出したファイル> [タイトル]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ctx = { console };
vm.createContext(ctx);
for (const f of ['SiteImport.js', 'Manual.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../gas', f), 'utf8'), ctx);

// 小さな手作りサンプル
const sample = `<html><head><style>.c3{font-weight:700}.c1{color:#000000}.c5{color:#ff0000;font-weight:700}.c6{background-color:#ffff00}.c7{color:red;background-color:#ffffff}</style></head><body class="c9">
<h1 id="h.x"><span class="c1">社用車について</span></h1><p><span>※旧Googleサイト「Monochro」から移行。社外秘。</span></p>
<h2><span class="c3">利用方法</span></h2><p><span class="c1">① カレンダーを</span><span class="c3">確認</span><span class="c5">赤字</span><span class="c6">マーカー</span><span class="c7">ふつう</span><span style="color:#000000;font-weight:700;font-family:&quot;Arial&quot;">インライン太字</span><span style="color:#999999">グレー</span></p>
<p><span></span></p><ul class="lst"><li><span>鍵を戻す</span></li></ul>
<p><a href="https://www.google.com/url?q=https://youtu.be/abcdefghijk&amp;sa=D">▶ 動画</a></p>
<p><img src="data:image/png;base64,AAAA" style="width:10px"><img src="javascript:alert(1)"></p>
<script>alert(1)</script><p onclick="x()">x</p></body></html>`;
ctx.__s = sample;
const r = JSON.parse(JSON.stringify(vm.runInContext('stripManualPreamble_(sanitizeDocHtml_(__s), "社用車について")', ctx)));
assert.deepStrictEqual(r.toc.map((t) => t.text), ['利用方法']);
assert.ok(!r.html.includes('社用車について'), 'title removed');
assert.ok(!r.html.includes('旧Googleサイト'), 'note removed');
assert.ok(r.html.includes('<b>確認</b>'), 'bold kept');
assert.ok(r.html.includes('<a href="https://youtu.be/abcdefghijk" target="_blank" rel="noopener">'), 'link unwrapped');
assert.ok(r.html.includes('<figure><img src="data:image/png;base64,AAAA"'), 'image kept');
assert.ok(r.html.includes('<b><span style="color:#ff0000">赤字</span></b>'), 'color kept');
assert.ok(r.html.includes('<span style="background-color:#ffff00">マーカー</span>'), 'highlight kept');
assert.ok(r.html.includes('ふつう') && !r.html.includes('color:red'), 'non-hex and white ignored');
assert.ok(r.html.includes('<b>インライン太字</b>'), 'inline bold');
assert.ok(r.html.includes('<span style="color:#999999">グレー</span>'), 'inline color');
assert.ok(!/javascript:|<script|onclick/.test(r.html), 'unsafe stripped');
assert.ok(!/style="(?!(color|background-color):#[0-9a-f]{6}(;background-color:#[0-9a-f]{6})?")/.test(r.html), 'only whitelisted styles');
assert.ok(!r.html.includes('<p></p>'), 'empty removed');

// 本物の書き出し（あれば）
if (process.argv[2]) {
  ctx.__s = fs.readFileSync(process.argv[2], 'utf8');
  const real = JSON.parse(JSON.stringify(vm.runInContext(`stripManualPreamble_(sanitizeDocHtml_(__s), ${JSON.stringify(process.argv[3] || '')})`, ctx)));
  assert.ok(!/<script|class=/.test(real.html));
  assert.ok((real.html.match(/<b>/g) || []).length > 5, 'real doc keeps bold');
  console.log('real doc:', real.toc.length, 'headings,', (real.html.match(/<b>/g) || []).length, 'bold,', (real.html.match(/<span style/g) || []).length, 'colored,', (real.html.match(/<img /g) || []).length, 'images,', Math.round(real.html.length / 1024), 'KB');
  console.log(real.toc.slice(0, 8).map((t) => t.level + ' ' + t.text).join('\n'));
  if (process.argv[4]) fs.writeFileSync(process.argv[4], JSON.stringify(real));
}
console.log('manual tests ok');
