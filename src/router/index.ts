import { createRouter, createWebHashHistory } from 'vue-router'

// 统一使用 hash 模式，兼容 Electron（file:// 协议）和 Web/GitHub Pages 部署
const history = createWebHashHistory()

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
