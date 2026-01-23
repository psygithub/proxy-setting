<template>
  <el-card>
    <template #header>
       <div class="card-header">
         <span>配置分享</span>
       </div>
    </template>
    <div class="share-content">
       <div class="url-section">
          <h3>订阅链接 (Config JSON)</h3>
          <el-input v-model="configUrl" readonly>
             <template #append>
                <el-button @click="copyUrl">复制</el-button>
             </template>
          </el-input>
          <p style="color: gray; font-size: 12px; margin-top: 5px;">
             注意：如果在局域网内使用，请确保将 localhost 替换为服务器的局域网 IP。
          </p>
       </div>
       <div class="qr-section">
          <h3>二维码</h3>
          <img :src="qrSrc" v-if="qrSrc" alt="QR Code" style="width: 200px; height: 200px; border: 1px solid #eee;" />
          <div v-else>加载二维码中...</div>
       </div>
    </div>
  </el-card>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import request from '../utils/axios'
import { ElMessage } from 'element-plus'

const configUrl = ref('')
const qrSrc = ref('')

onMounted(async () => {
    // Use BASE_URL from vite config (/proxy/) to construct correct full URL
    const baseUrl = import.meta.env.BASE_URL;
    configUrl.value = new URL(`${baseUrl}api/subscribe/config`, window.location.origin).href
    
    try {
        const res = await request.get('/api/subscribe/qr', { responseType: 'blob' })
        qrSrc.value = URL.createObjectURL(res.data)
    } catch (e) {
        ElMessage.error('无法加载二维码')
    }
})

const copyUrl = () => {
   navigator.clipboard.writeText(configUrl.value)
   ElMessage.success('已复制')
}
</script>

<style scoped>
.share-content {
   display: flex;
   flex-direction: column;
   align-items: center;
   gap: 20px;
}
.url-section {
   width: 100%;
   max-width: 600px;
}
.qr-section {
   text-align: center;
}
</style>
