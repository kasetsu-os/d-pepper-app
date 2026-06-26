/**
 * Dペッパー 履歴共有 メール通知スクリプト
 *
 * Googleフォームの回答先スプレッドシートに紐づけて使います。
 * フォームに回答が届くたびに onFormSubmit が実行され、
 * SHOP_EMAIL 宛にメールを送信します。
 *
 * 返信希望・返信不要に関わらず、すべての回答を店舗へ通知します。
 * 「返信不要」はお客様への返信が不要という意味であり、
 * 店舗への通知を止める条件ではありません。
 *
 * 設定手順: docs/dpepper-form-notification-setup.md を参照してください。
 */

// ─── 設定 ───────────────────────────────────────────────────
const SHOP_EMAIL = 'dais20101119@gmail.com';
const MAIL_SUBJECT_BASE = '【Dペッパー】相談内容が共有されました';
// ─────────────────────────────────────────────────────────────


/**
 * Googleフォームの複数の候補名でフィールド値を取得するヘルパー。
 * どの名前でも取れない場合は空文字を返す。
 *
 * @param {Object} namedValues  e.namedValues (フィールド名 → [値] の辞書)
 * @param {string[]} candidates 候補フィールド名の配列（先頭から優先）
 * @returns {string}
 */
function getValue(namedValues, candidates) {
  for (const name of candidates) {
    const val = namedValues[name];
    if (val && val[0] && val[0].trim() !== '') {
      return val[0].trim();
    }
  }
  return '';
}


/**
 * 改行を HTML <br> に変換する。
 * @param {string} text
 * @returns {string}
 */
function nl2br(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}


/**
 * フォーム送信トリガー。
 * スプレッドシートの「トリガー」画面で
 *   関数: onFormSubmit
 *   イベントの種類: フォーム送信時
 * に設定してください。
 *
 * 返信希望・返信不要に関わらず、必ず店舗メールへ通知します。
 *
 * @param {GoogleAppsScript.Events.SheetsOnFormSubmit} e
 */
