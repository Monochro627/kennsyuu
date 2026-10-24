/*
 * 研修アプリの設定ファイル
 * ここを書き換えるだけで、ステップ・資料・チャットのリンクを変更できます。
 * （プログラムの知識は不要です。「' '」の中身を差し替えてください）
 */
window.TRAINING_DATA = {
  title: '新人営業研修',
  subtitle: '研修生 → ルームアドバイザー 卒業ロードマップ',

  // ③ NotebookLM の共有リンク（NotebookLM右上「共有」→リンクをコピー）
  notebookLmUrl: 'https://notebooklm.google.com/',

  chatExamples: [
    '重要事項説明で必ず伝えることは？',
    '初回来店時のヒアリング項目を教えて',
    '申込から契約までの流れは？',
    '反響メールへの返信テンプレートは？',
  ],

  // ① 卒業までのステップ（※サンプルです。実際の研修内容に合わせて編集してください）
  steps: [
    {
      id: 'step1',
      title: '入社オリエンテーション',
      role: '研修生',
      description: '会社の理念・ルール・ツールの使い方を理解する。',
      tasks: ['会社理念・行動指針の理解', 'ビジネスマナー研修', '社内ツール（メール・チャット・基幹システム）の設定'],
    },
    {
      id: 'step2',
      title: '不動産の基礎知識',
      role: '研修生',
      description: '賃貸仲介に必要な用語・法律・商慣習を学ぶ。',
      tasks: ['不動産用語テスト合格', '宅建業法の基礎', '賃貸借契約の流れを説明できる'],
    },
    {
      id: 'step3',
      title: '物件確認・現地同行',
      role: '研修生',
      description: '先輩の案内に同行し、物件の見方と案内の流れを掴む。',
      tasks: ['担当エリアの主要物件を把握', '先輩の内見案内に3回同行', '物件確認の電話対応'],
    },
    {
      id: 'step4',
      title: '接客ロールプレイング',
      role: 'ジュニア',
      description: 'ヒアリング〜提案〜クロージングをロープレで練習する。',
      tasks: ['ヒアリングロープレ合格', '物件提案ロープレ合格', 'クロージングロープレ合格'],
    },
    {
      id: 'step5',
      title: '反響対応デビュー',
      role: 'ジュニア',
      description: 'メール・電話の反響対応を一人で行う。',
      tasks: ['反響メール返信（先輩チェック付き）', '来店アポ獲得', '一人で内見案内'],
    },
    {
      id: 'step6',
      title: '申込・契約業務',
      role: 'ジュニア',
      description: '申込受付から契約・鍵渡しまでを一通り担当する。',
      tasks: ['申込書・審査書類の作成', '重要事項説明の補助', '初回成約'],
    },
    {
      id: 'step7',
      title: '卒業テスト',
      role: 'ルームアドバイザー',
      description: '筆記・ロープレ・上長面談に合格して卒業！',
      tasks: ['筆記テスト合格', '総合ロープレ合格', '上長面談'],
    },
  ],

  /*
   * ② 資料・動画
   *   type:
   *     'youtube' … YouTube動画（限定公開でもOK）
   *     'drive'   … Googleドライブのファイル（PDF・スライド・動画など）
   *     'link'    … Googleサイトなど、別タブで開くページ
   *   step: 関連するステップのid（なければ省略）
   */
  materials: [
    { title: '研修ポータル（Googleサイト）', type: 'link', url: 'https://sites.google.com/', note: '既存の研修サイト' },
    { title: '会社案内・行動指針', type: 'drive', url: 'https://drive.google.com/file/d/XXXXXXXX/view', step: 'step1' },
    { title: '不動産用語集', type: 'drive', url: 'https://drive.google.com/file/d/XXXXXXXX/view', step: 'step2' },
    { title: '内見案内の流れ（動画）', type: 'youtube', url: 'https://www.youtube.com/watch?v=XXXXXXXXXXX', step: 'step3' },
    { title: '接客ロープレ見本（動画）', type: 'youtube', url: 'https://www.youtube.com/watch?v=XXXXXXXXXXX', step: 'step4' },
    { title: '反響メールテンプレート', type: 'drive', url: 'https://docs.google.com/document/d/XXXXXXXX/edit', step: 'step5' },
  ],
};
