import type { ChatMessage } from '@/types'

/**
 * AI 对话服务
 * 调用 DeepSeek API 进行多轮对话，支持语言学习场景
 */
export class ChatService {
  private apiKey: string = ''
  private apiEndpoint = 'https://api.deepseek.com/v1/chat/completions'

  setApiKey(key: string): void {
    this.apiKey = key
  }

  getApiKey(): string {
    return this.apiKey
  }

  /**
   * 发送消息并获取 AI 回复（非流式）
   * @param history 历史消息
   * @param userMessage 用户新输入
   */
  async sendMessage(
    history: ChatMessage[],
    userMessage: string,
    onUsage?: (prompt: number, completion: number) => void
  ): Promise<string> {
    if (!this.apiKey) {
      return '请先在设置中配置 DeepSeek API Key 才能使用 AI 对话功能。'
    }

    const messages = [
      {
        role: 'system',
        content: '你是一位友好的外语学习助手。请使用用户输入的语言来回复，保持自然对话风格。' +
          '如果用户使用目标语言练习，可以适当纠正语法错误并提供更好的表达方式。' +
          '回复要简洁自然，不要太长。可以适当使用表情符号让对话更生动。',
      },
      ...history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: userMessage },
    ]

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages,
          temperature: 0.8,
          max_tokens: 1000,
        }),
      })

      const data = await response.json()
      onUsage?.(data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0)
      const content = data.choices?.[0]?.message?.content
      if (!content) {
        throw new Error('AI 返回内容为空')
      }
      return content
    } catch (err: any) {
      console.error('[ChatService] API 调用失败:', err)
      return `抱歉，对话出错了：${err.message || '网络错误'}。请重试。`
    }
  }
}
