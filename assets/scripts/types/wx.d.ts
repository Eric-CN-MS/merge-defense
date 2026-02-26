/**
 * wx.d.ts — 微信小游戏全局 API 类型声明（最小子集）
 * 用于 TypeScript 编译时识别 wx.* API，不影响运行时行为
 */

declare namespace wx {
    // ─── 存储 ─────────────────────────────────────────────────────
    function setStorageSync(key: string, data: any): void;
    function getStorageSync(key: string): any;
    function removeStorageSync(key: string): void;
    function clearStorageSync(): void;

    // ─── 系统信息 ─────────────────────────────────────────────────
    function getSystemInfoSync(): {
        windowWidth: number;
        windowHeight: number;
        pixelRatio: number;
        platform: string;
        brand: string;
        model: string;
        system: string;
        version: string;
        SDKVersion: string;
        language: string;
    };

    // ─── 网络 ─────────────────────────────────────────────────────
    function request(options: {
        url: string;
        method?: string;
        data?: any;
        header?: Record<string, string>;
        success?: (res: { data: any; statusCode: number }) => void;
        fail?: (err: any) => void;
        complete?: () => void;
    }): void;

    // ─── 用户信息 ─────────────────────────────────────────────────
    function getUserProfile(options: {
        desc: string;
        success?: (res: { userInfo: { nickName: string; avatarUrl: string } }) => void;
        fail?: (err: any) => void;
    }): void;

    // ─── 振动 ─────────────────────────────────────────────────────
    function vibrateShort(options?: { type?: 'heavy' | 'medium' | 'light' }): void;
    function vibrateLong(): void;

    // ─── 音频 ─────────────────────────────────────────────────────
    function createInnerAudioContext(): {
        src: string;
        autoplay: boolean;
        loop: boolean;
        volume: number;
        play(): void;
        pause(): void;
        stop(): void;
        destroy(): void;
        onPlay(callback: () => void): void;
        onError(callback: (err: any) => void): void;
    };

    // ─── 性能监控 ─────────────────────────────────────────────────
    function getPerformance(): {
        now(): number;
    };
}