function onFormSubmit(e) {
  try {
    const namedValues = e.namedValues || {};
    const submittedAt = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

    // ── フィールド取得（複数候補名に対応）─────────────────────
    const consultText = getValue(namedValues, [
      'ご相談内容', '相談内容', '相談文', 'ご相談文',
      'consultation', 'text',
    ]);
    const aiResponseText = getValue(namedValues, [
      'Dペッパーの返答・メモ', 'Dペッパーの返答', 'AIの返答', 'AI返答',
      'response', 'ai_response',
    ]);
    const attachInfo = getValue(namedValues, [
      '添付情報', '添付', 'attach', '添付画像',
    ]);

    // 返信希望・返信不要フィールド（値がなければ「記録なし」として扱う）
    const replyField = getValue(namedValues, [
      '返信', '返信希望', '返信を希望しますか', 'お返事',
      '返信の希望', 'reply', 'reply_request',
    ]);
    // 「返信希望」を含む場合は希望あり、「不要」「しない」等を含む場合は不要とみなす
    const wantsReply = replyField.includes('希望') || replyField === 'はい' || replyField === 'Yes';
    const noReply    = replyField.includes('不要') || replyField.includes('しない') || replyField === 'いいえ' || replyField === 'No';
    // 件名サフィックス（返信希望の場合のみ付加。不要または未記入はサフィックスなし）
    const subjectSuffix = wantsReply ? '【返信希望】' : (noReply ? '【返信不要】' : '');

    // お客様のメールアドレス（返信希望時に表示）
    const customerEmail = getValue(namedValues, [
      'メールアドレス', 'email', 'メール', 'Email',
      'お客様メールアドレス', '返信先メールアドレス', '連絡先メールアドレス',
    ]);

    // ── consultText の構造から各フィールドを抽出 ─────────────
    // /api/share-history が送る形式:
    //   【Dペッパー履歴共有】
    //   相談日時：...
    //   カテゴリ：...
    //   分類：...
    //   来店種別：...（省略あり）
    //   お気に入り：⭐️（省略あり）
    //   履歴ID：...
    //
    //   ＝＝ご相談内容＝＝
    //   ...
    //   ＝＝次の案内＝＝（省略あり）
    //   ...
    const isHistoryShare = consultText.startsWith('【Dペッパー履歴共有】');

    function extractLine(text, prefix) {
      const line = text.split('\n').find(l => l.startsWith(prefix));
      return line ? line.slice(prefix.length).trim() : '';
    }

    function extractBlock(text, header) {
      const idx = text.indexOf(header);
      if (idx === -1) return '';
      const after = text.slice(idx + header.length);
      const nextHeader = after.indexOf('＝＝');
      return (nextHeader === -1 ? after : after.slice(0, nextHeader)).trim();
    }

    const consultDate = isHistoryShare ? extractLine(consultText, '相談日時：') : '';
    const category    = isHistoryShare ? extractLine(consultText, 'カテゴリ：') : '';
    const group       = isHistoryShare ? extractLine(consultText, '分類：')     : '';
    const entryTitle  = isHistoryShare ? extractLine(consultText, '来店種別：') : '';
    const isFav       = isHistoryShare && consultText.includes('お気に入り：⭐️');
    const historyId   = isHistoryShare ? extractLine(consultText, '履歴ID：')   : '';
    const bodyText    = isHistoryShare ? extractBlock(consultText, '＝＝ご相談内容＝＝') : consultText;
    const nextAction  = isHistoryShare ? extractBlock(consultText, '＝＝次の案内＝＝')  : '';

    // ── 件名 ────────────────────────────────────────────────
    const subject = MAIL_SUBJECT_BASE + (subjectSuffix ? ' ' + subjectSuffix : '');

    // ── テキスト本文 ────────────────────────────────────────
    const replyLine = replyField
      ? `返信希望：${replyField}`
      : '返信希望：(フォームに記録なし)';
    const customerEmailLine = wantsReply && customerEmail
      ? `返信先メール：${customerEmail}`
      : (wantsReply ? '返信先メール：(記録なし・フォームで確認してください)' : '');

    const textLines = [
      '【Dペッパー履歴共有】',
      `送信日時：${submittedAt}`,
      consultDate ? `相談日時：${consultDate}` : '',
      '',
      replyLine,
      customerEmailLine,
      '',
      category   ? `カテゴリ：${category}`   : '',
      group      ? `分類：${group}`           : '',
      entryTitle ? `来店種別：${entryTitle}`  : '',
      isFav      ? 'お気に入り：⭐️'           : '',
      historyId  ? `履歴ID：${historyId}`     : '',
      '',
      '── ご相談内容 ──────────────────────',
      bodyText || '(記録なし)',
      '',
      '── Dペッパーの返答・メモ ─────────',
      aiResponseText || '(この相談は詳細保存前の履歴のため、Dペッパーの返答本文は残っていません。)',
      '',
      nextAction ? '── 次の案内 ─────────────────────' : '',
      nextAction || '',
      attachInfo ? `\n添付情報：${attachInfo}` : '',
    ].filter(l => l !== '').join('\n');

    // ── HTML 本文 ───────────────────────────────────────────
    const replyBadgeColor = wantsReply ? '#c0392b' : (noReply ? '#888' : '#888');
    const replyBadgeText  = wantsReply ? '返信希望' : (noReply ? '返信不要' : '返信希望の有無：記録なし');
    const replyBadgeHtml  = `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:bold;color:#fff;background:${replyBadgeColor};margin-left:8px">${replyBadgeText}</span>`;

    const htmlLines = [
      '<div style="font-family:sans-serif;font-size:14px;line-height:1.8;color:#333;max-width:640px">',
      `<h2 style="font-size:16px;font-weight:bold;border-bottom:2px solid #b8955a;padding-bottom:6px;margin-bottom:16px">【Dペッパー履歴共有】${replyBadgeHtml}</h2>`,
      `<p style="font-size:12px;color:#888;margin-bottom:16px">送信日時：${submittedAt}</p>`,

      '<table style="border-collapse:collapse;width:100%;margin-bottom:20px">',
      makeTr('返信希望', replyField || '(記録なし)'),
      wantsReply ? makeTr('返信先メール', customerEmail || '<span style="color:#c0392b">記録なし・フォームで確認してください</span>') : '',
      makeTr('相談日時',  consultDate  || '&mdash;'),
      makeTr('カテゴリ',  category     || '&mdash;'),
      makeTr('分類',      group        || '&mdash;'),
      entryTitle  ? makeTr('来店種別', entryTitle) : '',
      makeTr('お気に入り', isFav ? '⭐️ あり' : 'なし'),
      historyId   ? makeTr('履歴ID',   historyId) : '',
      '</table>',

      '<h3 style="font-size:14px;font-weight:bold;margin-bottom:6px;color:#6b4a1b">ご相談内容</h3>',
      `<div style="background:#faf7f3;border:1px solid #e8dcc8;border-radius:6px;padding:12px 14px;margin-bottom:20px;white-space:pre-wrap">${nl2br(bodyText) || '(記録なし)'}</div>`,

      '<h3 style="font-size:14px;font-weight:bold;margin-bottom:6px;color:#6b4a1b">Dペッパーの返答・メモ</h3>',
      `<div style="background:#faf7f3;border:1px solid #e8dcc8;border-radius:6px;padding:12px 14px;margin-bottom:20px;white-space:pre-wrap">${nl2br(aiResponseText) || '<em style="color:#999">この相談は詳細保存前の履歴のため、Dペッパーの返答本文は残っていません。</em>'}</div>`,

      nextAction ? '<h3 style="font-size:14px;font-weight:bold;margin-bottom:6px;color:#6b4a1b">次の案内</h3>' : '',
      nextAction ? `<div style="background:#faf7f3;border:1px solid #e8dcc8;border-radius:6px;padding:12px 14px;margin-bottom:20px;white-space:pre-wrap">${nl2br(nextAction)}</div>` : '',

      attachInfo ? `<p style="font-size:12px;color:#888">添付情報：${attachInfo}</p>` : '',
      '</div>',
    ].filter(l => l !== '').join('\n');

    // ── 送信（返信希望・返信不要に関わらず必ず送信）────────
    if (!SHOP_EMAIL || SHOP_EMAIL === 'ここにお店用メールアドレスを入れる') {
      console.error('[Dペッパー] SHOP_EMAIL が設定されていません。スクリプトを確認してください。');
      return;
    }

    MailApp.sendEmail({
      to:       SHOP_EMAIL,
      subject:  subject,
      body:     textLines,
      htmlBody: htmlLines,
    });

    console.log('[Dペッパー] メール送信完了 → ' + SHOP_EMAIL + ' | 返信希望: ' + (replyField || '記録なし'));

  } catch (err) {
    console.error('[Dペッパー] onFormSubmit エラー: ' + err.message);
    // エラーが起きてもスクリプト全体は止めない
  }
}


