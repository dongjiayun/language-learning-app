/**
 * 文本归一化工具
 * 用于答案校验时忽略变音符号、连字和标点符号的差异
 */

/**
 * 带变音符号的 Latin 字符 → 基础字母映射
 * 覆盖法语、西班牙语、德语等常见欧洲语言
 */
const DIACRITICS_MAP: Record<string, string> = {
  à: 'a', á: 'a', â: 'a', ã: 'a', ä: 'a', å: 'a', ā: 'a', ă: 'a', ą: 'a',
  è: 'e', é: 'e', ê: 'e', ë: 'e', ē: 'e', ĕ: 'e', ę: 'e', ė: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i', ī: 'i', ĭ: 'i', į: 'i', İ: 'i',
  ò: 'o', ó: 'o', ô: 'o', õ: 'o', ö: 'o', ø: 'o', ō: 'o', ŏ: 'o', ǫ: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u', ū: 'u', ŭ: 'u', ů: 'u',
  ý: 'y', ÿ: 'y', ŷ: 'y',
  ñ: 'n', ň: 'n',
  ç: 'c', ć: 'c', ĉ: 'c', č: 'c',
  ğ: 'g', ĝ: 'g',
  ş: 's', ś: 's', ŝ: 's', š: 's',
  ź: 'z', ż: 'z', ž: 'z',
  // 大写
  À: 'A', Á: 'A', Â: 'A', Ã: 'A', Ä: 'A', Å: 'A', Ā: 'A', Ă: 'A', Ą: 'A',
  È: 'E', É: 'E', Ê: 'E', Ë: 'E', Ē: 'E', Ĕ: 'E', Ę: 'E', Ė: 'E',
  Ì: 'I', Í: 'I', Î: 'I', Ï: 'I', Ī: 'I', Ĭ: 'I', Į: 'I',
  Ò: 'O', Ó: 'O', Ô: 'O', Õ: 'O', Ö: 'O', Ø: 'O', Ō: 'O', Ŏ: 'O', Ǫ: 'O',
  Ù: 'U', Ú: 'U', Û: 'U', Ü: 'U', Ū: 'U', Ŭ: 'U', Ů: 'U',
  Ý: 'Y', Ÿ: 'Y', Ŷ: 'Y',
  Ñ: 'N', Ň: 'N',
  Ç: 'C', Ć: 'C', Ĉ: 'C', Č: 'C',
  Ğ: 'G', Ĝ: 'G',
  Ş: 'S', Ś: 'S', Ŝ: 'S', Š: 'S',
  Ź: 'Z', Ż: 'Z', Ž: 'Z',
}

/** 连字 → 双字母映射 */
const LIGATURES_MAP: Record<string, string> = {
  æ: 'ae', Æ: 'AE',
  œ: 'oe', Œ: 'OE',
  ß: 'ss', ẞ: 'SS',
}

/**
 * 标点符号正则（需要移除的字符）
 * 保留字母、数字、空格
 */
const PUNCTUATION_REGEX = /[^\w\s]|_/g

/**
 * 空白字符归一化（多个空格 → 一个空格，首尾去空格）
 */
const WHITESPACE_REGEX = /\s+/g

/**
 * 对文本进行归一化处理，用于容错比较
 *
 * 步骤：
 * 1. 去除标点符号
 * 2. 替换连字（æ→ae, œ→oe）
 * 3. 去除变音符号（é→e, à→a 等）
 * 4. 转小写
 * 5. 归一化空白字符
 *
 * @param text 输入文本
 * @returns 归一化后的文本
 */
export function normalizeText(text: string): string {
  if (!text) return ''

  let result = text

  // 1. 替换连字
  for (const [lig, replacement] of Object.entries(LIGATURES_MAP)) {
    result = result.replace(new RegExp(lig, 'g'), replacement)
  }

  // 2. 去除变音符号
  result = result
    .split('')
    .map((ch) => DIACRITICS_MAP[ch] || ch)
    .join('')

  // 3. 去除标点符号
  result = result.replace(PUNCTUATION_REGEX, '')

  // 4. 转小写
  result = result.toLowerCase()

  // 5. 归一化空白字符
  result = result.replace(WHITESPACE_REGEX, ' ').trim()

  return result
}

/**
 * 比较两个文本是否相等（忽略变音符号、连字、标点、大小写）
 */
export function isTextEqual(input: string, expected: string): boolean {
  return normalizeText(input) === normalizeText(expected)
}
