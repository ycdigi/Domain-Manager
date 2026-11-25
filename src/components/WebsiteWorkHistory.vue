<template>
  <section class="work-history" :aria-busy="loading">
    <p class="page-muted">每条记录代表一次工作登记，时间为上海时间。</p>
    <div v-if="error" class="page-error" role="alert">{{ error }}<el-button :disabled="loading" @click="load">重试</el-button></div>
    <p v-if="loading && !records.length" class="page-muted">正在读取记录…</p>
    <ul v-else class="page-list">
      <li v-for="record in records" :key="record.id"><div><strong>{{ record.kind }}</strong><small class="page-muted"> · <time :datetime="record.created_at">{{ workTime(record.created_at) }}</time></small></div><el-button text :disabled="busy !== undefined" :loading="busy === record.id" @click="undo(record)">撤销记录</el-button></li>
    </ul>
    <p v-if="!loading && !error && !records.length" class="page-empty">尚无记录</p>
  </section>
</template>
<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { getWorkRecords, undoWork, workTime, type WorkRecord, type WorkKind, type RecordResult } from '../api/website-management'
const props=defineProps<{websiteId:number;kind?:WorkKind;revision?:number}>()
const emit=defineEmits<{changed:[value:RecordResult];busy:[value:boolean]}>()
const records=ref<WorkRecord[]>([]),loading=ref(false),error=ref(''),busy=ref<number>()
let version=0
const load=async()=>{ const token=++version;loading.value=true;error.value='';try{const rows=await getWorkRecords(props.websiteId,props.kind);if(token===version)records.value=rows}catch(e){if(token===version)error.value=e instanceof Error?e.message:'记录读取失败'}finally{if(token===version)loading.value=false} }
const undo=async(record:WorkRecord)=>{if(busy.value!==undefined)return;busy.value=record.id;emit('busy',true);error.value='';try{const result=await undoWork(props.websiteId,record.id);records.value=records.value.filter(row=>row.id!==record.id);emit('changed',result)}catch(e){error.value=e instanceof Error?e.message:'撤销失败'}finally{busy.value=undefined;emit('busy',false)}}
watch(()=>[props.websiteId,props.kind,props.revision],()=>{records.value=[];void load()},{immediate:true})
onUnmounted(()=>{version++})
</script>
