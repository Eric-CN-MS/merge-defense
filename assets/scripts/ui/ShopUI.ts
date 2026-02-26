import { _decorator, Component, Button, Label, Node, tween, Vec3, Color } from 'cc';
import { EconomyManager } from '../core/EconomyManager';
import { GridManager } from '../core/GridManager';
import { GameManager } from '../core/GameManager';
import { GAME_CONFIG, GameState } from '../types/GameTypes';

const { ccclass, property } = _decorator;

/**
 * ShopUI — 商店 UI
 * T019: 购买武器按钮 + 价格显示
 * T021: 购买流程（EconomyManager → GridManager → 刷新）
 * T023: 金币不足处理（按钮置灰 + Toast 提示）
 */
@ccclass('ShopUI')
export class ShopUI extends Component {

    @property(Button)
    public buyButton: Button | null = null;       // 购买按钮

    @property(Label)
    public buyPriceLabel: Label | null = null;    // 按钮上的价格文字

    @property(Label)
    public buyButtonLabel: Label | null = null;   // 按钮主文字

    @property(Node)
    public toastNode: Node | null = null;         // Toast 提示节点

    @property(Label)
    public toastLabel: Label | null = null;       // Toast 文字

    @property(Button)
    public startWaveButton: Button | null = null; // 开始波次按钮

    // ─── Toast 状态 ───────────────────────────────────────────────
    private _toastTimer: number = 0;
    private _showingToast: boolean = false;
    private readonly TOAST_DURATION = 1.5;

    // ─────────────────────────────────────────────────────────────
    // 生命周期
    // ─────────────────────────────────────────────────────────────

    start() {
        // 绑定购买按钮
        this.buyButton?.node.on(Button.EventType.CLICK, this._onBuyClick, this);

        // 绑定开始波次按钮
        this.startWaveButton?.node.on(Button.EventType.CLICK, this._onStartWaveClick, this);

        // 监听金币变化，更新按钮状态
        EconomyManager.instance?.onGoldChange(this._onGoldChange.bind(this));

        // 监听游戏状态
        GameManager.instance?.onStateChange(this._onStateChange.bind(this));

        // 初始化 UI
        this._refreshBuyButton();
        this._hideToast();

        if (this.buyPriceLabel) {
            this.buyPriceLabel.string = `${GAME_CONFIG.WEAPON_COST} 金币`;
        }
    }

    update(dt: number) {
        // Toast 计时消失
        if (this._showingToast) {
            this._toastTimer -= dt;
            if (this._toastTimer <= 0) {
                this._hideToast();
            }
        }
    }

    onDestroy() {
        EconomyManager.instance?.offGoldChange(this._onGoldChange.bind(this));
    }

    // ─────────────────────────────────────────────────────────────
    // T021: 购买流程
    // ─────────────────────────────────────────────────────────────

    private _onBuyClick(): void {
        const economy = EconomyManager.instance;
        const grid = GridManager.instance;
        const gm = GameManager.instance;

        if (!economy || !grid || !gm) return;

        // 只在准备阶段可以购买
        if (gm.state !== GameState.WAVE_PREP) {
            this._showToast('战斗中无法购买');
            return;
        }

        // 检查金币
        if (!economy.canAfford(GAME_CONFIG.WEAPON_COST)) {
            this._showToast('金币不足！');
            this._shakeBuyButton();
            return;
        }

        // 检查格子
        if (!grid.hasEmptyCell()) {
            this._showToast('格子已满！');
            this._shakeBuyButton();
            return;
        }

        // 获取1级武器配置
        const weaponConfig = gm.getWeaponConfig(1);
        if (!weaponConfig) {
            console.error('[ShopUI] 找不到1级武器配置');
            return;
        }

        // 扣金币
        const success = economy.spend(GAME_CONFIG.WEAPON_COST);
        if (!success) return;

        // 放置武器
        grid.placeWeapon(weaponConfig);

        // 按钮点击反馈动画
        this._playBuyFeedback();
        console.log('[ShopUI] 购买成功：1级武器');
    }

    private _onStartWaveClick(): void {
        const gm = GameManager.instance;
        if (!gm) return;

        if (gm.state === GameState.WAVE_PREP) {
            gm.startWave();
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 按钮状态刷新
    // ─────────────────────────────────────────────────────────────

    private _refreshBuyButton(): void {
        if (!this.buyButton) return;

        const economy = EconomyManager.instance;
        const grid = GridManager.instance;
        const gm = GameManager.instance;

        const canBuy = economy?.canAfford(GAME_CONFIG.WEAPON_COST) ?? false;
        const hasSpace = grid?.hasEmptyCell() ?? true;
        const inPrep = gm?.state === GameState.WAVE_PREP;

        const enabled = canBuy && hasSpace && inPrep;
        this.buyButton.interactable = enabled;

        // 按钮文字颜色
        if (this.buyButtonLabel) {
            this.buyButtonLabel.color = enabled
                ? new Color(255, 255, 255, 255)
                : new Color(180, 180, 180, 255);
        }
    }

    private _onGoldChange(gold: number, delta: number): void {
        this._refreshBuyButton();
    }

    private _onStateChange(state: GameState): void {
        this._refreshBuyButton();

        // 战斗中隐藏购买按钮，显示开始波次按钮逻辑
        if (this.startWaveButton) {
            this.startWaveButton.node.active = state === GameState.WAVE_PREP;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // T023: Toast 提示
    // ─────────────────────────────────────────────────────────────

    private _showToast(message: string): void {
        if (!this.toastNode || !this.toastLabel) return;

        this.toastLabel.string = message;
        this.toastNode.active = true;
        this.toastNode.setPosition(0, 0, 0);
        this._showingToast = true;
        this._toastTimer = this.TOAST_DURATION;

        // 浮上去淡出
        tween(this.toastNode)
            .to(0.3, { position: new Vec3(0, 30, 0) })
            .delay(0.8)
            .to(0.3, { position: new Vec3(0, 60, 0) })
            .start();
    }

    private _hideToast(): void {
        if (this.toastNode) this.toastNode.active = false;
        this._showingToast = false;
    }

    // ─────────────────────────────────────────────────────────────
    // 按钮动画反馈
    // ─────────────────────────────────────────────────────────────

    /** 购买成功：按钮弹跳 */
    private _playBuyFeedback(): void {
        if (!this.buyButton) return;
        const btn = this.buyButton.node;
        tween(btn)
            .to(0.06, { scale: new Vec3(0.92, 0.92, 1) })
            .to(0.1, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .start();
    }

    /** 金币不足：按钮抖动 */
    private _shakeBuyButton(): void {
        if (!this.buyButton) return;
        const btn = this.buyButton.node;
        const originX = btn.position.x;
        tween(btn)
            .to(0.05, { position: new Vec3(originX - 8, btn.position.y, 0) })
            .to(0.05, { position: new Vec3(originX + 8, btn.position.y, 0) })
            .to(0.05, { position: new Vec3(originX - 5, btn.position.y, 0) })
            .to(0.05, { position: new Vec3(originX, btn.position.y, 0) })
            .start();
    }
}
