import fs from 'fs';
import path from 'path';
import { config } from "dotenv";
import Web3 from "web3";
import { Contract, ethers, Wallet } from 'ethers'
import { Account } from "web3-core";
import { CONTRACT_METHODS, NETWORKS, PANCAKE_SWAP_API } from "./consts";
import { ENV_DEFAULT } from "./defaults";
import { BotState, Pinksaleabi__factory } from "./types";
import pinksale_abi from './abis/pinksaleabi.json';
import pancake_abi from './abis/pancakeswap-router-abi.json';
import { isNumberObject } from 'util/types';
import axios from 'axios';
import { BigNumber } from 'bignumber.js';
import { DB, generateDBKey, DBItem } from './storage-db';
import { SHARE_ENV } from 'worker_threads';


const db = new DB();
let logsDir = process.cwd() + '/logs/';

let logsPath = logsDir + 'ps-bot-' + new Date().toISOString().slice(0, 10) + '.log';

// if logs dir missing then create it
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

config();
const ENV = {
    ...ENV_DEFAULT,
    ...process.env
};

const DB_KEY = generateDBKey({
    NETWORK: ENV.NETWORK,
    CONTRACT_ADDRESS: ENV.CONTRACT_ADDRESS,
    AMOUNT: ENV.AMOUNT,
    PRIVATE_KEY: ENV.PRIVATE_KEY
})
let dbItem = db.loadDBItem(DB_KEY) as DBItem;
if (dbItem === undefined) {
    dbItem = db.saveDBItem(DB_KEY, new DBItem({
        key: DB_KEY,
        state: ENV.STATE,
        buyPrice: '0',
        TP: ENV.TP,
        SL: ENV.SL,
        amount: ENV.AMOUNT,
        tokensAmount: '0',

    }))
}

ENV.STATE = ENV.STATE || dbItem?.state;

const { NETWORK,
    CONTRACT_ADDRESS,
    TOKEN_ADDRESS,
    PANCAKE_ROUTER_ADDRESS,
    WBNB_ADDRESS,
    AMOUNT,
    POLL_TIME,
    PRIVATE_KEY,
    LOGS } = ENV;

let web3: Web3;

const log = (...v: any) => {
    if (ENV.LOGS === 'true') {
        let content = v.join(',');
        if (fs.existsSync(logsPath)) {
            content = '\r\n' + new Date().toUTCString() + ': ' + content;
        }
        fs.appendFile(logsPath, content, function (err) {
            if (err) throw err;
        });
    }

    console.log(...v)
};

async function start() {
    const network_url = NETWORKS[NETWORK];
    if (!network_url) {
        log(`❌❌ Network ${NETWORK} not supported ❌❌`);
        process.exit();
    }

    web3 = new Web3(new Web3.providers.HttpProvider(network_url));
    const chainId = await web3.eth.getChainId();
    const account = web3.eth.accounts.privateKeyToAccount(PRIVATE_KEY);
    web3.eth.accounts.wallet.add(account);
    log(`
    --------------------------------------------
                 🚀 BOT STARTED 🚀
    --------------------------------------------
    🔗 NETWORK          : ${NETWORK}
    🌐 NETWORK_URL      : ${network_url}
    🔢 ChainId          : ${chainId}
    ⌚ POLL_TIME        : ${POLL_TIME}ms
    📄 CONTRACT_ADDRESS : ${CONTRACT_ADDRESS}
    💰 AMOUNT           : ${AMOUNT}
    🦸 ACCOUNT          : ${account.address}
    🔒 PRIVATE_KEY      : ${PRIVATE_KEY.substring(0, 4)}...${PRIVATE_KEY.substring(PRIVATE_KEY.length - 4)}
    📂 LOGS             : ${LOGS}
    --------------------------------------------
    `);

    if (!isNumberObject(ENV.STATE)) {
        ENV.STATE = BotState.fromString(ENV.STATE);
    }

    switch (ENV.STATE) {
        case BotState.snipe: {
            snipe({
                web3,
                chainId,
                account,
                contractAddress: CONTRACT_ADDRESS,
                amount: AMOUNT,
                pollTime: POLL_TIME
            });
            break;
        }
        case BotState.claim: {
            // dbItem.setBuyPrice(amount);
            break;
        }
        case BotState.monitor: {
            monitor({
                contractAddress: TOKEN_ADDRESS,
                buyPrice: dbItem.buyPrice,
                pollTime: POLL_TIME,
                TP: ENV.TP,
                SL: ENV.SL,
            });
            break;
        }
        case BotState.sell: {
            sell();
            break;
        }

    }

}

async function fetchPancakeSwapPrice(tokenAddress: string) {
    const url = `${PANCAKE_SWAP_API}${tokenAddress}`;
    const response = await axios.get(url).catch(() => { });
    return response?.data;
}

