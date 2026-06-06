import type { VocabJournal, VocabAssessment, VocabArticle } from '@/types'

/**
 * 词汇强化训练服务
 * 调用 DeepSeek API 生成周刊文章和评估用户语言水平
 */
export class VocabTrainingService {
  private apiKey: string = ''
  private apiEndpoint = 'https://api.deepseek.com/v1/chat/completions'

  setApiKey(key: string): void {
    this.apiKey = key
  }

  getApiKey(): string {
    return this.apiKey
  }

  /**
   * 生成本周词汇训练周刊
   * 包含多主题文章 + 关键词汇
   * @param onProgress 流式进度回调，参数为 (currentChars, totalEstimate)
   */
  async generateWeeklyJournal(
    targetLang: string,
    nativeLang: string,
    translationLang: string,
    userLevel: string,
    wordCount: number = 400,
    articleRange: string = '8-9',
    onProgress?: (chars: number, total: number) => void,
  ): Promise<VocabJournal> {
    if (!this.apiKey) throw new Error('请先配置 API Key')

    const langName = this.getLangName(targetLang)
    const nativeName = this.getLangName(nativeLang)
    const translationName = this.getLangName(translationLang)

    const prompt = `你是一位专业的${langName}语言教育专家。请为语言学习者生成一份本周词汇训练期刊。

用户母语：${nativeName}
翻译语言：${translationName}
用户当前语言水平：${userLevel}

要求：
1. 生成 ${articleRange} 篇短文章，每篇 ${wordCount} 词左右，覆盖以下不同的主题分类（尽量多样化）：
   - 时政/新闻（当前热点话题）
   - 美食/文化（饮食文化、传统习俗）
   - 生活/娱乐（日常场景、娱乐休闲）
   - 科技/创新（科技发展、创新产品）
   - 旅游/地理（旅行见闻、风土人情）
   - 体育/健康（运动健身、健康生活）
   - 教育/学习（学习方法、教育理念）
   - 财经/商业（经济动态、商业故事）
2. 每篇文章必须是地道的 ${langName} 写作
3. 每篇文章附有完整的 ${translationName} 翻译
4. 每篇文章提取 3-5 个关键词汇，给出 ${translationName} 翻译、包含该词的例句及例句的 ${translationName} 翻译
5. 每篇文章提供一个图片搜索关键词 imageQuery（英文）用于配图，以及1-2句话的摘要（${translationName}）
6. 根据用户水平控制文章难度

请严格按照以下 JSON 格式返回（不要包含 markdown 代码块标记，只返回纯 JSON）：
{
  "articles": [
    {
      "title": "文章标题（${langName}）",
      "category": "分类",
      "imageQuery": "英文图片搜索关键词",
      "summary": "文章摘要（1-2句话，${translationName}）",
      "content": "文章正文",
      "translation": "${translationName}翻译",
      "difficulty": "beginner|intermediate|advanced",
      "keyWords": [
        {
          "word": "词汇",
          "translation": "${translationName}翻译",
          "sentence": "包含该词的例句",
          "sentenceTranslation": "例句的${translationName}翻译"
        }
      ]
    }
  ]
}`

    // 估算总字符数
    const rangeParts = articleRange.split('-').map(Number)
    const numArticles = rangeParts.length === 2 ? rangeParts[1] : 9
    const totalEstimate = numArticles * wordCount * 5

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: '你是一位语言教育专家，只返回纯 JSON，不包含任何其他文字。' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.8,
          max_tokens: 100000,
          stream: onProgress ? true : false,
        }),
      })

      if (!response.ok) {
        const errBody = await response.text().catch(() => '')
        throw new Error(`API 请求失败 (${response.status}): ${errBody}`)
      }

      let content: string

      if (onProgress && response.body) {
        // 流式读取
        content = await this.readStream(response.body, totalEstimate, onProgress)
      } else {
        const data = await response.json()
        content = data.choices?.[0]?.message?.content
      }

      if (!content) throw new Error('AI 返回内容为空')

      // 解析 JSON
      const jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      const parsed = JSON.parse(jsonStr)

      const today = new Date()
      const weekStr = `W${String(Math.ceil((today.getTime() - new Date(today.getFullYear(), 0, 1).getTime()) / 604800000)).padStart(2, '0')}`
      const dateStr = `${today.getFullYear()}-${weekStr}`

      const journal: VocabJournal = {
        id: `journal-${dateStr}`,
        date: dateStr,
        articles: parsed.articles.map((a: any, idx: number) => ({
          ...a,
          id: `article-${dateStr}-${idx}`,
          imageUrl: a.imageQuery
            ? `https://picsum.photos/seed/${encodeURIComponent(a.imageQuery.replace(/\s+/g, '-').toLowerCase())}/400/250`
            : `https://picsum.photos/seed/${encodeURIComponent(a.category.replace(/\s+/g, '-'))}/400/250`,
        })),
        generatedAt: Date.now(),
        userLevel,
        nativeLang,
        targetLang,
      }

      return journal
    } catch (err: any) {
      console.error('[VocabTrainingService] 生成周刊失败:', err)
      throw new Error(`更新期刊失败：${err.message || '网络错误'}`)
    }
  }

  /**
   * 流式读取 SSE 响应
   */
  private async readStream(
    body: ReadableStream<Uint8Array>,
    totalEstimate: number,
    onProgress: (chars: number, total: number) => void,
  ): Promise<string> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let result = ''
    let buffer = ''
    let totalChars = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) {
            result += delta
            totalChars += delta.length
            onProgress(totalChars, totalEstimate)
          }
        } catch {
          // 忽略解析失败的行
        }
      }
    }

    return result
  }

  /**
   * 评估用户语言水平
   */
  async assessLevel(history: string[]): Promise<VocabAssessment> {
    if (!this.apiKey) throw new Error('请先配置 API Key')

    const prompt = `你是一位语言水平评估专家。请根据用户以下的历史对话/写作记录，评估其语言水平。

用户历史记录（最近的一些内容）：
${history.slice(-10).join('\n---\n')}

请严格按照以下 JSON 格式返回评估结果（只返回纯 JSON）：
{
  "level": "A1/A2/B1/B2/C1/C2 或 初级/中级/高级",
  "score": 0-100,
  "strengths": ["优势1", "优势2"],
  "weaknesses": ["待改进1", "待改进2"],
  "recommendedFocus": ["建议重点学习1", "建议重点学习2"]
}`

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: '你是一位语言水平评估专家，只返回纯 JSON。' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 1000,
        }),
      })

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content
      if (!content) throw new Error('AI 返回内容为空')

      const jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      return JSON.parse(jsonStr)
    } catch (err: any) {
      console.error('[VocabTrainingService] 评估失败:', err)
      return {
        level: '中级',
        score: 50,
        strengths: [],
        weaknesses: [],
        recommendedFocus: [],
      }
    }
  }

  /**
   * 翻译选中的单词/短语
   */
  async translateWord(word: string, sourceLang: string, outputLang: string): Promise<string> {
    if (!this.apiKey) return word

    const langName = this.getLangName(sourceLang)
    const outputName = this.getLangName(outputLang)

    const prompt = `请将以下${langName}单词/短语翻译成${outputName}，并给出简短的解释。

单词：${word}

请严格按照以下 JSON 格式返回（只返回纯 JSON）：
{
  "translation": "${outputName}翻译",
  "explanation": "简短的${outputName}解释，包括用法说明"
}`

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: '只返回纯 JSON。' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          max_tokens: 500,
        }),
      })

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content
      if (!content) return word

      const jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      const parsed = JSON.parse(jsonStr)
      return `${parsed.translation}${parsed.explanation ? '\n' + parsed.explanation : ''}`
    } catch {
      return word
    }
  }

  private getLangName(lang: string): string {
    const map: Record<string, string> = {
      'zh-CN': '中文',
      'en-US': '英语',
      'fr-FR': '法语',
      'ja-JP': '日语',
    }
    return map[lang] || lang
  }
}