/**
 * HTMLテーブル行を生成するヘルパー。
 * @param {string} label
 * @param {string} value
 * @returns {string}
 */
function makeTr(label, value) {
  return [
    '<tr>',
    `<td style="padding:5px 10px;font-weight:bold;color:#6b4a1b;white-space:nowrap;vertical-align:top;border-bottom:1px solid #e8dcc8;font-size:13px">${label}</td>`,
    `<td style="padding:5px 10px;border-bottom:1px solid #e8dcc8;font-size:13px">${value}</td>`,
    '</tr>',
  ].join('');
}


/**
 * テスト用関数。
 * Apps Scriptエディタの「実行」ボタンから手動で実行してください。
 * 実際のフォーム送信なしで onFormSubmit の動作を確認できます。
 *
 * 実行後、SHOP_EMAIL 宛にテストメールが届けば正常動作しています。
 */
function testOnFormSubmit() {
  const fakeEvent = {
    namedValues: {
      'ご相談内容': [
        '【Dペッパー履歴共有】\n相談日時：2026/06/26 14:30\nカテゴリ：カラー相談\n分類：ケア\nお気に入り：⭐️\n履歴ID：1719370200000\n\n＝＝ご相談内容＝＝\n最近カラーをしたのですが、色の落ちが早い気がします。ホームケアで改善できますか？\n\n＝＝次の案内＝＝\n色持ちには、カラーシャンプーと洗い流さないトリートメントの組み合わせが効果的です。',
      ],
      'Dペッパーの返答・メモ': [
        '色落ちが気になる場合、まず洗い方を見直すことが効果的です。お湯の温度を38度以下にし、洗浄力の強いシャンプーを避けることで色持ちが改善されます。',
      ],
      '返信': ['返信不要'],
      '添付情報': ['履歴共有'],
    },
  };

  console.log('[Dペッパー] testOnFormSubmit 開始（返信不要テスト）');
  onFormSubmit(fakeEvent);
  console.log('[Dペッパー] testOnFormSubmit 完了');
}


/**
 * 返信希望パターンのテスト用関数。
 */
function testOnFormSubmitWithReply() {
  const fakeEvent = {
    namedValues: {
      'ご相談内容': [
        '【Dペッパー履歴共有】\n相談日時：2026/06/26 15:00\nカテゴリ：頭皮相談\n分類：頭皮\n履歴ID：1719372000000\n\n＝＝ご相談内容＝＝\n頭皮がかゆくてフケが出やすいです。シャンプーを変えた方がいいでしょうか。',
      ],
      'Dペッパーの返答・メモ': [
        '頭皮のかゆみやフケには、頭皮の状態を整えるシャンプー選びが重要です。',
      ],
      '返信': ['返信希望'],
      'メールアドレス': ['test-customer@example.com'],
      '添付情報': ['履歴共有'],
    },
  };

  console.log('[Dペッパー] testOnFormSubmitWithReply 開始（返信希望テスト）');
  onFormSubmit(fakeEvent);
  console.log('[Dペッパー] testOnFormSubmitWithReply 完了');
}
