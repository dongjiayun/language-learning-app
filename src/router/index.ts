import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router'

// Electron 用 hash 模式（file:// 协议不支持 history），Web/GitHub Pages 用 history
const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI

const history = isElectron
  ? createWebHashHistory()
  : createWebHistory('/language-learning-app/app/')

const routes = [
  {
    path: '/:mode(speaking|chat|vocab|intensive|writing)?',
    name: 'app',
    // 使用相同的函数引用以确保同一个组件实例不被销毁重建
    component: () => import('../App.vue'),
  },
  { path: '/:pathMatch(.*)*', redirect: '/speaking' },
]

const router = createRouter({
  history,
  routes,
})

export default router
