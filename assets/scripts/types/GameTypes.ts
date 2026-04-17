/**
 * GameTypes.ts — 全局类型定义
 */

/** 武器元素属性 */
export type ElementType = 'fire' | 'lightning' | 'ice' | 'physical';

/** 武器形状（行×列） */
export type WeaponShape = '1x1' | '1x2' | '2x1' | '1x3' | '3x1';

/** 武器配置（来自 weapons.json） */
export interface WeaponConfig {
    id: string;              // 唯一标识，如 "fire_1x1_1"
    element: ElementType;    // 元素属性
    shape: WeaponShape;      // 占格形状
    level: number;           // 1~3（每种武器最多3级）
    name: string;
    damage: number;
    attackSpeed: number;     // 攻击间隔（秒）
    range: number;
    cost: number;            // 购买价格，合成得到的=0
    mergeToId: string | null;// 合成后的武器 id，null=最高级
}

/** 敌人配置（来自 enemies.json） */
export interface EnemyConfig {
    id: string;
    name: string;
    hp: number;
    speed: number;
    reward: number;
    type: 'normal' | 'elite' | 'boss';
}

/** 波次中单条敌人刷新指令 */
export interface WaveEnemy {
    enemyId: string;
    count: number;
    lane: number;
    spawnInterval: number;
}

/** 波次配置（来自 waves.json） */
export interface WaveConfig {
    waveNumber: number;
    prepTime: number;
    enemies: WaveEnemy[];
}

/** 皮肤/英雄配置（来自 skins.json） */
export interface SkinConfig {
    id: string;
    name: string;
    skillName: string;
    skillDescription: string;
    skillCooldown: number;
    skillEffect: 'aoe_damage' | 'slow' | 'buff_weapons' | 'heal';
    skillPower: number;
    price: number;
    isDefault: boolean;
}

/** 格子单元状态 */
export interface GridCell {
    row: number;
    col: number;
    weaponId: string | null;     // 武器 id（主格填 id，副格填 null）
    rootRow: number | null;      // 副格：指向主格行（主格自身填 null）
    rootCol: number | null;      // 副格：指向主格列（主格自身填 null）
    weaponNodeUuid?: string;
}

/** 玩家存档数据 */
export interface PlayerState {
    gold: number;
    hp: number;
    maxHp: number;
    currentWave: number;
    bestWave: number;
    grid: GridCell[];
    unlockedSkins: string[];
    currentSkinId: string;
}

/** 游戏状态枚举 */
export enum GameState {
    IDLE = 'IDLE',
    WAVE_PREP = 'WAVE_PREP',
    WAVE_ACTIVE = 'WAVE_ACTIVE',
    GAME_OVER = 'GAME_OVER',
}

/** 游戏全局配置 */
export const GAME_CONFIG = {
    INITIAL_GOLD: 5000,
    INITIAL_HP: 5,
    WEAPON_COST: 50,
    GRID_ROWS_INIT: 3,
    GRID_COLS_INIT: 3,
    MAX_WEAPON_LEVEL: 3,
    STORAGE_KEY: 'merge_defense_save',
    LANE_COUNT: 3,
} as const;
