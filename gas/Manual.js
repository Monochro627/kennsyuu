/**
 * マニュアルのウェブ表示。
 * Googleドキュメントを編集元のまま残し、アプリでは HTML に書き出して読みやすく整えて表示する。
 * 書き出し結果はドキュメントの更新日時ごとにドライブへキャッシュする。
 */

// 表示の作り方を変えたら上げる（古いキャッシュを使わないため）
var MANUAL_RENDER_VERSION = 'v3';

var MANUAL_TAGS = { h1: 'h2', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h4', h6: 'h4', p: 'p', ul: 'ul', ol: 'ol', li: 'li',
  table: 'table', tbody: 'tbody', tr: 'tr', td: 'td', th: 'td', br: 'br', hr: 'hr' };

/**
 * <style> の中から、文字の装飾（太字・斜体・下線・文字色・背景色）をクラスごとに集める。
 * 色は #rrggbb だけを通し、黒い文字色と白い背景は既定の見た目なので無視する。
 */
function styledClasses_(html) {
  var out = {};
  var re = /\.(c\d+)\{([^}]*)\}/g;
  var m;
  var style = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/i) || [])[1] || '';
  while ((m = re.exec(style)) !== null) {
    var s = parseCss_(m[2]);
    if (Object.keys(s).length) out[m[1]] = s;
  }
  return out;
}

