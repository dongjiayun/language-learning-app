import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChatService } from '@/services/ChatService'
import type { ChatMessage } from '@/types'

// ===== Mock fetch =====
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

beforeEach(() => {
  vi.clearAllMocks()
})

function createService(): ChatService {
  const svc = new ChatService()
  svc.setApiKey('sk-test-key')
  return svc
}

// ============== setApiKey / getApiKey ==============
describe('ChatService - API Key', () => {
  it('应该能设置和获取 API Key', () => {
    const svc = new ChatService()
    expect(svc.getApiKey()).toBe('')
    svc.setApiKey('sk-abc123')
    expect(svc.getApiKey()).toBe('sk-abc123')
  })
})

// ============== sendMessage ==============
describe('ChatService - sendMessage', () => {
  it('没有 API Key 时应返回提示信息', async () => {
    const svc = new ChatService()
    const result = await svc.sendMessage([], 'Bonjour')
    expect(result).toContain('配置 DeepSeek API Key')
  })

  it('应该成功发送消息并获取回复', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Bonjour! Comment allez-vous?' } }],
      }),
    })

    const svc = createService()
    const result = await svc.sendMessage([], 'Hello')

    expect(result).toBe('Bonjour! Comment allez-vous?')
    expect(mockFetch).toHaveBeenCalledTimes(1)

    const callArgs = mockFetch.mock.calls[0]
    expect(callArgs[0]).toBe('https://api.deepseek.com/v1/chat/completions')

    const body = JSON.parse(callArgs[1].body)
    expect(body.model).toBe('deepseek-chat')
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[1].role).toBe('user')
    expect(body.messages[1].content).toBe('Hello')
  })

  it('应该携带历史消息上下文', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Merci!' } }],
      }),
    })

    const history: ChatMessage[] = [
      { id: '1', role: 'user', content: 'Hello', timestamp: 100 },
      { id: '2', role: 'assistant', content: 'Bonjour!', timestamp: 200 },
    ]

    const svc = createService()
    await svc.sendMessage(history, 'How are you?')

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    // system + 2 history + 1 new user = 4 messages
    expect(body.messages).toHaveLength(4)
    expect(body.messages[1].content).toBe('Hello')
    expect(body.messages[2].content).toBe('Bonjour!')
    expect(body.messages[2].role).toBe('assistant')
    expect(body.messages[3].content).toBe('How are you?')
  })

  it('API 返回空内容时应返回错误提示', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({
        choices: [{ message: { content: '' } }],
      }),
    })

    const svc = createService()
    const result = await svc.sendMessage([], 'test')
    expect(result).toContain('对话出错了')
  })

  it('网络错误时应返回错误提示', async () => {
    mockFetch.mockRejectedValue(new Error('NetworkError'))

    const svc = createService()
    const result = await svc.sendMessage([], 'test')
    expect(result).toContain('对话出错了')
    expect(result).toContain('NetworkError')
  })

  it('API 返回异常格式时应返回错误提示', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({}),
    })

    const svc = createService()
    const result = await svc.sendMessage([], 'test')
    expect(result).toContain('对话出错了')
  })

  it('应该使用正确的请求头', async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({
        choices: [{ message: { content: 'OK' } }],
      }),
    })

    const svc = createService()
    await svc.sendMessage([], 'test')

    const headers = mockFetch.mock.calls[0][1].headers
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['Authorization']).toBe('Bearer sk-test-key')
  })

  it('并发调用应该互不影响', async () => {
    mockFetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ choices: [{ message: { content: 'Première réponse' } }] }),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ choices: [{ message: { content: 'Deuxième réponse' } }] }),
      })

    const svc = createService()
    const [r1, r2] = await Promise.all([
      svc.sendMessage([], 'msg1'),
      svc.sendMessage([], 'msg2'),
    ])

    expect(r1).toBe('Première réponse')
    expect(r2).toBe('Deuxième réponse')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
