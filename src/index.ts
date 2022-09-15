import fs from 'fs';
import path from 'path';
import { config } from "dotenv";
import Web3 from "web3";
import { ethers, Wallet } from 'ethers'
import { Account } from "web3-core";
import { CONTRACT_METHODS, NETWORKS } from "./consts";
import { ENV_DEFAULT } from "./defaults";
import { BotState, Pinksaleabi__factory } from "./types";
import abi from './abis/pinksaleabi.json';
import { isNumberObject } from 'util/types';
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
        case BotState.sell: {

        }
    }

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

start();