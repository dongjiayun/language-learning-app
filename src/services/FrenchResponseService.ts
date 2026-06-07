import type { FrenchResponseItem } from '@/types'

/**
 * 外语学习助手服务
 * 调用 DeepSeek API 生成目标语言学习回答
 */
export class FrenchResponseService {
  private apiKey: string = ''
  private apiEndpoint = 'https://api.deepseek.com/v1/chat/completions'

  private langMap: Record<string, { name: string; nativeName: string; code: string }> = {
    'fr-FR': { name: '法语', nativeName: 'French', code: 'french' },
    'en-US': { name: '英语', nativeName: 'English', code: 'english' },
    'zh-CN': { name: '中文', nativeName: 'Chinese', code: 'chinese' },
    'ja-JP': { name: '日语', nativeName: 'Japanese', code: 'japanese' },
  }

  setApiKey(key: string): void {
    this.apiKey = key
  }

  getApiKey(): string {
    return this.apiKey
  }

  async generate(
    heardText: string,
    targetLang: string = 'fr-FR',
    annotateLang: string = 'zh-CN',
    onUsage?: (prompt: number, completion: number) => void
  ): Promise<FrenchResponseItem[]> {
    const langInfo = this.langMap[targetLang] || this.langMap['fr-FR']
    const annotateInfo = this.langMap[annotateLang] || this.langMap['zh-CN']

    if (!this.apiKey) {
      return this.generateFallback(targetLang, annotateLang)
    }

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: `You are a ${langInfo.nativeName} learning assistant. You overhear conversations and provide helpful ${langInfo.nativeName} translations/responses. 
              
When you hear someone speak, generate exactly 3 ${langInfo.nativeName} sentences that would be natural responses to what was said. These should be useful for a ${langInfo.nativeName} learner.

IMPORTANT: Respond ONLY with a JSON array of 3 objects, each with "${langInfo.code}" and "translation" fields. The "translation" field must be in ${annotateInfo.nativeName} (${annotateInfo.name}). No other text.`
            },
            {
              role: 'user',
              content: `I just heard someone say: "${heardText}"

Please give me 3 ${langInfo.nativeName} responses with ${annotateInfo.nativeName} translations.`
            }
          ],
          temperature: 0.7,
          max_tokens: 500
        })
      })

      const data = await response.json()
      onUsage?.(data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0)
      const content = data.choices?.[0]?.message?.content || '[]'
      const parsed = JSON.parse(content)

      return parsed.map((item: Record<string, string>, idx: number) => ({
        id: `response-${Date.now()}-${idx}`,
        french: item[langInfo.code] || item.french || '',
        translation: item.translation || item.english || ''
      }))
    } catch (err) {
      console.error('DeepSeek API 调用失败，使用本地回答:', err)
      return this.generateFallback(targetLang, annotateLang)
    }
  }

  /** 无 API key 时的本地模拟回答 */
  private generateFallback(targetLang: string, annotateLang: string): FrenchResponseItem[] {
    const langInfo = this.langMap[targetLang] || this.langMap['fr-FR']

    const translationLabel = this.langMap[annotateLang]?.nativeName || 'English'

    const templates: Record<string, FrenchResponseItem[][]> = {
      'fr-FR': [
        [
          { id: '', french: 'Bonjour ! Comment allez-vous ?', translation: `Hello! How are you? (${translationLabel})` },
          { id: '', french: 'Enchanté de faire votre connaissance.', translation: `Nice to meet you. (${translationLabel})` },
          { id: '', french: 'Je vous souhaite une excellente journée !', translation: `I wish you an excellent day! (${translationLabel})` }
        ],
        [
          { id: '', french: 'Oui, tout à fait. Je suis d\'accord.', translation: `Yes, absolutely. I agree. (${translationLabel})` },
          { id: '', french: 'C\'est une excellente idée !', translation: `That is an excellent idea! (${translationLabel})` },
          { id: '', french: 'Je comprends ce que vous voulez dire.', translation: `I understand what you mean. (${translationLabel})` }
        ],
        [
          { id: '', french: 'Merci beaucoup pour votre aide.', translation: `Thank you very much for your help. (${translationLabel})` },
          { id: '', french: 'Je vous en prie, c\'est avec plaisir.', translation: `You're welcome, it's my pleasure. (${translationLabel})` },
          { id: '', french: 'Puis-je vous aider avec autre chose ?', translation: `Can I help you with something else? (${translationLabel})` }
        ],
        [
          { id: '', french: 'Excusez-moi, pourriez-vous répéter ?', translation: `Excuse me, could you repeat? (${translationLabel})` },
          { id: '', french: 'Je ne comprends pas très bien.', translation: `I don't understand very well. (${translationLabel})` },
          { id: '', french: 'Pouvez-vous parler plus lentement, s\'il vous plaît ?', translation: `Can you speak more slowly, please? (${translationLabel})` }
        ]
      ],
      'en-US': [
        [
          { id: '', french: 'Hello! How are you doing today?', translation: `Hello! How are you doing today? (${translationLabel})` },
          { id: '', french: 'It\'s nice to see you!', translation: `It's nice to see you! (${translationLabel})` },
          { id: '', french: 'Have a great day ahead!', translation: `Have a great day ahead! (${translationLabel})` }
        ],
        [
          { id: '', french: 'Yes, I completely agree with you.', translation: `Yes, I completely agree with you. (${translationLabel})` },
          { id: '', french: 'That sounds like a wonderful plan!', translation: `That sounds like a wonderful plan! (${translationLabel})` },
          { id: '', french: 'I see what you mean.', translation: `I see what you mean. (${translationLabel})` }
        ],
        [
          { id: '', french: 'Thank you so much for your help!', translation: `Thank you so much for your help! (${translationLabel})` },
          { id: '', french: 'You\'re very welcome!', translation: `You're very welcome! (${translationLabel})` },
          { id: '', french: 'Is there anything else I can assist with?', translation: `Is there anything else I can assist with? (${translationLabel})` }
        ]
      ],
      'zh-CN': [
        [
          { id: '', french: '你好！最近怎么样？', translation: `Hello! How have you been lately? (${translationLabel})` },
          { id: '', french: '很高兴认识你！', translation: `Nice to meet you! (${translationLabel})` },
          { id: '', french: '祝你今天过得愉快！', translation: `Wish you a nice day! (${translationLabel})` }
        ],
        [
          { id: '', french: '是的，我完全同意你的看法。', translation: `Yes, I completely agree with you. (${translationLabel})` },
          { id: '', french: '这是个好主意！', translation: `That's a great idea! (${translationLabel})` },
          { id: '', french: '我理解你的意思。', translation: `I understand what you mean. (${translationLabel})` }
        ],
        [
          { id: '', french: '非常感谢你的帮助！', translation: `Thank you very much for your help! (${translationLabel})` },
          { id: '', french: '不客气！', translation: `You're welcome! (${translationLabel})` },
          { id: '', french: '还需要我帮什么忙吗？', translation: `Can I help you with anything else? (${translationLabel})` }
        ]
      ]
    }

    const langTemplates = templates[targetLang] || templates['fr-FR']
    const idx = Math.floor(Math.random() * langTemplates.length)
    const timestamp = Date.now()
    return langTemplates[idx].map((item, i) => ({
      ...item,
      id: `response-${timestamp}-${i}`
    }))
  }
}
