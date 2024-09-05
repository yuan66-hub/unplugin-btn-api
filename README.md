
## 安装 （仅支持vue组件）

```bash
 npm add @yuanjianming/unplugin-btn-api
```

## 基本使用

- 自定义按钮权限组件-Auth.vue

```vue
<template>
   <template v-if="btns.includes(props.action)">
      <slot></slot>
   </template>
</template>

<script setup>
import { defineProps } from 'vue';
import { useRoute } from 'vue-router'
const route = useRoute()
const btns = route.meta.btns  // meta:{ btns:[xxx,xxx,xx] }
const props = defineProps({
    action:{
        type:[String], //仅支持string 类型
        default: ''
    }
})
</script>
```

- vite.config.mts

```ts
// vite.config.mts
import { defineConfig } from 'vite'
import { viteBtnApiPlugin } from '@yuanjianming/unplugin-btn-api'
export default defineConfig({
    //....
    plugins: [viteBtnApiPlugin()],
})
```

- App.vue

```vue
<template>
  <h1>page</h1>
  <Auth action="btn2">
    <button>点击按钮2</button>
  </Auth>
  <Auth action="btn3">
    <div>
      <button @click="onClick">点击按钮3</button>
    </div>
    <Auth action="btn4">
      <RouterLink :to="{ name: 'about' }">about</RouterLink>
    </Auth>
    <button @click="onClick1">点击按钮4</button>
  </Auth>
</template>

<script>
import { test2 } from '../../apis/test1/api.js';
import { test3 } from '../../apis/test2/api2.js';
import Auth from '../../components/Auth.vue'
import { defineComponent } from 'vue';
import { useRouter } from 'vue-router'
const router = useRouter()

export default defineComponent({
  components: {
    Auth
  },
  setup() {
    const onClick = () => {
      test2()
      test3()
    }
    const onClick1 = () => {
      test3()
      router.push({ name:'page2' }) // name 是必须值
    }
    function onClick2(){
      test2()
    }
    const  onClick3 = function(){
      test3()
    }
    return {
      onClick,
      onClick1,
      onClick2,
      onClick3
    }
  }
})

</script>

```


## 选项

|  参数   | 类型  | 默认 | 描述 |
|  ----  | ----  | ---- | ---- |
| `routesPath`  | `RegExp` | `'/\/router\/index\.js$/'` | `vue-router` 入口文件路径
| `importApiPath`  | `RegExp` | `'/\/apis\//'` | 接口模块导入路径
| `compPath`  | `RegExp` | `'/\/Auth\.vue$/'` | 权限组件导入路径
| `compName`  | `string` | `'Auth'` | 权限组件名称
| `compProp`  | `string` | `'action'` | 权限组件权限值属性名