async function snipe(args: {
    web3: Web3,
    chainId: number,
    account: Account,
    contractAddress: string,
    pollTime?: string,
    amount: string
}) {
    const { web3, chainId, account, contractAddress, amount, pollTime = '1000' } = args;
    const sniperWorker = async () => {
        web3.eth.estimateGas({
            to: contractAddress,
            from: account.address,
            value: web3.utils.toHex(web3.utils.toWei(amount, 'ether'))
        }).then(
            async (gas) => {
                log(`✅ GAS ESTIMATED: ${gas}`);
                log(`💸 Buying for ${amount} value...`);
                const txParams = {
                    gas: web3.utils.toHex(gas),
                    from: account.address,
                    chainId: chainId,
                    value: web3.utils.toHex(web3.utils.toWei(amount, 'ether')),
                    data: CONTRACT_METHODS.contribute,
                    to: contractAddress
                };
                try {
                    const receipt = { transactionHash: '' } as any //await web3.eth.sendTransaction(txParams);
                    log(`✅✅ Transaction sent: ${receipt.transactionHash} ✅✅`);

                    dbItem.setState(BotState.claim);
                    db.saveDBItem(DB_KEY);
                }
                catch (err: any) {
                    log(`❌❌ Error: ${err?.message || err.toString()} ❌❌`);
                    log(`🕕 Retrying...`);
                    setTimeout(sniperWorker, 1);
                }

            }
        ).catch(
            (err) => {
                if (err.message) {
                    if (err.message.indexOf("insufficient funds for gas") > 0) {
                        log(`💥💥 Account have no funds:  ${err.message} 💥💥`);
                    } else if (err.message.indexOf('It is not time to buy') > 0) {
                        log('⏰⏰ Presale contract is not active yet : ' + err.message);
                    } else {
                        log('💁‍♂️💁‍♂️ Presale contract might not be active yet : ' + err.message);
                    }
                } else {
                    log('Presale contract is not active yet : ' + err.toString());
                }
                setTimeout(sniperWorker, parseInt(pollTime));
            }
        );
    }
    setTimeout(sniperWorker, parseInt(pollTime));
}

async function monitor(args: {
    contractAddress: string
    buyPrice: string
    pollTime?: string
    TP: string
    SL: string
}) {
    const { contractAddress, buyPrice, pollTime = '1000', SL, TP } = {
        ...args,
        buyPrice: BigNumber(args.buyPrice),
        SL: BigNumber(args.SL),
        TP: BigNumber(args.TP)
    };

    const monitorWorker = () => {
        fetchPancakeSwapPrice(contractAddress).then((res) => {
            const apiUpdateTime = res?.updated_at || -1;
            log(`🕒 Last trade delta: ${apiUpdateTime === -1 ? '⛔ NOT LISTED ❌❌' : ((Date.now() - apiUpdateTime) / 1000).toFixed(4) + ' seconds'}`);
            const price_bn = BigNumber(res?.data?.price_BNB || 0);
            if (price_bn.isZero()) {
                log(`🚧 token not yet listed on PancakeSwap...`);
                log(`⌚ next check in ${pollTime}ms`);
                setTimeout(monitorWorker, parseInt(pollTime));
                return;
            }
            const printPNL = () => {
                const PNL = price_bn.minus(buyPrice).div(buyPrice).times(100);
                log(`🟣 Current price: ${price_bn.toFixed(18)}`);
                log(`🟡 Buy price: ${buyPrice.toFixed(18)}`);
                log(`${PNL.isNegative() ? '🔴' : '🟢'} PNL : ${PNL.toFixed(4)}%`);
            }

            if (price_bn.isLessThan(buyPrice.times(new BigNumber(100).minus(SL).div(100)))) {
                printPNL();
                log(`🔴 SL HIT!`);
                sell()
            } else if (price_bn.isGreaterThan(buyPrice.times(new BigNumber(100).plus(TP).div(100)))) {
                printPNL();
                log(`🟢 TP HIT!`);
            } else {
                printPNL();
                log(`⌚ next check in ${pollTime}ms`);
                setTimeout(monitorWorker, parseInt(pollTime));
            }

        }).catch(err => {
            log('❌❌ Error: ' + err.toString() + ' ❌❌');
            setTimeout(monitorWorker, parseInt(pollTime));
        })

    }
    monitorWorker();
}

async function sell() {
    const pancake = new web3.eth.Contract(pancake_abi as any, PANCAKE_ROUTER_ADDRESS);

    const payload = await pancake.methods.swapExactTokensForETH(
        web3.utils.toHex(dbItem.tokensAmount),
        web3.utils.toHex('0'),
        [
            TOKEN_ADDRESS,
            WBNB_ADDRESS
        ],
        web3.eth.accounts.wallet[0].address,
        '0x000000000000000000000000ae13d989dac2f0debff460ac112a837c89baa7cd' // long long expiry block.timestamp
    )

    const gas = await payload.estimateGas({
        from: web3.eth.accounts.wallet[0].address,
        to: PANCAKE_ROUTER_ADDRESS
    })

    console.log(gas)
    const res = await payload.send({
        from: web3.eth.accounts.wallet[0].address,
        to: PANCAKE_ROUTER_ADDRESS,
        gas: gas
    })

    console.log(res);
}

start();