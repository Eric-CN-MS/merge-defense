import { _decorator, Component, Node, Prefab, instantiate, Vec3, Graphics, Color, UITransform, Layers } from 'cc';
import { EnemyConfig } from '../types/GameTypes';
import { Enemy } from './Enemy';

const { ccclass, property } = _decorator;

/**
 * Projectile — 子弹组件
 * T027: 飞行动画 + 命中伤害
 */
@ccclass('Projectile')
export class Projectile extends Component {

    // ─── 运行时数据 ───────────────────────────────────────────────
    private _target: Enemy | null = null;
    private _damage: number = 0;
    private _speed: number = 800;
    private _active: boolean = false;

    // 元素颜色配置（outer glow / mid / core）
    private static readonly ELEMENT_COLORS: Record<string, [Color, Color, Color]> = {
        physical:  [new Color( 80, 130, 220,  60), new Color(100, 160, 240, 180), new Color(150, 200, 255, 255)],
        fire:      [new Color(255,  80,  20,  60), new Color(255, 130,  50, 180), new Color(255, 200, 100, 255)],
        lightning: [new Color(220, 200,  30,  60), new Color(240, 230,  60, 180), new Color(255, 255, 120, 255)],
        ice:       [new Color( 60, 180, 240,  60), new Color(100, 210, 255, 180), new Color(200, 240, 255, 255)],
    };
    private _element: string = 'physical';

    // 回收回调（对象池用）
    private _onRecycle: ((p: Projectile) => void) | null = null;

    // ─────────────────────────────────────────────────────────────
    // 初始化
    // ─────────────────────────────────────────────────────────────

    start() {
        this._drawBullet();
    }

    public init(
        target: Enemy,
        damage: number,
        onRecycle: (p: Projectile) => void,
        speed: number = 800,
        element: string = 'physical'
    ): void {
        this._target = target;
        this._damage = damage;
        this._onRecycle = onRecycle;
        this._speed = speed;
        this._active = true;
        this._element = element;
        this.node.active = true;
        this.node.layer = Layers.Enum.UI_2D;
        this._drawBullet();
    }

    public reset(): void {
        this._active = false;
        this._target = null;
        this.node.active = false;
    }

    private _drawBullet(): void {
        let uit = this.node.getComponent(UITransform);
        if (!uit) { uit = this.node.addComponent(UITransform); }
        uit.setContentSize(24, 24);

        let g = this.node.getComponent(Graphics);
        if (!g) g = this.node.addComponent(Graphics);
        g.clear();

        const colors = Projectile.ELEMENT_COLORS[this._element] ?? Projectile.ELEMENT_COLORS['physical'];
        const [glow, mid, core] = colors;

        // 外光晕
        g.fillColor = glow;
        g.circle(0, 0, 12);
        g.fill();
        // 中圈
        g.fillColor = mid;
        g.circle(0, 0, 8);
        g.fill();
        // 实心内核
        g.fillColor = core;
        g.circle(0, 0, 5);
        g.fill();
        // 描边（白色高亮）
        g.strokeColor = new Color(255, 255, 255, 200);
        g.lineWidth = 1.5;
        g.circle(0, 0, 5);
        g.stroke();
    }

    // ─────────────────────────────────────────────────────────────
    // 每帧追踪目标
    // ─────────────────────────────────────────────────────────────

    update(dt: number) {
        if (!this._active || !this._target) {
            this._recycle();
            return;
        }

        if (!this._target.isActive) {
            this._recycle();
            return;
        }

        const myPos = this.node.worldPosition;
        const targetPos = this._target.node.worldPosition;

        const dx = targetPos.x - myPos.x;
        const dy = targetPos.y - myPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 20) {
            this._target.takeDamage(this._damage);
            this._recycle();
            return;
        }

        const moveX = (dx / dist) * this._speed * dt;
        const moveY = (dy / dist) * this._speed * dt;
        this.node.setWorldPosition(myPos.x + moveX, myPos.y + moveY, 0);
    }

    private _recycle(): void {
        this._active = false;
        this._onRecycle?.(this);
    }

    public get isActive(): boolean { return this._active; }
}
