# Tasks: Merge Defense Core Game Loop

**Input**: Design documents from `/specs/001-core-game-loop/`
**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/ ✅

**Organization**: 任务按用户故事分组，每个故事可独立实现和测试。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件，无未完成依赖）
- **[Story]**: 对应用户故事（US1~US5）
- 文件路径基于 `assets/` 目录（Cocos Creator 项目结构）

---

## Phase 1: Setup（项目初始化）

**目的**: 初始化 Cocos Creator 项目结构，创建所有目录和配置文件骨架

- [ ] T001 在 `C:\Users\eric\projects\merge-defense\` 初始化 Cocos Creator 3.8 项目（创建 `project.json`、`assets/` 目录结构）
- [ ] T002 [P] 创建目录结构：`assets/scripts/core/`、`assets/scripts/entities/`、`assets/scripts/ui/`、`assets/scripts/data/`
- [ ] T003 [P] 创建 JSON 数据配置目录：`assets/resources/config/`，放置 `weapons.json`、`enemies.json`、`waves.json`、`skins.json`
- [ ] T004 [P] 填写 `assets/resources/config/weapons.json`：5个等级武器配置（damage/attackSpeed/range/cost）
- [ ] T005 [P] 填写 `assets/resources/config/enemies.json`：3类敌人（normal/elite/boss）配置
- [ ] T006 [P] 填写 `assets/resources/config/waves.json`：前10波次配置（3条路线/敌人数量/生成间隔）
- [ ] T007 [P] 填写 `assets/resources/config/skins.json`：默认皮肤 + 3个付费皮肤配置（技能/冷却/金币价格）

**Checkpoint**: 项目目录结构和数据配置文件就绪 ✅

---

## Phase 2: Foundational（核心基础，阻塞所有故事）

**目的**: 实现游戏状态机、数据加载、本地存储等所有故事共用的基础设施

**⚠️ 重要**: 所有用户故事均依赖此阶段完成

- [ ] T008 实现 `assets/scripts/data/StorageManager.ts`：封装 `wx.setStorageSync/getStorageSync`，实现 `save()/load()/clear()` 方法，使用 `merge_defense_save` 作为存储 Key
- [ ] T009 实现 `assets/scripts/core/GameManager.ts`：游戏状态机（IDLE/WAVE_PREP/WAVE_ACTIVE/GAME_OVER），管理 PlayerState，协调各 Manager
- [ ] T010 [P] 实现 `assets/scripts/core/EconomyManager.ts`：金币增减逻辑、初始100金币、购买判断（金币不足时返回 false）
- [ ] T011 [P] 创建 TypeScript 接口文件 `assets/scripts/types/GameTypes.ts`：定义 `WeaponConfig`、`EnemyConfig`、`WaveConfig`、`SkinConfig`、`PlayerState`、`HeroState` 接口（参照 data-model.md）
- [ ] T012 在 `assets/scripts/core/GameManager.ts` 中实现配置文件加载：从 `resources/config/` 异步加载4个 JSON 配置

**Checkpoint**: 基础设施就绪，状态机可运行，配置可读取 ✅

---

## Phase 3: User Story 1 — 合成武器（Priority: P1）🎯 MVP 起点

**目标**: 玩家可在格子盘上拖拽合成同级武器，升级为高一级武器

**Independent Test**: 格子上放2个1级武器，拖拽合并，确认变成1个2级武器；拖拽不同级别武器，确认无法合成并回原位

### Implementation

- [ ] T013 [US1] 实现 `assets/scripts/core/GridManager.ts`：管理格子盘（初始3×3），GridCell 状态（空/占用），提供 `getCell(row,col)`、`setWeapon()`、`removeWeapon()` 方法
- [ ] T014 [P] [US1] 实现 `assets/scripts/entities/Weapon.ts`：Cocos Creator 组件，绑定 WeaponConfig，显示武器图标和等级
- [ ] T015 [US1] 在 `assets/scripts/core/GridManager.ts` 中实现合成逻辑：`tryMerge(cellA, cellB)` — 等级相同则合成，不同则返回 false，最高5级无法合成
- [ ] T016 [US1] 实现 `assets/scripts/ui/GridUI.ts`：渲染格子盘 Node 树，每格一个 Node，武器 Prefab 挂载到对应格子
- [ ] T017 [US1] 在 `assets/scripts/ui/GridUI.ts` 中实现拖拽交互：`TOUCH_START/TOUCH_MOVE/TOUCH_END` 事件，拖拽目标格判断，调用 `GridManager.tryMerge()`，合成失败时武器回原位动画
- [ ] T018 [US1] 实现合成动画效果：合成成功时播放缩放+淡入动画（使用 Cocos `tween`），合成音效占位

**Checkpoint**: US1 完整可测——格子合成功能独立运行 ✅

---

## Phase 4: User Story 5 — 购买武器（Priority: P1）

**目标**: 玩家点击购买按钮，消耗金币，1级武器放入空格

**Independent Test**: 初始100金币，点击购买，扣50金币，格子出现1级武器；金币不足时按钮置灰，无法购买

### Implementation

- [ ] T019 [US5] 实现 `assets/scripts/ui/ShopUI.ts` 中的购买武器按钮：显示武器价格（50金币），绑定点击事件
- [ ] T020 [US5] 在 `assets/scripts/core/GridManager.ts` 中实现 `placeWeapon(weaponConfig)`：找到第一个空格，放入武器实例；无空格时返回 false
- [ ] T021 [US5] 在 `assets/scripts/ui/ShopUI.ts` 中实现购买流程：调用 `EconomyManager.spend(50)` → 调用 `GridManager.placeWeapon()` → 刷新格子UI
- [ ] T022 [US5] 实现 `assets/scripts/ui/HUD.ts` 金币显示：实时显示当前金币数，金币变化时播放数字增减动画
- [ ] T023 [US5] 金币不足状态处理：按钮变灰 + 提示文字"金币不足"（Toast 形式）

**Checkpoint**: US5 完整可测——购买武器流程独立运行 ✅

---

## Phase 5: User Story 2 — 防御波次敌人（Priority: P1）

**目标**: 武器自动攻击从上方3条路线涌入的敌人，敌人死亡掉金币，抵达底部扣血

**Independent Test**: 放1个武器，启动第一波，观察武器攻击敌人并扣血，敌人死亡后金币增加，敌人到底扣1条命

### Implementation

- [ ] T024 [US2] 实现 `assets/scripts/entities/Enemy.ts`：Cocos Creator 组件，绑定 EnemyConfig，沿指定路线（lane 0/1/2）向下移动，血条 UI
- [ ] T025 [P] [US2] 实现 `assets/scripts/core/WaveManager.ts`：读取 `waves.json`，按波次生成敌人队列，管理生成间隔和路线分配
- [ ] T026 [US2] 在 `assets/scripts/entities/Weapon.ts` 中实现自动攻击：每隔 `attackSpeed` 秒扫描射程内敌人（取血量最低者），生成子弹 Prefab 飞向目标
- [ ] T027 [US2] 实现 `assets/prefabs/ProjectilePrefab`：子弹飞行动画，命中时对敌人调用 `takeDamage(damage)`
- [ ] T028 [US2] 在 `assets/scripts/entities/Enemy.ts` 中实现 `takeDamage()` 和死亡逻辑：血量归零时触发死亡动画，调用 `EconomyManager.earn(reward)`，回收到对象池
- [ ] T029 [US2] 实现敌人抵达底部逻辑：敌人 Y 坐标超出边界时，调用 `GameManager.loseLife()`，生命数减1
- [ ] T030 [US2] 实现对象池 `NodePool`：敌人和子弹复用，避免频繁 instantiate/destroy 导致卡顿
- [ ] T031 [US2] 实现 `assets/scripts/ui/HUD.ts` 生命显示：3个心形图标，失去生命时播放破碎动画
- [ ] T032 [US2] 实现游戏结束逻辑：生命归零时切换状态到 GAME_OVER，显示结算界面（当前波次 + 历史最高波次）
- [ ] T033 [US2] 实现 `assets/scripts/ui/GameOverUI.ts`：显示本局波次、最高波次，"再来一局"按钮重置状态

**Checkpoint**: US2 完整可测——核心游戏循环（合成+购买+战斗）可完整运行 ✅

---

## Phase 6: User Story 3 — 格子扩展（Priority: P2）

**目标**: 每通过2关，格子盘扩展一格，最大 4×7

**Independent Test**: 通过第2关，格子盘从3×3出现扩展动画，新格子为空可用，现有武器不移动

### Implementation

- [ ] T034 [US3] 在 `assets/scripts/core/GridManager.ts` 中实现扩展逻辑：`expandGrid()` — 当前cols < 7则加一列，否则加一行，上限4×7
- [ ] T035 [US3] 在 `assets/scripts/core/GameManager.ts` 中接入扩展触发：每完成第N关（N mod 2 == 0）调用 `GridManager.expandGrid()`
- [ ] T036 [US3] 在 `assets/scripts/ui/GridUI.ts` 中实现扩展动画：新格子从边缘以弹性动画滑入（`tween` 实现）

**Checkpoint**: US3 完整可测——格子扩展在通关后正确触发 ✅

---

## Phase 7: User Story 4 — 英雄主角与皮肤技能（Priority: P2）

**目标**: 英雄显示在场景中，技能按钮手动触发，金币购买皮肤解锁新技能

**Independent Test**: 默认皮肤进入游戏，技能按钮可见，CD 结束后点击触发范围爆炸效果；皮肤商店展示所有皮肤，用金币购买后技能变更

### Implementation

- [ ] T037 [US4] 实现 `assets/scripts/entities/Hero.ts`：显示英雄 Sprite，维护 `skillCooldownRemaining`，每帧递减，提供 `activateSkill()` 方法
- [ ] T038 [P] [US4] 实现4种技能效果函数（在 `Hero.ts` 中）：`aoe_damage`（范围伤害）、`slow`（减速）、`buff_weapons`（临时强化武器）、`heal`（回复生命）
- [ ] T039 [US4] 在 `assets/scripts/ui/HUD.ts` 中实现技能按钮：显示英雄头像 + 技能CD进度环，CD 未结束时按钮置灰，点击调用 `Hero.activateSkill()`
- [ ] T040 [US4] 实现 `assets/scripts/ui/ShopUI.ts` 皮肤商店页：展示所有皮肤卡片（图标/名称/技能描述/价格），已解锁显示"已拥有"，可用金币购买
- [ ] T041 [US4] 在 `assets/scripts/core/GameManager.ts` 中实现皮肤解锁：调用 `EconomyManager.spend(price)` → 将皮肤ID写入 `StorageManager`，刷新英雄技能

**Checkpoint**: US4 完整可测——英雄技能和皮肤商店独立运行 ✅

---

## Phase 8: 波次系统完善

**目标**: 补全波次间备战时间、Boss波、波次进阶显示

- [ ] T042 实现备战倒计时：`WaveManager` 在每波结束后启动15秒倒计时，HUD 显示倒计时进度条
- [ ] T043 实现 Boss 波（每5波）：Boss 敌人使用更大 Sprite，血量x5，受击时闪红，死亡时掉落大量金币
- [ ] T044 在 `assets/scripts/ui/HUD.ts` 中实现当前波次显示：`Wave N` 文字 + 进入新波次时播放波次提示动画

---

## Phase 9: Polish & 跨系统完善

**目的**: 音效、性能、存档、细节打磨

- [ ] T045 [P] 实现金币掉落飞行动画：敌人死亡时金币图标从敌人位置飞向HUD金币计数器（`tween` 路径动画）
- [ ] T046 [P] 实现本地存档：游戏结束时调用 `StorageManager.save({bestWave, unlockedSkins, selectedSkin})`，游戏启动时加载并还原
- [ ] T047 [P] 实现波次进行中可合成：确认拖拽事件在 WAVE_ACTIVE 状态下正常响应，武器移动立即生效
- [ ] T048 [P] 性能优化：确认 NodePool 正确复用敌人/子弹；在低端设备测试帧率，超过10个敌人时不低于30FPS
- [ ] T049 添加基础音效占位：合成成功音、敌人死亡音、购买武器音、技能施放音（使用 AudioSource 组件）
- [ ] T050 微信开发者工具构建验证：按 `quickstart.md` 流程执行构建，确认包体 ≤ 4MB，在模拟器中运行无报错

---

## 依赖与执行顺序

### Phase 依赖链

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundational) ← 阻塞所有故事
    ↓
Phase 3 (US1 合成) → Phase 5 (US2 战斗) → Phase 6 (US3 扩展)
Phase 4 (US5 购买) ↗                       Phase 7 (US4 英雄) [可并行]
```

