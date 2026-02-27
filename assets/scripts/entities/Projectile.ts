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
    private _speed: number = 800;        // 子弹速度（像素/秒）
    private _active: boolean = false;
    private _color: Color = new Color(255, 220, 50, 255); // 默认黄色

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
        speed: number = 800
    ): void {
        this._target = target;
        this._damage = damage;
        this._onRecycle = onRecycle;
        this._speed = speed;
        this._active = true;
        this.node.active = true;
        // 确保 layer = UI_2D，否则 Camera 看不到
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
        // 大光晕
        g.fillColor = new Color(255, 200, 50, 60);
        g.circle(0, 0, 12);
        g.fill();
        // 中圈
        g.fillColor = new Color(255, 230, 80, 180);
        g.circle(0, 0, 8);
        g.fill();
        // 实心内核
        g.fillColor = new Color(255, 255, 120, 255);
        g.circle(0, 0, 5);
        g.fill();
        // 描边
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
            // 目标消失（已死）直接回收
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

        // 命中判定
        if (dist < 20) {
            this._target.takeDamage(this._damage);
            this._recycle();
            return;
        }

        // 朝目标飞行
        const moveX = (dx / dist) * this._speed * dt;
        const moveY = (dy / dist) * this._speed * dt;
        this.node.setWorldPosition(myPos.x + moveX, myPos.y + moveY, 0);
    }

    // ─────────────────────────────────────────────────────────────

    private _recycle(): void {
        this._active = false;
        this._onRecycle?.(this);
    }

    public get isActive(): boolean { return this._active; }
}
