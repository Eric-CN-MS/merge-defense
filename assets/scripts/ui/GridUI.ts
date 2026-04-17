import {
    _decorator, Component, Node, Prefab, instantiate,
    Vec2, Vec3, UITransform, EventTouch, Input, input,
    tween, v3, CCFloat, CCInteger, Graphics, Color
} from 'cc';
import { GridCell, WeaponConfig, GAME_CONFIG, GameState } from '../types/GameTypes';
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
    public cellSize: number = 90;               // 格子尺寸（像素），scene里可覆盖
    private get BASE_CELL_SIZE() { return this.cellSize; }  // 始终与scene值一致

    @property(CCFloat)
    public cellGap: number = 10;                 // 格子间距

    // ─── 运行时状态 ───────────────────────────────────────────────
    private _cellNodes: Node[][] = [];           // 格子背景节点
    private _weaponNodes: (Node | null)[][] = [];// 武器节点（null=空格）
    private _lastActiveCount: number = 0;        // 上次渲染时的 activeCount
    private _inBattle: boolean = false;           // 战斗中：背景全隐藏

    // 备用格（Stash）
    private _stashBgNode: Node | null = null;    // 备用格背景节点（程序创建）
    private _stashWeaponId: string | null = null;// 备用格当前武器id
    private _stashWeaponNode: Node | null = null;// 备用格武器节点
    private _dragFromStash: boolean = false;     // 本次拖拽来自备用格

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
        // gridContainer 的位置由 scene 设定，代码里不移动
        this._buildGrid();
        this._buildStashCell();
        this._registerTouchEvents();

        // 监听 GridManager 格子变化
        GridManager.instance?.onChange(this._onGridChange.bind(this));

        // 监听波次状态，切换武器自动攻击
        GameManager.instance?.onStateChange(this._onStateChange.bind(this));

        // 兜底：1帧后如果格子还没渲染（GridManager 异步 init）则强制重建
        this.scheduleOnce(() => {
            if (this._lastActiveCount === 0 && (GridManager.instance?.activeCount ?? 0) > 0) {
                console.log('[GridUI] 兜底触发 _rebuildCells');
                this._rebuildCells();
            }
        }, 0.1);
    }

    onDestroy() {
        GridManager.instance?.offChange(this._onGridChange.bind(this));
    }

    // ─────────────────────────────────────────────────────────────
    // T016: 渲染格子
    // ─────────────────────────────────────────────────────────────

    /** 根据当前列数自动计算 cellSize，保证格子区域不超出屏幕宽度 */
    private _calcCellSize(cols: number): number {
        // cellSize 固定不变，始终用初始格子尺寸
        // 新格子追加到右侧，不缩放原有格子
        return this.BASE_CELL_SIZE;
    }

    /** 计算格子的本地坐标（相对 gridContainer），以左上角为原点向右下排列 */
    private _getCellLocalPos(r: number, c: number): Vec3 {
        const step = this.cellSize + this.cellGap;
        // 以 4×4 格子区域中心为原点，向右上排列
        // 格子区域总宽/高 = 4*step - gap = 3*step + cellSize
        const totalW = 3 * step + this.cellSize;  // = 3*100+90 = 390
        const totalH = 3 * step + this.cellSize;
        const x = -totalW / 2 + c * step + this.cellSize / 2;
        const y =  totalH / 2 - r * step - this.cellSize / 2;
        return new Vec3(x, y, 0);
    }

    private _buildGrid(): void {
        const gm = GridManager.instance;
        if (!gm || !this.gridContainer) return;
        const rows = gm.rows;   // 固定 4
        const cols = gm.cols;   // 固定 4
        this.cellSize = this.BASE_CELL_SIZE;
        this._lastActiveCount = gm.activeCount;

        // gridContainer 位置由 scene 决定，不在代码里移动

        // 先全部初始化为 null，再按激活状态创建节点
        this._cellNodes = Array.from({ length: rows }, () => new Array(cols).fill(null));
        this._weaponNodes = Array.from({ length: rows }, () => new Array(cols).fill(null));
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (gm.isActive(r, c)) {
                    this._cellNodes[r][c] = this._buildCell(r, c, true);
                }
            }
        }
        console.log(`[GridUI] 格子渲染完成 4×4，激活 ${gm.activeCount} 格，容器位置=${JSON.stringify(this.PREP_POS)}`);
    }

    /** 创建单个格子背景节点并加入 gridContainer */
    private _buildCell(r: number, c: number, isActive: boolean): Node | null {
        if (!isActive) return null;   // 未解锁的格子不渲染，位置留空

        const localPos = this._getCellLocalPos(r, c);

        let cellNode: Node;
        if (this.cellPrefab) {
            cellNode = instantiate(this.cellPrefab);
        } else {
            cellNode = new Node(`cell_${r}_${c}`);
            cellNode.layer = 1 << 25;  // UI_2D
            const uit = cellNode.addComponent(UITransform);
            uit.setContentSize(this.cellSize, this.cellSize);
            const g = cellNode.addComponent(Graphics);
            g.fillColor = new Color(40, 50, 70, 200);
            g.lineWidth = 2;
            g.strokeColor = new Color(80, 120, 180, 180);
            g.roundRect(-this.cellSize / 2, -this.cellSize / 2, this.cellSize, this.cellSize, 10);
            g.fill();
            g.roundRect(-this.cellSize / 2, -this.cellSize / 2, this.cellSize, this.cellSize, 10);
            g.stroke();
        }
        cellNode.setPosition(localPos);
        this.gridContainer!.addChild(cellNode);
        // 背景格永远在底层，武器节点渲染在上方
        cellNode.setSiblingIndex(0);
        return cellNode;
    }

    // ─────────────────────────────────────────────────────────────
    // 备用格（Stash）
    // ─────────────────────────────────────────────────────────────

    /** 创建左侧备用格背景节点（挂在 gridContainer 下，位置在格子区域左侧） */
    private _buildStashCell(): void {
        if (!this.gridContainer) return;
        const step = this.cellSize + this.cellGap;
        const totalW = 3 * step + this.cellSize;
        // 备用格坐标：格子区域左边缘再向左一格+间隙
        const stashX = -totalW / 2 - this.cellGap - this.cellSize / 2;
        const stashY = 0;   // 垂直居中

        const bg = new Node('StashCell');
        bg.layer = 1 << 25;
        const uit = bg.addComponent(UITransform);
        uit.setContentSize(this.cellSize, this.cellSize);
        const g = bg.addComponent(Graphics);
        // 备用格用偏暖的棕色区分
        g.fillColor = new Color(80, 60, 40, 200);
        g.lineWidth = 2;
        g.strokeColor = new Color(180, 140, 80, 200);
        const s = this.cellSize;
        g.roundRect(-s / 2, -s / 2, s, s, 10);
        g.fill();
        g.roundRect(-s / 2, -s / 2, s, s, 10);
        g.stroke();

        bg.setPosition(stashX, stashY, 0);
        this.gridContainer.addChild(bg);
        bg.setSiblingIndex(0);
        this._stashBgNode = bg;
    }

    /** 备用格的本地坐标（相对 gridContainer） */
    private _getStashLocalPos(): Vec3 {
        const step = this.cellSize + this.cellGap;
        const totalW = 3 * step + this.cellSize;
        const stashX = -totalW / 2 - this.cellGap - this.cellSize / 2;
        return new Vec3(stashX, 0, 0);
    }

    /** 判断屏幕坐标是否命中备用格 */
    private _hitTestStash(screenPos: Vec2): boolean {
        if (!this.gridContainer || !this._stashBgNode) return false;
        const worldPos = new Vec3();
        this._stashBgNode.getWorldPosition(worldPos);
        const dx = Math.abs(screenPos.x - worldPos.x);
        const dy = Math.abs(screenPos.y - worldPos.y);
        return dx <= this.cellSize / 2 && dy <= this.cellSize / 2;
    }

    /** 同步备用格视图（数据从 GridManager.stashWeaponId 读取） */
    private _syncStashView(): void {
        const gm = GridManager.instance;
        if (!gm) return;
        const stashId = gm.stashWeaponId;

        if (stashId === this._stashWeaponId) return; // 无变化

        // 销毁旧节点
        if (this._stashWeaponNode?.isValid) {
            this._stashWeaponNode.destroy();
            this._stashWeaponNode = null;
        }
        this._stashWeaponId = stashId;

        if (stashId === null) return;

        // 创建新武器节点
        const config = GameManager.instance?.getWeaponConfig(stashId);
        if (!config || !this.weaponPrefab || !this.gridContainer) return;

        const node = instantiate(this.weaponPrefab);
        this.gridContainer.addChild(node);
        const uit = node.getComponent(UITransform);
        if (uit) uit.setContentSize(this.cellSize, this.cellSize);
        node.setPosition(this._getStashLocalPos());
        node.setScale(1, 1, 1);
        const weapon = node.getComponent(Weapon);
        weapon?.init(config, -1, -1);   // row/col=-1 表示备用格
        if (weapon && this.projectilePrefab) weapon.projectilePrefab = this.projectilePrefab;
        if (weapon && this.projectileContainer) weapon.projectileContainer = this.projectileContainer;
        weapon?.setAttackEnabled(false); // 备用格武器不攻击
        this._stashWeaponNode = node;
    }

    /** GridManager 数据变化时刷新视图 */
    private _onGridChange(grid: GridCell[][], activeKeys: Set<string>): void {
        const gm = GridManager.instance;
        if (!gm) return;
        const newActive = gm.activeCount;
        const curActive = this._lastActiveCount;

        // 同步备用格视图
        this._syncStashView();

        // activeCount 变了（有新格子解锁）→ 重建背景
        if (newActive !== curActive) {
            this._lastActiveCount = newActive;
            this._rebuildCells();
            return;
        }
        // 只更新武器节点（只更新激活格子）
        for (let r = 0; r < grid.length; r++) {
            for (let c = 0; c < grid[r].length; c++) {
                if (activeKeys.has(`${r},${c}`)) {
                    this._syncCell(grid[r][c]);
                }
            }
        }
        // 同步副格背景可见性（副格有武器占用时，隐藏自己的背景格）
        this._syncSubCellVisibility(grid);
    }

    /** 副格背景隐藏：当格子是副格（rootRow !== null）时，隐藏背景节点 */
    private _syncSubCellVisibility(grid: GridCell[][]): void {
        // 战斗中背景由 enterBattleLayout 统一隐藏，不在这里干预
        if (this._inBattle) return;
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                const cell = grid[r]?.[c];
                const bg = this._cellNodes[r]?.[c];
                if (!bg) continue;
                // 副格（被多格武器占用）→ 隐藏背景
                if (cell && cell.rootRow !== null) {
                    bg.active = false;
                } else {
                    bg.active = true;
                }
            }
        }
    }

    private _syncCell(cell: GridCell): void {
        const { row, col, weaponId, rootRow } = cell;
        // 安全守卫：数组未初始化时跳过
        if (!this._weaponNodes[row]) return;
        const existingNode = this._weaponNodes[row][col] ?? null;

        // 副格（rootRow !== null）：不独立渲染节点，跟随主格；确保无孤立节点
        if (rootRow !== null) {
            if (existingNode) {
                existingNode.destroy();
                this._weaponNodes[row][col] = null;
            }
            return;
        }

        if (weaponId === null) {
            // 空主格：清除武器节点
            if (existingNode) {
                existingNode.destroy();
                this._weaponNodes[row][col] = null;
            }
            return;
        }

        // 已有正确 id 的武器，不需要重建
        if (existingNode) {
            const weapon = existingNode.getComponent(Weapon);
            if (weapon?.config?.id === weaponId) return;
            existingNode.destroy();
        }

        // 创建新武器节点
        this._spawnWeaponNode(row, col, weaponId);
    }

    private _spawnWeaponNode(row: number, col: number, weaponId: string): Node | null {
        if (!this.weaponPrefab || !this.gridContainer) return null;

        const config = GameManager.instance?.getWeaponConfig(weaponId);
        if (!config) return null;

        // 防重复：如果该格已有节点，先销毁
        const oldNode = this._weaponNodes[row]?.[col];
        if (oldNode?.isValid) {
            console.warn(`[GridUI] spawn 前发现残留节点 (${row},${col})，强制销毁`);
            oldNode.destroy();
            this._weaponNodes[row][col] = null;
        }

        const node = instantiate(this.weaponPrefab);
        this.gridContainer.addChild(node);

        // 根据 shape 计算实际宽度（1x1=cellSize, 1x2=cellSize*2+gap, 1x3=cellSize*3+gap*2）
        const shapeWidth = this._getShapePixelWidth(config.shape);
        const uit = node.getComponent(UITransform);
        if (uit) uit.setContentSize(shapeWidth, this.cellSize);

        // 计算本地坐标：主格中心 + 多格武器向右偏移
        const step = this.cellSize + this.cellGap;  // 局部变量，不依赖 this.step
        const span = config.shape === '1x3' || config.shape === '3x1' ? 3
                   : config.shape === '1x2' || config.shape === '2x1' ? 2 : 1;
        const localPos = this._getCellLocalPos(row, col);
        const offsetX = (span - 1) * step / 2;
        node.setPosition(localPos.x + offsetX, localPos.y, 0);

        // 直接用已知参数算出格子中心世界坐标，不依赖 node.worldPosition 时序
        const cellWorldPos = this._getCellWorldPos(row, col);
        // 多格武器水平中心 = 主格中心 + offsetX（在 local 空间和 world 空间比例一致）
        cellWorldPos.x += offsetX;

        const weapon = node.getComponent(Weapon);
        weapon?.init(config, row, col, cellWorldPos);
        if (weapon && this.projectilePrefab) weapon.projectilePrefab = this.projectilePrefab;
        if (weapon && this.projectileContainer) weapon.projectileContainer = this.projectileContainer;

        // 出生动画（scale 从 0 弹出）
        node.setScale(0, 0, 1);
        this.scheduleOnce(() => {
            if (!node.isValid) return;
            node.getComponent(Weapon)?.playSpawnAnimation();
            // 出生动画完成后再次确认世界坐标（保险）
            node.getComponent(Weapon)?.refreshGridWorldPos();
        }, 0);

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

        // 优先检测备用格
        if (this._stashWeaponNode?.isValid && this._hitTestStash(touchPos)) {
            const weapon = this._stashWeaponNode.getComponent(Weapon);
            if (!weapon) return;
            this._dragging = true;
            this._dragWeapon = weapon;
            this._dragNode = this._stashWeaponNode;
            this._dragFromStash = true;
            this._dragOriginRow = -1;
            this._dragOriginCol = -1;
            this._dragOriginPos = this._stashWeaponNode.position.clone();

            const worldPos = new Vec3();
            this._stashWeaponNode.getWorldPosition(worldPos);
            this._dragOffset.set(worldPos.x - touchPos.x, worldPos.y - touchPos.y, 0);

            if (this.dragLayer) {
                const wp = new Vec3();
                this._stashWeaponNode.getWorldPosition(wp);
                this.dragLayer.addChild(this._stashWeaponNode);
                this._stashWeaponNode.setWorldPosition(wp);
            }
            weapon.setDragging(true);
            event.propagationStopped = true;
            return;
        }

        // 检测主格武器
        const result = this._hitTestWeapon(touchPos);
        if (!result) return;

        const { node, weapon, row, col } = result;
        this._dragging = true;
        this._dragWeapon = weapon;
        this._dragNode = node;
        this._dragFromStash = false;
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
        this._dragWeapon.setDragging(false);

        // ── 判断是否拖入弃用区（格子区域下方 80px 以内） ──────────
        const isDiscard = this._isDiscardZone(touchPos);
        if (isDiscard) {
            this._discardDragging();
            this._resetDragState();
            return;
        }

        // ── 判断是否拖入备用格 ──────────────────────────────────────
        const toStash = this._hitTestStash(touchPos);
        if (toStash && !this._dragFromStash) {
            // 主格 → 备用格：通过 GridManager
            const weaponId = this._dragWeapon.config?.id;
            if (weaponId) {
                // GridManager 处理数据（备用格原武器弃用、主格清空）
                GridManager.instance?.moveToStash(this._dragOriginRow, this._dragOriginCol);
                // 节点先销毁，_syncStashView 在 _onGridChange 里会重建备用格节点
                this._dragNode.destroy();
                this._weaponNodes[this._dragOriginRow][this._dragOriginCol] = null;
            } else {
                this._returnToOrigin();
            }
            this._resetDragState();
            return;
        }

        const targetCell = this._screenPosToCell(touchPos);

        if (targetCell) {
            const { row: toRow, col: toCol } = targetCell;

            if (this._dragFromStash) {
                // 备用格 → 主格
                const gm = GridManager.instance;
                const grid = gm?.getGrid();
                const targetData = grid?.[toRow]?.[toCol];

                if (targetData?.weaponId === null && targetData?.rootRow === null) {
                    // 目标空格：GridManager.moveFromStash 搞定数据
                    // 节点先销毁，_syncStashView 清掉备用格，_syncCell 在主格创建新节点
                    this._dragNode.destroy();
                    this._stashWeaponNode = null;
                    gm?.moveFromStash(toRow, toCol);
                } else if (targetData?.weaponId === this._stashWeaponId) {
                    // 相同武器：合成
                    const result = gm?.tryMergeFromStash(toRow, toCol, this._stashWeaponId!);
                    if (result === 'merged') {
                        this._dragNode.destroy();
                        this._stashWeaponNode = null;
                        const targetWeapon = this._weaponNodes[toRow]?.[toCol]?.getComponent(Weapon);
                        targetWeapon?.playMergeAnimation();
                    } else {
                        this._returnToStash();
                    }
                } else {
                    this._returnToStash();
                }
            } else {
                // 主格 → 主格
                const result = GridManager.instance?.tryMerge(
                    this._dragOriginRow, this._dragOriginCol,
                    toRow, toCol
                );

                if (result === 'merged') {
                    this._dragNode.destroy();
                    this._weaponNodes[this._dragOriginRow][this._dragOriginCol] = null;
                    const targetWeapon = this._weaponNodes[toRow]?.[toCol]?.getComponent(Weapon);
                    targetWeapon?.playMergeAnimation();

                } else if (result === 'swapped') {
                    const span = this._dragWeapon.config?.shape === '1x3' || this._dragWeapon.config?.shape === '3x1' ? 3
                               : this._dragWeapon.config?.shape === '1x2' || this._dragWeapon.config?.shape === '2x1' ? 2 : 1;
                    const step = this.cellSize + this.cellGap;
                    const localPos = this._getCellLocalPos(toRow, toCol);
                    if (this.gridContainer) this.gridContainer.addChild(this._dragNode);
                    this._dragNode.setPosition(localPos.x + (span - 1) * step / 2, localPos.y, 0);
                    this._dragWeapon.setGridPos(toRow, toCol);
                    this._weaponNodes[this._dragOriginRow][this._dragOriginCol] = null;
                    this._weaponNodes[toRow][toCol] = this._dragNode;

                } else {
                    this._returnToOrigin();
                }
            }
        } else {
            if (this._dragFromStash) {
                this._returnToStash();
            } else {
                this._returnToOrigin();
            }
        }

        this._resetDragState();
    }

    /** 判断是否在弃用区（格子区域下方 80px） */
    private _isDiscardZone(screenPos: Vec2): boolean {
        if (!this.gridContainer) return false;
        const worldPos = new Vec3();
        this.gridContainer.getWorldPosition(worldPos);
        const step = this.cellSize + this.cellGap;
        const totalH = 3 * step + this.cellSize;
        const bottomEdge = worldPos.y - totalH / 2;
        // 在格子底部 80px 以下，且 X 大致在格子范围内
        const totalW = 3 * step + this.cellSize;
        const inX = Math.abs(screenPos.x - worldPos.x) <= totalW / 2 + 60;
        return screenPos.y < bottomEdge - 10 && screenPos.y > bottomEdge - 80 && inX;
    }

    /** 弃用正在拖拽的武器 */
    private _discardDragging(): void {
        if (!this._dragNode || !this._dragWeapon) return;
        const nodeToDestroy = this._dragNode;
        if (this._dragFromStash) {
            // 从备用格弃用 → GridManager 清空备用格
            GridManager.instance?.clearStash();
            this._stashWeaponNode = null;
        } else {
            // 从主格弃用
            GridManager.instance?.removeWeapon(this._dragOriginRow, this._dragOriginCol);
            this._weaponNodes[this._dragOriginRow][this._dragOriginCol] = null;
        }
        tween(nodeToDestroy)
            .to(0.2, { scale: new Vec3(0, 0, 1) })
            .call(() => { nodeToDestroy.isValid && nodeToDestroy.destroy(); })
            .start();
    }

    /** 备用格武器回原位 */
    private _returnToStash(): void {
        if (!this._dragNode || !this.gridContainer) return;
        this.gridContainer.addChild(this._dragNode);
        const pos = this._getStashLocalPos();
        this._stashWeaponNode = this._dragNode;
        tween(this._dragNode)
            .to(0.2, { position: pos, scale: new Vec3(1, 1, 1) }, { easing: 'cubicOut' })
            .start();
    }

    /** 武器回原位动画 */
    private _returnToOrigin(): void {
        if (!this._dragNode || !this._dragWeapon) return;
        if (this.gridContainer) this.gridContainer.addChild(this._dragNode);
        this._weaponNodes[this._dragOriginRow][this._dragOriginCol] = this._dragNode;
        this._dragWeapon.playReturnAnimation(this._dragOriginPos);
    }

    private _resetDragState(): void {
        this._dragging = false;
        this._dragWeapon = null;
        this._dragNode = null;
        this._dragFromStash = false;
        this._dragOriginRow = -1;
        this._dragOriginCol = -1;
    }

    // ─────────────────────────────────────────────────────────────
    // 坐标工具
    // ─────────────────────────────────────────────────────────────

    /** 屏幕坐标命中检测 */
    private _hitTestWeapon(screenPos: Vec2): { node: Node; weapon: Weapon; row: number; col: number } | null {
        if (!this.gridContainer) return null;
        const gm = GridManager.instance;
        if (!gm) return null;

        const containerWorldPos = new Vec3();
        this.gridContainer.getWorldPosition(containerWorldPos);

        const step = this.cellSize + this.cellGap;
        const totalW = 3 * step + this.cellSize;
        const totalH = 3 * step + this.cellSize;

        // screenPos 相对于容器中心的偏移
        const dx = screenPos.x - containerWorldPos.x;
        const dy = screenPos.y - containerWorldPos.y;

        // 换算成格子行列（0起）
        const col = Math.floor((dx + totalW / 2) / step);
        const row = Math.floor((-dy + totalH / 2) / step);

        if (row < 0 || row >= 4 || col < 0 || col >= 4) return null;
        if (!gm.isActive(row, col)) return null;

        const node = this._weaponNodes[row]?.[col];
        if (!node || !node.isValid) return null;

        const weapon = node.getComponent(Weapon);
        if (!weapon) return null;

        return { node, weapon, row, col };
    }

    /** 屏幕坐标转格子坐标 */
    private _screenPosToCell(screenPos: Vec2): { row: number; col: number } | null {
        const gm = GridManager.instance;
        if (!gm || !this.gridContainer) return null;

        const containerWorldPos = new Vec3();
        this.gridContainer.getWorldPosition(containerWorldPos);

        const step = this.cellSize + this.cellGap;
        const totalW = 3 * step + this.cellSize;
        const totalH = 3 * step + this.cellSize;

        const dx = screenPos.x - containerWorldPos.x;
        const dy = screenPos.y - containerWorldPos.y;

        const col = Math.floor((dx + totalW / 2) / step);
        const row = Math.floor((-dy + totalH / 2) / step);

        if (row >= 0 && row < 4 && col >= 0 && col < 4 && gm.isActive(row, col)) {
            return { row, col };
        }
        return null;
    }

    /** 获取格子的世界坐标 */
    private _getCellWorldPos(row: number, col: number): Vec3 {
        if (!this.gridContainer) return new Vec3();
        const local = this._getCellLocalPos(row, col);
        const containerWorldPos = new Vec3();
        this.gridContainer.getWorldPosition(containerWorldPos);
        return new Vec3(
            containerWorldPos.x + local.x,
            containerWorldPos.y + local.y,
            0
        );
    }

    // ─────────────────────────────────────────────────────────────
    // 游戏状态联动：波次开始/结束切换武器攻击
    // ─────────────────────────────────────────────────────────────

    // ─── 布局常量 ──────────────────────────────────────────────────
    // 准备阶段：gridContainer 本地坐标（相对于 Canvas 中心）
    private readonly PREP_POS   = new Vec3(-350, 50, 0);
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

    /** 进入战斗：格子背景隐藏，武器缩成底部多排图标 */
    private _enterBattleLayout(): void {
        this._inBattle = true;
        // 隐藏格子背景
        for (const row of this._cellNodes) {
            for (const cell of row) { if (cell) cell.active = false; }
        }

        // 收集所有主格武器节点
        const weapons: { node: Node; config: WeaponConfig }[] = [];
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                const node = this._weaponNodes[r]?.[c];
                if (!node) continue;
                const weapon = node.getComponent(Weapon);
                if (!weapon?.config) continue;
                weapons.push({ node, config: weapon.config });
            }
        }
        if (weapons.length === 0) return;

        const ICON_H  = 52;          // 图标高度（统一）
        const GAP     = 8;           // 图标间隙
        const SCALE   = ICON_H / this.cellSize;   // 缩放比例
        const localCenterX = 80;     // 屏幕中心(640) - GridContainer世界x(560) = 80
        const localBaseY   = -295;

        // 先算每个武器的图标宽度（按 shape 等比缩放）
        const iconWidths = weapons.map(({ config }) => {
            const span = config.shape === '1x3' || config.shape === '3x1' ? 3
                       : config.shape === '1x2' || config.shape === '2x1' ? 2 : 1;
            // 原始宽度 = span * cellSize + (span-1) * cellGap，缩放后
            const rawW = span * this.cellSize + (span - 1) * this.cellGap;
            return rawW * SCALE;
        });

        // 计算一行总宽（所有武器宽+间隙），居中对齐
        const totalW = iconWidths.reduce((s, w) => s + w, 0) + GAP * (weapons.length - 1);
        let curX = localCenterX - totalW / 2;

        weapons.forEach(({ node, config }, i) => {
            if (!this.gridContainer) return;
            if (node.parent !== this.gridContainer) {
                this.gridContainer.addChild(node);
            }

            // 保持 shape 比例的宽度，高度统一 ICON_H
            const span = config.shape === '1x3' || config.shape === '3x1' ? 3
                       : config.shape === '1x2' || config.shape === '2x1' ? 2 : 1;
            const rawW = span * this.cellSize + (span - 1) * this.cellGap;
            const iconW = rawW * SCALE;
            const uit = node.getComponent(UITransform);
            if (uit) uit.setContentSize(rawW, this.cellSize);  // 保持原尺寸，用 scale 缩

            const targetX = curX + iconW / 2;   // 中心 = 起点 + 半宽
            curX += iconW + GAP;

            tween(node)
                .to(0.3, {
                    position: new Vec3(targetX, localBaseY, 0),
                    scale: new Vec3(SCALE, SCALE, 1)
                }, { easing: "cubicOut" })
                .start();
        });
    }

    /** 退出战斗：清除 CD 阴影，武器回到格子，格子背景重显 */
    private _exitBattleLayout(): void {
        this._inBattle = false;
        // 清除所有武器的 CD 遮罩
        for (const row of this._weaponNodes) {
            for (const node of row) {
                if (!node) continue;
                const cdNode = node.getChildByName('CDOverlay');
                if (cdNode) {
                    cdNode.getComponent(Graphics)?.clear();
                }
                // 归位（tween 回格子原始坐标和 scale，并恢复原始宽度）
                const weapon = node.getComponent(Weapon);
                if (!weapon) continue;
                const cellLocalPos = this._getCellLocalPos(weapon.row, weapon.col);
                // 恢复多格武器的 contentSize
                const shape = weapon.config?.shape ?? '1x1';
                const origWidth = this._getShapePixelWidth(shape);
                const uit = node.getComponent(UITransform);
                if (uit) uit.setContentSize(origWidth, this.cellSize);
                // 多格武器归位坐标需要加 offsetX（同 _spawnWeaponNode 的逻辑）
                const step = this.cellSize + this.cellGap;
                const span = shape === '1x3' || shape === '3x1' ? 3
                           : shape === '1x2' || shape === '2x1' ? 2 : 1;
                const offsetX = (span - 1) * step / 2;
                const targetPos = new Vec3(cellLocalPos.x + offsetX, cellLocalPos.y, 0);
                const capturedWeapon = weapon;
                tween(node)
                    .to(0.3, {
                        position: targetPos,
                        scale: new Vec3(1, 1, 1)
                    }, { easing: 'cubicOut' })
                    .call(() => capturedWeapon.refreshGridWorldPos())
                    .start();
            }
        }
        // 每两波后格子可能扩了，重建格子背景（同时恢复背景可见性）
        this.scheduleOnce(() => this._rebuildCells(), 0.4);
    }

    /** 重建格子背景（格子数量变化时） */
    private _rebuildCells(): void {
        const gm = GridManager.instance;
        if (!gm || !this.gridContainer) return;
        this._lastActiveCount = gm.activeCount;

        // 确保容器在正确位置（不移动，由scene决定）
        // this.gridContainer.setPosition(this.PREP_POS);

        // 确保 4×4 数组完整初始化
        for (let r = 0; r < 4; r++) {
            if (!this._cellNodes[r]) this._cellNodes[r] = new Array(4).fill(null);
            if (!this._weaponNodes[r]) this._weaponNodes[r] = new Array(4).fill(null);
        }

        // 新建刚解锁的格子节点
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                if (gm.isActive(r, c) && !this._cellNodes[r][c]) {
                    const cell = this._buildCell(r, c, true);
                    this._cellNodes[r][c] = cell;
                    // 战斗中新解锁的格子背景也要保持隐藏
                    if (cell && this._inBattle) cell.active = false;
                }
            }
        }
        console.log(`[GridUI] _rebuildCells 完成，激活 ${gm.activeCount} 格`);
        // 先把所有已有背景格恢复显示（退出战斗后需要重显），再同步副格可见性
        for (const row of this._cellNodes) {
            for (const cell of row) { if (cell) cell.active = true; }
        }
        // 同步副格背景可见性（_inBattle 时此函数直接 return，不影响战斗中）
        const grid = gm.getGrid();
        if (grid) this._syncSubCellVisibility(grid);
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

    /** 根据 shape 返回像素宽度（含 gap） */
    private _getShapePixelWidth(shape: string): number {
        if (shape === '1x2' || shape === '2x1') return this.cellSize * 2 + this.cellGap;
        if (shape === '1x3' || shape === '3x1') return this.cellSize * 3 + this.cellGap * 2;
        return this.cellSize; // 1x1
    }
}