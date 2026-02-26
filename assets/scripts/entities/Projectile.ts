import { _decorator, Component, Node, Prefab, instantiate, Vec3 } from 'cc';
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

    // 回收回调（对象池用）
    private _onRecycle: ((p: Projectile) => void) | null = null;

    // ─────────────────────────────────────────────────────────────
    // 初始化
    // ─────────────────────────────────────────────────────────────

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
    }

    public reset(): void {
        this._active = false;
        this._target = null;
        this.node.active = false;
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

        // 朝向目标旋转
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        this.node.setRotationFromEuler(0, 0, angle - 90);
    }

    // ─────────────────────────────────────────────────────────────

    private _recycle(): void {
        this._active = false;
        this._onRecycle?.(this);
    }

    public get isActive(): boolean { return this._active; }
}
