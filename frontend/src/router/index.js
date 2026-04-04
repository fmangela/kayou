import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes = [
  { path: '/login', component: () => import('../views/LoginView.vue') },
  {
    path: '/admin',
    component: () => import('../views/admin/AdminLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/admin/workflow' },
      { path: 'workflow', component: () => import('../views/admin/WorkflowView.vue') },
      { path: 'attributes', component: () => import('../views/admin/AttributeView.vue') },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/admin' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.token) return '/login'
})

export default router
