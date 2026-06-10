import { describe, it, expect } from 'vitest'
import { normalizeText, isTextEqual } from '@/utils/textNormalization'

describe('normalizeText', () => {
  // ===== 变音符号去除 =====
  it('应去除 é 的重音', () => {
    expect(normalizeText('é')).toBe('e')
  })

  it('应去除 èêë 的重音', () => {
    expect(normalizeText('èêë')).toBe('eee')
  })

  it('应去除 àâ 的重音', () => {
    expect(normalizeText('àâ')).toBe('aa')
  })

  it('应去除 ùûü 的重音', () => {
    expect(normalizeText('ùûü')).toBe('uuu')
  })

  it('应去除 ôö 的重音', () => {
    expect(normalizeText('ôö')).toBe('oo')
  })

  it('应去除 îï 的重音', () => {
    expect(normalizeText('îï')).toBe('ii')
  })

  it('应去除 ç 的变音符号', () => {
    expect(normalizeText('ç')).toBe('c')
  })

  it('应处理混合法语句子', () => {
    expect(normalizeText('français très bien')).toBe('francais tres bien')
  })

  // ===== 连字替换 =====
  it('应将 æ 替换为 ae', () => {
    expect(normalizeText('cæur')).toBe('caeur')
  })

  it('应将 œ 替换为 oe', () => {
    expect(normalizeText('sœur')).toBe('soeur')
  })

  it('应将 ß 替换为 ss', () => {
    expect(normalizeText('Straße')).toBe('strasse')
  })

  // ===== 标点符号移除 =====
  it('应移除标点符号', () => {
    expect(normalizeText("c'est")).toBe('cest')
  })

  it('应移除感叹号和问号', () => {
    expect(normalizeText('Bonjour! Comment ça va?')).toBe('bonjour comment ca va')
  })

  it('应移除逗号、分号、冒号', () => {
    expect(normalizeText('a, b; c: d')).toBe('a b c d')
  })

  it('应移除引号', () => {
    expect(normalizeText('"hello" «merci»')).toBe('hello merci')
  })

  it('应移除连字符', () => {
    expect(normalizeText('a-t-il')).toBe('atil')
  })

  it('应移除括号', () => {
    expect(normalizeText('test (important)')).toBe('test important')
  })

  // ===== 大小写归一化 =====
  it('应转小写', () => {
    expect(normalizeText('BONJOUR')).toBe('bonjour')
  })

  it('应正确处理大小写混合', () => {
    expect(normalizeText('FranÇais')).toBe('francais')
  })

  // ===== 空白字符 =====
  it('应归一化连续空格', () => {
    expect(normalizeText('a   b    c')).toBe('a b c')
  })

  it('应去除首尾空格', () => {
    expect(normalizeText('  hello  ')).toBe('hello')
  })

  // ===== 边界情况 =====
  it('空字符串应返回空字符串', () => {
    expect(normalizeText('')).toBe('')
  })

  it('null/undefined 应返回空字符串', () => {
    expect(normalizeText(null as any)).toBe('')
    expect(normalizeText(undefined as any)).toBe('')
  })

  it('纯数字不应受影响', () => {
    expect(normalizeText('123')).toBe('123')
  })

  // ===== 综合法语场景 =====
  it('应正确处理完整法语句子', () => {
    const input = "J'étudie le français à l'école, c'est très intéressant!"
    const expected = 'jetudie le francais a lecole cest tres interessant'
    expect(normalizeText(input)).toBe(expected)
  })

  it('应正确处理含 œ 的法语句子', () => {
    // "sœur" = sister, "cœur" = heart, "vœu" = wish
    expect(normalizeText('sa sœur a du cœur')).toBe('sa soeur a du coeur')
  })

  it('应正确处理含 æ 的法语词', () => {
    // "cæcum" = cecum, "ex æquo" = ex aequo
    expect(normalizeText('ex æquo')).toBe('ex aequo')
  })
})

describe('isTextEqual', () => {
  // ===== 法语变音符号容错 =====
  it('é 和 e 应视为相等', () => {
    expect(isTextEqual('été', 'ete')).toBe(true)
  })

  it('è 和 e 应视为相等', () => {
    expect(isTextEqual('très', 'tres')).toBe(true)
  })

  it('ç 和 c 应视为相等', () => {
    expect(isTextEqual('français', 'francais')).toBe(true)
  })

  it('â 和 a 应视为相等', () => {
    expect(isTextEqual('âge', 'age')).toBe(true)
  })

  it('û 和 u 应视为相等', () => {
    expect(isTextEqual('où', 'ou')).toBe(true)
  })

  // ===== 连字容错 =====
  it('æ 和 ae 应视为相等', () => {
    expect(isTextEqual('cæcum', 'caecum')).toBe(true)
  })

  it('œ 和 oe 应视为相等', () => {
    expect(isTextEqual('sœur', 'soeur')).toBe(true)
  })

  // ===== 标点符号容错 =====
  it("带引号的单词和不带引号的应视为相等", () => {
    expect(isTextEqual("c'est", 'cest')).toBe(true)
  })

  it('带标点的句子和不带标点的应视为相等', () => {
    expect(isTextEqual("Bonjour, comment ça va?", 'Bonjour comment ca va')).toBe(true)
  })

  // ===== 大小写容错 =====
  it('大小写不同的文本应视为相等', () => {
    expect(isTextEqual('BONJOUR', 'bonjour')).toBe(true)
  })

  // ===== 综合场景 =====
  it('用户输入与标准答案应匹配（综合法语场景）', () => {
    // 单个 blank 的场景：标准答案为 "français"，用户可输入 "francais"
    expect(isTextEqual('francais', 'français')).toBe(true)

    // 标准答案为 "étudie"，用户可输入 "etudie"
    expect(isTextEqual('etudie', 'étudie')).toBe(true)

    // 标准答案为 "sœur"，用户可输入 "soeur"
    expect(isTextEqual('soeur', 'sœur')).toBe(true)

    // 标准答案为 "c'est"，用户可输入 "cest"
    expect(isTextEqual('cest', "c'est")).toBe(true)
  })

  it('不同的文本应不相等', () => {
    expect(isTextEqual('bonjour', 'au revoir')).toBe(false)
  })

  it('空值比较应正确处理', () => {
    expect(isTextEqual('', '')).toBe(true)
    expect(isTextEqual('a', '')).toBe(false)
    expect(isTextEqual('', 'a')).toBe(false)
  })

  // ===== 空白字符容错 =====
  it('连续空格应不影响比较结果', () => {
    expect(isTextEqual('a   b', 'a b')).toBe(true)
  })
})
