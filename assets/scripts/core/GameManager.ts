import { _decorator, Component, resources, JsonAsset } from 'cc';
import { GameState, PlayerState, WeaponConfig, EnemyConfig, WaveConfig, SkinConfig, GAME_CONFIG } from '../types/GameTypes';
import { StorageManager } from '../data/StorageManager';
import { EconomyManager } from './EconomyManager';
import { WaveManager } from './WaveManager';

const { ccclass, property } = _decorator;

/**
 * GameManager — 游戏核心状态机
 * T009 + T012: 管理游戏状态、PlayerState、配置加载、各 Manager 协调
 * 
 * 挂载到场景根节点，作为单例使用。
 */
@ccclass('GameManager')
export class GameManager extends Component {

    // ─── 单例 ────────────────────────────────────────────────────
    private static _instance: GameManager | null = null;
    public static get instance(): GameManager {
        return GameManager._instance!;
    }

    // ─── 子 Manager 引用（Inspector 绑定） ───────────────────────
    @property(StorageManager)
    public storageManager: StorageManager | null = null;

    @property(EconomyManager)
    public economyManager: EconomyManager | null = null;

    @property(WaveManager)
    public waveManager: WaveManager | null = null;

    // ─── 游戏状态 ────────────────────────────────────────────────
    private _state: GameState = GameState.IDLE;
    private _playerState: PlayerState | null = null;

    // ─── 配置数据（T012 加载） ────────────────────────────────────
    private _weaponConfigs: WeaponConfig[] = [];
    private _enemyConfigs: EnemyConfig[] = [];
    private _waveConfigs: WaveConfig[] = [];
    private _skinConfigs: SkinConfig[] = [];

    private _configsLoaded: boolean = false;

    // ─── 状态变化回调 ─────────────────────────────────────────────
    private _stateChangeCallbacks: ((state: GameState) => void)[] = [];

    // ─────────────────────────────────────────────────────────────
    // 生命周期
    // ─────────────────────────────────────────────────────────────

    onLoad() {
        if (GameManager._instance) {
            this.destroy();
            return;
        }
        GameManager._instance = this;
    }

    async start() {
        console.log('[GameManager] 启动...');
        await this._loadConfigs();
        this._loadOrCreatePlayerState();
        this._initManagers();
        this._setState(GameState.WAVE_PREP);
        console.log('[GameManager] 初始化完成，进入准备阶段');
    }

