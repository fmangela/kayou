<template>
  <el-container style="height:100vh">
    <el-aside width="200px" style="background:#001529">
      <div style="color:#fff;font-size:18px;font-weight:bold;padding:20px 16px;border-bottom:1px solid #1f3a5f">
        Kayou 管理
      </div>
      <el-menu
        :default-active="activeMenu"
        background-color="#001529"
        text-color="#ccc"
        active-text-color="#fff"
        router
      >
        <el-menu-item index="/admin/workflow">
          <el-icon><Picture /></el-icon>
          <span>卡牌图片AI生成</span>
        </el-menu-item>
        <el-menu-item index="/admin/attributes">
          <el-icon><Edit /></el-icon>
          <span>卡牌属性编辑</span>
        </el-menu-item>
        <el-menu-item index="/admin/cards">
          <el-icon><Tickets /></el-icon>
          <span>卡牌制作</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header style="background:#fff;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:flex-end;padding:0 20px">
        <el-button text @click="handleLogout">退出登录</el-button>
      </el-header>
      <el-main style="background:#f0f2f5;padding:20px">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const activeMenu = computed(() => route.path)

function handleLogout() {
  auth.logout()
  router.push('/login')
}
</script>
