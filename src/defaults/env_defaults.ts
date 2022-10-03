import { BotState, NetworkType } from "../types";

export const ENV_DEFAULT = {
    NETWORK: 'BNBSMART' as NetworkType,
    STATE: BotState.snipe,
    CONTRACT_ADDRESS: '',
    TOKEN_ADDRESS: '',
    PANCAKE_ROUTER_ADDRESS: '',
    WBNB_ADDRESS: '',
    AMOUNT: '0.1',
    PRIVATE_KEY: '',
    POLL_TIME: '1000',
    TP: '100',
    SL: '20',
    LOGS: 'true'
}