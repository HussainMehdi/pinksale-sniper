import fs from 'fs';
import path from 'path';
import { config } from "dotenv";
import Web3 from "web3";
import { ethers, Wallet } from 'ethers'
import { Account } from "web3-core";
import { CONTRACT_METHODS, NETWORKS, PANCAKE_SWAP_API } from "./consts";
import { ENV_DEFAULT } from "./defaults";
import { BotState, Pinksaleabi__factory } from "./types";
import abi from './abis/pinksaleabi.json';
import { isNumberObject } from 'util/types';
import axios from 'axios';
import { BigNumber } from 'bignumber.js';

let logsDir = path.dirname(__dirname) + '/logs/';

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
    const { NETWORK, CONTRACT_ADDRESS, AMOUNT, POLL_TIME, PRIVATE_KEY, LOGS } = ENV;
    const network_url = NETWORKS[NETWORK];
    if (!network_url) {
        log(`❌❌ Network ${NETWORK} not supported ❌❌`);
        process.exit();
    }

    const web3 = new Web3(new Web3.providers.HttpProvider(network_url));
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
            break;
        }
        case BotState.monitor: {
            monitor({
                contractAddress: CONTRACT_ADDRESS,
                buyPrice: '0.0000002820847225380439190126288869787',
                pollTime: POLL_TIME,
                TP: ENV.TP,
                SL: ENV.SL,
            });
            break;
        }
        case BotState.sell: {

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
                    const receipt = await web3.eth.sendTransaction(txParams);
                    log(`✅✅ Transaction sent: ${receipt.transactionHash} ✅✅`);
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
            const apiUpdateTime = res?.updated_at || 0;
            log(`🕒 Last trade delta: ${((Date.now() - apiUpdateTime) / 1000).toFixed(4)} seconds`);
            const price_bn = BigNumber(res?.data?.price_BNB || 0);
            if (price_bn.isLessThan(buyPrice.times(new BigNumber(100).minus(SL).div(100)))) {
                log(`🔴 SL HIT!`);
            } else if (price_bn.isGreaterThan(buyPrice.times(new BigNumber(100).plus(TP).div(100)))) {
                log(`🟢 TP HIT!`);
            } else {
                const PNL = price_bn.minus(buyPrice).div(buyPrice).times(100);
                log(`🟣 Current price: ${price_bn.toFixed(18)}`);
                log(`🟡 Buy price: ${buyPrice.toFixed(18)}`);
                log(`${PNL.isNegative() ? '🔴' : '🟢'} PNL : ${PNL.toFixed(4)}%`);
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

async function sell(args: {
}) {
    const { } = args;


}

start();