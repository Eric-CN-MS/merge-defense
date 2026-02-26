# Research: Merge Defense Core Game Loop

**Date**: 2026-02-25
**Branch**: `001-core-game-loop`

---

## Decision 1: Cocos Creator 版本

**Decision**: Cocos Creator 3.8（最新稳定版）
**Rationale**: 原生支持微信小游戏发布，TypeScript 支持完善，社区资源丰富，官方文档齐全。
**Alternatives considered**: 
- Cocos Creator 2.x — 旧版，组件系统不同，不推荐新项目使用
- Egret / LayaAir — 国内替代引擎，文档少，社区小

---

## Decision 2: 编程语言

**Decision**: TypeScript（Cocos Creator 默认）
**Rationale**: 类型安全减少 bug，IDE 补全友好，Cocos Creator 3.x 官方推荐。
**Alternatives considered**: JavaScript — 无类型检查，大型项目难维护

---

## Decision 3: 拖拽实现方案

**Decision**: Cocos Creator 内置 Touch 事件（`Node.on(Node.EventType.TOUCH_START/MOVE/END)`）
**Rationale**: 无需第三方库，微信小游戏原生支持，性能最优。
**Alternatives considered**: 
- 第三方拖拽库 — 增加包体，兼容性不确定

---

## Decision 4: 对象池（Object Pool）

**Decision**: 使用 Cocos Creator `NodePool` 管理敌人和子弹对象
**Rationale**: 微信小游戏内存有限，频繁创建/销毁节点会导致 GC 卡顿，对象池是标准优化方案。
**Alternatives considered**: 
- 直接 instantiate/destroy — 简单但性能差，波次高峰期会掉帧

---

## Decision 5: 本地存储方案

**Decision**: `wx.setStorageSync / wx.getStorageSync` 封装为 `StorageManager`
**Rationale**: 微信小游戏官方 API，可靠，同步读写简单，适合游戏存档场景。
**Alternatives considered**: 
- `localStorage` — 微信小游戏不完全支持浏览器 API

---

## Decision 6: 武器攻击目标选择

**Decision**: 攻击射程内**最近（血量最低）**的敌人
**Rationale**: 优先打血量低的敌人更容易清场，减少漏怪，符合防御游戏直觉。
**Alternatives considered**: 
- 攻击最近的敌人 — 也可行，但不如"最低血量"策略感强
- 玩家手动选择 — 增加复杂度，不符合休闲定位

---

## Decision 7: 敌人路线数量

**Decision**: 3条固定路线（左、中、右）
**Rationale**: 对应 3×3 格子的三列，玩家需要在每列都放置武器，策略性强且直观。
**Alternatives considered**: 
- 2条 — 策略性略低
- 随机 — 增加随机性但降低可预测性，不适合初期版本

---

## Decision 8: 游戏场景布局

**Decision**: 
- 上方 60%：战场区域（敌人移动路线）
- 下方 35%：格子盘（武器布置）
- 底部 5%：HUD（金币、生命、波次、购买按钮）

**Rationale**: 手机竖屏布局，拇指操作区在底部，视野和操作分离清晰。
**Alternatives considered**: 
- 横屏 — 微信小游戏竖屏用户更多，横屏需要旋转处理

---

## Decision 9: MVP 范围

**Decision**: Phase 1 MVP 包含：格子系统 + 合成系统 + 基础战斗（无英雄技能）+ 5波次
**Rationale**: 先验证核心游戏循环是否好玩，英雄/皮肤/商店在 Phase 2 加入。
**Alternatives considered**: 
- 全功能一次开发 — 风险高，难以早期验证核心乐趣

