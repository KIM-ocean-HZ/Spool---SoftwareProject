/**
 * 健壮的 JSON 解析：处理 markdown 代码块、前缀 "json"、尾逗号、单引号字符串、
 * 字符串里未转义的换行等。Plan §12.4 要求。
 */

// 单次扫描修复字符串字面量：把单引号定界符改成双引号、转义字符串内的字面控制字符。
// 模型偶尔会用单引号包裹键/值,或在字符串里直接打回车——两者都让 JSON.parse 失败。
const sanitizeStrings = (s: string): string => {
  let out = '';
  let inStr = false;
  let quote = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (inStr) {
      if (c === '\\') {
        const next = s[i + 1];
        if (next === undefined) {
          out += '\\\\';
        } else if (quote === "'" && next === "'") {
          // \' 在单引号串里是字面单引号；双引号串里无需转义
          out += "'";
          i++;
        } else {
          out += c + next;
          i++;
        }
        continue;
      }
      if (c === quote) {
        inStr = false;
        out += '"';
        continue;
      }
      if (c === '"') {
        // 单引号串里的字面双引号必须转义
        out += '\\"';
        continue;
      }
      if (c === '\n') out += '\\n';
      else if (c === '\r') out += '\\r';
      else if (c === '\t') out += '\\t';
      else out += c;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      quote = c;
      out += '"';
      continue;
    }
    out += c;
  }
  return out;
};

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

  // 单引号定界符 → 双引号；转义字符串内未转义的换行/制表符
  s = sanitizeStrings(s);

  // 去掉对象/数组末尾的多余逗号
  s = s.replace(/,(\s*[}\]])/g, '$1');

  try {
    return JSON.parse(s) as T;
  } catch (e) {
    throw new Error(`parseJson failed: ${(e as Error).message}\n--- raw ---\n${raw.slice(0, 400)}`);
  }
};
