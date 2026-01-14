<template>
  <div class="layout">
    <el-container class="main-container">
      <el-aside width="200px">
        <div class="logo">Proxy Ray Web</div>
        <el-menu :default-active="activeMenu" router class="el-menu-vertical-demo">
          <el-menu-item index="/config">
            <el-icon><Setting /></el-icon>
            <span>配置管理</span>
          </el-menu-item>
          <el-menu-item index="/subs">
            <el-icon><List /></el-icon>
            <span>订阅管理</span>
          </el-menu-item>
          <el-menu-item index="/share">
            <el-icon><Share /></el-icon>
            <span>分享配置</span>
          </el-menu-item>
        </el-menu>
      </el-aside>
      <el-container>
        <el-header>
          <div class="header-content">
             <span>Dashboard</span>
             <el-button link @click="logout">退出登录</el-button>
          </div>
        </el-header>
        <el-main>
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Setting, List, Share } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const activeMenu = computed(() => route.path)

const logout = () => {
  localStorage.removeItem('token')
  router.push('/login')
}
</script>

<style scoped>
.layout {
  height: 100vh;
}
.main-container {
  height: 100%;
}
.el-aside {
  background-color: #fff;
  border-right: 1px solid #dcdfe6;
}
.logo {
  height: 60px;
  line-height: 60px;
  text-align: center;
  font-weight: bold;
  font-size: 18px;
  color: #409eff;
  border-bottom: 1px solid #dcdfe6;
}
.el-header {
  background-color: #fff;
  border-bottom: 1px solid #dcdfe6;
  line-height: 60px;
}
.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
}
.el-main {
  background-color: #f0f2f5;
  padding: 20px;
}
</style>
