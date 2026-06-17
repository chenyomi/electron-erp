declare global {
  interface Window {
    getCLodop?: () => any
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-lodop-src="${src}"]`)
    if (existing) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.dataset.lodopSrc = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`无法加载 ${src}`))
    document.head.appendChild(script)
  })
}

export async function loadCLodop(servicePort = 8000): Promise<any> {
  const primary = `http://localhost:${servicePort}/CLodopfuncs.js?priority=1`
  const fallback = `http://localhost:${servicePort === 8000 ? 18000 : 8000}/CLodopfuncs.js?priority=1`

  try {
    await loadScript(primary)
  } catch {
    await loadScript(fallback)
  }

  for (let i = 0; i < 20; i += 1) {
    const lodop = window.getCLodop?.()
    if (lodop) return lodop
    await new Promise((resolve) => setTimeout(resolve, 150))
  }

  throw new Error('未检测到 C-Lodop 服务，请先安装 C-Lodop 并确认服务已启动')
}

export async function runLodopScript(script: string, servicePort = 8000): Promise<{ ok: boolean; error?: string }> {
  try {
    await loadCLodop(servicePort)
    // eslint-disable-next-line no-new-func
    const runner = new Function(script) as () => { ok?: boolean; result?: unknown }
    runner()
    return { ok: true }
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Lodop 打印失败' }
  }
}

export async function checkLodopAvailable(servicePort = 8000): Promise<boolean> {
  try {
    await loadCLodop(servicePort)
    return true
  } catch {
    return false
  }
}
