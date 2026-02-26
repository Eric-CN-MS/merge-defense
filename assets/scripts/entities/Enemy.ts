import { _decorator, Component, Label, Node, Sprite, Color, tween, Vec3, ProgressBar } from 'cc';
import { EnemyConfig } from '../types/GameTypes';
import { EconomyManager } from '../core/EconomyManager';
import { GameManager } from '../core/GameManager';

const { ccclass, property } = _decorator;

/** 敌人死亡回调 */
export type EnemyDeathCallback = (enemy: Enemy) => void;
/** 敌人到达底部回调 */
export type EnemyReachEndCallback = (enemy: Enemy) => void;

/**
 * Enemy — 敌人实体组件
 * T024: 沿路线向下移动，血条 UI
 * T028: takeDamage() + 死亡逻辑
 * T029: 到达底部扣血
 */
@ccclass('Enemy')
export class Enemy extends Component {

    @property(Label)
    public nameLabel: Label | null = null;

    @property(ProgressBar)
    public hpBar: ProgressBar | null = null;

    @property(Sprite)
    public bodySprite: Sprite | null = null;

    // ─── 路线 X 坐标（由 WaveManager 设置）──────────────────────
    /** 3 条路线的 X 坐标 */
    public static readonly LANE_X: number[] = [-150, 0, 150];
    /** 敌人出生 Y 坐标（屏幕上方外） */
    public static readonly SPAWN_Y: number = 600;
    /** 敌人到达底部的 Y 坐标 */
    public static readonly END_Y: number = -700;

    // ─── 运行时数据 ───────────────────────────────────────────────
    private _config: EnemyConfig | null = null;
    private _currentHp: number = 0;
    private _maxHp: number = 0;
    private _lane: number = 1;
    private _active: boolean = false;

    // 回调
    private _onDeath: EnemyDeathCallback | null = null;
    private _onReachEnd: EnemyReachEndCallback | null = null;

    // 减速倍率（技能 slow 使用）
    private _speedMultiplier: number = 1.0;
    private _slowTimer: number = 0;

    // ─────────────────────────────────────────────────────────────
    // 初始化（对象池复用接口）
    // ─────────────────────────────────────────────────────────────

    public init(
        config: EnemyConfig,
        lane: number,
        onDeath: EnemyDeathCallback,
        onReachEnd: EnemyReachEndCallback
    ): void {
        this._config = config;
        this._currentHp = config.hp;
        this._maxHp = config.hp;
        this._lane = lane;
        this._active = true;
        this._onDeath = onDeath;
        this._onReachEnd = onReachEnd;
        this._speedMultiplier = 1.0;
        this._slowTimer = 0;

        // 设置初始位置
        const x = Enemy.LANE_X[lane] ?? 0;
        this.node.setPosition(x, Enemy.SPAWN_Y, 0);
        this.node.active = true;

        // 刷新 UI
        if (this.nameLabel) this.nameLabel.string = config.name;
        this._refreshHpBar();

        // 按类型设置颜色
        if (this.bodySprite) {
            switch (config.type) {
                case 'normal': this.bodySprite.color = new Color(80, 180, 80, 255); break;
                case 'elite':  this.bodySprite.color = new Color(80, 80, 220, 255); break;
                case 'boss':   this.bodySprite.color = new Color(200, 50, 50, 255); break;
            }
        }
    }

    /** 重置（回对象池前调用） */
    public reset(): void {
        this._active = false;
        this._config = null;
        this._onDeath = null;
        this._onReachEnd = null;
        this.node.active = false;
    }

    // ─────────────────────────────────────────────────────────────
    // 每帧更新
    // ─────────────────────────────────────────────────────────────

    update(dt: number) {
        if (!this._active || !this._config) return;

        // 减速计时
        if (this._slowTimer > 0) {
            this._slowTimer -= dt;
            if (this._slowTimer <= 0) {
                this._speedMultiplier = 1.0;
            }
        }

        // 向下移动
        const speed = this._config.speed * this._speedMultiplier;
        const pos = this.node.position;
        this.node.setPosition(pos.x, pos.y - speed * dt, pos.z);

        // 到达底部
        if (this.node.position.y <= Enemy.END_Y) {
            this._reachEnd();
        }
    }

    // ─────────────────────────────────────────────────────────────
    // T028: 受伤 & 死亡
    // ─────────────────────────────────────────────────────────────

    public takeDamage(damage: number): void {
        if (!this._active || !this._config) return;

        this._currentHp -= damage;
        this._refreshHpBar();

        // 受击闪白
        this._playHitFlash();

        if (this._currentHp <= 0) {
            this._die();
        }
    }

    private _die(): void {
        if (!this._active || !this._config) return;
        this._active = false;

        // 奖励金币
        EconomyManager.instance?.earn(this._config.reward);

        // 死亡动画
        tween(this.node)
            .to(0.2, { scale: new Vec3(1.3, 1.3, 1) })
            .to(0.15, { scale: new Vec3(0, 0, 1) })
            .call(() => {
                this._onDeath?.(this);
            })
            .start();
    }

    // T029: 到达底部
    private _reachEnd(): void {
        if (!this._active) return;
        this._active = false;
        this._onReachEnd?.(this);
    }

    // ─────────────────────────────────────────────────────────────
    // 技能效果
    // ─────────────────────────────────────────────────────────────

    /** 减速（slow 技能） */
    public applySlow(multiplier: number, duration: number): void {
        this._speedMultiplier = multiplier;
        this._slowTimer = duration;
    }

    // ─────────────────────────────────────────────────────────────
    // 属性读取
    // ─────────────────────────────────────────────────────────────

    public get config(): EnemyConfig | null { return this._config; }
    public get isActive(): boolean { return this._active; }
    public get lane(): number { return this._lane; }
    public get currentHp(): number { return this._currentHp; }
    public get maxHp(): number { return this._maxHp; }

    // ─────────────────────────────────────────────────────────────
    // 工具
    // ─────────────────────────────────────────────────────────────

    private _refreshHpBar(): void {
        if (this.hpBar) {
            this.hpBar.progress = this._maxHp > 0
                ? Math.max(0, this._currentHp / this._maxHp)
                : 0;
        }
    }

    private _playHitFlash(): void {
        if (!this.bodySprite) return;
        const orig = this.bodySprite.color.clone();
        this.bodySprite.color = new Color(255, 255, 255, 255);
        tween(this.node)
            .delay(0.06)
            .call(() => { if (this.bodySprite) this.bodySprite.color = orig; })
            .start();
    }
}
