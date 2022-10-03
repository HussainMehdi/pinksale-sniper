import fs from 'fs';
import path from 'path';
import { BotState } from '../types';

export class DBItem {
    key: string;
    state: BotState;
    buyPrice: string;
    TP: string;
    SL: string;
    amount: string;
    tokensAmount: string;

    constructor(args: { key: string, state: BotState, buyPrice: string, TP: string, SL: string, amount: string, tokensAmount: string }) {
        this.key = args.key;
        this.state = args.state;
        this.buyPrice = args.buyPrice;
        this.TP = args.TP;
        this.SL = args.SL;
        this.amount = args.amount;
        this.tokensAmount = args.tokensAmount;
    }

    setState(state: BotState) {
        this.state = state;
    }

    setBuyPrice(buyPrice: string) {
        this.buyPrice = buyPrice;
    }

    setTP(TP: string) {
        this.TP = TP;
    }

    setSL(SL: string) {
        this.SL = SL;
    }

    setAmount(amount: string) {
        this.amount = amount;
    }

    setTokensAmount(tokensAmount: string) {
        this.tokensAmount = tokensAmount;
    }
}

export class DB {
    private dbPath: string;
    private db: { [key: string]: DBItem };

    constructor(dbPath?: string) {
        this.dbPath = process.cwd() + `/${dbPath || 'db'}`;
        // this.dbPath = `${path.dirname(__dirname)}/${dbPath || 'db'}/'`;
        this.db = {};
        if (!fs.existsSync(this.dbPath)) {
            fs.mkdirSync(this.dbPath);
        }
    }

    public loadDBItem(key: string): DBItem | undefined {
        const dbItem = this.db[key];
        if (dbItem) {
            return dbItem;
        } else {
            const dbItem = this.loadDBItemFromFile(key);
            if (dbItem) {
                this.db[key] = dbItem;
                return dbItem;
            }
        }
    }

    public loadDBItemFromFile(key: string): DBItem | undefined {
        const filePath = `${this.dbPath}/${key}.json`;
        if (fs.existsSync(filePath)) {
            const dbItem = fs.readFileSync(filePath);
            if (dbItem) {
                const dbItemJson = JSON.parse(dbItem.toString());
                return new DBItem({
                    key: dbItemJson.key,
                    state: dbItemJson.state,
                    buyPrice: dbItemJson.buyPrice,
                    TP: dbItemJson.TP,
                    SL: dbItemJson.SL,
                    amount: dbItemJson.amount,
                    tokensAmount: dbItemJson.tokensAmount
                });
            }
        }
        return undefined;
    }

    public saveDBItem(key: string, dbItem?: DBItem): DBItem {
        dbItem = dbItem || this.db[key];
        if (dbItem) {
            fs.writeFileSync(`${this.dbPath}/${dbItem.key}.json`, JSON.stringify(dbItem));
        }
        this.db[key] = dbItem;
        return dbItem;
    }

}

export function generateDBKey(args: {
    NETWORK: string,
    CONTRACT_ADDRESS: string,
    AMOUNT: string,
    PRIVATE_KEY: string
}): string {
    return `${args.NETWORK}_${args.CONTRACT_ADDRESS}_${args.AMOUNT}_${args.PRIVATE_KEY.substring(0, 4)}...${args.PRIVATE_KEY.substring(args.PRIVATE_KEY.length - 4)}`;
}