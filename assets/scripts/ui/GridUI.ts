import {
    _decorator, Component, Node, Prefab, instantiate,
    Vec2, Vec3, UITransform, EventTouch, Input, input,
    tween, v3, CCFloat, CCInteger, Graphics, Color
} from 'cc';
import { GridCell, GAME_CONFIG, GameState } from '../types/GameTypes';
import { GridManager } from '../core/GridManager';
import { GameManager } from '../core/GameManager';
import { Weapon } from '../entities/Weapon';

const { ccclass, property } = _decorator;

/**
 * GridUI — 格子盘渲染 + 拖拽交互
 * T016: 渲染格子节点树
 * T017: TOUCH_START/MOVE/END 拖拽逻辑
 */
@ccclass('GridUI')
export class GridUI extends Component {

    // ─── Inspector 属性 ───────────────────────────────────────────
    @property(Prefab)
    public weaponPrefab: Prefab | null = null;   // 武器 Prefab

    @property(Prefab)
    public cellPrefab: Prefab | null = null;     // 格子背景 Prefab

    @property(Node)
    public gridContainer: Node | null = null;    // 格子父节点

    @property(Node)
    public dragLayer: Node | null = null;        // 拖拽层（最高层）

    @property(Prefab)
    public projectilePrefab: Prefab | null = null; // 子弹 Prefab（注入给 Weapon）

    @property(Node)
    public projectileContainer: Node | null = null; // 子弹容器（注入给 Weapon）

    @property(CCFloat)
    public cellSize: number = 160;               // 格子尺寸（像素）

    @property(CCFloat)
    public cellGap: number = 10;                 // 格子间距

    // ─── 运行时状态 ───────────────────────────────────────────────
    private _cellNodes: Node[][] = [];           // 格子背景节点
    private _weaponNodes: (Node | null)[][] = [];// 武器节点（null=空格）

    // 拖拽状态
    private _dragging: boolean = false;
    private _dragWeapon: Weapon | null = null;
    private _dragNode: Node | null = null;
    private _dragOriginPos: Vec3 = new Vec3();
    private _dragOriginRow: number = -1;
    private _dragOriginCol: number = -1;
    private _dragOffset: Vec3 = new Vec3();

    // ─────────────────────────────────────────────────────────────
    // 生命周期
    // ─────────────────────────────────────────────────────────────

    start() {
        this._buildGrid();
        this._registerTouchEvents();

        // 监听 GridManager 格子变化
        GridManager.instance?.onChange(this._onGridChange.bind(this));

        // 监听波次状态，切换武器自动攻击
        GameManager.instance?.onStateChange(this._onStateChange.bind(this));
    }

    onDestroy() {
        GridManager.instance?.offChange(this._onGridChange.bind(this));
    }

    // ─────────────────────────────────────────────────────────────
    // T016: 渲染格子
    // ─────────────────────────────────────────────────────────────

    private _buildGrid(): void {
        const gm = GridManager.instance;
        if (!gm || !this.gridContainer) return;

        const rows = gm.rows;
        const cols = gm.cols;

        this._cellNodes = [];
        this._weaponNodes = [];

        for (let r = 0; r < rows; r++) {
            this._cellNodes[r] = [];
            this._weaponNodes[r] = [];
            for (let c = 0; c < cols; c++) {
                this._cellNodes[r][c] = this._buildCell(r, c);
                this._weaponNodes[r][c] = null;
            }
        }
        console.log(`[GridUI] 格子渲染完成 ${rows}×${cols}`);
    }

    /** 创建单个格子背景节点并加入 gridContainer */
    private _buildCell(r: number, c: number): Node {
        const gm = GridManager.instance!;
        const cols = gm.cols;
        const rows = gm.rows;
        const step = this.cellSize + this.cellGap;
        const offsetX = -((cols - 1) * step) / 2;
        const offsetY = ((rows - 1) * step) / 2;
        const x = offsetX + c * step;
        const y = offsetY - r * step;

        let cellNode: Node;
        if (this.cellPrefab) {
            cellNode = instantiate(this.cellPrefab);
        } else {
            cellNode = new Node(`cell_${r}_${c}`);
            cellNode.layer = 1 << 25; // UI_2D
            const uit = cellNode.addComponent(UITransform);
            uit.setContentSize(this.cellSize, this.cellSize);
            const g = cellNode.addComponent(Graphics);
            g.fillColor = new Color(40, 50, 70, 200);
            g.roundRect(-this.cellSize / 2, -this.cellSize / 2, this.cellSize, this.cellSize, 10);
            g.fill();
            g.strokeColor = new Color(80, 120, 180, 180);
            g.lineWidth = 2;
            g.roundRect(-this.cellSize / 2, -this.cellSize / 2, this.cellSize, this.cellSize, 10);
            g.stroke();
        }
        cellNode.setPosition(x, y, 0);
        this.gridContainer!.addChild(cellNode);
        return cellNode;
    }

