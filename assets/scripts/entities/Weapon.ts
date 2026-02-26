import { _decorator, Component, Label, Sprite, Color, Node, tween, Vec3 } from 'cc';
import { WeaponConfig } from '../types/GameTypes';

const { ccclass, property } = _decorator;

/**
 * Weapon — 武器实体组件
 * T014: 绑定 WeaponConfig，显示武器图标和等级
 * 挂载到武器 Prefab 根节点
 */
@ccclass('Weapon')
export class Weapon extends Component {

    @property(Label)
    public levelLabel: Label | null = null;   // 显示等级数字

    @property(Label)
    public nameLabel: Label | null = null;    // 显示武器名称

    @property(Sprite)
    public iconSprite: Sprite | null = null;  // 武器图标

    @property(Node)
    public bgNode: Node | null = null;        // 背景节点（用于换色）

    // ─── 武器数据 ─────────────────────────────────────────────────
    private _config: WeaponConfig | null = null;
    private _row: number = -1;
    private _col: number = -1;

    // ─── 颜色映射（按等级） ────────────────────────────────────────
    private static readonly LEVEL_COLORS: Color[] = [
        new Color(100, 180, 100, 255),   // Lv1 — 绿色
        new Color(100, 140, 220, 255),   // Lv2 — 蓝色
        new Color(180, 100, 220, 255),   // Lv3 — 紫色
        new Color(220, 160, 50, 255),    // Lv4 — 金色
        new Color(220, 80, 80, 255),     // Lv5 — 红色
    ];

    // ─────────────────────────────────────────────────────────────
    // 初始化
    // ─────────────────────────────────────────────────────────────

    /** 由 GridUI 调用，绑定武器配置 */
    public init(config: WeaponConfig, row: number, col: number): void {
        this._config = config;
        this._row = row;
        this._col = col;
        this._refresh();
    }

    private _refresh(): void {
        if (!this._config) return;

        // 等级标签
        if (this.levelLabel) {
            this.levelLabel.string = `Lv.${this._config.level}`;
        }

        // 名称标签
        if (this.nameLabel) {
            this.nameLabel.string = this._config.name;
        }

        // 背景颜色（按等级）
        if (this.bgNode) {
            const color = Weapon.LEVEL_COLORS[this._config.level - 1] ?? Weapon.LEVEL_COLORS[0];
            const sprite = this.bgNode.getComponent(Sprite);
            if (sprite) sprite.color = color;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 属性读取
    // ─────────────────────────────────────────────────────────────

    public get config(): WeaponConfig | null { return this._config; }
    public get level(): number { return this._config?.level ?? 0; }
    public get row(): number { return this._row; }
    public get col(): number { return this._col; }

    public setGridPos(row: number, col: number): void {
        this._row = row;
        this._col = col;
    }

    // ─────────────────────────────────────────────────────────────
    // T018: 动画效果
    // ─────────────────────────────────────────────────────────────

    /** 合成成功动画：弹出缩放 + 淡入 */
    public playMergeAnimation(): Promise<void> {
        return new Promise(resolve => {
            const originalScale = this.node.scale.clone();
            tween(this.node)
                .to(0.1, { scale: new Vec3(1.3, 1.3, 1) })
                .to(0.15, { scale: originalScale })
                .call(() => resolve())
                .start();
        });
    }

    /** 放置动画：从小到大弹入 */
    public playSpawnAnimation(): Promise<void> {
        return new Promise(resolve => {
            this.node.setScale(0, 0, 1);
            tween(this.node)
                .to(0.2, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'backOut' })
                .to(0.08, { scale: new Vec3(1, 1, 1) })
                .call(() => resolve())
                .start();
        });
    }

    /** 拖拽时的跟随状态 */
    public setDragging(isDragging: boolean): void {
        const scale = isDragging ? new Vec3(1.15, 1.15, 1) : new Vec3(1, 1, 1);
        tween(this.node)
            .to(0.08, { scale })
            .start();
    }

    /** 回原位动画（合成失败） */
    public playReturnAnimation(targetPos: Vec3): Promise<void> {
        return new Promise(resolve => {
            tween(this.node)
                .to(0.15, { position: targetPos }, { easing: 'quadOut' })
                .call(() => resolve())
                .start();
        });
    }
}
