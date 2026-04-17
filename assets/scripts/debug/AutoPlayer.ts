import { _decorator, Component } from 'cc';
import { GameManager } from '../core/GameManager';
import { GridManager } from '../core/GridManager';
import { EconomyManager } from '../core/EconomyManager';
import { GAME_CONFIG, GameState, WeaponConfig } from '../types/GameTypes';

const { ccclass } = _decorator;

/**
 * AutoPlayer - 自动测试脚本
 * 策略：买满武器 → 尽量合成 → 等2秒 → 开始波次 → 循环到通关
 */
@ccclass('AutoPlayer')
export class AutoPlayer extends Component {

    private _waveStartTimer = 0;
    private readonly WAVE_START_DELAY = 2.0;
    private readonly TICK = 0.3;

    onLoad() {
        // 用 scheduleInterval 保证动态挂载后也能正常执行
        this.schedule(this._tick.bind(this), this.TICK);
        console.log('[AutoPlayer] 调度器已启动');
    }

    private _tick() {
        const gm = GameManager.instance;
        const grid = GridManager.instance;
        const eco = EconomyManager.instance;
        if (!gm || !grid || !eco) return;

        const state = gm.state;

        if (state === GameState.GAME_OVER) {
            console.log('[AutoPlayer] 游戏结束，停止');
            this.unscheduleAllCallbacks();
            return;
        }

        if (state !== GameState.WAVE_PREP) {
            this._waveStartTimer = 0;
            return;
        }

        // 买武器填满空格（1x1=70%, 1x2=20%, 1x3=10%）
        let bought = true;
        while (bought) {
            bought = false;
            const allLv1 = gm.getLv1WeaponConfigs();
            if (!allLv1.length) break;

            // 按概率选形状
            const rand = Math.random();
            let shape = '1x1';
            if (rand > 0.9) shape = '1x3';
            else if (rand > 0.7) shape = '1x2';

            const candidates = allLv1.filter(w => w.shape === shape);
            const fallback   = allLv1.filter(w => w.shape === '1x1');
            const pool = candidates.length ? candidates : fallback;
            const cfg  = pool[Math.floor(Math.random() * pool.length)];

            if (eco.canAfford(cfg.cost) && grid.hasEmptyCell()) {
                const cell = grid.placeWeapon(cfg);
                if (cell) {
                    eco.spend(cfg.cost);
                    console.log(`[AutoPlayer] 购买 ${cfg.name}(${cfg.shape}) → (${cell.row},${cell.col})`);
                    bought = true;
                }
            }
        }

        // 2. 合并（找相同等级且未满级的对子，循环直到无法合并）
        let merged = true;
        while (merged) {
            merged = this._tryMergeOnce(grid);
        }

        // 3. 备用格利用：如果备用格有武器，尝试与主格合并；如格子满了把最低级主格存入备用格
        this._tryUseStash(grid, gm);

        // 4. 累计等待时间后开始波次
        this._waveStartTimer += this.TICK;
        console.log(`[AutoPlayer] 等待开始... ${this._waveStartTimer.toFixed(1)}s / ${this.WAVE_START_DELAY}s`);
        if (this._waveStartTimer >= this.WAVE_START_DELAY) {
            this._waveStartTimer = 0;
            console.log(`[AutoPlayer] ▶ 开始第 ${gm.currentWave + 1} 波`);
            gm.startWave();
        }
    }

    private _tryMergeOnce(grid: GridManager): boolean {
        const g = grid.getGrid();
        for (let r1 = 0; r1 < 4; r1++) {
            for (let c1 = 0; c1 < 4; c1++) {
                const cell1 = g[r1]?.[c1];
                // 只处理主格（rootRow===null）且有武器
                if (!cell1 || cell1.weaponId === null || cell1.rootRow !== null) continue;
                const cfg1 = GameManager.instance?.getWeaponConfig(cell1.weaponId);
                if (!cfg1 || cfg1.mergeToId === null) continue; // 已满级跳过

                for (let r2 = 0; r2 < 4; r2++) {
                    for (let c2 = 0; c2 < 4; c2++) {
                        if (r1 === r2 && c1 === c2) continue;
                        const cell2 = g[r2]?.[c2];
                        if (!cell2 || cell2.rootRow !== null) continue;
                        if (cell2.weaponId !== cell1.weaponId) continue;

                        const result = grid.tryMerge(r1, c1, r2, c2);
                        if (result === 'merged') {
                            console.log(`[AutoPlayer] 合并 (${r1},${c1})+(${r2},${c2}) → ${cfg1.mergeToId}`);
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    /** 利用备用格：备用格有武器时尝试合并；格子满且买不了时把最低级武器存入备用格 */
    private _tryUseStash(grid: GridManager, gm: GameManager): void {
        const stashId = grid.stashWeaponId;
        if (stashId !== null) {
            // 备用格有武器：找主格里同 id 的格子合并
            const g = grid.getGrid();
            for (let r = 0; r < 4; r++) {
                for (let c = 0; c < 4; c++) {
                    const cell = g[r]?.[c];
                    if (!cell || cell.rootRow !== null) continue;
                    if (cell.weaponId === stashId) {
                        const result = grid.tryMergeFromStash(r, c, stashId);
                        if (result === 'merged') {
                            console.log(`[AutoPlayer] 备用格合并 → (${r},${c})`);
                            return;
                        }
                    }
                }
            }
            // 找空格放回主格
            if (grid.hasEmptyCell()) {
                const placed = grid.moveFromStashToFirst();
                if (placed) console.log('[AutoPlayer] 备用格归还到空格');
            }
        } else if (!grid.hasEmptyCell()) {
            // 格子满了：把最低级的1×1武器存入备用格，腾出空间
            const g = grid.getGrid();
            let lowestCfg: WeaponConfig | null = null;
            let lowestR = -1, lowestC = -1;
            for (let r = 0; r < 4; r++) {
                for (let c = 0; c < 4; c++) {
                    const cell = g[r]?.[c];
                    if (!cell || cell.rootRow !== null || cell.weaponId === null) continue;
                    const cfg = gm.getWeaponConfig(cell.weaponId);
                    if (!cfg || cfg.shape !== '1x1') continue;
                    if (!lowestCfg || cfg.level < lowestCfg.level) {
                        lowestCfg = cfg;
                        lowestR = r;
                        lowestC = c;
                    }
                }
            }
            if (lowestR >= 0) {
                grid.moveToStash(lowestR, lowestC);
                console.log(`[AutoPlayer] 格子满，存入备用格 (${lowestR},${lowestC}) ${lowestCfg?.id}`);
            }
        }
    }
}
