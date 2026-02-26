import { _decorator, Component, Label, Node, tween, Vec3, Color } from 'cc';
import { EconomyManager } from '../core/EconomyManager';
import { GameManager } from '../core/GameManager';
import { GameState } from '../types/GameTypes';

const { ccclass, property } = _decorator;

/**
 * HUD — 游戏抬头显示
 * T022: 金币实时显示 + 数字动画
 * 同时显示：波次、生命值、金币
 */
@ccclass('HUD')
export class HUD extends Component {

    @property(Label)
    public goldLabel: Label | null = null;       // 金币数量

    @property(Label)
    public waveLabel: Label | null = null;        // 当前波次

    @property(Label)
    public hpLabel: Label | null = null;          // 生命值

    @property(Node)
    public goldChangeEffect: Node | null = null;  // 金币变化浮动文字节点

    @property(Label)
    public goldChangeDeltaLabel: Label | null = null; // 浮动文字 Label

    // ─── 金币动画状态 ─────────────────────────────────────────────
    private _displayedGold: number = 0;
    private _targetGold: number = 0;
    private _goldAnimTimer: number = 0;
    private _goldAnimDuration: number = 0.4;

    // ─────────────────────────────────────────────────────────────
    // 生命周期
    // ─────────────────────────────────────────────────────────────

    start() {
        // 监听金币变化
        EconomyManager.instance?.onGoldChange(this._onGoldChange.bind(this));

        // 监听游戏状态变化
        GameManager.instance?.onStateChange(this._onStateChange.bind(this));

        // 初始化显示
        this._refresh();

        // 隐藏浮动效果节点
        if (this.goldChangeEffect) {
            this.goldChangeEffect.active = false;
        }
    }

    update(dt: number) {
        // 金币数字滚动动画
        if (this._displayedGold !== this._targetGold) {
            this._goldAnimTimer += dt;
            const t = Math.min(this._goldAnimTimer / this._goldAnimDuration, 1);
            const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
            this._displayedGold = Math.round(
                this._displayedGold + (this._targetGold - this._displayedGold) * eased
            );
            if (t >= 1) this._displayedGold = this._targetGold;
            if (this.goldLabel) {
                this.goldLabel.string = `🪙 ${this._displayedGold}`;
            }
        }
    }

    onDestroy() {
        EconomyManager.instance?.offGoldChange(this._onGoldChange.bind(this));
    }

    // ─────────────────────────────────────────────────────────────
    // 刷新显示
    // ─────────────────────────────────────────────────────────────

    private _refresh(): void {
        const gm = GameManager.instance;
        if (!gm) return;

        const gold = EconomyManager.instance?.gold ?? 0;
        this._displayedGold = gold;
        this._targetGold = gold;
        if (this.goldLabel) this.goldLabel.string = `🪙 ${gold}`;

        this._refreshWave();
        this._refreshHp();
    }

    private _refreshWave(): void {
        const wave = GameManager.instance?.currentWave ?? 1;
        if (this.waveLabel) this.waveLabel.string = `第 ${wave} 波`;
    }

    private _refreshHp(): void {
        const hp = GameManager.instance?.playerHp ?? 0;
        if (this.hpLabel) {
            // 用❤️显示生命值
            this.hpLabel.string = '❤️'.repeat(Math.max(0, hp));
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 金币变化回调
    // ─────────────────────────────────────────────────────────────

    private _onGoldChange(newGold: number, delta: number): void {
        this._targetGold = newGold;
        this._goldAnimTimer = 0;
        this._playGoldDeltaEffect(delta);
    }

    /** 浮动数字效果（+10 或 -50） */
    private _playGoldDeltaEffect(delta: number): void {
        if (!this.goldChangeEffect || !this.goldChangeDeltaLabel || delta === 0) return;

        const isPositive = delta > 0;
        this.goldChangeDeltaLabel.string = isPositive ? `+${delta}` : `${delta}`;
        this.goldChangeDeltaLabel.color = isPositive
            ? new Color(80, 220, 80, 255)
            : new Color(220, 80, 80, 255);

        const effect = this.goldChangeEffect;
        effect.active = true;
        effect.setPosition(0, 0, 0);
        effect.getComponent(Label)?.node;

        tween(effect)
            .to(0.6, { position: new Vec3(0, 40, 0) })
            .call(() => { effect.active = false; effect.setPosition(0, 0, 0); })
            .start();
    }

    // ─────────────────────────────────────────────────────────────
    // 游戏状态变化
    // ─────────────────────────────────────────────────────────────

    private _onStateChange(state: GameState): void {
        this._refreshWave();
        this._refreshHp();
    }

    /** 由 GameManager 外部调用，刷新生命值显示 */
    public refreshHp(): void {
        this._refreshHp();
    }
}
