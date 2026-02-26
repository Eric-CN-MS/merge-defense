import { _decorator, Component, Node, Prefab, instantiate } from 'cc';
import { WaveConfig, WaveEnemy, GameState } from '../types/GameTypes';
import { GameManager } from './GameManager';
import { Enemy, EnemyDeathCallback, EnemyReachEndCallback } from '../entities/Enemy';

const { ccclass, property } = _decorator;

/**
 * WaveManager — 波次管理器
 * T025: 读取 waves.json，生成敌人队列，管理波次流程
 * T030: 基础对象池（敌人复用）
 */
@ccclass('WaveManager')
export class WaveManager extends Component {

    private static _instance: WaveManager | null = null;
    public static get instance(): WaveManager {
        return WaveManager._instance!;
    }

    @property(Prefab)
    public enemyPrefab: Prefab | null = null;   // 敌人 Prefab

    @property(Node)
    public enemyContainer: Node | null = null;   // 敌人父节点

    // ─── 状态 ─────────────────────────────────────────────────────
    private _activeEnemies: Enemy[] = [];
    private _enemyPool: Enemy[] = [];            // 对象池
    private _waveInProgress: boolean = false;
    private _pendingSpawns: Array<{ config: WaveEnemy; delay: number }> = [];
    private _spawnTimer: number = 0;
    private _spawnIndex: number = 0;
    private _totalToSpawn: number = 0;
    private _totalSpawned: number = 0;
    private _totalDefeated: number = 0;          // 死亡 + 到达底部

    // 波次完成回调
    private _onWaveCompleteCallbacks: (() => void)[] = [];

    onLoad() {
        if (WaveManager._instance) { this.destroy(); return; }
        WaveManager._instance = this;
    }

    onDestroy() {
        if (WaveManager._instance === this) WaveManager._instance = null;
    }

    // ─────────────────────────────────────────────────────────────
    // 波次启动
    // ─────────────────────────────────────────────────────────────

    /** 由 GameManager 调用，开始当前波次 */
    public startWave(waveNumber: number): void {
        const config = GameManager.instance?.getWaveConfig(waveNumber);
        if (!config) {
            console.warn(`[WaveManager] 找不到第 ${waveNumber} 波配置`);
            return;
        }

        this._waveInProgress = true;
        this._pendingSpawns = [];
        this._spawnIndex = 0;
        this._totalSpawned = 0;
        this._totalDefeated = 0;

        // 将所有敌人刷新指令展开为带延迟的队列
        let accumulatedDelay = 0;
        config.enemies.forEach(waveEnemy => {
            for (let i = 0; i < waveEnemy.count; i++) {
                this._pendingSpawns.push({
                    config: waveEnemy,
                    delay: accumulatedDelay,
                });
                accumulatedDelay += waveEnemy.spawnInterval;
            }
        });

        this._totalToSpawn = this._pendingSpawns.length;
        this._spawnTimer = 0;

        console.log(`[WaveManager] 第 ${waveNumber} 波开始，共 ${this._totalToSpawn} 个敌人`);
    }

    // ─────────────────────────────────────────────────────────────
    // 每帧更新 — 生成队列处理
    // ─────────────────────────────────────────────────────────────

    update(dt: number) {
        if (!this._waveInProgress) return;

        // 处理生成队列
        if (this._spawnIndex < this._pendingSpawns.length) {
            this._spawnTimer += dt;
            while (
                this._spawnIndex < this._pendingSpawns.length &&
                this._spawnTimer >= this._pendingSpawns[this._spawnIndex].delay
            ) {
                this._spawnEnemy(this._pendingSpawns[this._spawnIndex].config);
                this._spawnIndex++;
            }
        }

        // 检查波次是否完成（所有敌人都生成 + 都结束）
        if (
            this._spawnIndex >= this._pendingSpawns.length &&
            this._totalDefeated >= this._totalToSpawn &&
            this._totalToSpawn > 0
        ) {
            this._onWaveComplete();
        }
    }

    // ─────────────────────────────────────────────────────────────
    // T030: 对象池 — 敌人生成/回收
    // ─────────────────────────────────────────────────────────────

    private _spawnEnemy(waveEnemy: WaveEnemy): void {
        const config = GameManager.instance?.getEnemyConfig(waveEnemy.enemyId);
        if (!config || !this.enemyContainer) return;

        // 从对象池取或新建
        let enemy = this._enemyPool.pop() ?? null;
        if (!enemy) {
            if (!this.enemyPrefab) return;
            const node = instantiate(this.enemyPrefab);
            this.enemyContainer.addChild(node);
            enemy = node.getComponent(Enemy);
            if (!enemy) return;
        } else {
            this.enemyContainer.addChild(enemy.node);
        }

        enemy.init(
            config,
            waveEnemy.lane,
            this._onEnemyDeath.bind(this),
            this._onEnemyReachEnd.bind(this)
        );

        this._activeEnemies.push(enemy);
        this._totalSpawned++;
    }

    private _onEnemyDeath(enemy: Enemy): void {
        this._removeActiveEnemy(enemy);
        this._recycleEnemy(enemy);
        this._totalDefeated++;
    }

    private _onEnemyReachEnd(enemy: Enemy): void {
        this._removeActiveEnemy(enemy);
        this._recycleEnemy(enemy);
        this._totalDefeated++;
        // 扣生命
        GameManager.instance?.loseHp(1);
    }

    private _removeActiveEnemy(enemy: Enemy): void {
        const idx = this._activeEnemies.indexOf(enemy);
        if (idx >= 0) this._activeEnemies.splice(idx, 1);
    }

    private _recycleEnemy(enemy: Enemy): void {
        enemy.reset();
        this._enemyPool.push(enemy);
    }

    // ─────────────────────────────────────────────────────────────
    // 波次完成
    // ─────────────────────────────────────────────────────────────

    private _onWaveComplete(): void {
        this._waveInProgress = false;
        console.log('[WaveManager] 波次完成！');
        this._onWaveCompleteCallbacks.forEach(cb => cb());
        GameManager.instance?.onWaveComplete();
    }

    // ─────────────────────────────────────────────────────────────
    // 武器查询接口（Weapon 自动攻击使用）
    // ─────────────────────────────────────────────────────────────

    /**
     * 查找射程内生命值最低的敌人
     * @param worldX 武器世界 X
     * @param worldY 武器世界 Y
     * @param range 射程（像素）
     */
    public findTarget(worldX: number, worldY: number, range: number): Enemy | null {
        let target: Enemy | null = null;
        let minHp = Infinity;

        for (const enemy of this._activeEnemies) {
            if (!enemy.isActive) continue;
            const ep = enemy.node.worldPosition;
            const dx = ep.x - worldX;
            const dy = ep.y - worldY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= range && enemy.currentHp < minHp) {
                minHp = enemy.currentHp;
                target = enemy;
            }
        }
        return target;
    }

    /** 获取所有活跃敌人（技能 AoE 使用） */
    public get activeEnemies(): Enemy[] {
        return this._activeEnemies;
    }

    // ─────────────────────────────────────────────────────────────
    // 回调订阅
    // ─────────────────────────────────────────────────────────────

    public onWaveComplete(cb: () => void): void {
        this._onWaveCompleteCallbacks.push(cb);
    }
}
