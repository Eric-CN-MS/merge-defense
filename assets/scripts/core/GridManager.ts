import { _decorator, Component } from 'cc';
import { GridCell, WeaponConfig, GAME_CONFIG } from '../types/GameTypes';

const { ccclass } = _decorator;

/**
 * GridManager — 格子盘管理器
 * 始终以 4×4 分配格子池，用 _activeKeys 记录已解锁的格子
 * 扩展顺序：3×3(9格) → 依次激活右上→右中→右下→第4行各格
 *
 * 支持多格武器（1x1/1x2/1x3）：
 *  - 主格：weaponId = config.id，rootRow = null，rootCol = null
 *  - 副格：weaponId = null，rootRow/rootCol = 主格坐标
 */
@ccclass('GridManager')
export class GridManager extends Component {

    private static _instance: GridManager | null = null;
    public static get instance(): GridManager { return GridManager._instance!; }

    /** 固定 4×4 格子池 */
    private static readonly TOTAL_ROWS = 4;
    private static readonly TOTAL_COLS = 4;

    private _grid: GridCell[][] = [];
    /** 已激活格子的 key 集合（"r,c"格式） */
    private _activeKeys: Set<string> = new Set();
    /** 武器配置缓存（id → config），由 GameManager 初始化时注入 */
    private _weaponConfigMap: Map<string, WeaponConfig> = new Map();
    /** 备用格武器 id（null = 空） */
    private _stashWeaponId: string | null = null;
    /** 扩展顺序：3×3之后依次解锁的格子坐标 */
    private static readonly EXPAND_ORDER: [number, number][] = [
        [0, 3], [1, 3], [2, 3],  // 第4列：从上到下
        [3, 0], [3, 1], [3, 2], [3, 3],  // 第4行：从左到右
    ];

    // 格子变化回调（GridUI 监听）
    private _changeCallbacks: ((grid: GridCell[][], activeKeys: Set<string>) => void)[] = [];

    onLoad() {
        if (GridManager._instance) { this.destroy(); return; }
        GridManager._instance = this;
    }

    onDestroy() {
        if (GridManager._instance === this) GridManager._instance = null;
    }

    // ─────────────────────────────────────────────────────────────
    // 初始化
    // ─────────────────────────────────────────────────────────────

