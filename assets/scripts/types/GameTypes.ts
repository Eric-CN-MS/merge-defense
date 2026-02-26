/**
 * GameTypes.ts — 全局类型定义
 * 参照 data-model.md
 */

/** 武器配置（来自 weapons.json） */
export interface WeaponConfig {
    level: number;           // 1~5
    name: string;
    damage: number;
    attackSpeed: number;     // 攻击间隔（秒）
    range: number;           // 攻击范围（像素）
    cost: number;            // 购买价格（金币），合成得到的武器 cost=0
    mergeTo: number | null;  // 合成后等级，null 表示最高级
}

/** 敌人配置（来自 enemies.json） */
export interface EnemyConfig {
    id: string;
    name: string;
    hp: number;
    speed: number;           // 移动速度（像素/秒）
    reward: number;          // 击杀金币奖励
    type: 'normal' | 'elite' | 'boss';
}

/** 波次中单条敌人刷新指令 */
export interface WaveEnemy {
    enemyId: string;         // 对应 EnemyConfig.id
    count: number;
    lane: number;            // 0=左, 1=中, 2=右
    spawnInterval: number;   // 生成间隔（秒）
}

/** 波次配置（来自 waves.json） */
export interface WaveConfig {
    waveNumber: number;
    prepTime: number;        // 准备时间（秒）
    enemies: WaveEnemy[];
}

/** 皮肤/英雄配置（来自 skins.json） */
export interface SkinConfig {
    id: string;
    name: string;
    skillName: string;
    skillDescription: string;
    skillCooldown: number;   // 技能冷却（秒）
    skillEffect: 'aoe_damage' | 'slow' | 'buff_weapons' | 'heal';
    skillPower: number;      // 技能强度（伤害值/倍率/比例）
    price: number;           // 金币价格，0=默认免费
    isDefault: boolean;
}

/** 格子单元状态 */
export interface GridCell {
    row: number;
    col: number;
    weaponLevel: number | null;  // null=空格
    weaponNodeUuid?: string;     // 对应场景节点 UUID
}

/** 玩家存档数据 */
export interface PlayerState {
    gold: number;            // 当前金币
    hp: number;              // 当前生命值（默认5）
    maxHp: number;
    currentWave: number;     // 当前波次
    bestWave: number;        // 历史最高波次
    grid: GridCell[];        // 格子状态
    unlockedSkins: string[]; // 已解锁皮肤 id 列表
    currentSkinId: string;   // 当前使用皮肤 id
}

/** 英雄运行时状态 */
export interface HeroState {
    skinId: string;
    skillCooldownRemaining: number;  // 剩余冷却时间（秒）
    isSkillReady: boolean;
}

/** 游戏状态枚举 */
export enum GameState {
    IDLE = 'IDLE',             // 初始/菜单
    WAVE_PREP = 'WAVE_PREP',   // 波次准备（购买/合成阶段）
    WAVE_ACTIVE = 'WAVE_ACTIVE', // 战斗中
    GAME_OVER = 'GAME_OVER',   // 失败
}

/** 游戏全局配置（运行时常量） */
export const GAME_CONFIG = {
    INITIAL_GOLD: 100,
    INITIAL_HP: 5,
    WEAPON_COST: 50,           // 购买1级武器价格
    GRID_ROWS_INIT: 3,
    GRID_COLS_INIT: 3,
    MAX_WEAPON_LEVEL: 5,
    STORAGE_KEY: 'merge_defense_save',
    LANE_COUNT: 3,
} as const;
