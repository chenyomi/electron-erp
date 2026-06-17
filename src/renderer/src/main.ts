import { createApp } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import 'vuetify/styles'
import App from './App.vue'
import './styles/vuetify.css'

const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'donghaoLight',
    themes: {
      donghaoDark: {
        dark: true,
        colors: {
          background: '#0b1020',
          surface: '#121a2e',
          primary: '#5470c6',
          secondary: '#73c0de',
          success: '#91cc75',
          warning: '#fac858',
          error: '#ee6666',
        },
      },
      donghaoLight: {
        dark: false,
        colors: {
          background: '#f5f7fb',
          surface: '#ffffff',
          primary: '#2563eb',
          secondary: '#0891b2',
          success: '#059669',
          warning: '#d97706',
          error: '#dc2626',
        },
      },
    },
  },
  defaults: {
    VBtn: { rounded: 'xl', elevation: 0, height: 42 },
    VCard: { rounded: 'xl', elevation: 0 },
    VTextField: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto', color: 'primary' },
    VTextarea: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto', color: 'primary' },
    VSelect: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto', color: 'primary' },
  },
})

createApp(App).use(vuetify).mount('#root')
