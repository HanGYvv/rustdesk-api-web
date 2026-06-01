import { defineStore, acceptHMRUpdate } from 'pinia'
import { current, login } from '@/api/user'
import { setToken, removeToken, setCode, removeCode } from '@/utils/auth'
import { useRouteStore } from '@/store/router'
import { useAppStore } from '@/store/app'
import { oidcAuth, oidcQuery } from '@/api/login'

export const useUserStore = defineStore({
  id: 'user',
  state: () => ({
    nickname: '',
    username: '',
    email: '',
    token: '',
    role: '',
    avatar: '',
    route_names: [],
  }),

  actions: {
    logout () {
      removeToken()
      localStorage.removeItem('user_info')
      removeCode()
      this.$patch({
        nickname: '',
        username: '',
        email: '',
        token: '',
        role: '',
        avatar: '',
        route_names: [],
      })
    },

    saveUserData (userData) {
      // useAppStore().getAppConfig()
      setToken(userData.token)
      //
      localStorage.setItem('user_info', JSON.stringify({ name: userData.username }))
      this.$patch({
        ...userData,
      })
      if (userData.route_names && userData.route_names.length) {
        useRouteStore().addRoutes(userData.route_names)
      }
    },

    async bootstrapUserSession (userData) {
      this.saveUserData(userData)
      void useAppStore().loadConfig()
      return userData
    },

    async login (form) {
      const res = await login(form).catch(e => e)
      if (!res.code) {
        return this.bootstrapUserSession(res.data)
      } else {
        return Promise.reject(res)
      }
    },
    async info () {
      const res = await current().catch(_ => false)
      if (res) {
        return this.bootstrapUserSession(res.data)
      }
      return false
    },
    async oidc (provider, platform, browser) {
      // oidc data need to be implement
      const data = {
        deviceInfo: {
          name: navigator.userAgent, // 使用浏览器的 User-Agent 作为设备名
          os: platform, // 获取操作系统信息
          type: 'webadmin', // any vaule
        },
        id: `${platform}-${browser}`,
        op: provider, // 传入的 provider
        uuid: '',//crypto.randomUUID(), // 自动生成 UUID
      }
      const res = await oidcAuth(data).catch(_ => false)
      if (res) {
        const { code, url } = res.data
        setCode(code)
        if (provider == 'webauth') {
          window.open(url)
        } else {
          window.location.href = url
        }
      }
    },
    async query (code) {
      const params = { 'code': code, uuid: '' }
      const res = await oidcQuery(params).catch(_ => false)
      if (res) {
        removeCode()
        return this.bootstrapUserSession(res.data)
      }
      return false
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useUserStore, import.meta.hot))
}
