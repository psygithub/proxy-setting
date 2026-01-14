<template>
  <el-card>
    <template #header>
      <div class="card-header">
        <span>端口映射配置</span>
        <el-button type="primary" @click="openDialog(-1)">新增映射</el-button>
      </div>
    </template>
    <el-table :data="mappings" style="width: 100%">
      <el-table-column label="端口" prop="inbound.port" width="100" />
      <el-table-column label="协议" prop="inbound.protocol" width="100" />
      <el-table-column label="Tag" prop="inbound.tag" />
      <el-table-column label="出站节点">
         <template #default="scope">
            <span v-if="scope.row.outbound_node">
              [{{ scope.row.outbound_node.type }}] {{ scope.row.outbound_node.name }}
            </span>
            <span v-else-if="scope.row.outbound">
              {{ scope.row.outbound.tag }}
            </span>
            <span v-else>
              -
            </span>
         </template>
      </el-table-column>
      <el-table-column label="操作" width="180">
        <template #default="scope">
          <el-button size="small" @click="openDialog(scope.$index)">编辑</el-button>
          <el-button size="small" type="danger" @click="deleteMapping(scope.$index)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>

  <el-dialog v-model="dialogVisible" :title="editIndex === -1 ? '新增映射' : '编辑映射'" width="600px">
     <el-form :model="form" label-width="100px">
        <el-form-item label="本地端口">
           <el-input v-model.number="form.port" type="number" />
        </el-form-item>
        <el-form-item label="协议">
           <el-select v-model="form.protocol" style="width: 100%">
              <el-option label="http" value="http" />
              <el-option label="socks5" value="socks" />
              <el-option label="mixed" value="mixed" />
           </el-select>
        </el-form-item>
        <el-form-item label="订阅来源">
            <el-select v-model="form.sub" placeholder="请选择订阅源" style="width: 100%" @change="onSubChange">
               <el-option v-for="sub in subOptions" :key="sub" :label="sub" :value="sub" />
            </el-select>
        </el-form-item>
        <el-form-item label="出站节点">
           <el-select v-model="form.selectedNodeRaw" value-key="raw" placeholder="请选择节点" filterable style="width: 100%" :disabled="!form.sub">
              <el-option v-for="item in filteredNodes" :key="item.raw" :label="item.name" :value="item" />
           </el-select>
           <div v-if="nodes.length === 0" style="color: #e6a23c; font-size: 12px; line-height: 1.5; margin-top: 5px;">
              暂无可用节点，请前往 <el-button link type="primary" @click="$router.push('/subs')" style="padding: 0; height: auto;">订阅管理</el-button> 添加并更新订阅。
           </div>
        </el-form-item>
     </el-form>
     <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveMapping">确定</el-button>
     </template>
  </el-dialog>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import request from '../utils/axios'
import { ElMessage } from 'element-plus'

const mappings = ref([])
const nodes = ref([])
const dialogVisible = ref(false)
const editIndex = ref(-1)

const form = ref({
  port: 10808,
  protocol: 'http',
  sub: '',
  selectedNodeRaw: null
})

const subOptions = computed(() => {
   return [...new Set(nodes.value.map(n => n.source || 'Unknown'))]
})

const filteredNodes = computed(() => {
   if (!form.value.sub) return []
   return nodes.value.filter(n => (n.source || 'Unknown') === form.value.sub)
})

const onSubChange = () => {
   form.value.selectedNodeRaw = null
}

const fetchData = async () => {
  try {
    const [mRes, nRes] = await Promise.all([
      request.get('/api/mappings'),
      request.get('/api/nodes')
    ])
    mappings.value = mRes.data
    nodes.value = nRes.data
  } catch (e) {
    ElMessage.error('加载数据失败')
  }
}

const openDialog = (index) => {
  editIndex.value = index
  if (index === -1) {
    form.value = { port: 10808, protocol: 'http', sub: '', selectedNodeRaw: null }
  } else {
    const m = mappings.value[index]
    const node = m.outbound_node
    form.value = {
      port: m.inbound.port,
      protocol: m.inbound.protocol,
      sub: node ? (node.source || 'Unknown') : '',
      selectedNodeRaw: node
    }
  }
  dialogVisible.value = true
}

const saveMapping = async () => {
  if (!form.value.selectedNodeRaw) {
      ElMessage.warning('请选择一个出站节点')
      return
  }

  const m = {
     inbound: {
        tag: `in-${form.value.port}`,
        port: form.value.port,
        protocol: form.value.protocol,
        listen: "0.0.0.0",
        settings: {
           auth: "noauth",
           udp: true
        },
        sniffing: { enabled: true, destOverride: ["http", "tls"] }
     },
     outbound_node: form.value.selectedNodeRaw,
     routing: {
        type: "field",
        inboundTag: [`in-${form.value.port}`]
     }
  }
  
  // http settings adjustment
  if (form.value.protocol === 'http') {
      m.inbound.settings = { allowTransparent: false }
  }

  const newMappings = [...mappings.value]
  if (editIndex.value === -1) {
    newMappings.push(m)
  } else {
    newMappings[editIndex.value] = m
  }

  try {
    await request.post('/api/mappings', newMappings)
    mappings.value = newMappings
    dialogVisible.value = false
    ElMessage.success('保存成功')
  } catch (e) {
    ElMessage.error('保存失败')
  }
}

const deleteMapping = async (index) => {
  const newMappings = [...mappings.value]
  newMappings.splice(index, 1)
  try {
    await request.post('/api/mappings', newMappings)
    mappings.value = newMappings
    ElMessage.success('删除成功')
  } catch (e) {
     ElMessage.error('删除失败')
  }
}

onMounted(fetchData)
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
