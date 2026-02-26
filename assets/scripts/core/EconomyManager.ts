import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

/** 金币变化回调 */
type GoldChangeCallback = (newGold: number, delta: number) => void;

/**
 * EconomyManager — 金币经济系统
 * T010: 管理金币增减，提供购买判断
 */
@ccclass('EconomyManager')
export class EconomyManager extends Component {

    private static _instance: EconomyManager | null = null;

    public static get instance(): EconomyManager {
        return EconomyManager._instance!;
    }

    private _gold: number = 0;
    private _callbacks: GoldChangeCallback[] = [];

    onLoad() {
        if (EconomyManager._instance) {
            this.destroy();
            return;
        }
        EconomyManager._instance = this;
    }

    onDestroy() {
        if (EconomyManager._instance === this) {
            EconomyManager._instance = null;
        }
    }

    // ─── 初始化 ──────────────────────────────────────────────────

    /** 由 GameManager 初始化金币 */
    public init(gold: number): void {
        this._gold = gold;
        this._notifyChange(0);
        console.log(`[EconomyManager] 初始化金币: ${gold}`);
    }

    // ─── 读取 ────────────────────────────────────────────────────

    public get gold(): number {
        return this._gold;
    }

    /** 是否有足够金币 */
    public canAfford(amount: number): boolean {
        return this._gold >= amount;
    }

    // ─── 增减 ────────────────────────────────────────────────────

    /** 增加金币（击杀奖励等） */
    public earn(amount: number): void {
        if (amount <= 0) return;
        this._gold += amount;
        this._notifyChange(amount);
        console.log(`[EconomyManager] +${amount} 金币，当前: ${this._gold}`);
    }

    /**
     * 消费金币
     * @returns true=扣款成功，false=金币不足
     */
    public spend(amount: number): boolean {
        if (!this.canAfford(amount)) {
            console.warn(`[EconomyManager] 金币不足，需要 ${amount}，当前 ${this._gold}`);
            return false;
        }
        this._gold -= amount;
        this._notifyChange(-amount);
        console.log(`[EconomyManager] -${amount} 金币，当前: ${this._gold}`);
        return true;
    }

    /** 强制设置金币（读档时使用） */
    public setGold(gold: number): void {
        const delta = gold - this._gold;
        this._gold = gold;
        this._notifyChange(delta);
    }

    // ─── 回调订阅 ────────────────────────────────────────────────

    /** 订阅金币变化（UI 使用） */
    public onGoldChange(callback: GoldChangeCallback): void {
        this._callbacks.push(callback);
    }

    /** 取消订阅 */
    public offGoldChange(callback: GoldChangeCallback): void {
        const idx = this._callbacks.indexOf(callback);
        if (idx >= 0) this._callbacks.splice(idx, 1);
    }

    private _notifyChange(delta: number): void {
        this._callbacks.forEach(cb => cb(this._gold, delta));
    }
}
