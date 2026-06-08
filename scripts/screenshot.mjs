/**
 * 详细交互截图脚本
 *
 * 用法：node scripts/screenshot.mjs
 * 前提：npm run dev 已在 localhost:5173 运行
 */

import puppeteer from 'puppeteer-core'
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(__dirname, '..', 'docs', 'screenshots')
const DEV_URL = 'http://localhost:5173/'

const VIEWPORT = { width: 1280, height: 800 }

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

/** 点击第 index 个底部 tab（从 0 开始） */
async function clickTab(page, index) {
  const tabs = await page.$$('.tab-item')
  if (tabs[index]) {
    await tabs[index].click()
    await sleep(2000)
  }
}

/** 等待页面加载完毕 + 额外等待 */
async function waitStable(page, ms = 1500) {
  await sleep(ms)
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true })
  }

  // 找 Chrome
  const chromePaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-stable',
  ]
  let executablePath = chromePaths.find(p => {
    try { fs.accessSync(p); return true } catch { return false }
  })
  if (!executablePath) {
    try {
      executablePath = execSync('which google-chrome || which chromium || which google-chrome-stable', { encoding: 'utf8' }).trim()
    } catch {}
  }
  if (!executablePath || !fs.existsSync(executablePath)) {
    console.error('Chrome not found.')
    process.exit(1)
  }
  console.log('Chrome path:', executablePath)

  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  const page = await browser.newPage()
  await page.setViewport(VIEWPORT)

  // ===== Helper: 等待 API 加载完成（检测某个元素出现） =====
  async function waitForResponse(maxSec = 60) {
    for (let i = 0; i < maxSec * 2; i++) {
      await sleep(500)
      const dots = await page.$('.loading-dots, .send-btn[disabled], .vocab-loading, .practice-loading')
      if (!dots) return true
    }
    return false
  }

  try {
    // ================================================================
    // PHASE 0: 设置 API Key
    // ================================================================
    console.log('[0] 初始化 - 设置 API Key...')
    await page.goto(DEV_URL, { waitUntil: 'networkidle0', timeout: 30000 })
    await sleep(2000)

    await page.evaluate(() => {
      localStorage.setItem('doulingo_deepseek_api_key', 'sk-replaced')
      localStorage.setItem('doulingo_target_lang', 'fr-FR')
      localStorage.setItem('doulingo_source_lang', 'zh-CN')
      localStorage.setItem('doulingo_theme', 'dark')
      // 清空可能干扰的旧数据
      localStorage.removeItem('doulingo_chat_sessions')
      localStorage.removeItem('doulingo_practice_sessions')
    })
    await sleep(500)

    // 刷新使 localStorage 生效
    await page.reload({ waitUntil: 'networkidle0', timeout: 30000 })
    await sleep(2000)

    // ================================================================
    // PHASE 1: AI 对话 - 纯法语多轮对话
    // ================================================================
    console.log('\n[1] AI 对话 - 纯法语多轮对话...')
    await clickTab(page, 1) // AI 对话 tab

    const frenchMessages = [
      'Bonjour ! Pouvez-vous me parler de vos hobbies ?',
      'J\'aime beaucoup voyager. Quel pays recommandez-vous pour un premier voyage en Europe ?',
      'Merci ! Et quelle est la meilleure période pour visiter ce pays ?',
    ]

    for (let i = 0; i < frenchMessages.length; i++) {
      const msg = frenchMessages[i]
      console.log(`  发送消息 ${i + 1}/${frenchMessages.length}: "${msg.slice(0, 50)}..."`)

      const input = await page.$('input.text-input')
      if (!input) { console.log('  ! 找不到输入框'); break }

      await input.click()
      await sleep(300)
      await input.type(msg, { delay: 15 })
      await sleep(300)

      const sendBtn = await page.$('button.send-btn:not([disabled])')
      if (sendBtn) {
        await sendBtn.click()
        console.log('  等待 AI 回复...')
        // 等待 loading 消失（最多 30s）
        for (let w = 0; w < 60; w++) {
          await sleep(500)
          const loading = await page.$('.msg.assistant .loading-dots')
          if (!loading) break
        }
        await sleep(1000)
      }
    }

    await page.screenshot({ path: path.join(OUT_DIR, '01-ai-chat.png'), fullPage: false })
    console.log('  -> docs/screenshots/01-ai-chat.png')
    await sleep(1000)

    // ================================================================
    // PHASE 2: 词汇训练 - 生成期刊后截图
    // ================================================================
    console.log('\n[2] 词汇训练 - 更新期刊...')
    await clickTab(page, 3) // 词汇训练 tab

    // 点击「更新期刊」按钮
    const updateBtn = await page.$('button.vocab-tool-btn.primary, .empty-btn')
    if (updateBtn) {
      await updateBtn.click()
      console.log('  已点击更新期刊，等待生成中...（可能需要 1-2 分钟）')

      // 等待确认对话框（confirmGenerate）—— 如果有的话
      await sleep(1000)
      // 检查是否有确认弹窗（confirm）
      const confirmOk = await page.$('.confirm-ok')
      if (confirmOk) {
        await confirmOk.click()
        console.log('  已确认生成')
        await sleep(1000)
      }

      // 等待进度条消失（生成完成）
      let generated = false
      for (let w = 0; w < 600; w++) { // 最多等 5 分钟
        await sleep(500)
        const loading = await page.$('.progress-container, .vocab-loading')
        const error = await page.$('.error-banner')
        const journal = await page.$('.home, .newspaper-scroll, .masthead')
        if (error) {
          console.log('  生成时出现错误提示，截取当前状态')
          break
        }
        if (journal) {
          generated = true
          console.log('  期刊已生成！')
          break
        }
        if (w % 40 === 0 && w > 0) {
          console.log(`  ...等待中 (${w * 0.5}s)`)
        }
      }

      if (!generated) {
        console.log('  期刊生成未完成或超时，截取当前状态')
      }
      await sleep(2000)
    } else {
      console.log('  ! 找不到更新按钮，可能已有期刊内容')
    }

    await page.screenshot({ path: path.join(OUT_DIR, '02-vocab-training.png'), fullPage: false })
    console.log('  -> docs/screenshots/02-vocab-training.png')
    await sleep(1000)

    // ================================================================
    // PHASE 3: 口语练习 - 开始对话、切换文字模式、对话几轮、点击提示
    // ================================================================
    console.log('\n[3] 口语练习 - 文字模式对话...')
    await clickTab(page, 2) // 口语练习 tab

    // 点击「开始」按钮
    const startBtn = await page.$('button.start-btn')
    if (startBtn) {
      await startBtn.click()
      console.log('  已点击开始，等待 AI 发起话题...')
      await sleep(3000)

      // 等待 AI 发送第一条消息和提示
      for (let w = 0; w < 40; w++) {
        await sleep(500)
        const loading = await page.$('.practice-loading, .msg.ai .loading-dots')
        if (!loading) break
      }
      await sleep(1000)

      // 切换为文字输入模式
      const toggleBtn = await page.$('.tool-btn')
      if (toggleBtn) {
        await toggleBtn.click()
        console.log('  已切换为文字输入模式')
        await sleep(500)
      }

      // 用文字回复 AI
      const replies = [
        'J\'aime lire des livres et faire du sport.',
        'Je joue au football le week-end.',
        'Oui, j\'apprends le français depuis six mois.',
      ]
      for (let i = 0; i < replies.length; i++) {
        const replyInput = await page.$('input.text-input')
        if (!replyInput) {
          console.log(`  ! 找不到文字输入框 (msg ${i + 1})`)
          // 尝试找到切换按钮再点击一下
          const toggle2 = await page.$('.tool-btn')
          if (toggle2) await toggle2.click()
          await sleep(500)
          continue
        }

        await replyInput.click()
        await sleep(200)
        await replyInput.type(replies[i], { delay: 15 })
        await sleep(300)

        const sendBtn = await page.$('button.send-btn:not([disabled])')
        if (sendBtn) {
          await sendBtn.click()
          console.log(`  已发送回复 ${i + 1}/${replies.length}`)
          // 等待 AI 回复
          for (let w = 0; w < 40; w++) {
            await sleep(500)
            const loading = await page.$('.msg.ai .loading-dots')
            if (!loading) break
          }
          await sleep(1000)
        }
      }

      // 点击提示（如果有提示按钮）
      const hintBtn = await page.$('.hint-btn')
      if (hintBtn) {
        console.log('  点击提示按钮')
        await hintBtn.click()
        await sleep(1500)
      }
    } else {
      console.log('  ! 找不到开始按钮')
    }

    await page.screenshot({ path: path.join(OUT_DIR, '03-speaking-practice.png'), fullPage: false })
    console.log('  -> docs/screenshots/03-speaking-practice.png')
    await sleep(1000)

    // ================================================================
    // PHASE 4: 强化训练 - 生成考题后作答到一半截图
    // ================================================================
    console.log('\n[4] 强化训练 - 生成考题并作答...')
    await clickTab(page, 4) // 强化训练 tab

    // 点击「生成考题」
    const genBtn = await page.$('button.vocab-tool-btn.primary, .empty-btn')
    if (genBtn) {
      await genBtn.click()
      console.log('  已点击生成考题，等待生成...')
      await sleep(2000)

      // 等待生成完成（进度条消失，出现大纲）
      let questionsGenerated = false
      for (let w = 0; w < 600; w++) {
        await sleep(500)
        const loading = await page.$('.progress-section, .progress-container')
        const intensiveList = await page.$('.intensive-list, .intensive-stats')
        if (!loading && intensiveList) {
          questionsGenerated = true
          console.log('  考题已生成！')
          break
        }
        if (w % 40 === 0 && w > 0) {
          console.log(`  ...等待中 (${w * 0.5}s)`)
        }
      }
      await sleep(1500)

      if (questionsGenerated) {
        // 点击第 1 题进入答题
        const firstItem = await page.$('.intensive-item')
        if (firstItem) {
          await firstItem.click()
          console.log('  进入第 1 题')
          await sleep(1000)

          // 填入第 1 题的答案
          const blankInputs = await page.$$('input.blank-input')
          const answers1 = ['protéger', 'réduire']
          for (let b = 0; b < Math.min(blankInputs.length, answers1.length); b++) {
            await blankInputs[b].click()
            await sleep(200)
            await blankInputs[b].type(answers1[b], { delay: 15 })
          }
          console.log('  第 1 题已填答案')

          // 点击「检查答案」
          const checkBtn = await page.$('.btn.check')
          if (checkBtn) {
            await checkBtn.click()
            console.log('  已提交第 1 题')
            await sleep(1500)
          }

          // 等待跳到第 2 题
          await sleep(1000)

          // 进入第 2 题（手动点击第2题）
          const items = await page.$$('.intensive-item')
          if (items.length >= 2) {
            // 先返回大纲
            const backBtn = await page.$('.detail-back')
            if (backBtn) {
              await backBtn.click()
              await sleep(800)
            }
            // 点击第 2 题
            const items2 = await page.$$('.intensive-item')
            if (items2.length >= 2) {
              await items2[1].click()
              await sleep(1000)

              // 在第 2 题填一半（只填一个空）
              const blankInputs2 = await page.$$('input.blank-input')
              if (blankInputs2.length > 0) {
                await blankInputs2[0].click()
                await sleep(200)
                await blankInputs2[0].type('protéger', { delay: 15 })
                console.log('  第 2 题填了一个空')
                await sleep(500)
              }
            }
          }
        }
      }
    } else {
      console.log('  ! 找不到生成按钮')
    }

    await page.screenshot({ path: path.join(OUT_DIR, '04-intensive-training.png'), fullPage: false })
    console.log('  -> docs/screenshots/04-intensive-training.png')
    await sleep(1000)

    // ================================================================
    // PHASE 5: 写作训练 - 生成命题 - 选命题 - 写几句话 - 点击提示
    // ================================================================
    console.log('\n[5] 写作训练 - 生成命题并写作...')
    await clickTab(page, 5) // 写作训练 tab

    // 点击「生成写作命题」
    // 点击「生成写作命题」- 遍历按钮找文本包含"生成"的
    const allBtns = await page.$$('button')
    let genWritingBtn = null
    for (const btn of allBtns) {
      const txt = await btn.evaluate(el => el.textContent)
      if (txt && txt.includes('生成')) { genWritingBtn = btn; break }
    }
    if (genWritingBtn) {
      await genWritingBtn.click()
      console.log('  已点击生成写作命题')
      await sleep(2000)

      // 等待命题生成
      for (let w = 0; w < 60; w++) {
        await sleep(500)
        const topics = await page.$('.topic-card, .topics-list')
        if (topics) break
      }
      await sleep(1000)

      // 点击第一个命题
      const firstTopic = await page.$('.topic-card')
      if (firstTopic) {
        await firstTopic.click()
        console.log('  已选择第一个命题')
        await sleep(2000)

        // 在 textarea 里写几句话
        const textarea = await page.$('textarea.editor-textarea, .editor-textarea')
        if (textarea) {
          const writingContent = [
            'Ma ville idéale serait une petite ville côtière au sud de la France.',
            'Il y aurait des marchés en plein air avec des produits frais chaque matin.',
            'Les habitants seraient accueillants et la nourriture serait délicieuse.',
            'Je pourrais me promener sur la plage après le travail.',
          ]
          for (const line of writingContent) {
            await textarea.click()
            await sleep(200)
            await textarea.type(line + '\n\n', { delay: 10 })
          }
          console.log('  已写入一段作文')
          await sleep(500)

          // 点击「写作提示」按钮
          const hintBtn = await page.$('.hint-circle-btn')
          if (hintBtn) {
            await hintBtn.click()
            console.log('  已点击写作提示')
            // 等待提示出现
            await sleep(4000)
          }
        }
      }
    } else {
      console.log('  ! 找不到生成命题按钮')
    }

    await page.screenshot({ path: path.join(OUT_DIR, '05-writing-training.png'), fullPage: false })
    console.log('  -> docs/screenshots/05-writing-training.png')
    await sleep(1000)

    // ================================================================
    // 完成
    // ================================================================
    console.log('\n=== 全部截图完成！===')
    console.log(`输出目录: ${OUT_DIR}`)

    // 列出文件
    const files = fs.readdirSync(OUT_DIR)
    for (const f of files) {
      const stat = fs.statSync(path.join(OUT_DIR, f))
      console.log(`  ${f} (${(stat.size / 1024).toFixed(1)} KB)`)
    }

  } catch (err) {
    console.error('Error:', err)
    // 出错也尝试截图
    try {
      await page.screenshot({ path: path.join(OUT_DIR, 'error-state.png'), fullPage: false })
      console.log('  已保存错误状态截图')
    } catch {}
  } finally {
    await browser.close()
  }
}

main()
