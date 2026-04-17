import { _decorator, Component, Label, Sprite, Color, Node, Prefab, instantiate, tween, Vec3, Graphics, UITransform } from 'cc';
import { WeaponConfig } from '../types/GameTypes';
import { WaveManager } from '../core/WaveManager';
import { Projectile } from './Projectile';
import { Enemy } from './Enemy';

const { ccclass, property } = _decorator;

/**
 * Weapon — 武器实体组件
 * 支持多格武器（1x1/1x2/1x3）和4种元素属性（physical/fire/lightning/ice）
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

    // ─── 自动攻击状态 ────────────────────────────────────────────
    private _attackTimer: number = 0;
    private _attackEnabled: boolean = false;
    private _projectilePool: Projectile[] = [];
    // 武器攻击力临时加成（技能 buff_weapons）
    private _damageMultiplier: number = 1.0;
    private _buffTimer: number = 0;
    // 武器在格子中的世界坐标（战斗时节点被移到底部图标，攻击仍以此坐标为基准）
    private _gridWorldPos: Vec3 = new Vec3();

    // ─── CD 时钟 Graphics 缓存 ─────────────────────────────────────
    private _cdGraphics: Graphics | null = null;

    // ─── 元素颜色映射 ─────────────────────────────────────────────
    private static readonly ELEMENT_COLORS: Record<string, Color> = {
        physical:  new Color(80,  120, 180, 255),
        fire:      new Color(220, 80,  40,  255),
        lightning: new Color(180, 160, 40,  255),
        ice:       new Color(60,  160, 220, 255),
    };

    // ─── shape → 节点宽度映射 ────────────────────────────────────
    private static readonly SHAPE_WIDTHS: Record<string, number> = {
        '1x1': 90,
        '1x2': 190,  // 90×2 + 10 gap
        '2x1': 190,
        '1x3': 290,  // 90×3 + 10×2 gap
        '3x1': 290,
    };

    // ─────────────────────────────────────────────────────────────
    // 初始化
    // ─────────────────────────────────────────────────────────────

    /**
     * 由 GridUI 调用，绑定武器配置
     * gridWorldPos: 格子中心世界坐标（由 GridUI 直接计算后传入，不依赖节点变换）
     */
    public init(config: WeaponConfig, row: number, col: number, gridWorldPos?: Vec3): void {
        this._config = config;
        this._row = row;
        this._col = col;
        this._applyShape();
        this._refresh();
        if (gridWorldPos) {
            Vec3.copy(this._gridWorldPos, gridWorldPos);
        }
    }

    /** 根据 shape 调整节点宽度，高度保持 UITransform 当前值 */
    private _applyShape(): void {
        if (!this._config) return;
        const w = Weapon.SHAPE_WIDTHS[this._config.shape] ?? 90;
        const uit = this.node.getComponent(UITransform);
        if (uit) {
            // 高度保留外部设定值（GridUI 已设好），只更新宽度
            const h = uit.contentSize.height || 90;
            uit.setContentSize(w, h);
        }
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

        this._drawBackground();
    }

    /** 根据 element 绘制背景色 */
    private _drawBackground(): void {
        if (!this._config) return;
        const color = Weapon.ELEMENT_COLORS[this._config.element]
                   ?? Weapon.ELEMENT_COLORS['physical'];

        // bgNode Sprite 着色
        if (this.bgNode) {
            const sprite = this.bgNode.getComponent(Sprite);
            if (sprite) sprite.color = color;
        }

        // 始终用 Graphics 在根节点画填充矩形
        let g = this.node.getComponent(Graphics);
        if (!g) g = this.node.addComponent(Graphics);
        const uit = this.node.getComponent(UITransform);
        const w = uit ? uit.contentSize.width : 90;
        const h = uit ? uit.contentSize.height : 90;
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

    /** 格子尺寸变化时重绘（由 GridUI._rebuildCells 调用） */
    public redraw(size: number): void {
        const uit = this.node.getComponent(UITransform);
        if (this._config) {
            const w = Weapon.SHAPE_WIDTHS[this._config.shape] ?? size;
            if (uit) uit.setContentSize(w, size);
        } else {
            if (uit) uit.setContentSize(size, size);
        }
        this._refresh();
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
    // 自动攻击
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
            cdNode.layer = 1 << 25; // UI_2D layer
            this.node.addChild(cdNode);
            const uit = cdNode.addComponent(UITransform);
            uit.setContentSize(90, 90);
            this._cdGraphics = cdNode.addComponent(Graphics);
        }
        const g = this._cdGraphics;
        const r = 36; // 扇形半径（略小于格子）
        g.clear();

        if (progress > 0.01) {
            // 暗色遮罩扇形（顺时针从顶部开始）
            const startAngle = Math.PI / 2;           // 12点钟方向
            const endAngle = startAngle - progress * Math.PI * 2; // 顺时针
            g.fillColor = new Color(0, 0, 0, 120);
            g.moveTo(0, 0);
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

        // 用格子坐标寻敌（而非节点实时位置——战斗图标时节点被移到底部）
        const wx = this._gridWorldPos.x;
        const wy = this._gridWorldPos.y;
        const target = wm.findTarget(wx, wy, this._config.range);
        if (!target) return;

        this._fireProjectile(target);

        // 元素特效
        this._applyElementEffect(target);
    }

    /** 根据 element 对命中目标施加特效 */
    private _applyElementEffect(target: Enemy): void {
        if (!this._config) return;
        const wm = WaveManager.instance;

        switch (this._config.element) {
            case 'fire':
                // 燃烧：每0.5秒10点伤害，持续2秒
                target.applyBurn(10, 2.0);
                break;

            case 'lightning': {
                // 溅射：找3格（世界坐标约270px）范围内其他敌人，各造成50%伤害
                if (!wm) break;
                const splashDamage = Math.round(this._config.damage * this._damageMultiplier * 0.5);
                const wp = this.node.worldPosition;
                const splashRange = 270; // 约3格
                const enemies = wm.activeEnemies ?? [];
                for (const e of enemies) {
                    if (e === target || !e.isActive) continue;
                    const ep = e.node.worldPosition;
                    const dx = ep.x - wp.x;
                    const dy = ep.y - wp.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= splashRange) {
                        e.takeDamage(splashDamage);
                    }
                }
                break;
            }

            case 'ice':
                // 减速：速度×0.5，持续2秒
                target.applySlow(0.5, 2.0);
                break;

            case 'physical':
            default:
                // 无特效
                break;
        }
    }

    private _fireProjectile(target: Enemy): void {
        if (!this._config) return;
        const container = this.projectileContainer;
        if (!container || !this.projectilePrefab) return;

        // 对象池取子弹
        let proj = this._projectilePool.pop() ?? null;
        if (!proj) {
            const node = instantiate(this.projectilePrefab);
            node.layer = 1 << 25; // UI_2D layer
            container.addChild(node);
            proj = node.getComponent(Projectile);
            if (!proj) {
                console.error('[Weapon] Projectile component missing on prefab!');
                return;
            }
        } else {
            proj.node.layer = 1 << 25; // UI_2D layer
            container.addChild(proj.node);
        }

        // 发射起点：格子中心（_gridWorldPos 即为格子中心世界坐标）
        proj.node.setWorldPosition(this._gridWorldPos);

        const damage = Math.round(this._config.damage * this._damageMultiplier);
        proj.init(target, damage, (p) => {
            p.reset();
            this._projectilePool.push(p);
        }, 800, this._config.element);
    }

    /** 临时增益（技能 buff_weapons） */
    public applyDamageBuff(multiplier: number, duration: number): void {
        this._damageMultiplier = multiplier;
        this._buffTimer = duration;
    }

    /** 刷新格子世界坐标（归位动画结束后由 GridUI 调用） */
    public refreshGridWorldPos(): void {
        Vec3.copy(this._gridWorldPos, this.node.worldPosition);
    }

    // ─────────────────────────────────────────────────────────────
    // 动画效果
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