    /** GridManager 数据变化时刷新视图 */
    private _onGridChange(grid: GridCell[][]): void {
        // 如果格子尺寸变了，先重建背景
        const newRows = grid.length;
        const newCols = grid[0]?.length ?? 0;
        const curRows = this._cellNodes.length;
        const curCols = this._cellNodes[0]?.length ?? 0;
        if (newRows !== curRows || newCols !== curCols) {
            this._rebuildCells();
            return; // _rebuildCells 内部会重新定位武器，无需再 sync
        }
        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[r].length; c++) {
                this._syncCell(grid[r][c]);
            }
        }
    }

    private _syncCell(cell: GridCell): void {
        const { row, col, weaponLevel } = cell;
        const existingNode = this._weaponNodes[row]?.[col];

        if (weaponLevel === null) {
            // 清除武器节点
            if (existingNode) {
                existingNode.destroy();
                this._weaponNodes[row][col] = null;
            }
            return;
        }

        // 已有正确等级的武器，不需要重建
        if (existingNode) {
            const weapon = existingNode.getComponent(Weapon);
            if (weapon?.level === weaponLevel) return;
            existingNode.destroy();
        }

        // 创建新武器节点
        this._spawnWeaponNode(row, col, weaponLevel);
    }

    private _spawnWeaponNode(row: number, col: number, level: number): Node | null {
        if (!this.weaponPrefab || !this.gridContainer) return null;

        const config = GameManager.instance?.getWeaponConfig(level);
        if (!config) return null;

        const node = instantiate(this.weaponPrefab);
        this.gridContainer.addChild(node);
        const cellPos = this._getCellWorldPos(row, col);
        node.setWorldPosition(cellPos);

        const weapon = node.getComponent(Weapon);
        weapon?.init(config, row, col);
        // 注入子弹资源（weapon 需要但不存在于 prefab 绑定中）
        if (weapon && this.projectilePrefab) weapon.projectilePrefab = this.projectilePrefab;
        if (weapon && this.projectileContainer) weapon.projectileContainer = this.projectileContainer;
        weapon?.playSpawnAnimation();

        this._weaponNodes[row][col] = node;
        return node;
    }

    // ─────────────────────────────────────────────────────────────
    // T017: 拖拽交互
    // ─────────────────────────────────────────────────────────────

    private _registerTouchEvents(): void {
        this.node.on(Node.EventType.TOUCH_START, this._onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this._onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    }

    private _onTouchStart(event: EventTouch): void {
        const touchPos = event.getUILocation();
        const result = this._hitTestWeapon(touchPos);
        if (!result) return;

        const { node, weapon, row, col } = result;
        this._dragging = true;
        this._dragWeapon = weapon;
        this._dragNode = node;
        this._dragOriginRow = row;
        this._dragOriginCol = col;
        this._dragOriginPos = node.position.clone();

        // 计算触摸点与节点中心的偏移
        const worldPos = new Vec3();
        node.getWorldPosition(worldPos);
        this._dragOffset.set(worldPos.x - touchPos.x, worldPos.y - touchPos.y, 0);

        // 把武器节点提到拖拽层
        if (this.dragLayer) {
            const wp = new Vec3();
            node.getWorldPosition(wp);
            this.dragLayer.addChild(node);
            node.setWorldPosition(wp);
        }

        weapon.setDragging(true);
        event.propagationStopped = true;
    }

    private _onTouchMove(event: EventTouch): void {
        if (!this._dragging || !this._dragNode) return;

        const touchPos = event.getUILocation();
        const newPos = new Vec3(
            touchPos.x + this._dragOffset.x,
            touchPos.y + this._dragOffset.y,
            0
        );
        this._dragNode.setWorldPosition(newPos);
    }

    private _onTouchEnd(event: EventTouch): void {
        if (!this._dragging || !this._dragNode || !this._dragWeapon) return;

        const touchPos = event.getUILocation();
        const targetCell = this._screenPosToCell(touchPos);

        this._dragWeapon.setDragging(false);

        if (targetCell) {
            const { row: toRow, col: toCol } = targetCell;
            const result = GridManager.instance?.tryMerge(
                this._dragOriginRow, this._dragOriginCol,
                toRow, toCol
            );

            if (result === 'merged') {
                // 合成成功：来源格已清空，目标格会重建节点
                this._dragNode.destroy();
                this._weaponNodes[this._dragOriginRow][this._dragOriginCol] = null;
                // 播放目标格的合成动画
                const targetWeapon = this._weaponNodes[toRow]?.[toCol]?.getComponent(Weapon);
                targetWeapon?.playMergeAnimation();

            } else if (result === 'swapped') {
                // 移动到空格：将节点移回 gridContainer 并对齐
                const targetPos = this._getCellWorldPos(toRow, toCol);
                if (this.gridContainer) this.gridContainer.addChild(this._dragNode);
                this._dragNode.setWorldPosition(targetPos);
                this._dragWeapon.setGridPos(toRow, toCol);
                this._weaponNodes[this._dragOriginRow][this._dragOriginCol] = null;
                this._weaponNodes[toRow][toCol] = this._dragNode;

            } else {
                // 失败：回原位
                this._returnToOrigin();
            }
        } else {
            // 没有放到有效格子：回原位
            this._returnToOrigin();
        }

        this._resetDragState();
    }

    /** 武器回原位动画 */
    private _returnToOrigin(): void {
        if (!this._dragNode || !this._dragWeapon) return;

        const originWorldPos = new Vec3();
        const originRow = this._dragOriginRow;
        const originCol = this._dragOriginCol;

        // 算出原格子世界坐标
        const worldPos = this._getCellWorldPos(originRow, originCol);

        // 把节点移回 gridContainer
        if (this.gridContainer) this.gridContainer.addChild(this._dragNode);
        this._weaponNodes[originRow][originCol] = this._dragNode;

        this._dragWeapon.playReturnAnimation(this._dragOriginPos);
    }

    private _resetDragState(): void {
        this._dragging = false;
        this._dragWeapon = null;
        this._dragNode = null;
        this._dragOriginRow = -1;
        this._dragOriginCol = -1;
    }

    // ─────────────────────────────────────────────────────────────
    // 坐标工具
    // ─────────────────────────────────────────────────────────────

    /** 屏幕坐标命中检测，返回武器节点信息 */
    private _hitTestWeapon(screenPos: Vec2): { node: Node; weapon: Weapon; row: number; col: number } | null {
        const gm = GridManager.instance;
        if (!gm) return null;

        for (let r = 0; r < gm.rows; r++) {
            for (let c = 0; c < gm.cols; c++) {
                const node = this._weaponNodes[r]?.[c];
                if (!node) continue;

                const uit = node.getComponent(UITransform);
                if (!uit) continue;

                const worldPos = new Vec3();
                node.getWorldPosition(worldPos);

                const half = this.cellSize / 2;
                if (
                    screenPos.x >= worldPos.x - half &&
                    screenPos.x <= worldPos.x + half &&
                    screenPos.y >= worldPos.y - half &&
                    screenPos.y <= worldPos.y + half
                ) {
                    const weapon = node.getComponent(Weapon);
                    if (weapon) return { node, weapon, row: r, col: c };
                }
            }
        }
        return null;
    }

    /** 屏幕坐标转格子坐标 */
    private _screenPosToCell(screenPos: Vec2): { row: number; col: number } | null {
        const gm = GridManager.instance;
        if (!gm || !this.gridContainer) return null;

        const step = this.cellSize + this.cellGap;
        const offsetX = -((gm.cols - 1) * step) / 2;
        const offsetY = ((gm.rows - 1) * step) / 2;

        const containerWorldPos = new Vec3();
        this.gridContainer.getWorldPosition(containerWorldPos);

        const localX = screenPos.x - containerWorldPos.x;
        const localY = screenPos.y - containerWorldPos.y;

        const col = Math.round((localX - offsetX) / step);
        const row = Math.round((offsetY - localY) / step);

        if (row >= 0 && row < gm.rows && col >= 0 && col < gm.cols) {
            return { row, col };
        }
        return null;
    }

    /** 获取格子的世界坐标 */
    private _getCellWorldPos(row: number, col: number): Vec3 {
        const gm = GridManager.instance;
        if (!gm || !this.gridContainer) return new Vec3();

        const step = this.cellSize + this.cellGap;
        const offsetX = -((gm.cols - 1) * step) / 2;
        const offsetY = ((gm.rows - 1) * step) / 2;

        const x = offsetX + col * step;
        const y = offsetY - row * step;

        const containerWorldPos = new Vec3();
        this.gridContainer.getWorldPosition(containerWorldPos);

        return new Vec3(
            containerWorldPos.x + x,
            containerWorldPos.y + y,
            0
        );
    }

    // ─────────────────────────────────────────────────────────────
    // 游戏状态联动：波次开始/结束切换武器攻击
    // ─────────────────────────────────────────────────────────────

    // ─── 布局常量 ──────────────────────────────────────────────────
    // 准备阶段：格子居中大格
    private readonly PREP_POS   = new Vec3(-270, 0, 0);
    private readonly PREP_SCALE = new Vec3(1, 1, 1);
    // 战斗阶段：武器变成底部一排小图标（不显示格子背景）
    private readonly BATTLE_Y     = -295;
    private readonly BATTLE_ICON  = 52;   // 战斗时每个武器图标宽度
    private readonly BATTLE_GAP   = 8;    // 图标间距

    private _onStateChange(state: GameState): void {
        const attacking = state === GameState.WAVE_ACTIVE;
        this._setAllWeaponsAttack(attacking);
        if (attacking) {
            this._enterBattleLayout();
        } else {
            this._exitBattleLayout();
        }
    }

    /** 进入战斗：格子背景隐藏，武器缩成底部一排图标 */
    private _enterBattleLayout(): void {
        // 隐藏格子背景
        for (const row of this._cellNodes) {
            for (const cell of row) { if (cell) cell.active = false; }
        }
        // 把所有武器节点排成一行
        const weapons: Node[] = [];
        for (const row of this._weaponNodes) {
            for (const node of row) { if (node) weapons.push(node); }
        }
        const total = weapons.length;
        const step  = this.BATTLE_ICON + this.BATTLE_GAP;
        const startX = -(total - 1) * step / 2;
        weapons.forEach((node, i) => {
            if (!this.gridContainer) return;
            this.gridContainer.addChild(node); // 统一父节点
            tween(node)
                .to(0.3, {
                    worldPosition: new Vec3(
                        640 + startX + i * step,   // 世界坐标 X，居中
                        this.BATTLE_Y + 360,        // 世界坐标 Y（Canvas中心360）
                        0
                    ),
                    scale: new Vec3(
                        this.BATTLE_ICON / this.cellSize,
                        this.BATTLE_ICON / this.cellSize,
                        1
                    )
                }, { easing: 'cubicOut' })
                .start();
        });
    }

    /** 退出战斗：清除 CD 阴影，武器回到格子，格子背景重显 */
    private _exitBattleLayout(): void {
        // 清除所有武器的 CD 遮罩
        for (const row of this._weaponNodes) {
            for (const node of row) {
                if (!node) continue;
                const cdNode = node.getChildByName('CDOverlay');
                if (cdNode) {
                    cdNode.getComponent(Graphics)?.clear();
                }
                // 归位（tween 回格子原始坐标和 scale）
                const weapon = node.getComponent(Weapon);
                if (!weapon) continue;
                const cellWorldPos = this._getCellWorldPos(weapon.row, weapon.col);
                tween(node)
                    .to(0.3, {
                        worldPosition: cellWorldPos,
                        scale: new Vec3(1, 1, 1)
                    }, { easing: 'cubicOut' })
                    .start();
            }
        }
        // 恢复格子背景（延迟等动画结束）
        this.scheduleOnce(() => {
            for (const row of this._cellNodes) {
                for (const cell of row) { if (cell) cell.active = true; }
            }
        }, 0.35);

        // 每两波后格子可能扩了，重建格子背景
        this.scheduleOnce(() => this._rebuildCells(), 0.4);
    }

    /** 重建格子背景（格子数量变化时） */
    private _rebuildCells(): void {
        const gm = GridManager.instance;
        if (!gm || !this.gridContainer) return;
        const newRows = gm.rows;
        const newCols = gm.cols;
        if (newRows === this._cellNodes.length && newCols === (this._cellNodes[0]?.length ?? 0)) return;

        // 移除旧格子背景
        for (const row of this._cellNodes) {
            for (const cell of row) { cell?.destroy(); }
        }
        // 格子变多时缩小 cellSize（最小80）
        const maxCols = Math.max(newRows, newCols);
        this.cellSize = Math.max(80, Math.floor(460 / maxCols));

        // 重新初始化格子背景数组
        this._cellNodes = [];
        for (let r = 0; r < newRows; r++) {
            this._cellNodes[r] = [];
            for (let c = 0; c < newCols; c++) {
                this._cellNodes[r][c] = this._buildCell(r, c);
            }
        }

        // 武器节点数组扩容
        while (this._weaponNodes.length < newRows) {
            this._weaponNodes.push(new Array(newCols).fill(null));
        }
        for (const row of this._weaponNodes) {
            while (row.length < newCols) row.push(null);
        }

        // ★ 重新定位所有已有武器节点到新格子坐标
        for (let r = 0; r < this._weaponNodes.length; r++) {
            for (let c = 0; c < (this._weaponNodes[r]?.length ?? 0); c++) {
                const node = this._weaponNodes[r][c];
                if (!node) continue;
                const newPos = this._getCellWorldPos(r, c);
                tween(node)
                    .to(0.3, { worldPosition: newPos }, { easing: 'cubicOut' })
                    .start();
                // UITransform 尺寸也同步缩放
                node.getComponent(UITransform)?.setContentSize(this.cellSize, this.cellSize);
            }
        }
    }

    private _setAllWeaponsAttack(enabled: boolean): void {
        for (const row of this._weaponNodes) {
            for (const node of row) {
                if (node) {
                    node.getComponent(Weapon)?.setAttackEnabled(enabled);
                }
            }
        }
    }
}
