/**
 * 旧Googleサイト（Monochro Training Program 社内サイト）の取り込み。
 * setup() から一度だけ呼ばれ、e-ラーニング動画の一覧と、マニュアルページの
 * Googleドキュメント化を行う。サイトが「ウェブ上で一般公開」の間に実行すること。
 */

var SITE_BASE = 'https://sites.google.com';
var SITE_ROOT = '/monochro-inc.com/monochro-e';

// e-ラーニングの並び順と必須区分（★①〜⑥が必須）
var ELEARNING_SECTIONS = {
  '★①はじめに': { no: 1, required: true },
  '★②集客活動編': { no: 2, required: true },
  '★③マイストーリー編': { no: 3, required: true },
  '★④営業実務フロー編': { no: 4, required: true },
  '★⑤賃貸営業の考え方': { no: 5, required: true },
  '★⑥専門知識編': { no: 6, required: true },
  '⑦契約手続き編': { no: 7, required: false },
  '⑧業務ツール使い方編': { no: 8, required: false },
  '⑨アポ応用編': { no: 9, required: false },
  '⑩営業力向上編': { no: 10, required: false },
  '⑪紹介営業に必要なスキル': { no: 11, required: false },
  '⑫マネーリテラシー・税金': { no: 12, required: false },
  '⑬マネージャー昇格編': { no: 13, required: false },
  '⑭メンバーお勧め動画編': { no: 14, required: false }
};

// 動画ごとの見出しがなく、グループ見出しの下に動画が並ぶページ
var GROUPED_SECTIONS = ['⑨アポ応用編', '⑩営業力向上編', '⑪紹介営業に必要なスキル', '⑫マネーリテラシー・税金', '⑬マネージャー昇格編'];

var SKIP_TEXT = ['※必須', '動画視聴後回答フォーム', 'Report abuse', 'Page details', 'Page updated', 'テキストはこちら'];

function decodeEntities_(s) {
  return String(s)
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); })
    .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); })
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

function escapeHtml_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function stripScripts_(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
}

function pageTitle_(html) {
  var m = html.match(/<title>([^<]*)/);
  if (!m) return '';
  var parts = decodeEntities_(m[1]).split(' - ');
  return parts[parts.length - 1].trim();
}

/** トップページのナビゲーションから全ページのパスを集める */
function listSitePaths_(topHtml) {
  var re = /href="(\/monochro-inc\.com\/monochro-e[^"#?]*)"/g;
  var seen = {};
  var out = [];
  var m;
  while ((m = re.exec(topHtml)) !== null) {
    var p = decodeEntities_(m[1]);
    if (!seen[p]) { seen[p] = true; out.push(p); }
  }
  return out;
}

/** 本文部分（最初の <h1> 以降、フッター手前）を返す */
function mainContent_(html) {
  var body = stripScripts_(html);
  var i = body.indexOf('<h1');
  if (i >= 0) body = body.slice(i);
  var end = body.indexOf('Report abuse');
  if (end > 0) body = body.slice(0, body.lastIndexOf('<', end));
  return body;
}

/** 本文を [種類, 値] のトークン列にする。Y=YouTube ID, H=見出し, T=テキスト */
function tokenize_(main) {
  var re = /(youtube\.com\/embed\/[\w-]{11})|<(h[1-6])[\s>]|>([^<>]+)</g;
  var toks = [];
  var m;
  while ((m = re.exec(main)) !== null) {
    if (m[1]) toks.push(['Y', m[1].slice(-11)]);
    else if (m[2]) toks.push(['H', m[2]]);
    else {
      var s = decodeEntities_(m[3]).trim();
      if (s) toks.push(['T', s]);
    }
  }
  return toks;
}

/**
 * e-ラーニングページから動画を抜き出す。
 * サイトの構造は「動画 → 見出し（タイトル）→ 訂正箇所などの補足」の順。
 * グループ型のページは「グループ見出し → 動画が複数」の順。
 */