### 用户故事依赖

| 故事 | 依赖 | 说明 |
|------|------|------|
| US1 合成武器 | Phase 2 完成 | 独立，无跨故事依赖 |
| US5 购买武器 | Phase 2 完成 | 独立，可与 US1 并行 |
| US2 战斗系统 | US1 + US5 完成 | 需要格子和武器已就绪 |
| US3 格子扩展 | US2 完成 | 需要关卡通关逻辑 |
| US4 英雄皮肤 | Phase 2 完成 | 可与 US1/US5 并行 |

---

## MVP 范围建议

**最小可玩版本（Phase 1~5）**:
1. ✅ Phase 1: Setup
2. ✅ Phase 2: Foundational
3. ✅ Phase 3: US1 合成武器
4. ✅ Phase 4: US5 购买武器
5. ✅ Phase 5: US2 战斗系统

完成后即可体验完整的**合成→购买→防御**游戏循环，验证核心乐趣。

---

## 任务统计

| Phase | 任务数 | 说明 |
|-------|--------|------|
| Phase 1 Setup | 7 | T001~T007 |
| Phase 2 Foundational | 5 | T008~T012 |
| Phase 3 US1 合成 | 6 | T013~T018 |
| Phase 4 US5 购买 | 5 | T019~T023 |
| Phase 5 US2 战斗 | 10 | T024~T033 |
| Phase 6 US3 扩展 | 3 | T034~T036 |
| Phase 7 US4 英雄 | 5 | T037~T041 |
| Phase 8 波次完善 | 3 | T042~T044 |
| Phase 9 Polish | 6 | T045~T050 |
| **总计** | **50** | |

可并行任务（标 [P]）：**19个**
