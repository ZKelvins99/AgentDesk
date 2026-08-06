// pino-roll 无自带类型声明；CJS 默认导出为工厂函数，返回 pino destination 流。
declare module 'pino-roll' {
  export interface PinoRollOptions {
    file: string;
    size?: string | number;
    frequency?: 'daily' | 'hourly' | 'custom' | string;
    dateFormat?: string;
    limit?: { count?: number; maxSize?: number | string; days?: number };
    mkdir?: boolean;
    sync?: boolean;
    extension?: string;
    maxFiles?: number;
  }
  function createRoll(opts: PinoRollOptions): Promise<import('pino').DestinationStream>;
  export default createRoll;
}
