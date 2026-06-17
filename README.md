# 东昊账务

温州东昊汽车配件有限公司 · 账务管理系统（Electron）

## macOS 安装

1. 从 [Releases](https://github.com/chenyomi/electron-erp/releases) 下载对应版本：
   - **Apple 芯片** → `mac-arm64.dmg`
   - **Intel** → `mac-x64.dmg`
2. 打开 DMG，将「东昊账务」拖入「应用程序」文件夹。
3. 若提示 **「已损坏，无法打开」**（Chrome 下载常见），在终端执行：

```bash
xattr -cr "/Applications/东昊账务.app"
```

然后正常双击打开。也可 **右键 → 打开 → 打开**（仅首次）。

## 开发

```bash
pnpm install
pnpm dev
```

## Mac 代码签名（可选）

在 GitHub 仓库 Settings → Secrets 配置以下变量后，Release 构建会自动签名并公证，用户安装时不再出现「已损坏」：

- `CSC_LINK` — Developer ID 证书（base64 编码的 .p12）
- `CSC_KEY_PASSWORD` — 证书密码
- `APPLE_ID` — Apple ID 邮箱
- `APPLE_APP_SPECIFIC_PASSWORD` — 应用专用密码
- `APPLE_TEAM_ID` — 团队 ID
