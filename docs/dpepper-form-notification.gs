/**
 * Dペッパー 履歴共有 メール通知スクリプト
 *
 * Googleフォームの回答先スプレッドシートに紐づけて使います。
 * フォームに回答が届くたびに onFormSubmit が実行され、
 * SHOP_EMAIL 宛にメールを送信します。
 *
 * 設定手順: docs/dpepper-form-notification-setup.md を参照してください。
 */

// ─── 設定 ───────────────────────────────────────────────────
const SHOP_EMAIL = 'ここにお店用メールアドレスを入れる'; // 例: 'dais@example.com'
const MAIL_SUBJECT = '【Dペッパー】相談内容が共有されました';
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

    const consultDate   = isHistoryShare ? extractLine(consultText, '相談日時：') : '';
    const category      = isHistoryShare ? extractLine(consultText, 'カテゴリ：') : '';
    const group         = isHistoryShare ? extractLine(consultText, '分類：')     : '';
    const entryTitle    = isHistoryShare ? extractLine(consultText, '来店種別：') : '';
    const isFav         = isHistoryShare && consultText.includes('お気に入り：⭐️');
    const historyId     = isHistoryShare ? extractLine(consultText, '履歴ID：')   : '';
    const bodyText      = isHistoryShare ? extractBlock(consultText, '＝＝ご相談内容＝＝') : consultText;
    const nextAction    = isHistoryShare ? extractBlock(consultText, '＝＝次の案内＝＝')  : '';

    // ── テキスト本文 ────────────────────────────────────────
    const textLines = [
      '【Dペッパー履歴共有】',
      `送信日時：${submittedAt}`,
      consultDate ? `相談日時：${consultDate}` : '',
      '',
      category    ? `カテゴリ：${category}`   : '',
      group       ? `分類：${group}`           : '',
      entryTitle  ? `来店種別：${entryTitle}`  : '',
      isFav       ? 'お気に入り：⭐️'           : '',
      historyId   ? `履歴ID：${historyId}`     : '',
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
    const htmlLines = [
      '<div style="font-family:sans-serif;font-size:14px;line-height:1.8;color:#333;max-width:640px">',
      '<h2 style="font-size:16px;font-weight:bold;border-bottom:2px solid #b8955a;padding-bottom:6px;margin-bottom:16px">【Dペッパー履歴共有】</h2>',
      `<p style="font-size:12px;color:#888;margin-bottom:16px">送信日時：${submittedAt}</p>`,

      '<table style="border-collapse:collapse;width:100%;margin-bottom:20px">',
      makeTr('相談日時',  consultDate  || '&mdash;'),
      makeTr('カテゴリ',  category     || '&mdash;'),
      makeTr('分類',      group        || '&mdash;'),
      entryTitle  ? makeTr('来店種別',  entryTitle) : '',
      makeTr('お気に入り', isFav ? '⭐️ あり' : 'なし'),
      historyId   ? makeTr('履歴ID',    historyId)  : '',
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

    // ── 送信 ────────────────────────────────────────────────
    if (!SHOP_EMAIL || SHOP_EMAIL === 'ここにお店用メールアドレスを入れる') {
      console.error('[Dペッパー] SHOP_EMAIL が設定されていません。スクリプトを確認してください。');
      return;
    }

    MailApp.sendEmail({
      to:       SHOP_EMAIL,
      subject:  MAIL_SUBJECT,
      body:     textLines,
      htmlBody: htmlLines,
    });

    console.log('[Dペッパー] メール送信完了 → ' + SHOP_EMAIL);

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
