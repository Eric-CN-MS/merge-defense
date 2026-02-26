import { _decorator, Component } from 'cc';
import { PlayerState, GAME_CONFIG } from '../types/GameTypes';

const { ccclass } = _decorator;

/**
 * StorageManager — 封装微信小游戏本地存储
 * T008: 使用 wx.setStorageSync / wx.getStorageSync
 * 在非微信环境（编辑器预览）自动降级为 localStorage
 */
@ccclass('StorageManager')
export class StorageManager extends Component {

    private static _instance: StorageManager | null = null;

    public static get instance(): StorageManager {
        return StorageManager._instance!;
    }

    onLoad() {
        if (StorageManager._instance) {
            this.destroy();
            return;
        }
        StorageManager._instance = this;
    }

    onDestroy() {
        if (StorageManager._instance === this) {
            StorageManager._instance = null;
        }
    }

    // ─── 底层读写（自动适配微信/浏览器环境）───────────────────────

    private setItem(key: string, value: string): void {
        try {
            if (typeof wx !== 'undefined' && wx.setStorageSync) {
                wx.setStorageSync(key, value);
            } else {
                localStorage.setItem(key, value);
            }
        } catch (e) {
            console.error('[StorageManager] setItem failed:', e);
        }
    }

    private getItem(key: string): string | null {
        try {
            if (typeof wx !== 'undefined' && wx.getStorageSync) {
                return wx.getStorageSync(key) || null;
            } else {
                return localStorage.getItem(key);
            }
        } catch (e) {
            console.error('[StorageManager] getItem failed:', e);
            return null;
        }
    }

    private removeItem(key: string): void {
        try {
            if (typeof wx !== 'undefined' && wx.removeStorageSync) {
                wx.removeStorageSync(key);
            } else {
                localStorage.removeItem(key);
            }
        } catch (e) {
            console.error('[StorageManager] removeItem failed:', e);
        }
    }

    // ─── 公开 API ─────────────────────────────────────────────────

    /** 保存玩家存档 */
    public save(state: PlayerState): void {
        this.setItem(GAME_CONFIG.STORAGE_KEY, JSON.stringify(state));
        console.log('[StorageManager] 已保存存档');
    }

    /** 读取玩家存档，不存在则返回 null */
    public load(): PlayerState | null {
        const raw = this.getItem(GAME_CONFIG.STORAGE_KEY);
        if (!raw) return null;
        try {
            return JSON.parse(raw) as PlayerState;
        } catch (e) {
            console.error('[StorageManager] 存档解析失败，清除损坏数据:', e);
            this.clear();
            return null;
        }
    }

    /** 清除存档 */
    public clear(): void {
        this.removeItem(GAME_CONFIG.STORAGE_KEY);
        console.log('[StorageManager] 存档已清除');
    }

    /** 创建默认初始存档 */
    public static createDefaultState(): PlayerState {
        return {
            gold: GAME_CONFIG.INITIAL_GOLD,
            hp: GAME_CONFIG.INITIAL_HP,
            maxHp: GAME_CONFIG.INITIAL_HP,
            currentWave: 1,
            bestWave: 0,
            grid: [],
            unlockedSkins: ['default'],
            currentSkinId: 'default',
        };
    }
}
