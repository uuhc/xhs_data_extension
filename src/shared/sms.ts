/** 从短信文本中提取 4-8 位验证码（兼容多种格式） */
export function extractSmsCode(text: string): string {
  if (!text) return '';
  const s = String(text);
  const patterns = [
    /验证码是[：:\s]*(\d{4,8})/,
    /您的验证码是[：:\s]*(\d{4,8})/,
    /验证码为[：:\s]*(\d{4,8})/,
    /您的验证码为[：:\s]*(\d{4,8})/,
    /验证码[：:]\s*(\d{4,8})/,
    /您的验证码[：:]\s*(\d{4,8})/,
    /code\s+is[:\s]*(\d{4,8})/i,
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m) return m[1];
  }
  return '';
}