/** CSS の宣言から、表示に使う装飾だけを取り出す（書き出し方によってクラスとインラインの両方がある） */
function parseCss_(css) {
  var s = {};
  if (/font-weight:\s*700/.test(css)) s.bold = true;
  if (/font-style:\s*italic/.test(css)) s.italic = true;
  if (/text-decoration:\s*underline/.test(css)) s.underline = true;
  var color = css.match(/(?:^|;)\s*color:\s*(#[0-9a-fA-F]{6})/);
  // 黒は既定の文字色、#1155cc はリンクの既定色なので無視する
  if (color && !/^#(0{6}|1155cc)$/i.test(color[1])) s.color = color[1].toLowerCase();
  var bg = css.match(/background-color:\s*(#[0-9a-fA-F]{6})/);
  if (bg && !/^#f{6}$/i.test(bg[1])) s.bg = bg[1].toLowerCase();
  return s;
}

/** クラスの装飾を、開きタグと閉じタグの組にする */
function spanTags_(styles) {
  var s = {};
  styles.forEach(function (x) { Object.keys(x).forEach(function (k) { s[k] = x[k]; }); });
  var open = '';
  var close = '';
  if (s.bold) { open += '<b>'; close = '</b>' + close; }
  if (s.italic) { open += '<i>'; close = '</i>' + close; }
  if (s.underline) { open += '<u>'; close = '</u>' + close; }
  var css = [];
  if (s.color) css.push('color:' + s.color);
  if (s.bg) css.push('background-color:' + s.bg);
  if (css.length) { open += '<span style="' + css.join(';') + '">'; close = '</span>' + close; }
  return [open, close];
}

/** Googleのリダイレクト付きリンクを元のURLに戻す */
function realHref_(href) {
  var m = href.match(/^https:\/\/www\.google\.com\/url\?q=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : href;
}

/**
 * Docs の書き出しHTMLを、決まったタグだけの安全なHTMLにする。
 * 見出しには目次用の id を付け、目次の配列も返す。
 */
function sanitizeDocHtml_(html) {
  var classes = styledClasses_(html);
  var body = html.replace(/^[\s\S]*?<body[^>]*>/i, '').replace(/<\/body>[\s\S]*$/i, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '');
  var re = /<(\/?)([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  var out = [];
  var stack = [];
  var toc = [];
  var heading = null;
  var m;
  while ((m = re.exec(body)) !== null) {
    if (m[4] !== undefined) {
      if (heading) heading.text += decodeEntities_(m[4]);
      out.push(m[4].replace(/</g, '&lt;'));
      continue;
    }
    var closing = m[1] === '/';
    var tag = m[2].toLowerCase();
    var attrs = m[3] || '';
    if (tag === 'span') {
      if (closing) { out.push(stack.pop() || ''); continue; }
      var cls = (attr_(attrs, 'class') || '').split(/\s+/);
      var styles = cls.filter(function (c) { return classes[c]; }).map(function (c) { return classes[c]; });
      styles.push(parseCss_(decodeEntities_(attr_(attrs, 'style') || '')));
      var tags = spanTags_(styles);
      out.push(tags[0]);
      stack.push(tags[1]);
      continue;
    }
    if (tag === 'a') {
      if (closing) { out.push(stack.pop() || ''); continue; }
      var href = realHref_(attr_(attrs, 'href'));
      if (/^https?:\/\//.test(href)) {
        out.push('<a href="' + escapeHtml_(href) + '" target="_blank" rel="noopener">');
        stack.push('</a>');
      } else {
        stack.push('');
      }
      continue;
    }
    if (tag === 'img') {
      var src = attr_(attrs, 'src');
      if (/^data:image\/(png|jpe?g|gif|webp);base64,/.test(src) || /^https:\/\//.test(src)) {
        out.push('<figure><img src="' + escapeHtml_(src) + '" loading="lazy" alt=""></figure>');
      }
      continue;
    }
    var mapped = MANUAL_TAGS[tag];
    if (!mapped) continue;
    if (closing) {
      if (mapped === 'h2' || mapped === 'h3') heading = null;
      if (mapped !== 'br' && mapped !== 'hr') out.push('</' + mapped + '>');
      continue;
    }
    if (mapped === 'h2' || mapped === 'h3') {
      var id = 'sec-' + (toc.length + 1);
      heading = { id: id, level: mapped === 'h2' ? 2 : 3, text: '' };
      toc.push(heading);
      out.push('<' + mapped + ' id="' + id + '">');
      continue;
    }
    out.push('<' + mapped + '>');
  }
  var clean = out.join('')
    .replace(/<(b|i|u)><\/\1>/g, '')
    .replace(/<(p|li|h2|h3|h4|td)>(\s|&nbsp;)*<\/\1>/g, '')
    .replace(/<figure><img/g, '<figure><img');
  toc.forEach(function (t) { t.text = t.text.replace(/\s+/g, ' ').trim(); });
  return { html: clean, toc: toc.filter(function (t) { return t.text; }) };
}

/** 先頭のタイトルと「旧サイトから移行」の注記は画面側で出すので取り除く */
function stripManualPreamble_(result, title) {
  var html = result.html;
  var firstHeading = result.toc[0];
  if (firstHeading && firstHeading.text === title) {
    html = html.replace(new RegExp('<h2 id="' + firstHeading.id + '">[\\s\\S]*?</h2>'), '');
    result.toc.shift();
  }
  html = html.replace(/<p>[^<]*旧Googleサイト[^<]*<\/p>/, '');
  result.html = html;
  return result;
}

function docIdFromUrl_(url) {
  var m = String(url).match(/\/document\/d\/([\w-]+)/);
  return m ? m[1] : '';
}

function manualCacheFolder_() {
  var p = props_();
  var id = p.getProperty('MANUAL_CACHE_FOLDER_ID');
  if (id) return DriveApp.getFolderById(id);
  var folder = DriveApp.getFolderById(p.getProperty('ROOT_FOLDER_ID')).createFolder('_マニュアル表示キャッシュ（触らない）');
  p.setProperty('MANUAL_CACHE_FOLDER_ID', folder.getId());
  return folder;
}

/** マニュアル1件をウェブ表示用に返す。ドキュメント以外は html: null（画面側でプレビュー表示） */
function api_getManual(materialId) {
  var me = currentUser_();
  var m = readTable_(sheet_(SHEET.MATERIALS)).filter(function (x) { return String(x['ID']) === String(materialId); })[0];
  if (!m) throw new Error('マニュアルが見つかりません。');
  var base = { id: String(materialId), title: m['タイトル'], url: m['URL'], canEdit: isStaff_(me), html: null, toc: [] };
  var docId = docIdFromUrl_(m['URL']);
  if (!docId) return base;

  var file = DriveApp.getFileById(docId);
  var cacheName = docId + '_' + file.getLastUpdated().getTime() + '_' + MANUAL_RENDER_VERSION + '.json';
  var folder = manualCacheFolder_();
  var hit = folder.getFilesByName(cacheName);
  if (hit.hasNext()) {
    var cached = JSON.parse(hit.next().getBlob().getDataAsString('UTF-8'));
    return Object.assign(base, cached);
  }
  var res = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + docId + '/export?mimeType=text%2Fhtml', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('マニュアルを読み込めませんでした（' + res.getResponseCode() + '）');
  var built = stripManualPreamble_(sanitizeDocHtml_(res.getContentText('UTF-8')), m['タイトル']);
  var old = folder.searchFiles('title contains "' + docId + '_"');
  while (old.hasNext()) old.next().setTrashed(true);
  folder.createFile(cacheName, JSON.stringify(built), 'application/json');
  return Object.assign(base, built);
}
