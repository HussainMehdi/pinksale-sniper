import { config } from "dotenv";
import Web3 from "web3";
import { Account } from "web3-core";
import { NETWORKS } from "./consts";
import { ENV_DEFAULT } from "./defaults";
config();
const ENV = {
    ...ENV_DEFAULT,
    ...process.env
};

async function start() {
    const { NETWORK, CONTRACT_ADDRESS, BNB_AMOUNT, POLL_TIME, PRIVATE_KEY, LOGS } = ENV;
    const network_url = NETWORKS[NETWORK];
    if (!network_url) {
        console.error(`❌❌ Network ${NETWORK} not supported ❌❌`);
        process.exit();
    }

    const web3 = new Web3(new Web3.providers.HttpProvider(network_url));
    const chainId = await web3.eth.getChainId();
    const account = web3.eth.accounts.privateKeyToAccount(PRIVATE_KEY);
    web3.eth.accounts.wallet.add(account);
    console.log(`
    --------------------------------------------
                 🚀 BOT STARTED 🚀
    --------------------------------------------
    🔗 NETWORK          : ${NETWORK}
    🌐 NETWORK_URL      : ${network_url}
    ⌚ POLL_TIME        : ${POLL_TIME}ms
    📄 CONTRACT_ADDRESS : ${CONTRACT_ADDRESS}
    💰 BNB_AMOUNT       : ${BNB_AMOUNT}
    🦸 ACCOUNT          : ${account.address}
    🔒 PRIVATE_KEY      : ${PRIVATE_KEY.substring(0, 4)}...${PRIVATE_KEY.substring(PRIVATE_KEY.length - 4)}
    📂 LOGS             : ${LOGS}
    --------------------------------------------
    `);

    snipe({
        web3,
        chainId,
        account,
        contractAddress: CONTRACT_ADDRESS,
        bnbAmount: BNB_AMOUNT,
        pollTime: POLL_TIME
    });

}

async function snipe(args: {
    web3: Web3,
    chainId: number,
    account: Account,
    contractAddress: string,
    pollTime?: string,
    bnbAmount: string
}) {
    const { web3, chainId, account, contractAddress, bnbAmount, pollTime = '1000' } = args;
    const sniperWorker = async () => {
        web3.eth.estimateGas({
            to: contractAddress,
            from: account.address,
            value: web3.utils.toHex(web3.utils.toWei(bnbAmount, 'ether'))
        }).then(
            (gas) => {
                console.log(`✅ GAS ESTIMATED: ${gas}`);
                console.log(`💸 Buying for ${bnbAmount} BNB...`);
                const txParams = {
                    gas: web3.utils.toHex(gas),
                    from: account.address,
                    chainId: chainId,
                    value: web3.utils.toHex(web3.utils.toWei(bnbAmount, 'ether')),
                    to: contractAddress
                };
                web3.eth.sendTransaction(txParams, (err, txHash) => {
                    if (err) {
                        console.error(`❌❌ Error: ${err.message} ❌❌`);
                        return;
                    }
                    console.log(`✅✅ Transaction sent: ${txHash} ✅✅`);
                })
            }
        ).catch(
            (err) => {
                if (err.message) {
                    if (err.message.indexOf("insufficient funds for gas") > 0) {
                        console.log(`💥💥 Account have no funds:  ${err.message} 💥💥`);
                    } else if (err.message.indexOf('It is not time to buy') > 0) {
                        console.log('⏰⏰ Presale contract is not active yet : ' + err.message);
                    } else {
                        console.log('💁‍♂️💁‍♂️ Presale contract might not be active yet : ' + err.message);
                    }
                } else {
                    console.log('Presale contract is not active yet : ' + err.toString());
                }
                setTimeout(sniperWorker, parseInt(pollTime));
            }
        );
    }
    setTimeout(sniperWorker, parseInt(pollTime));
}

start();