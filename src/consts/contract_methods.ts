import Web3 from "web3";

export const CONTRACT_METHODS = {
    contribute: '0xd7bb99ba',
    claim: '0x4e71d92d',
    generate: (method: string) => Web3.utils.sha3(method)?.substring(0, 10)
} 