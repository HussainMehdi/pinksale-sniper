import { BotState, NetworkType } from "../types";

export const ENV_DEFAULT = {
    NETWORK: 'BNBSMART' as NetworkType,
    STATE: BotState.snipe,
    CONTRACT_ADDRESS: '',
    AMOUNT: '0.1',
    PRIVATE_KEY: '',
    POLL_TIME: '1000',
    LOGS: 'true'
}