/**
 * 健壮的 JSON 解析：处理 markdown 代码块、前缀 "json"、尾逗号等。
 * Plan §3 / §7.5 要求。
 */
export const parseJson = <T = unknown>(raw: string): T => {
  let s = raw.trim();

  // 去 ```json … ``` 或 ``` … ```
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json|JSON)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  // 模型有时会在前面 echo 一句 "json"
  s = s.replace(/^json\s*\n/i, '').trim();

  // 截取第一个 { 或 [ 到对应的 } 或 ]
  const firstBrace = Math.min(
    ...['{', '['].map((c) => {
      const i = s.indexOf(c);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    }),
  );
  if (firstBrace > 0 && firstBrace !== Number.MAX_SAFE_INTEGER) {
    s = s.slice(firstBrace);
  }
  const lastBrace = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (lastBrace !== -1 && lastBrace < s.length - 1) {
    s = s.slice(0, lastBrace + 1);
  }

  // 去掉对象/数组末尾的多余逗号
  s = s.replace(/,(\s*[}\]])/g, '$1');

  try {
    return JSON.parse(s) as T;
  } catch (e) {
    throw new Error(`parseJson failed: ${(e as Error).message}\n--- raw ---\n${raw.slice(0, 400)}`);
  }
};
