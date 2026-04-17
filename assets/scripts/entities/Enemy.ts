import { _decorator, Component, Label, Node, Sprite, Color, tween, Vec3, ProgressBar, Graphics, UITransform } from 'cc';
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
    /** 战场 X 范围（世界坐标，对齐武器位置 ~475-540，让敌人在射程内经过） */
    public static readonly FIELD_X_MIN: number = 350;
    public static readonly FIELD_X_MAX: number = 700;
    /** 兼容旧接口保留 */
    public static readonly LANE_X: number[] = [-300, -100, 100];
    /** 出生世界 Y（屏幕顶边外） */
    public static readonly SPAWN_Y: number = 760;
    /** 到达此世界 Y 触发扣血（低于武器Y=130，给武器留充足拦截空间） */
    public static readonly END_Y: number = 90;

    // ─── 运行时数据 ───────────────────────────────────────────────
    private _config: EnemyConfig | null = null;
    private _currentHp: number = 0;
    private _maxHp: number = 0;
    private _lane: number = 1;
    private _active: boolean = false;

    // 回调
    private _onDeath: EnemyDeathCallback | null = null;
    private _onReachEnd: EnemyReachEndCallback | null = null;

    // ─── 燃烧状态（fire 元素武器） ────────────────────────────────
    private _burnTimer: number = 0;
    private _burnDamage: number = 0;
    private _burnInterval: number = 0.5;
    private _burnTickTimer: number = 0;

    // ─── 减速状态（ice 元素武器 / slow 技能） ────────────────────
    private _slowMultiplier: number = 1.0;
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
        this._slowMultiplier = 1.0;
        this._slowTimer = 0;
        this._burnTimer = 0;
        this._burnDamage = 0;
        this._burnTickTimer = 0;

        // 设置初始位置：X 随机，Y 从屏幕可见顶部出现（用世界坐标，避免父节点偏移）
        const xRange = Enemy.FIELD_X_MAX - Enemy.FIELD_X_MIN;
        const worldX = Enemy.FIELD_X_MIN + Math.random() * xRange;
        const worldY = Enemy.SPAWN_Y;
        this.node.setWorldPosition(worldX, worldY, 0);
        this.node.active = true;

        // 刷新 UI
        if (this.nameLabel) this.nameLabel.string = config.name;
        this._refreshHpBar();

        // 用 Graphics 画敌人本体
        this._drawBody(config.type);
    }

    /** 重置（回对象池前调用） */
    public reset(): void {
        this._active = false;
        this._config = null;
        this._onDeath = null;
        this._onReachEnd = null;
        // 重置 scale（死亡动画会把 scale 缩到 0）
        this.node.setScale(1, 1, 1);
        this.node.active = false;
    }

    // ─────────────────────────────────────────────────────────────
    // 每帧更新
    // ─────────────────────────────────────────────────────────────

    update(dt: number) {
        if (!this._active || !this._config) return;

        // ── 减速计时 ────────────────────────────────────────────
        if (this._slowTimer > 0) {
            this._slowTimer -= dt;
            if (this._slowTimer <= 0) {
                this._slowMultiplier = 1.0;
            }
        }

        // ── 燃烧计时（fire 元素武器） ────────────────────────────
        if (this._burnTimer > 0) {
            this._burnTimer -= dt;
            this._burnTickTimer -= dt;
            if (this._burnTickTimer <= 0) {
                this._burnTickTimer = this._burnInterval;
                this.takeDamage(this._burnDamage);
            }
            if (this._burnTimer <= 0) {
                this._burnTimer = 0;
                this._burnDamage = 0;
                this._burnTickTimer = 0;
            }
        }

        // ── 向下移动（用世界坐标，避免父节点影响） ─────────────────
        const speed = this._config.speed * this._slowMultiplier;
        const wp = this.node.worldPosition;
        this.node.setWorldPosition(wp.x, wp.y - speed * dt, 0);

        // 到达底部（世界坐标）
        if (this.node.worldPosition.y <= Enemy.END_Y) {
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
    // 元素特效（由 Weapon 调用）
    // ─────────────────────────────────────────────────────────────

    /**
     * 燃烧效果（fire 元素武器）
     * 每 0.5 秒造成 damagePerTick 点伤害，持续 duration 秒
     * 重复施加时刷新持续时间（取较长者）
     */
    public applyBurn(damagePerTick: number, duration: number): void {
        this._burnDamage = damagePerTick;
        // 刷新持续时间（若已有燃烧，取较长者）
        this._burnTimer = Math.max(this._burnTimer, duration);
        // 首次触发立即开始计时
        if (this._burnTickTimer <= 0) {
            this._burnTickTimer = this._burnInterval;
        }
    }

    /** 减速效果（ice 元素武器 / slow 技能） */
    public applySlow(multiplier: number, duration: number): void {
        // 取减速效果最强的那个
        this._slowMultiplier = Math.min(this._slowMultiplier, multiplier);
        this._slowTimer = Math.max(this._slowTimer, duration);
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
        // 同时用 Graphics 刷新血条
        this._drawBody(this._config?.type ?? 'normal');
    }

    private _playHitFlash(): void {
        // bodySprite 闪白
        if (this.bodySprite) {
            const orig = this.bodySprite.color.clone();
            this.bodySprite.color = new Color(255, 255, 255, 255);
            this.scheduleOnce(() => { if (this.bodySprite) this.bodySprite.color = orig; }, 0.06);
        } else {
            // 没有 Sprite 时，用 Graphics 闪白后恢复
            this.scheduleOnce(() => this._drawBody(this._config?.type ?? 'normal'), 0.06);
        }
    }

    /** 用 Graphics 画敌人本体 + 血条 */
    private _drawBody(type: string): void {
        let g = this.node.getComponent(Graphics);
        if (!g) g = this.node.addComponent(Graphics);
        if (!g) return;
        g.clear();

        const r = 30;   // 敌人半径
        // 本体颜色
        switch (type) {
            case 'normal': g.fillColor = new Color(80, 200, 80, 255); break;
            case 'elite':  g.fillColor = new Color(80, 120, 230, 255); break;
            case 'boss':   g.fillColor = new Color(220, 60, 60, 255); break;
            default:       g.fillColor = new Color(80, 200, 80, 255); break;
        }
        g.circle(0, 0, r);
        g.fill();

        // 描边
        g.strokeColor = new Color(255, 255, 255, 120);
        g.lineWidth = 2;
        g.circle(0, 0, r);
        g.stroke();

        // 血条背景（在本体上方）
        const barW = 60, barH = 8;
        const barX = -barW / 2;
        const barY = r + 6;
        g.fillColor = new Color(60, 60, 60, 200);
        g.rect(barX, barY, barW, barH);
        g.fill();

        // 血条前景
        const hp = this._maxHp > 0 ? Math.max(0, this._currentHp / this._maxHp) : 0;
        g.fillColor = new Color(80, 220, 80, 255);
        g.rect(barX, barY, barW * hp, barH);
        g.fill();
    }
}
