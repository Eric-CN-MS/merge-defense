import { _decorator, Component } from 'cc';
import { GridCell, WeaponConfig, GAME_CONFIG } from '../types/GameTypes';
import { GameManager } from './GameManager';

const { ccclass } = _decorator;

/**
 * GridManager — 格子盘管理器
 * T013: 管理格子状态、武器放置、合成逻辑
 * T015: tryMerge() 合成判断
 */
@ccclass('GridManager')
export class GridManager extends Component {

    private static _instance: GridManager | null = null;
    public static get instance(): GridManager {
        return GridManager._instance!;
    }

    private _grid: GridCell[][] = [];
    private _rows: number = GAME_CONFIG.GRID_ROWS_INIT;
    private _cols: number = GAME_CONFIG.GRID_COLS_INIT;

    // 格子变化回调（GridUI 监听）
    private _changeCallbacks: ((grid: GridCell[][]) => void)[] = [];

    onLoad() {
        if (GridManager._instance) {
            this.destroy();
            return;
        }
        GridManager._instance = this;
    }

    onDestroy() {
        if (GridManager._instance === this) {
            GridManager._instance = null;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 初始化
    // ─────────────────────────────────────────────────────────────

    /** 由 GameManager 调用，初始化格子（支持从存档恢复） */
    public init(rows: number = GAME_CONFIG.GRID_ROWS_INIT, cols: number = GAME_CONFIG.GRID_COLS_INIT): void {
        this._rows = rows;
        this._cols = cols;
        this._grid = [];

        for (let r = 0; r < rows; r++) {
            this._grid[r] = [];
            for (let c = 0; c < cols; c++) {
                this._grid[r][c] = { row: r, col: c, weaponLevel: null };
            }
        }
        console.log(`[GridManager] 初始化 ${rows}×${cols} 格子`);
        this._notifyChange();
    }

    /** 从存档恢复格子状态 */
    public restoreFromSave(cells: GridCell[]): void {
        cells.forEach(cell => {
            if (this._isValidPos(cell.row, cell.col)) {
                this._grid[cell.row][cell.col] = { ...cell };
            }
        });
        this._notifyChange();
    }

    // ─────────────────────────────────────────────────────────────
    // 格子读写 API
    // ─────────────────────────────────────────────────────────────

    public get rows(): number { return this._rows; }
    public get cols(): number { return this._cols; }

    public getCell(row: number, col: number): GridCell | null {
        if (!this._isValidPos(row, col)) return null;
        return this._grid[row][col];
    }

    public getGrid(): GridCell[][] {
        return this._grid;
    }

    /** 获取所有格子的扁平列表 */
    public getFlatCells(): GridCell[] {
        return this._grid.flat();
    }

    /** 找第一个空格（左上到右下顺序） */
    public findFirstEmpty(): GridCell | null {
        for (let r = 0; r < this._rows; r++) {
            for (let c = 0; c < this._cols; c++) {
                if (this._grid[r][c].weaponLevel === null) {
                    return this._grid[r][c];
                }
            }
        }
        return null;
    }

    /** 是否有空格 */
    public hasEmptyCell(): boolean {
        return this.findFirstEmpty() !== null;
    }

    // ─────────────────────────────────────────────────────────────
    // 武器放置 / 移除
    // ─────────────────────────────────────────────────────────────

    /**
     * T020: 放置武器到第一个空格
     * @returns 放置成功的 GridCell，null=无空格
     */
    public placeWeapon(config: WeaponConfig): GridCell | null {
        const cell = this.findFirstEmpty();
        if (!cell) {
            console.warn('[GridManager] 格子已满，无法放置武器');
            return null;
        }
        cell.weaponLevel = config.level;
        console.log(`[GridManager] 放置 Lv${config.level} 武器到 (${cell.row},${cell.col})`);
        this._notifyChange();
        return cell;
    }

    /** 在指定格子放置武器 */
    public setWeapon(row: number, col: number, level: number): boolean {
        if (!this._isValidPos(row, col)) return false;
        this._grid[row][col].weaponLevel = level;
        this._notifyChange();
        return true;
    }

    /** 移除指定格子的武器 */
    public removeWeapon(row: number, col: number): boolean {
        if (!this._isValidPos(row, col)) return false;
        this._grid[row][col].weaponLevel = null;
        this._grid[row][col].weaponNodeUuid = undefined;
        this._notifyChange();
        return true;
    }

    // ─────────────────────────────────────────────────────────────
    // T015: 合成逻辑
    // ─────────────────────────────────────────────────────────────

    /**
     * 尝试合成两个格子的武器
     * @returns 'merged'=合成成功, 'swapped'=不同级交换位置, 'failed'=无效操作
     */
    public tryMerge(
        fromRow: number, fromCol: number,
        toRow: number, toCol: number
    ): 'merged' | 'swapped' | 'failed' {

        const fromCell = this.getCell(fromRow, fromCol);
        const toCell = this.getCell(toRow, toCol);

        if (!fromCell || !toCell) return 'failed';
        if (fromRow === toRow && fromCol === toCol) return 'failed';
        if (fromCell.weaponLevel === null) return 'failed';

        // 目标格为空 → 移动
        if (toCell.weaponLevel === null) {
            toCell.weaponLevel = fromCell.weaponLevel;
            fromCell.weaponLevel = null;
            this._notifyChange();
            return 'swapped';
        }

        // 同级 → 合成
        if (fromCell.weaponLevel === toCell.weaponLevel) {
            const currentLevel = fromCell.weaponLevel;

            // 最高级无法再合成
            if (currentLevel >= GAME_CONFIG.MAX_WEAPON_LEVEL) {
                console.log('[GridManager] 最高级武器，无法继续合成');
                return 'failed';
            }

            // 合成：目标格升级，来源格清空
            toCell.weaponLevel = currentLevel + 1;
            fromCell.weaponLevel = null;
            console.log(`[GridManager] 合成成功！Lv${currentLevel} × 2 → Lv${currentLevel + 1}`);
            this._notifyChange();
            return 'merged';
        }

        // 不同级 → 交换位置
        const tmp = fromCell.weaponLevel;
        fromCell.weaponLevel = toCell.weaponLevel;
        toCell.weaponLevel = tmp;
        this._notifyChange();
        return 'swapped';
    }

    // ─────────────────────────────────────────────────────────────
    // 存档序列化
    // ─────────────────────────────────────────────────────────────

    /** 导出为存档格式 */
    public toSaveData(): GridCell[] {
        return this.getFlatCells().filter(c => c.weaponLevel !== null);
    }

    // ─────────────────────────────────────────────────────────────
    // 回调
    // ─────────────────────────────────────────────────────────────

    public onChange(cb: (grid: GridCell[][]) => void): void {
        this._changeCallbacks.push(cb);
    }

    public offChange(cb: (grid: GridCell[][]) => void): void {
        const idx = this._changeCallbacks.indexOf(cb);
        if (idx >= 0) this._changeCallbacks.splice(idx, 1);
    }

    private _notifyChange(): void {
        this._changeCallbacks.forEach(cb => cb(this._grid));
    }

    // ─────────────────────────────────────────────────────────────
    // 工具
    // ─────────────────────────────────────────────────────────────

    private _isValidPos(row: number, col: number): boolean {
        return row >= 0 && row < this._rows && col >= 0 && col < this._cols;
    }
}
