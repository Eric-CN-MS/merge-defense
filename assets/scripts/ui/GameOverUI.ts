import { _decorator, Component, Label, Button, Node, tween, Vec3 } from 'cc';
import { GameManager } from '../core/GameManager';
import { GameState } from '../types/GameTypes';

const { ccclass, property } = _decorator;

/**
 * GameOverUI — 游戏结束界面
 * T032+T033: 显示波次/最高记录，"再来一局"重置
 */
@ccclass('GameOverUI')
export class GameOverUI extends Component {

    @property(Node)
    public panel: Node | null = null;           // 整个结算面板

    @property(Label)
    public waveResultLabel: Label | null = null; // "坚持到第 X 波"

    @property(Label)
    public bestWaveLabel: Label | null = null;   // "历史最高：X 波"

    @property(Button)
    public restartButton: Button | null = null;  // 再来一局

    // ─────────────────────────────────────────────────────────────

    start() {
        // 默认隐藏
        if (this.panel) this.panel.active = false;

        // 监听游戏状态
        GameManager.instance?.onStateChange(this._onStateChange.bind(this));

        // 绑定按钮
        this.restartButton?.node.on(Button.EventType.CLICK, this._onRestart, this);
    }

    private _onStateChange(state: GameState): void {
        if (state === GameState.GAME_OVER) {
            this._show();
        } else {
            this._hide();
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 显示/隐藏
    // ─────────────────────────────────────────────────────────────

    private _show(): void {
        const gm = GameManager.instance;
        if (!gm || !this.panel) return;

        const state = gm.playerState;
        const currentWave = gm.currentWave;
        const bestWave = state?.bestWave ?? 0;

        if (this.waveResultLabel) {
            this.waveResultLabel.string = `坚持到第 ${currentWave} 波`;
        }
        if (this.bestWaveLabel) {
            this.bestWaveLabel.string = `历史最高：${bestWave} 波`;
        }

        this.panel.active = true;
        this.panel.setScale(0.5, 0.5, 1);

        // 弹入动画
        tween(this.panel)
            .to(0.3, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'backOut' })
            .to(0.1, { scale: new Vec3(1, 1, 1) })
            .start();
    }

    private _hide(): void {
        if (this.panel) this.panel.active = false;
    }

    // ─────────────────────────────────────────────────────────────
    // 再来一局
    // ─────────────────────────────────────────────────────────────

    private _onRestart(): void {
        // 按钮反馈
        tween(this.restartButton!.node)
            .to(0.08, { scale: new Vec3(0.9, 0.9, 1) })
            .to(0.12, { scale: new Vec3(1, 1, 1) })
            .call(() => {
                GameManager.instance?.restartGame();
            })
            .start();
    }
}
