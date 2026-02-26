# Implementation Plan: Merge Defense Core Game Loop

**Branch**: `001-core-game-loop` | **Date**: 2026-02-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-core-game-loop/spec.md`

---

## Summary

构建一款微信小游戏：玩家在 3×3（逐渐扩展）格子盘上拖拽合成武器（1-5级），武器自动攻击从上方2-3条路线涌入的敌人，通过波次挑战获取金币，金币可购买新武器或解锁英雄皮肤（含主动技能）。游戏基于 Cocos Creator 3.8 + TypeScript，发布为微信小游戏。

---

## Technical Context

**Language/Version**: TypeScript 5.x（Cocos Creator 内置）
**Primary Dependencies**: Cocos Creator 3.8、微信小游戏 SDK（wx API）
**Storage**: 微信小游戏本地存储（`wx.setStorageSync / wx.getStorageSync`）
**Testing**: 手动测试 + Cocos Preview（浏览器模拟）+ 微信开发者工具
**Target Platform**: 微信小游戏（iOS / Android 中低端设备）
**Project Type**: 微信小游戏（Cocos Creator 项目）
**Performance Goals**: 稳定 30+ FPS（中低端安卓），合成操作响应 < 100ms
**Constraints**: 包体 ≤ 4MB（微信小游戏限制），无服务端，纯离线运行
**Scale/Scope**: 单人离线游戏，5波次验证MVP，后续无限波次

---

## Constitution Check

| 原则 | 状态 | 说明 |
|------|------|------|
| I. Spec-First | ✅ | spec.md + clarify 已完成，plan 在 spec 之后 |
| II. 简单增量交付 | ✅ | 按 Phase 拆分，每阶段可独立运行测试 |
| III. Cocos + 微信兼容 | ✅ | Cocos Creator 3.8，TypeScript，wx API |
| IV. 游戏循环完整性 | ✅ | 核心循环（合成→攻击→波次）在 Phase 1 优先实现 |
| V. 数据驱动 | ✅ | 武器/敌人/波次配置全部放 JSON，代码不含数值 |

**GATE: PASS** ✅ — 所有原则通过，可进入 Phase 0。

---

## Project Structure

### Documentation (this feature)

```text
specs/001-core-game-loop/
├── plan.md              ✅ 本文件
├── research.md          ✅ Phase 0 输出
├── data-model.md        ✅ Phase 1 输出
├── quickstart.md        ✅ Phase 1 输出
├── contracts/           ✅ Phase 1 输出
└── tasks.md             ⏳ /speckit.tasks 生成
```

### Source Code (repository root)

```text
merge-defense/                    # Cocos Creator 项目根目录
├── assets/
│   ├── scenes/
│   │   └── GameScene.scene       # 主游戏场景
│   ├── scripts/
│   │   ├── core/
│   │   │   ├── GameManager.ts    # 游戏状态机、波次控制
│   │   │   ├── GridManager.ts    # 格子盘管理、扩展逻辑
│   │   │   ├── WaveManager.ts    # 波次生成、敌人调度
│   │   │   └── EconomyManager.ts # 金币、购买逻辑
│   │   ├── entities/
│   │   │   ├── Weapon.ts         # 武器组件（攻击、射程）
│   │   │   ├── Enemy.ts          # 敌人组件（移动、血量）
│   │   │   └── Hero.ts           # 英雄组件（技能、冷却）
│   │   ├── ui/
│   │   │   ├── HUD.ts            # 血条、金币、波次显示
│   │   │   ├── GridUI.ts         # 格子盘渲染、拖拽交互
│   │   │   ├── ShopUI.ts         # 购买武器/皮肤商店
│   │   │   └── GameOverUI.ts     # 结算界面
│   │   ├── data/
│   │   │   └── StorageManager.ts # wx 本地存储封装
│   │   └── config/
│   │       ├── weapons.json      # 武器配置（等级/攻击/射程）
│   │       ├── enemies.json      # 敌人配置（血量/速度/奖励）
│   │       ├── waves.json        # 波次配置（敌人类型/数量）
│   │       └── skins.json        # 皮肤配置（技能/价格）
│   ├── prefabs/
│   │   ├── WeaponPrefab.prefab
│   │   ├── EnemyPrefab.prefab
│   │   └── ProjectilePrefab.prefab
│   └── resources/                # 运行时动态加载资源
├── build/                        # 构建输出（.gitignore）
└── project.json                  # Cocos Creator 项目配置
```

---

## Complexity Tracking

无 Constitution 违规，无需填写。

