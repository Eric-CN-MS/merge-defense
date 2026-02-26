# Quickstart: Merge Defense 开发环境

**Date**: 2026-02-25

---

## 前置要求

1. **Cocos Creator 3.8** — 从 [Cocos 官网](https://www.cocos.com/creator) 下载安装
2. **微信开发者工具** — 从 [微信官网](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html) 下载
3. **Node.js 18+** — 已安装 ✅
4. **Git** — 已安装 ✅

---

## 快速开始

### 1. 克隆项目
```bash
git clone https://github.com/Eric-CN-MS/merge-defense.git
cd merge-defense
git checkout 001-core-game-loop
```

### 2. 用 Cocos Creator 打开项目
- 启动 Cocos Creator Dashboard
- 点击 **打开项目**
- 选择 `merge-defense/` 目录

### 3. 在浏览器预览（开发调试）
- Cocos Creator 菜单：**项目 → 预览**
- 或按 `Ctrl+P`

### 4. 发布为微信小游戏
- Cocos Creator 菜单：**项目 → 构建**
- 平台选择：**微信小游戏**
- 填写 AppID（开发阶段可用测试AppID）
- 点击 **构建** → **打开微信开发者工具**

---

## 项目结构快速导航

| 文件/目录 | 作用 |
|-----------|------|
| `assets/scripts/core/GameManager.ts` | 游戏主控制器，从这里开始阅读 |
| `assets/scripts/core/GridManager.ts` | 格子和合成逻辑 |
| `assets/scripts/core/WaveManager.ts` | 波次和敌人生成 |
| `assets/config/weapons.json` | 修改武器数值 |
| `assets/config/waves.json` | 修改波次难度 |

---

## 常见问题

**Q: 微信开发者工具报错"appid不合法"**
A: 开发阶段在微信开发者工具里选择"测试号"模式即可

**Q: 预览时触摸拖拽不响应**
A: 检查 Node 的 Touch 事件是否在 `onLoad` 中注册

