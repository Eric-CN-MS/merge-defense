import { _decorator, Component, Label, Sprite, Color, Node, Prefab, instantiate, tween, Vec3, Graphics, UITransform, Layers } from 'cc';
import { WeaponConfig } from '../types/GameTypes';
import { WaveManager } from '../core/WaveManager';
import { Projectile } from './Projectile';

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

    @property(Prefab)
    public projectilePrefab: Prefab | null = null;  // 子弹 Prefab

    @property(Node)
    public projectileContainer: Node | null = null; // 子弹父节点（场景级）

    // ─── 武器数据 ─────────────────────────────────────────────────
    private _config: WeaponConfig | null = null;
    private _row: number = -1;
    private _col: number = -1;

    // ─── 自动攻击状态（T026）────────────────────────────────────────
    private _attackTimer: number = 0;
    private _attackEnabled: boolean = false;
    private _projectilePool: Projectile[] = [];
    // 武器攻击力临时加成（技能 buff_weapons）
    private _damageMultiplier: number = 1.0;
    private _buffTimer: number = 0;

    // ─── CD 时钟 Graphics 缓存 ─────────────────────────────────────
    private _cdGraphics: Graphics | null = null;

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

        // 背景颜色 — 优先用 bgNode.Sprite，否则直接用 Graphics 画
        const color = Weapon.LEVEL_COLORS[(this._config.level - 1) % Weapon.LEVEL_COLORS.length];
        if (this.bgNode) {
            const sprite = this.bgNode.getComponent(Sprite);
            if (sprite) sprite.color = color;
        }

        // 始终尝试用 Graphics 在根节点画填充矩形（保证有背景色）
        let g = this.node.getComponent(Graphics);
        if (!g) g = this.node.addComponent(Graphics);
        const uit = this.node.getComponent(UITransform);
        const w = uit ? uit.contentSize.width : 140;
        const h = uit ? uit.contentSize.height : 140;
        g.clear();
        g.fillColor = color;
        g.roundRect(-w / 2, -h / 2, w, h, 12);
        g.fill();
        // 边框
        g.strokeColor = new Color(255, 255, 255, 80);
        g.lineWidth = 2;
        g.roundRect(-w / 2, -h / 2, w, h, 12);
        g.stroke();
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
    // T026: 自动攻击
    // ─────────────────────────────────────────────────────────────

    /** 启用/禁用自动攻击（波次开始/结束时切换） */
    public setAttackEnabled(enabled: boolean): void {
        this._attackEnabled = enabled;
        if (!enabled) this._attackTimer = 0;
    }

    update(dt: number) {
        if (!this._attackEnabled || !this._config) return;

        // buff 计时
        if (this._buffTimer > 0) {
            this._buffTimer -= dt;
            if (this._buffTimer <= 0) this._damageMultiplier = 1.0;
        }

        // 攻击冷却
        this._attackTimer += dt;
        const interval = 1 / this._config.attackSpeed;
        if (this._attackTimer >= interval) {
            this._attackTimer = 0;
            this._tryAttack();
        }

        // 更新 CD 时钟扇形（每帧）
        this._drawCdClock(this._attackTimer / interval);
    }

    /** 在武器背景上画时钟扇形 CD 指示 */
    private _drawCdClock(progress: number): void {
        if (!this._cdGraphics) {
            const cdNode = new Node('CDOverlay');
            cdNode.layer = Layers.Enum.UI_2D;
            this.node.addChild(cdNode);
            const uit = cdNode.addComponent(UITransform);
            uit.setContentSize(140, 140);
            this._cdGraphics = cdNode.addComponent(Graphics);
        }
        const g = this._cdGraphics;
        const r = 60; // 扇形半径（略小于格子）
        g.clear();

        if (progress > 0.01) {
            // 暗色遮罩扇形（顺时针从顶部开始）
            const startAngle = Math.PI / 2;           // 12点钟方向
            const endAngle = startAngle - progress * Math.PI * 2; // 顺时针
            g.fillColor = new Color(0, 0, 0, 120);
            g.moveTo(0, 0);
            // arc 参数: cx, cy, r, startAngle, endAngle, counterClockwise
            g.arc(0, 0, r, startAngle, endAngle, true);
            g.lineTo(0, 0);
            g.fill();

            // 边框圆
            g.strokeColor = new Color(255, 255, 255, 60);
            g.lineWidth = 2;
            g.circle(0, 0, r);
            g.stroke();
        }
    }

    private _tryAttack(): void {
        if (!this._config) return;
        const wm = WaveManager.instance;
        if (!wm) return;

        const wp = this.node.worldPosition;
        const target = wm.findTarget(wp.x, wp.y, this._config.range);
        if (!target) return;

        this._fireProjectile(target);
    }

    private _fireProjectile(target: any): void {
        if (!this._config) return;
        const container = this.projectileContainer;
        if (!container || !this.projectilePrefab) return;

        // 对象池取子弹
        let proj = this._projectilePool.pop() ?? null;
        if (!proj) {
            const node = instantiate(this.projectilePrefab);
            node.layer = Layers.Enum.UI_2D;
            container.addChild(node);
            proj = node.getComponent(Projectile);
            if (!proj) {
                console.error('[Weapon] Projectile component missing on prefab!');
                return;
            }
        } else {
            proj.node.layer = Layers.Enum.UI_2D;
            container.addChild(proj.node);
        }

        // 从武器位置出发
        proj.node.setWorldPosition(this.node.worldPosition);

        const damage = Math.round(this._config.damage * this._damageMultiplier);
        proj.init(target, damage, (p) => {
            p.reset();
            this._projectilePool.push(p);
        });
    }

    /** 临时增益（技能 buff_weapons） */
    public applyDamageBuff(multiplier: number, duration: number): void {
        this._damageMultiplier = multiplier;
        this._buffTimer = duration;
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