function parseElearningVideos_(section, html) {
  var toks = tokenize_(mainContent_(html));
  var seen = {};
  var items = [];
  if (GROUPED_SECTIONS.indexOf(section) >= 0) {
    var group = section;
    var prevH = false;
    toks.forEach(function (t) {
      if (t[0] === 'H') { prevH = true; return; }
      if (t[0] === 'T' && prevH) group = t[1];
      prevH = false;
      if (t[0] === 'Y' && !seen[t[1]]) {
        seen[t[1]] = true;
        items.push({ title: group, yt: t[1], note: '' });
      }
    });
    var count = {};
    items.forEach(function (it) { count[it.title] = (count[it.title] || 0) + 1; });
    var seq = {};
    items.forEach(function (it) {
      if (count[it.title] > 1) {
        seq[it.title] = (seq[it.title] || 0) + 1;
        it.title = it.title + '（' + seq[it.title] + '）';
      }
    });
    return items;
  }
  for (var i = 0; i < toks.length; i++) {
    if (toks[i][0] !== 'Y' || seen[toks[i][1]]) continue;
    var yt = toks[i][1];
    seen[yt] = true;
    var j = i + 1;
    while (j < toks.length && toks[j][0] !== 'H') j++;
    j++;
    var title = [];
    var notes = [];
    var state = 'title';
    for (; j < toks.length && toks[j][0] !== 'Y'; j++) {
      var k = toks[j][0];
      var v = toks[j][1];
      if (state === 'done') continue;
      if (k === 'H') {
        if (title.length) state = 'notes';
      } else if (v === '動画視聴後回答フォーム') {
        state = 'done';
      } else if (SKIP_TEXT.indexOf(v) >= 0 || v === '訂正箇所' || v.indexOf('撮影時から') === 0) {
        state = 'notes';
      } else if (state === 'title' && title.length < 3 && v.length < 30) {
        title.push(v);
      } else {
        notes.push(v);
      }
    }
    items.push({
      title: title.join('').replace(/★/g, '').replace(/^「/, ''),
      yt: yt,
      note: notes.join(' ').slice(0, 500)
    });
  }
  // 「〇〇の使い方・説明・説明」のように箇条書きが見出しに連結された場合は最初だけ残す
  items.forEach(function (it) {
    var cut = it.title.indexOf('・', 1);
    if (cut > 0 && /の使い方/.test(it.title.slice(0, cut))) {
      it.note = (it.title.slice(cut) + ' ' + it.note).trim();
      it.title = it.title.slice(0, cut);
    }
  });
  return items;
}

var KEEP_TAGS = { h1: 'h2', h2: 'h2', h3: 'h3', h4: 'h3', p: 'p', li: 'li', ul: 'ul', ol: 'ol',
  b: 'b', strong: 'b', table: 'table', tr: 'tr', td: 'td', th: 'td' };

function attr_(attrs, name) {
  var m = attrs.match(new RegExp('\\s' + name + '="([^"]*)"'));
  return m ? decodeEntities_(m[1]) : '';
}