    public init(rows: number = GAME_CONFIG.GRID_ROWS_INIT, cols: number = GAME_CONFIG.GRID_COLS_INIT, weaponConfigs?: WeaponConfig[]): void {
        // 注入武器配置缓存
        if (weaponConfigs) {
            this._weaponConfigMap = new Map(weaponConfigs.map(w => [w.id, w]));
        }
        const TR = GridManager.TOTAL_ROWS;
        const TC = GridManager.TOTAL_COLS;
        this._grid = [];
        for (let r = 0; r < TR; r++) {
            this._grid[r] = [];
            for (let c = 0; c < TC; c++) {
                this._grid[r][c] = { row: r, col: c, weaponId: null, rootRow: null, rootCol: null };
            }
        }
        // 激活初始 rows×cols 格子
        this._activeKeys = new Set();
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                this._activeKeys.add(`${r},${c}`);
            }
        }
        console.log(`[GridManager] 初始化 ${rows}×${cols}，激活 ${this._activeKeys.size} 格`);
        this._notifyChange();
    }

    public restoreFromSave(cells: GridCell[]): void {
        cells.forEach(cell => {
            if (this._isValidPos(cell.row, cell.col)) {
                this._grid[cell.row][cell.col] = { ...cell };
            }
        });
        this._notifyChange();
    }

    // ─────────────────────────────────────────────────────────────
    // 公共 getter
    // ─────────────────────────────────────────────────────────────

    public get rows(): number { return GridManager.TOTAL_ROWS; }
    public get cols(): number { return GridManager.TOTAL_COLS; }
    public get activeCount(): number { return this._activeKeys.size; }

    public isActive(r: number, c: number): boolean {
        return this._activeKeys.has(`${r},${c}`);
    }

    // ─────────────────────────────────────────────────────────────
    // 格子读写 API
    // ─────────────────────────────────────────────────────────────

    public getCell(row: number, col: number): GridCell | null {
        if (!this._isValidPos(row, col)) return null;
        return this._grid[row][col];
    }

    public getGrid(): GridCell[][] { return this._grid; }

    public getFlatCells(): GridCell[] { return this._grid.flat(); }

    /**
     * 判断格子是否为空主格（可放置 1x1 武器）
     * 空主格：激活 + weaponId === null + rootRow === null
     */
    private _isFreeCell(r: number, c: number): boolean {
        if (!this._activeKeys.has(`${r},${c}`)) return false;
        const cell = this._grid[r]?.[c];
        if (!cell) return false;
        return cell.weaponId === null && cell.rootRow === null;
    }

    /**
     * 根据 shape 解析所需的列跨度（水平方向）
     * 1x1 → 1列，1x2/2x1 → 2列，1x3/3x1 → 3列
     * （当前游戏只支持横向延伸）
     */
    private _shapeWidth(shape: string): number {
        if (shape === '1x2' || shape === '2x1') return 2;
        if (shape === '1x3' || shape === '3x1') return 3;
        return 1;
    }

    /**
     * 寻找第一个可以放置指定 shape 的位置（主格左上角）
     * 只检查同一行连续空主格
     */
    private _findFirstFit(shape: string): { row: number; col: number } | null {
        const width = this._shapeWidth(shape);
        for (let r = 0; r < GridManager.TOTAL_ROWS; r++) {
            for (let c = 0; c <= GridManager.TOTAL_COLS - width; c++) {
                let fits = true;
                for (let dc = 0; dc < width; dc++) {
                    if (!this._isFreeCell(r, c + dc)) { fits = false; break; }
                }
                if (fits) return { row: r, col: c };
            }
        }
        return null;
    }

    /** 找到第一个可放 1x1 的主格（对外接口） */
    public findFirstEmpty(): GridCell | null {
        if (!this._grid || this._grid.length === 0) return null;
        for (let r = 0; r < GridManager.TOTAL_ROWS; r++) {
            for (let c = 0; c < GridManager.TOTAL_COLS; c++) {
                if (this._isFreeCell(r, c)) return this._grid[r][c];
            }
        }
        return null;
    }

    /** 至少能放一个 1x1 武器 */
    public hasEmptyCell(): boolean {
        if (!this._grid || this._grid.length === 0) return true;
        return this.findFirstEmpty() !== null;
    }

    // ─────────────────────────────────────────────────────────────
    // 武器放置 / 移除
    // ─────────────────────────────────────────────────────────────

    /**
     * 放置武器：根据 config.shape 寻找合适连续空格
     * 返回主格，或 null（放不下）
     */
    public placeWeapon(config: WeaponConfig): GridCell | null {
        const fit = this._findFirstFit(config.shape);
        if (!fit) {
            console.warn(`[GridManager] 格子已满，无法放置 shape=${config.shape}`);
            return null;
        }
        const { row, col } = fit;
        const width = this._shapeWidth(config.shape);

        // 主格
        const mainCell = this._grid[row][col];
        mainCell.weaponId = config.id;
        mainCell.rootRow = null;
        mainCell.rootCol = null;

        // 副格
        for (let dc = 1; dc < width; dc++) {
            const sub = this._grid[row][col + dc];
            sub.weaponId = null;
            sub.rootRow = row;
            sub.rootCol = col;
        }

        console.log(`[GridManager] 放置 ${config.id}(${config.shape}) 到 (${row},${col})`);
        this._notifyChange();
        return mainCell;
    }

    /** 直接设置某格为指定 weaponId（兼容旧接口，仅设置单主格） */
    public setWeapon(row: number, col: number, weaponId: string): boolean {
        if (!this._isValidPos(row, col)) return false;
        this._grid[row][col].weaponId = weaponId;
        this._grid[row][col].rootRow = null;
        this._grid[row][col].rootCol = null;
        this._notifyChange();
        return true;
    }

    /**
     * 移除武器：传入任意占用格（主格或副格）
     * 自动找到主格，清除主格 + 所有关联副格
     */
    public removeWeapon(row: number, col: number): boolean {
        if (!this._isValidPos(row, col)) return false;
        const cell = this._grid[row][col];

        // 如果是副格，找到主格
        let mr = row, mc = col;
        if (cell.rootRow !== null && cell.rootCol !== null) {
            mr = cell.rootRow;
            mc = cell.rootCol;
        }

        const mainCell = this._grid[mr][mc];
        // 清除主格
        mainCell.weaponId = null;
        mainCell.rootRow = null;
        mainCell.rootCol = null;
        mainCell.weaponNodeUuid = undefined;

        // 清除所有副格（遍历全格查找 rootRow/rootCol 指向主格的格子）
        for (let r = 0; r < GridManager.TOTAL_ROWS; r++) {
            for (let c = 0; c < GridManager.TOTAL_COLS; c++) {
                const s = this._grid[r][c];
                if (s.rootRow === mr && s.rootCol === mc) {
                    s.weaponId = null;
                    s.rootRow = null;
                    s.rootCol = null;
                    s.weaponNodeUuid = undefined;
                }
            }
        }

        this._notifyChange();
        return true;
    }

    /**
     * 将武器直接放到指定主格（备用格归还时使用）
     * 目标格必须为空主格，shape 由 weaponId 对应的 config 决定
     */
    public placeWeaponAt(row: number, col: number, weaponId: string): boolean {
        if (!this._isValidPos(row, col)) return false;
        const cell = this._grid[row][col];
        if (cell.weaponId !== null || cell.rootRow !== null) return false;

        const config = this._weaponConfigMap?.get(weaponId);
        if (!config) {
            // 无 config 时按单格处理
            cell.weaponId = weaponId;
            cell.rootRow = null;
            cell.rootCol = null;
            this._notifyChange();
            return true;
        }

        const width = this._shapeWidth(config.shape);
        // 检查副格是否足够且为空
        for (let dc = 1; dc < width; dc++) {
            if (!this._isValidPos(row, col + dc)) return false;
            const sub = this._grid[row][col + dc];
            if (sub.weaponId !== null || sub.rootRow !== null) return false;
        }

        cell.weaponId = weaponId;
        cell.rootRow = null;
        cell.rootCol = null;
        for (let dc = 1; dc < width; dc++) {
            const sub = this._grid[row][col + dc];
            sub.weaponId = null;
            sub.rootRow = row;
            sub.rootCol = col;
        }
        this._notifyChange();
        return true;
    }

    // ─────────────────────────────────────────────────────────────
    // 备用格 API
    // ─────────────────────────────────────────────────────────────

    /** 获取备用格武器 id（null = 空） */
    public get stashWeaponId(): string | null { return this._stashWeaponId; }

    /** 把主格武器移入备用格（备用格原有武器弃用），返回是否成功 */
    public moveToStash(row: number, col: number): boolean {
        const cell = this._grid[row]?.[col];
        if (!cell || cell.weaponId === null || cell.rootRow !== null) return false;
        // 弃用备用格原有武器（无需通知，下面会通知）
        this._stashWeaponId = cell.weaponId;
        this.removeWeapon(row, col);  // 内部调 _notifyChange
        return true;
    }

    /** 把备用格武器放入指定主格（主格必须为空），返回是否成功 */
    public moveFromStash(row: number, col: number): boolean {
        if (this._stashWeaponId === null) return false;
        const ok = this.placeWeaponAt(row, col, this._stashWeaponId);
        if (ok) {
            this._stashWeaponId = null;
            // placeWeaponAt 内部已 _notifyChange
        }
        return ok;
    }

    /** 把备用格武器放入第一个合适的空格 */
    public moveFromStashToFirst(): boolean {
        if (this._stashWeaponId === null) return false;
        const config = this._weaponConfigMap?.get(this._stashWeaponId);
        const shape = config?.shape ?? '1x1';
        const fit = this._findFirstFit(shape);
        if (!fit) return false;
        return this.moveFromStash(fit.row, fit.col);
    }

    /** 清空备用格（弃用武器） */
    public clearStash(): void {
        if (this._stashWeaponId === null) return;
        this._stashWeaponId = null;
        this._notifyChange();
    }

    /**
     * 从备用格合成到主格
     * stashWeaponId 必须与目标格 weaponId 相同，且有 mergeToId
     */
    public tryMergeFromStash(tr: number, tc: number, stashWeaponId: string): 'merged' | 'failed' {
        if (!this._isValidPos(tr, tc)) return 'failed';
        const targetCell = this._grid[tr][tc];
        if (targetCell.weaponId !== stashWeaponId) return 'failed';
        if (targetCell.rootRow !== null) return 'failed';

        const config = this._weaponConfigMap?.get(stashWeaponId);
        if (!config?.mergeToId) return 'failed';

        // 升级目标格，清空备用格
        targetCell.weaponId = config.mergeToId;
        this._stashWeaponId = null;
        this._notifyChange();
        return 'merged';
    }

    // ─────────────────────────────────────────────────────────────
    // 合成逻辑
    // ─────────────────────────────────────────────────────────────

    /**
     * 尝试合成：fr/fc → tr/tc
     * - 两者都必须是主格（rootRow === null）
     * - weaponId 相同 → 查找 mergeToId，升级
     * - weaponId 不同 → 互换
     * - to 格为空主格 → 移动
     */
    public tryMerge(
        fr: number, fc: number,
        tr: number, tc: number,
        weaponConfigs?: Map<string, WeaponConfig>
    ): 'merged' | 'swapped' | 'failed' {
        const fromCell = this.getCell(fr, fc);
        const toCell = this.getCell(tr, tc);
        if (!fromCell || !toCell) return 'failed';
        if (fr === tr && fc === tc) return 'failed';

        // from 必须是有武器的主格
        if (fromCell.weaponId === null || fromCell.rootRow !== null) return 'failed';

        // to 是空主格 → 移动（含副格迁移）
        if (toCell.weaponId === null && toCell.rootRow === null) {
            this._moveWeapon(fr, fc, tr, tc);
            this._notifyChange();
            return 'swapped';
        }

        // to 也是主格 → 尝试合成或互换
        if (toCell.rootRow !== null) return 'failed'; // to 是副格，不处理

        // 相同 id → 合成
        if (fromCell.weaponId === toCell.weaponId) {
            const mergeToId = this._getMergeToId(fromCell.weaponId);
            if (!mergeToId) return 'failed'; // 最高级，无法合成

            // 清除 from 武器（主格+副格）
            this._clearWeaponCells(fr, fc);

            // to 格升级（保持 shape 不变，只改 id）
            // 副格 rootRow/rootCol 已指向 tr/tc，无需改变
            toCell.weaponId = mergeToId;

            this._notifyChange();
            return 'merged';
        }

        // 不同武器 → 互换（两者都是主格且形状相同才能互换，简单版：只互换单主格 id）
        const tmpId = fromCell.weaponId;
        const tmpUuid = fromCell.weaponNodeUuid;
        fromCell.weaponId = toCell.weaponId;
        fromCell.weaponNodeUuid = toCell.weaponNodeUuid;
        toCell.weaponId = tmpId;
        toCell.weaponNodeUuid = tmpUuid;
        this._notifyChange();
        return 'swapped';
    }

    /** 移动武器：将 fr/fc 主格（含副格）迁移到 tr/tc 开始的位置 */
    private _moveWeapon(fr: number, fc: number, tr: number, tc: number): void {
        const fromMain = this._grid[fr][fc];

        // 先保存需要迁移的数据
        const savedId = fromMain.weaponId;
        const savedUuid = fromMain.weaponNodeUuid;

        // 计算副格列偏移
        const subDcs: number[] = [];
        for (let r = 0; r < GridManager.TOTAL_ROWS; r++) {
            for (let c = 0; c < GridManager.TOTAL_COLS; c++) {
                const s = this._grid[r][c];
                if (s.rootRow === fr && s.rootCol === fc) {
                    subDcs.push(c - fc);
                }
            }
        }

        // 清除原位
        this._clearWeaponCells(fr, fc);

        // 写入新主格
        const toMain = this._grid[tr][tc];
        toMain.weaponId = savedId;
        toMain.rootRow = null;
        toMain.rootCol = null;
        toMain.weaponNodeUuid = savedUuid;

        // 写入新副格
        for (const dc of subDcs) {
            const newC = tc + dc;
            if (this._isValidPos(tr, newC)) {
                const sub = this._grid[tr][newC];
                sub.weaponId = null;
                sub.rootRow = tr;
                sub.rootCol = tc;
                sub.weaponNodeUuid = undefined;
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 内部辅助
    // ─────────────────────────────────────────────────────────────

    /** 清除主格及其所有副格 */
    private _clearWeaponCells(mr: number, mc: number): void {
        const main = this._grid[mr][mc];
        main.weaponId = null;
        main.rootRow = null;
        main.rootCol = null;
        main.weaponNodeUuid = undefined;

        for (let r = 0; r < GridManager.TOTAL_ROWS; r++) {
            for (let c = 0; c < GridManager.TOTAL_COLS; c++) {
                const s = this._grid[r][c];
                if (s.rootRow === mr && s.rootCol === mc) {
                    s.weaponId = null;
                    s.rootRow = null;
                    s.rootCol = null;
                    s.weaponNodeUuid = undefined;
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 扩展
    // ─────────────────────────────────────────────────────────────

    public expandCol(): void { this.expandTwoCells(); }

    /** 每两波解锁一个新格子（按固定顺序） */
    public expandTwoCells(): void {
        const order = GridManager.EXPAND_ORDER;
        const activated = this._activeKeys.size - (GAME_CONFIG.GRID_ROWS_INIT * GAME_CONFIG.GRID_COLS_INIT);
        if (activated >= order.length) {
            console.log('[GridManager] 已达最大格子数');
            return;
        }
        const [r, c] = order[activated];
        this._activeKeys.add(`${r},${c}`);
        console.log(`[GridManager] 解锁格子 (${r},${c})，共 ${this._activeKeys.size} 格`);
        this._notifyChange();
    }

    // ─────────────────────────────────────────────────────────────
    // 存档
    // ─────────────────────────────────────────────────────────────

    public toSaveData(): GridCell[] {
        return this.getFlatCells().filter(c => c.weaponId !== null || c.rootRow !== null);
    }

    // ─────────────────────────────────────────────────────────────
    // 回调
    // ─────────────────────────────────────────────────────────────

    public onChange(cb: (grid: GridCell[][], activeKeys: Set<string>) => void): void {
        this._changeCallbacks.push(cb);
    }

    public offChange(cb: (grid: GridCell[][], activeKeys: Set<string>) => void): void {
        const idx = this._changeCallbacks.indexOf(cb);
        if (idx >= 0) this._changeCallbacks.splice(idx, 1);
    }

    private _notifyChange(): void {
        this._changeCallbacks.forEach(cb => cb(this._grid, this._activeKeys));
    }

    private _isValidPos(row: number, col: number): boolean {
        return row >= 0 && row < GridManager.TOTAL_ROWS &&
               col >= 0 && col < GridManager.TOTAL_COLS;
    }

    /** 根据缓存的武器配置获取合成后 id */
    private _getMergeToId(weaponId: string): string | null {
        return this._weaponConfigMap.get(weaponId)?.mergeToId ?? null;
    }
}
