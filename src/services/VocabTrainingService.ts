import type { VocabJournal, VocabAssessment, VocabArticle, TrainingQuestion, WritingTopic, WritingHint, WritingEvaluation } from '@/types'

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
    onUsage?: (prompt: number, completion: number) => void
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
2. 【重要】时政/新闻和娱乐类别的文章必须基于${langName}国家权威媒体的真实新闻报道来编写，摘录并改写自${langName}本土媒体的真实内容，而不是凭空虚构。这意味着：
   - 法语（fr-FR）：参考 Le Monde、Le Figaro、France 24、Le Parisien 等法国媒体
   - 英语（en-US）：参考 CNN、BBC News、The Washington Post、The New York Times 等媒体
   - 日语（ja-JP）：参考朝日新聞、読売新聞、NHK、日本経済新聞等日本媒体
   - 中文（zh-CN）：参考新华社、人民日报、央视新闻等媒体
   其他类别（美食、科技、体育等）也应尽量基于真实的新闻或话题，确保内容有事实依据。
3. 每篇文章必须是地道的 ${langName} 写作
4. 每篇文章附有完整的 ${translationName} 翻译
5. 每篇文章提取 3-5 个关键词汇，给出 ${translationName} 翻译、包含该词的例句及例句的 ${translationName} 翻译
6. 每篇文章提供一个图片搜索关键词 imageQuery（英文）用于配图，以及1-2句话的摘要（${translationName}）
7. 根据用户水平控制文章难度

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
        onUsage?.(data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0)
        content = data.choices?.[0]?.message?.content
      }

      if (!content) throw new Error('AI 返回内容为空')

      // 解析 JSON
      const jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      const parsed = JSON.parse(jsonStr)

      const today = new Date()
      const weekStr = `W${String(Math.ceil((today.getTime() - new Date(today.getFullYear(), 0, 1).getTime()) / 604800000)).padStart(2, '0')}`
      const dateStr = `${today.getFullYear()}-${weekStr}`
      const timestamp = Date.now()

      const journal: VocabJournal = {
        id: `journal-${dateStr}-${targetLang}-${timestamp}`,
        date: dateStr,
        articles: parsed.articles.map((a: any, idx: number) => ({
          ...a,
          id: `article-${dateStr}-${targetLang}-${idx}`,
          imageUrl: a.imageQuery
            ? `https://picsum.photos/seed/${encodeURIComponent(a.imageQuery.replace(/\s+/g, '-').toLowerCase())}/400/250`
            : `https://picsum.photos/seed/${encodeURIComponent(a.category.replace(/\s+/g, '-'))}/400/250`,
        })),
        generatedAt: timestamp,
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
  async assessLevel(history: string[], onUsage?: (prompt: number, completion: number) => void): Promise<VocabAssessment> {
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
      onUsage?.(data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0)
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
  async translateWord(word: string, sourceLang: string, outputLang: string, onUsage?: (prompt: number, completion: number) => void): Promise<string> {
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
      onUsage?.(data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0)
      const content = data.choices?.[0]?.message?.content
      if (!content) return word

      const jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      const parsed = JSON.parse(jsonStr)
      return `${parsed.translation}${parsed.explanation ? '\n' + parsed.explanation : ''}`
    } catch {
      return word
    }
  }

  /**
   * 生成强化训练题目
   * @param count 题目数量（默认30）
   * @param onProgress 流式进度回调 (chars, total)
   */
  async generateTrainingQuestions(
    targetLang: string,
    nativeLang: string,
    userLevel: string,
    count: number = 30,
    onProgress?: (chars: number, total: number) => void,
    onUsage?: (prompt: number, completion: number) => void
  ): Promise<TrainingQuestion[]> {
    if (!this.apiKey) throw new Error('请先配置 API Key')

    const langName = this.getLangName(targetLang)
    const nativeName = this.getLangName(nativeLang)

    const prompt = `你是一位专业的${langName}语言教育专家。请为语言学习者生成${count}道强化训练填空题。

用户母语：${nativeName}
用户当前语言水平：${userLevel}

要求：
1. 生成 ${count} 句不同主题的${langName}句子，覆盖日常对话、旅行、美食、文化、科技、教育、工作、娱乐等不同场景
2. 每一句话都要抽取其中部分单词/词组作为填空（每句抽取1-3个空位），用 ___ 表示
3. 抽取的单词应是该语言水平下值得练习的核心词汇
4. 每句附上 ${nativeName} 翻译
5. 句子难度要根据用户的语言水平适当调整
6. 题目应按难度递增排序

请严格按照以下 JSON 格式返回（只返回纯 JSON，不要包含 markdown 代码块标记）：
{
  "questions": [
    {
      "originalSentence": "完整的${langName}句子",
      "blankedSentence": "抽掉部分单词的${langName}句子，用 ___ 表示每个空位",
      "blanks": ["正确答案1", "正确答案2"],
      "translation": "${nativeName}翻译",
      "difficulty": "beginner|intermediate|advanced"
    }
  ]
}`

    // 估算总字符数
    const totalEstimate = count * 120

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
          max_tokens: 32000,
          stream: onProgress ? true : false,
        }),
      })

      if (!response.ok) {
        const errBody = await response.text().catch(() => '')
        throw new Error(`API 请求失败 (${response.status}): ${errBody}`)
      }

      let content: string

      if (onProgress && response.body) {
        content = await this.readStream(response.body, totalEstimate, onProgress)
      } else {
        const data = await response.json()
        onUsage?.(data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0)
        content = data.choices?.[0]?.message?.content
      }

      if (!content) throw new Error('AI 返回内容为空')

      // 清理 markdown 代码块标记
      const jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      const parsed = JSON.parse(jsonStr)

      const questions: TrainingQuestion[] = parsed.questions.map((q: any, idx: number) => ({
        id: `tq-${Date.now()}-${idx}`,
        originalSentence: q.originalSentence,
        blankedSentence: q.blankedSentence,
        blanks: q.blanks,
        translation: q.translation,
        difficulty: q.difficulty || 'intermediate',
      }))

      return questions
    } catch (err: any) {
      console.error('[VocabTrainingService] 生成强化训练题目失败:', err)
      throw new Error(`生成强化训练题目失败：${err.message || '网络错误'}`)
    }
  }

  /**
   * 生成写作训练的 3 个命题
   */
  async generateWritingTopics(
    targetLang: string,
    nativeLang: string,
    userLevel: string,
    onUsage?: (prompt: number, completion: number) => void
  ): Promise<WritingTopic[]> {
    if (!this.apiKey) throw new Error('请先配置 API Key')

    const langName = this.getLangName(targetLang)
    const nativeName = this.getLangName(nativeLang)

    const prompt = `你是一位${langName}写作教师。请为语言学习者生成 3 个写作命题。

用户母语：${nativeName}
用户当前语言水平：${userLevel}

要求：
1. 生成 3 个不同主题的写作命题（覆盖生活、社会、科技、文化、教育等不同领域）
2. 每个命题包括：标题（${langName}）、写作要求描述（${langName}）、${nativeName}翻译、3-5条写作提示/要点
3. 题目难度适中，让学习者有话可写
4. 每个命题应有不同的讨论方向

请严格按照以下 JSON 格式返回（只返回纯 JSON）：
{
  "topics": [
    {
      "title": "${langName}命题标题",
      "description": "${langName}写作要求描述，包括背景信息和写作方向",
      "translation": "${nativeName}翻译",
      "tips": ["提示1", "提示2", "提示3"]
    }
  ]
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
            { role: 'system', content: '你是一位专业的写作教师，只返回纯 JSON，不包含任何其他文字。' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.8,
          max_tokens: 4000,
        }),
      })

      if (!response.ok) {
        const errBody = await response.text().catch(() => '')
        throw new Error(`API 请求失败 (${response.status}): ${errBody}`)
      }

      const data = await response.json()
      onUsage?.(data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0)
      let content = data.choices?.[0]?.message?.content
      if (!content) throw new Error('AI 返回内容为空')

      const jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      const parsed = JSON.parse(jsonStr)

      return parsed.topics.map((t: any, idx: number) => ({
        id: `wt-${Date.now()}-${idx}`,
        title: t.title,
        description: t.description,
        translation: t.translation,
        tips: t.tips || [],
      }))
    } catch (err: any) {
      console.error('[VocabTrainingService] 生成写作命题失败:', err)
      throw new Error(`生成写作命题失败：${err.message || '网络错误'}`)
    }
  }

  /**
   * 获取写作续写建议（3个方向）
   */
  async getWritingHint(
    targetLang: string,
    nativeLang: string,
    topic: string,
    content: string,
    onUsage?: (prompt: number, completion: number) => void
  ): Promise<WritingHint> {
    if (!this.apiKey) throw new Error('请先配置 API Key')

    const langName = this.getLangName(targetLang)
    const nativeName = this.getLangName(nativeLang)

    const prompt = `你是一位${langName}写作教师。学生正在写一篇关于以下命题的作文：

命题：${topic}

学生当前已写内容：
${content}

请根据学生已写的内容，给出后续写作的续写建议。
你需要提供：
1. 一段续写引导（${langName}），帮助学生接续思路
2. 续写引导的 ${nativeName} 翻译
3. 3个不同的发展方向（每个方向用一句话概括，${langName}）
4. 每个发展方向的 ${nativeName} 翻译

请严格按照以下 JSON 格式返回（只返回纯 JSON）：
{
  "continuation": "续写引导段落（${langName}）",
  "continuationTranslation": "续写引导的${nativeName}翻译",
  "options": ["方向1（${langName}）", "方向2（${langName}）", "方向3（${langName}）"],
  "optionsTranslation": ["方向1的${nativeName}翻译", "方向2的${nativeName}翻译", "方向3的${nativeName}翻译"]
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
            { role: 'system', content: '你是一位专业的写作教师，只返回纯 JSON。' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 3000,
        }),
      })

      if (!response.ok) {
        const errBody = await response.text().catch(() => '')
        throw new Error(`API 请求失败 (${response.status}): ${errBody}`)
      }

      const data = await response.json()
      onUsage?.(data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0)
      let content = data.choices?.[0]?.message?.content
      if (!content) throw new Error('AI 返回内容为空')

      const jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      const parsed = JSON.parse(jsonStr)

      return {
        continuation: parsed.continuation,
        continuationTranslation: parsed.continuationTranslation || '',
        options: parsed.options || [],
        optionsTranslation: parsed.optionsTranslation || [],
      }
    } catch (err: any) {
      console.error('[VocabTrainingService] 获取写作提示失败:', err)
      throw new Error(`获取写作提示失败：${err.message || '网络错误'}`)
    }
  }

  /**
   * 评估并批改写作
   */
  async evaluateWriting(
    targetLang: string,
    nativeLang: string,
    topic: string,
    content: string,
    onUsage?: (prompt: number, completion: number) => void
  ): Promise<WritingEvaluation> {
    if (!this.apiKey) throw new Error('请先配置 API Key')

    const langName = this.getLangName(targetLang)
    const nativeName = this.getLangName(nativeLang)

    const prompt = `你是一位${langName}写作教师。请对学生的作文进行评分和批改。

命题：${topic}

学生作文：
${content}

请返回评分、总评、优点、待改进和具体的批改建议。

请严格按照以下 JSON 格式返回（只返回纯 JSON）：
{
  "score": 0-100的整数分数,
  "comment": "总评（${nativeName}）",
  "strengths": ["优点1（${nativeName}）", "优点2"],
  "weaknesses": ["待改进1（${nativeName}）", "待改进2"],
  "corrections": [
    {
      "original": "原文片段",
      "corrected": "修改建议",
      "type": "grammar|spelling|expression|word_choice",
      "explanation": "修改说明（${nativeName}）"
    }
  ]
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
            { role: 'system', content: '你是一位专业的写作评分教师，只返回纯 JSON。' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.5,
          max_tokens: 5000,
        }),
      })

      if (!response.ok) {
        const errBody = await response.text().catch(() => '')
        throw new Error(`API 请求失败 (${response.status}): ${errBody}`)
      }

      const data = await response.json()
      onUsage?.(data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0)
      let responseContent = data.choices?.[0]?.message?.content
      if (!responseContent) throw new Error('AI 返回内容为空')

      const jsonStr = responseContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      const parsed = JSON.parse(jsonStr)

      return {
        score: parsed.score,
        comment: parsed.comment,
        strengths: parsed.strengths || [],
        weaknesses: parsed.weaknesses || [],
        corrections: parsed.corrections || [],
      }
    } catch (err: any) {
      console.error('[VocabTrainingService] 评估写作失败:', err)
      throw new Error(`评估写作失败：${err.message || '网络错误'}`)
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
