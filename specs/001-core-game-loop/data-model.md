# Data Model: Merge Defense Core Game Loop

**Date**: 2026-02-25
**Branch**: `001-core-game-loop`

---

## Entities

### WeaponConfig（武器配置，JSON）
```typescript
interface WeaponConfig {
  level: number;        // 1-5
  name: string;         // 显示名称，如"木弓"、"铁炮"
  damage: number;       // 单次伤害值
  attackSpeed: number;  // 攻击间隔（秒）
  range: number;        // 攻击射程（像素/格子数）
  cost: number;         // 购买金币（仅1级武器可购买）
  iconPath: string;     // 图标资源路径
  mergeTo: number | null; // 合成后等级，null表示最高级
}
```

### EnemyConfig（敌人配置，JSON）
```typescript
interface EnemyConfig {
  id: string;           // 唯一ID，如"normal_1"
  name: string;
  hp: number;           // 血量
  speed: number;        // 移动速度（像素/秒）
  reward: number;       // 击杀金币奖励
  type: 'normal' | 'elite' | 'boss';
  spritePath: string;   // 精灵资源路径
}
```

### WaveConfig（波次配置，JSON）
```typescript
interface WaveConfig {
  waveNumber: number;
  enemies: Array<{
    enemyId: string;
    count: number;
    lane: 0 | 1 | 2;   // 0=左, 1=中, 2=右
    spawnInterval: number; // 生成间隔（秒）
  }>;
  prepTime: number;     // 备战时间（秒），默认15
}
```

### SkinConfig（皮肤配置，JSON）
```typescript
interface SkinConfig {
  id: string;
  name: string;
  spritePath: string;
  skillName: string;
  skillDescription: string;
  skillCooldown: number;  // 冷却时间（秒）
  skillEffect: 'aoe_damage' | 'slow' | 'buff_weapons' | 'heal'; 
  skillPower: number;     // 技能强度数值
  price: number;          // 解锁所需金币
  isDefault: boolean;
}
```

---

## Runtime State

### GridCell（格子状态，运行时）
```typescript
interface GridCell {
  row: number;
  col: number;
  weapon: WeaponInstance | null;
}
```

### WeaponInstance（武器实例，运行时）
```typescript
interface WeaponInstance {
  id: string;           // 唯一实例ID
  config: WeaponConfig; // 对应配置
  cell: { row: number; col: number }; // 当前格子
  isAttacking: boolean;
  lastAttackTime: number;
}
```

### EnemyInstance（敌人实例，运行时）
```typescript
interface EnemyInstance {
  id: string;
  config: EnemyConfig;
  currentHp: number;
  lane: 0 | 1 | 2;
  positionY: number;    // 当前Y坐标
  isDead: boolean;
}
```

### PlayerState（玩家状态，持久化）
```typescript
interface PlayerState {
  coins: number;            // 当前金币
  lives: number;            // 当前生命（初始3）
  currentWave: number;      // 当前波次
  bestWave: number;         // 历史最高波次（本地存储）
  unlockedSkins: string[];  // 已解锁皮肤ID列表（本地存储）
  selectedSkin: string;     // 当前选中皮肤ID
  gridSize: { rows: number; cols: number }; // 当前格子尺寸
}
```

### HeroState（英雄状态，运行时）
```typescript
interface HeroState {
  skin: SkinConfig;
  skillCooldownRemaining: number; // 剩余冷却（秒）
  isSkillReady: boolean;
}
```

---

## State Transitions

### 武器合成流程
```
格子A（Weapon Lv.N）+ 格子B（Weapon Lv.N）
  → 拖拽A到B
  → 验证：等级相同 && B有武器 && A≠B
  → 合成：删除A和B的实例
  → 创建：Weapon Lv.N+1 放在B的格子
  → 播放合成动画
```

### 游戏状态机
```
IDLE → WAVE_PREP（开始游戏）
WAVE_PREP → WAVE_ACTIVE（倒计时结束）
WAVE_ACTIVE → WAVE_PREP（本波敌人全灭）
WAVE_ACTIVE → GAME_OVER（生命归零）
GAME_OVER → IDLE（重新开始）
```

### 格子扩展规则
```
关卡数 mod 2 == 0 → 触发扩展
当前尺寸 < 4×7 → 增加一列（优先）或一行
扩展时 → 现有武器位置不变，新格子为空
```

---

## Local Storage Schema

```json
{
  "bestWave": 12,
  "unlockedSkins": ["default", "fire_mage"],
  "selectedSkin": "fire_mage",
  "totalCoinsEarned": 5420
}
```

Storage Key: `merge_defense_save`

