// 画像つき相談の送信容量テスト（2026-10 保守点検）
// 実行: node tests/image-budget.test.mjs
// ブラウザの画像変換は使わず、変換後の文字数を指定できる模擬エンコーダで「実測→再圧縮→停止」の判断を確認する。
// 実際のスマホ・実際の写真での容量は、プレビュー環境で別途確認すること。

import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const log = console.log;
console.log = console.warn = () => {};

const B = await import(path.join(root, "src/lib/imageBudget.js"));
const { buildDpepperPrompt } = await import(path.join(root, "src/lib/dpepperPrompt.js"));

const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);

// 段階ごとの変換後サイズ（文字数）を指定できる模擬エンコーダ
const fakeEncoder = (sizesByMax) => async (o, max) => ({ name: o.name, mimeType: "image/jpeg", data: "A".repeat(sizesByMax[o.name][max]) });
const imgs = (names) => names.map((name) => ({ name }));

// 参考値：Pillow でノイズ画像（最悪ケース）を変換した base64 文字数。ブラウザの変換結果とは一致しない
const worst = { 1280: 993_464, 1024: 598_008, 800: 327_848 };

// 1) 通常サイズは最初の設定のまま
{
  const sizes = { a: { 1280: 400_000, 1024: 250_000, 800: 150_000 } };
  const r = await B.encodeWithinBudget(imgs(["a"]), fakeEncoder(sizes));
  check("通常の写真1枚は最初の設定（1280px）で送る", r.step?.max === 1280 && !r.tooLarge, `合計 ${r.totalChars}`);
}
// 2) 最悪ケース3枚：1280px で約298万文字 → 上限390万以内
{
  const sizes = { a: worst, b: worst, c: worst };
  const r = await B.encodeWithinBudget(imgs(["a", "b", "c"]), fakeEncoder(sizes));
  check("参考最悪ケース3枚は 1280px で上限内", r.step?.max === 1280 && !r.tooLarge, `合計 ${r.totalChars}`);
}
// 3) 上限を超えると再圧縮に進む
{
  const big = { 1280: 1_500_000, 1024: 1_000_000, 800: 600_000 };
  const r = await B.encodeWithinBudget(imgs(["a", "b", "c"]), fakeEncoder({ a: big, b: big, c: big }));
  check("超える場合は 1024px に再圧縮", r.step?.max === 1024 && r.totalChars <= B.IMAGE_BUDGET_CHARS, `合計 ${r.totalChars}`);
}
// 4) どの段階でも超える場合は送らない
{
  const huge = { 1280: 3_000_000, 1024: 2_500_000, 800: 2_000_000 };
  const r = await B.encodeWithinBudget(imgs(["a", "b"]), fakeEncoder({ a: huge, b: huge }));
  check("最後の段階でも超える場合は送信しない（tooLarge）", r.tooLarge && r.images.length === 0);
}
// 4b) 合計は上限内でも、1枚が1枚あたりの上限を超えれば再圧縮に進む（サーバーと同じ条件）
{
  const sizes = { a: { 1280: 2_000_004, 1024: 1_200_000, 800: 700_000 } };
  const r = await B.encodeWithinBudget(imgs(["a"]), fakeEncoder(sizes));
  check("1枚 2,000,004文字は再圧縮して 1024px で送る", r.step?.max === 1024 && !r.tooLarge, `合計 ${r.totalChars}`);
}
// 4c) 上限値は画面側・サーバー側で同じファイルから読む
{
  const L = await import(path.join(root, "src/lib/limits.js"));
  check("画面側の上限は共通ファイルの値", B.MAX_IMAGE_B64_CHARS === L.MAX_IMAGE_B64_CHARS && B.IMAGE_BUDGET_CHARS === L.IMAGE_BUDGET_CHARS && B.REQUEST_LIMIT_BYTES === L.REQUEST_LIMIT_BYTES);
  check("送信全体の上限 < サーバー上限 < 4.5MB", L.REQUEST_LIMIT_BYTES < L.SERVER_MAX_BODY_BYTES && L.SERVER_MAX_BODY_BYTES < 4_500_000);
}
// 5) 画像なし
{
  const r = await B.encodeWithinBudget([], fakeEncoder({}));
  check("画像なしはそのまま", !r.tooLarge && r.images.length === 0);
}

// 6) 送信データ全体：最長クラスの指示文 + 画像上限ぎりぎり でも全体の上限内か
{
  const longText = "カラー 色持ち 寝癖 湿気 白髪 頭皮 ".repeat(5) + "あ".repeat(2000);
  const prompt = buildDpepperPrompt({ text: longText, category: "カラー相談", group: "頭皮・ケア・デザイン・カラー", summary: "s", guidance: "g", entryTitle: "初めての方", isContinuing: true, hasImages: true });
  const per = Math.floor(B.IMAGE_BUDGET_CHARS / 3);
  const images = [0, 1, 2].map((i) => ({ name: `photo-${i}.jpg`, mimeType: "image/jpeg", data: "A".repeat(per) }));
  const bytes = B.bodyByteLength({ prompt, urls: ["https://beauty.hotpepper.jp/x", "https://example.jp/y", "https://example.jp/z"], images, mode: "customer" });
  check("最長の指示文 + 画像上限ぎりぎり3枚 の送信データが全体上限内", bytes <= B.REQUEST_LIMIT_BYTES, `${bytes} bytes ≦ ${B.REQUEST_LIMIT_BYTES}`);
}

// 7) クライアント側の最終確認：上限を超える送信は fetch を呼ばずに止める
{
  let fetched = 0;
  globalThis.fetch = async () => { fetched++; return new Response("{}", { status: 200 }); };
  const { askGemini } = await import(path.join(root, "src/lib/geminiClient.js"));
  let code = null;
  try {
    await askGemini("p", [], [{ name: "x", mimeType: "image/jpeg", data: "A".repeat(B.REQUEST_LIMIT_BYTES) }]);
  } catch (e) { code = e.code; }
  check("上限超えは送信せず PAYLOAD_TOO_LARGE", code === B.PAYLOAD_TOO_LARGE && fetched === 0);

  globalThis.fetch = async () => new Response("{}", { status: 413 });
  code = null;
  try { await askGemini("p", [], []); } catch (e) { code = e.code; }
  check("サーバーが413を返した場合も PAYLOAD_TOO_LARGE", code === B.PAYLOAD_TOO_LARGE);
}

console.log = log;
console.log(results.join("\n"));
const failed = results.filter((x) => x.startsWith("FAIL")).length;
console.log(`\n合計 ${results.length} 項目 / 失敗 ${failed}`);
process.exit(failed ? 1 : 0);
