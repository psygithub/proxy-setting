import { createRouter, createWebHashHistory } from 'vue-router'
import Login from '../views/Login.vue'
import Layout from '../views/Layout.vue'
import Config from '../views/Config.vue'
import Subs from '../views/Subs.vue'
import Share from '../views/Share.vue'

const routes = [
  { path: '/login', component: Login },
  { 
    path: '/', 
    component: Layout,
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/config' },
      { path: 'config', component: Config },
      { path: 'subs', component: Subs },
      { path: 'share', component: Share }
    ]
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  if (to.meta.requiresAuth && !token) {
    next('/login')
  } else {
    next()
  }
})

export default router
