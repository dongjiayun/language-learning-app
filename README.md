# 🗣️ 外语口语学习助手

> 一个面向多语种学习者的 AI 口语学习桌面应用 —— 支持语音识别、AI 对话、口语练习和词汇训练。

---

## ✨ 功能亮点

### 1. 🎤 口语提示
对着麦克风讲述你的母语（或任何熟悉的语言），AI 会将其翻译成目标语言并朗读。

- **语音识别**：支持中/英/法/日语输入
- **AI 翻译回答**：将你的话翻译成目标语言（支持 DeepSeek API 或本地模型）
- **TTS 朗读**：AI 自动朗读翻译结果
- **历史记录**：所有口语记录持久化保存

### 2. 💬 AI 对话
与 AI 进行多轮对话，支持多会话管理。

- **多会话管理**：自动生成对话标题，轻松切换
- **语音 + 文字输入**：支持语音识别和键盘输入
- **一键翻译**：选中 AI 回复即可翻译
- **上下文持久化**：对话历史自动保存

### 3. 🎯 口语练习
模拟真实对话场景的 AI 口语陪练（类似 Duolingo Max）。

- **AI 主动提问**：AI 会主动发起话题，引导对话
- **智能等待**：用户沉默 5 秒后 AI 自动给出提示
- **自定义话题间隔**：可配置 AI 新话题的触发频率（10-60 秒）
- **语音 / 文字切换**：自由选择输入方式
- **练习历史**：记录每次练习的完整对话

### 4. 📰 词汇训练
AI 为你生成定制化的词汇期刊，沉浸式阅读学习。

- **AI 生成文章**：每次生成 5-20 篇目标语言文章
- **多领域覆盖**：时政、文化、美食、科技、娱乐等丰富分类
- **瀑布流卡片布局**：精美配图 + 摘要，点击进入详情
- **全文翻译 + 划词翻译**：选中任意词汇即时查看翻译和例句
- **智能评估**：AI 评估你的语言水平并推荐重点词汇
- **个性化配置**：可设置每篇文章字数（200-1000）和篇数（5-20）
- **历史期刊保留**：历次生成记录可随时回看

### 5. 🌙 主题切换
- **深色模式**：默认暗色主题，护眼舒适
- **浅色模式**：适合明亮环境
- **跟随系统**：自动匹配系统主题

---

## 🌐 支持的语言

| 语言 | 输入 | 输出（回答） | 翻译标注 |
|------|:----:|:-----------:|:--------:|
| 中文 (zh-CN) | ✅ | ✅ | ✅ |
| 英语 (en-US) | ✅ | ✅ | ✅ |
| 法语 (fr-FR) | ✅ | ✅ | ✅ |
| 日语 (ja-JP) | ✅ | ✅ | ✅ |

---

## 🛠 技术栈

| 技术 | 用途 |
|------|------|
| **Vue 3** + TypeScript | 前端框架 |
| **Pinia** | 状态管理 |
| **Vite** | 构建工具 |
| **Electron 28** | 桌面应用容器 |
| **electron-builder** | 打包分发 |
| **Web Speech API** | 语音识别（备选方案） |
| **科大讯飞 ASR** | 高精度语音识别 |
| **DeepSeek API** | AI 对话 & 翻译 |
| **WebSocket** | 实时通信 |

---

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- macOS (当前仅支持 macOS 构建)

### 安装 & 运行

```bash
# 安装依赖
npm install

# 开发模式（仅 Web）
npm run dev

# 开发模式（Electron）
npm run dev:electron
```

### 构建打包

```bash
# 自动版本号 +1 → 生成 CHANGELOG → 生成 DMG 背景 → 构建 → 打包
npm run build
```

构建产物位于 `dist/` 目录，输出 `.dmg` 安装包。

### API 配置

应用默认使用本地模型回答。如需更高质量的 AI 回复，可在设置中配置：

1. **DeepSeek API Key** — 用于 AI 对话、翻译和词汇生成
2. **科大讯飞语音识别密钥** — 提升语音识别准确率（AppID + API Key + API Secret）

---

## 📦 项目结构

```
doulingo-assist/
├── src/
│   ├── App.vue                # 主组件（Tab 导航 + 路由）
│   ├── components/
│   │   ├── MicButton.vue      # 麦克风控制按钮
│   │   ├── ResponseCard.vue   # 口语翻译结果卡片
│   │   ├── ChatView.vue       # AI 对话视图
│   │   ├── SpeakingPractice.vue # 口语练习视图
│   │   ├── VocabularyTraining.vue # 词汇训练视图
│   │   ├── SettingsPanel.vue  # 设置面板
│   │   └── HistoryPanel.vue   # 历史记录面板
│   ├── stores/
│   │   └── appStore.ts        # 全局状态管理
│   ├── services/              # 业务服务层
│   │   ├── FrenchResponseService.ts
│   │   ├── ChatService.ts
│   │   ├── VocabTrainingService.ts
│   │   ├── SpeechRecognitionService.ts
│   │   └── TextToSpeechService.ts
│   └── types/
│       └── index.ts           # TypeScript 类型定义
├── electron/
│   ├── main.ts                # Electron 主进程
│   └── preload.ts             # 预加载脚本（桥接 API）
├── scripts/
│   ├── bump-version.mjs       # 版本管理
│   ├── update-changelog.mjs   # 自动更新 CHANGELOG
│   └── generate-dmg-bg.py     # DMG 安装背景生成
├── build/                     # 构建资源（图标、背景图等）
├── CHANGELOG.md               # 更新日志
└── package.json
```

---

## 📄 协议

MIT License

---

*Made with ❤️ for language learners.*
