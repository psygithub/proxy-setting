<template>
  <el-row :gutter="20">
    <el-col :span="8">
       <el-card>
          <template #header>
            <div class="card-header">
              <span>订阅源</span>
              <el-button type="primary" size="small" @click="showAddDialog">添加</el-button>
            </div>
          </template>
          <el-table :data="subs" style="width: 100%" @row-click="selectSub" highlight-current-row>
             <el-table-column prop="name" label="名称" />
             <el-table-column label="节点数" prop="count" width="80" />
             <el-table-column label="操作" width="120">
                <template #default="scope">
                   <el-button size="small" type="success" :icon="Refresh" circle @click.stop="updateSub(scope.row.name)" />
                   <el-button size="small" type="danger" :icon="Delete" circle @click.stop="deleteSub(scope.row.name)" />
                </template>
             </el-table-column>
          </el-table>
       </el-card>
    </el-col>
    <el-col :span="16">
       <el-card>
          <template #header>
             <div class="card-header">
                <span>节点列表 {{ currentSubName ? `(${currentSubName})` : '' }}</span>
                <el-button v-if="currentSubName" @click="updateSub(currentSubName)" size="small">刷新节点</el-button>
             </div>
          </template>
          <el-table :data="filteredNodes" style="width: 100%" height="500">
             <el-table-column prop="name" label="名称" width="200" show-overflow-tooltip />
             <el-table-column prop="type" label="类型" width="100" />
             <el-table-column label="地址">
                <template #default="scope">
                   {{ scope.row.address }}:{{ scope.row.port }}
                </template>
             </el-table-column>
          </el-table>
       </el-card>
    </el-col>
  </el-row>

  <el-dialog v-model="addVisible" title="添加订阅" width="500px">
     <el-form :model="addForm" label-width="80px">
        <el-form-item label="名称">
           <el-input v-model="addForm.name" />
        </el-form-item>
        <el-form-item label="URL">
           <el-input v-model="addForm.url" />
        </el-form-item>
     </el-form>
     <template #footer>
        <el-button @click="addVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmAdd">确定</el-button>
     </template>
  </el-dialog>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import request from '../utils/axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Delete } from '@element-plus/icons-vue'

const subs = ref([])
const nodes = ref([])
const currentSubName = ref('')
const addVisible = ref(false)
const addForm = ref({ name: '', url: '' })

const filteredNodes = computed(() => {
   if (!currentSubName.value) return []
   return nodes.value.filter(n => n.source === currentSubName.value)
})

const fetchSubs = async () => {
   try {
      const res = await request.get('/api/subs')
      subs.value = res.data
   } catch (e) {}
}

const fetchNodes = async () => {
   try {
      const res = await request.get('/api/nodes')
      nodes.value = res.data
   } catch (e) {}
}

const refreshAll = () => {
   fetchSubs()
   fetchNodes()
}

const selectSub = (row) => {
   currentSubName.value = row.name
}

const showAddDialog = () => {
   addForm.value = { name: '', url: '' }
   addVisible.value = true
}

const confirmAdd = async () => {
   if (!addForm.value.name || !addForm.value.url) return
   try {
      await request.post('/api/subs', addForm.value)
      addVisible.value = false
      ElMessage.success('添加成功，正在更新节点...')
      // Auto update
      updateSub(addForm.value.name)
   } catch (e) {
      ElMessage.error('添加失败')
   }
}

const deleteSub = async (name) => {
   try {
      await ElMessageBox.confirm(`确定删除订阅 ${name}?`)
      await request.delete(`/api/subs/${name}`)
      if (currentSubName.value === name) currentSubName.value = ''
      refreshAll()
      ElMessage.success('删除成功')
   } catch (e) {}
}

const updateSub = async (name) => {
   const loading = ElMessage.info({ message: `正在更新 ${name}...`, duration: 0 })
   try {
      await request.post(`/api/subs/${name}/update`)
      loading.close()
      ElMessage.success('更新成功')
      refreshAll()
   } catch (e) {
      loading.close()
      ElMessage.error('更新失败')
   }
}

onMounted(refreshAll)
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