/** Sites の本文HTMLを、Googleドキュメントに変換できる素直なHTMLにする */
function cleanManualHtml_(html) {
  var main = mainContent_(html);
  var re = /<(\/?)([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  var out = [];
  var linkStack = [];
  var seenVideo = {};
  var m;
  while ((m = re.exec(main)) !== null) {
    if (m[4] !== undefined) {
      var text = m[4];
      if (text.trim()) out.push(escapeHtml_(decodeEntities_(text)));
      continue;
    }
    var closing = m[1] === '/';
    var tag = m[2].toLowerCase();
    var attrs = m[3] || '';
    if (tag === 'a') {
      if (closing) {
        if (linkStack.pop()) out.push('</a>');
      } else {
        var href = attr_(attrs, 'href');
        var real = href.match(/^https:\/\/www\.google\.com\/url\?q=([^&]+)/);
        if (real) href = decodeURIComponent(real[1]);
        if (/^https?:\/\//.test(href)) { out.push('<a href="' + escapeHtml_(href) + '">'); linkStack.push(true); }
        else linkStack.push(false);
      }
      continue;
    }
    if (closing) {
      if (KEEP_TAGS[tag]) out.push('</' + KEEP_TAGS[tag] + '>');
      continue;
    }
    if (tag === 'img') {
      var src = attr_(attrs, 'src');
      if (/sitesv-images|googleusercontent/.test(src) && !/aria-label="Site home"/.test(attrs)) {
        out.push('<p><img src="' + escapeHtml_(src) + '" width="600"></p>');
      }
      continue;
    }
    var yt = attrs.match(/youtube\.com\/embed\/([\w-]{11})/);
    if (yt && !seenVideo[yt[1]]) {
      seenVideo[yt[1]] = true;
      out.push('<p>▶ 動画：<a href="https://youtu.be/' + yt[1] + '">https://youtu.be/' + yt[1] + '</a></p>');
      continue;
    }
    if (tag === 'iframe') {
      var isrc = attr_(attrs, 'src') || attr_(attrs, 'data-src');
      if (/^https:\/\/(docs|drive)\.google\.com\//.test(isrc)) {
        out.push('<p>埋め込み資料：<a href="' + escapeHtml_(isrc) + '">' + escapeHtml_(isrc) + '</a></p>');
      }
      continue;
    }
    if (KEEP_TAGS[tag]) out.push('<' + KEEP_TAGS[tag] + '>');
  }
  var body = out.join('')
    .replace(/<a href="[^"]*"><\/a>/g, '')
    .replace(/<(p|li|h2|h3|b|td)>\s*<\/\1>/g, '');
  return body;
}

/** 既存のドキュメント／スプレッドを埋め込んでいるだけのページなら、そのファイルのURLを返す */
function wrappedFileUrl_(html) {
  var main = mainContent_(html);
  var text = main.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  if (text.length > 400 || /youtube\.com\/embed\//.test(main)) return '';
  var m = main.match(/https:\/\/docs\.google\.com\/(document|spreadsheets)\/d\/([\w-]+)/);
  if (!m) return '';
  return 'https://docs.google.com/' + m[1] + '/d/' + m[2] + '/edit';
}

/** 途中で止まって再実行したときに、同じマニュアルを二重に作らないための確認 */
function existingDocId_(folderId, title) {
  var it = DriveApp.getFolderById(folderId).getFilesByName(title);
  while (it.hasNext()) {
    var f = it.next();
    if (f.getMimeType() === MimeType.GOOGLE_DOCS && !f.isTrashed()) return f.getId();
  }
  return '';
}

function fetchSitePage_(path) {
  var url = SITE_BASE + encodeURI(path);
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() !== 200) {
    throw new Error('サイトを読み込めませんでした（' + res.getResponseCode() + '）: ' + path +
      '\nサイトの公開範囲を「ウェブ上で一般公開」にしてから、もう一度 setup を実行してください。');
  }
  var html = res.getContentText('UTF-8');
  if (html.indexOf('accounts.google.com') >= 0 && html.indexOf('<h1') < 0) {
    throw new Error('サイトがログインを求めています。公開範囲を「ウェブ上で一般公開」にしてから実行してください。');
  }
  return html;
}

/**
 * サイト全体を取り込み、資料マスターの行（配列）を返す。
 * マニュアルは manualFolderId にGoogleドキュメントとして作成する。
 */
function importSite_(manualFolderId) {
  var top = fetchSitePage_(SITE_ROOT);
  var paths = listSitePaths_(top);
  var videos = [];
  var manuals = [];
  paths.forEach(function (path) {
    var isElearning = path.indexOf('e-ラーニング') >= 0 || path.indexOf('アポ応用編') >= 0;
    var isManual = path.indexOf('マニュアル一覧') >= 0 || path.indexOf('ルームアドバイザー昇格まで') >= 0;
    if (!isElearning && !isManual) return;
    var html = fetchSitePage_(path);
    var title = pageTitle_(html);
    if (isElearning && ELEARNING_SECTIONS[title]) {
      parseElearningVideos_(title, html).forEach(function (v) {
        videos.push({ section: title, no: ELEARNING_SECTIONS[title].no, required: ELEARNING_SECTIONS[title].required, item: v });
      });
    } else if (isManual) {
      manuals.push({ title: title, html: html });
    }
  });

  var rows = [];
  videos.sort(function (a, b) { return a.no - b.no; });
  videos.forEach(function (v, i) {
    rows.push(['VID-' + ('00' + (i + 1)).slice(-3), 'eラーニング', v.section, v.item.title, '動画',
      'https://youtu.be/' + v.item.yt, v.required ? '必須' : '任意', v.item.note, '', i + 1]);
  });

  manuals.forEach(function (m, i) {
    var id = 'MAN-' + ('0' + (i + 1)).slice(-2);
    var wrapped = wrappedFileUrl_(m.html);
    var url;
    var kind;
    if (wrapped) {
      url = wrapped;
      kind = wrapped.indexOf('/spreadsheets/') >= 0 ? 'スプレッド' : 'ドキュメント';
    } else if (existingDocId_(manualFolderId, m.title)) {
      url = 'https://docs.google.com/document/d/' + existingDocId_(manualFolderId, m.title) + '/edit';
      kind = 'ドキュメント';
    } else {
      var doc = '<html><head><meta charset="utf-8"></head><body><h1>' + escapeHtml_(m.title) + '</h1>' +
        '<p>※旧Googleサイト「Monochro Training Program 社内サイト」から移行。社外秘。</p>' +
        cleanManualHtml_(m.html) + '</body></html>';
      var file = Drive.Files.create(
        { name: m.title, mimeType: MimeType.GOOGLE_DOCS, parents: [manualFolderId] },
        Utilities.newBlob(doc, 'text/html', m.title + '.html'));
      url = 'https://docs.google.com/document/d/' + file.id + '/edit';
      kind = 'ドキュメント';
    }
    rows.push([id, 'マニュアル', 'マニュアル', m.title, kind, url, '', '', '', 1000 + i]);
  });
  return rows;
}