    onDestroy() {
        if (GameManager._instance === this) {
            GameManager._instance = null;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // T012: 配置文件加载
    // ─────────────────────────────────────────────────────────────

    private _loadConfigs(): Promise<void> {
        return new Promise((resolve, reject) => {
            const configFiles = ['config/weapons', 'config/enemies', 'config/waves', 'config/skins'];
            let loaded = 0;

            configFiles.forEach(path => {
                resources.load(path, JsonAsset, (err, asset) => {
                    if (err) {
                        console.error(`[GameManager] 配置加载失败: ${path}`, err);
                        // 非致命错误，继续加载其他配置
                    } else {
                        this._applyConfig(path, asset.json);
                        console.log(`[GameManager] 配置加载成功: ${path}`);
                    }
                    loaded++;
                    if (loaded === configFiles.length) {
                        this._configsLoaded = true;
                        console.log('[GameManager] 所有配置加载完成');
                        resolve();
                    }
                });
            });
        });
    }

    private _applyConfig(path: string, data: any): void {
        if (path.includes('weapons')) this._weaponConfigs = data as WeaponConfig[];
        else if (path.includes('enemies')) this._enemyConfigs = data as EnemyConfig[];
        else if (path.includes('waves')) this._waveConfigs = data as WaveConfig[];
        else if (path.includes('skins')) this._skinConfigs = data as SkinConfig[];
    }

    // ─────────────────────────────────────────────────────────────
    // 玩家存档
    // ─────────────────────────────────────────────────────────────

    private _loadOrCreatePlayerState(): void {
        const saved = this.storageManager?.load();
        if (saved) {
            this._playerState = saved;
            console.log(`[GameManager] 读取存档，当前波次: ${saved.currentWave}，最高: ${saved.bestWave}`);
        } else {
            this._playerState = StorageManager.createDefaultState();
            console.log('[GameManager] 新游戏，创建默认存档');
        }
    }

    /** 保存当前状态到本地存储 */
    public saveGame(): void {
        if (this._playerState) {
            this.storageManager?.save(this._playerState);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Manager 初始化
    // ─────────────────────────────────────────────────────────────

    private _initManagers(): void {
        if (!this._playerState) return;
        this.economyManager?.init(this._playerState.gold);
    }

    // ─────────────────────────────────────────────────────────────
    // 状态机
    // ─────────────────────────────────────────────────────────────

    private _setState(state: GameState): void {
        this._state = state;
        console.log(`[GameManager] 状态 → ${state}`);
        this._stateChangeCallbacks.forEach(cb => cb(state));
    }

    public get state(): GameState { return this._state; }

    public onStateChange(cb: (state: GameState) => void): void {
        this._stateChangeCallbacks.push(cb);
    }

    /** 开始波次战斗 */
    public startWave(): void {
        if (this._state !== GameState.WAVE_PREP) return;
        this._setState(GameState.WAVE_ACTIVE);
        // 通知 WaveManager 启动当前波次
        this.waveManager?.startWave(this.currentWave);
    }

    /** 波次结束（由 WaveManager 调用） */
    public onWaveComplete(): void {
        if (!this._playerState) return;
        this._playerState.currentWave++;
        if (this._playerState.currentWave > this._playerState.bestWave) {
            this._playerState.bestWave = this._playerState.currentWave;
        }
        // 同步金币到存档
        this._playerState.gold = this.economyManager?.gold ?? this._playerState.gold;
        this.saveGame();
        this._setState(GameState.WAVE_PREP);
    }

    /** 游戏失败 */
    public onGameOver(): void {
        if (!this._playerState) return;
        // 更新最高波次
        if (this._playerState.currentWave > this._playerState.bestWave) {
            this._playerState.bestWave = this._playerState.currentWave;
        }
        this.saveGame();
        this._setState(GameState.GAME_OVER);
    }

    /** 重新开始（保留最高波次记录） */
    public restartGame(): void {
        const bestWave = this._playerState?.bestWave ?? 0;
        this._playerState = StorageManager.createDefaultState();
        this._playerState.bestWave = bestWave;
        this._initManagers();
        this.saveGame();
        this._setState(GameState.WAVE_PREP);
    }

    // ─────────────────────────────────────────────────────────────
    // 配置查询 API
    // ─────────────────────────────────────────────────────────────

    public getWeaponConfig(level: number): WeaponConfig | null {
        return this._weaponConfigs.find(w => w.level === level) ?? null;
    }

    public getEnemyConfig(id: string): EnemyConfig | null {
        return this._enemyConfigs.find(e => e.id === id) ?? null;
    }

    public getWaveConfig(waveNumber: number): WaveConfig | null {
        return this._waveConfigs.find(w => w.waveNumber === waveNumber) ?? null;
    }

    public getSkinConfig(id: string): SkinConfig | null {
        return this._skinConfigs.find(s => s.id === id) ?? null;
    }

    public get allWeaponConfigs(): WeaponConfig[] { return this._weaponConfigs; }
    public get allSkinConfigs(): SkinConfig[] { return this._skinConfigs; }

    // ─────────────────────────────────────────────────────────────
    // PlayerState 读写
    // ─────────────────────────────────────────────────────────────

    public get playerState(): PlayerState | null { return this._playerState; }

    public get currentWave(): number { return this._playerState?.currentWave ?? 1; }
    public get playerHp(): number { return this._playerState?.hp ?? GAME_CONFIG.INITIAL_HP; }

    /** 扣除生命值，归零则触发 GameOver */
    public loseHp(amount: number = 1): void {
        if (!this._playerState) return;
        this._playerState.hp -= amount;
        console.log(`[GameManager] 失去 ${amount} 血，剩余: ${this._playerState.hp}`);
        if (this._playerState.hp <= 0) {
            this._playerState.hp = 0;
            this.onGameOver();
        }
    }
}
