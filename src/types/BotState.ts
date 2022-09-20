export enum BotState {
    'snipe', 'claim', 'monitor', 'sell'
}

export namespace BotState {
    export function toString(dir: BotState): string {
        return BotState[dir];
    }

    export function fromString(dir: string): BotState {
        return (BotState as any)[dir];
    }
}