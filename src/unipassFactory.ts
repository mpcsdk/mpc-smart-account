export const UNIPASS_FACTORY_ABI = `[
    {
      "inputs": [],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "string",
          "name": "appId",
          "type": "string"
        },
        {
          "indexed": false,
          "internalType": "address",
          "name": "createdContract",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "bytes32",
          "name": "keysetHash",
          "type": "bytes32"
        }
      ],
      "name": "UniPassAccountDeployed",
      "type": "event"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "_keysetHash",
          "type": "bytes32"
        },
        {
          "internalType": "bytes",
          "name": "_initCode",
          "type": "bytes"
        },
        {
          "internalType": "string",
          "name": "_appId",
          "type": "string"
        }
      ],
      "name": "deploy",
      "outputs": [
        {
          "internalType": "address",
          "name": "createdContract",
          "type": "address"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    }
]`;

export const UNIPASS_FACTORY_ADDRESS =
  '0x9dECf65345384893c743De463190B0AA83f54dE8';
