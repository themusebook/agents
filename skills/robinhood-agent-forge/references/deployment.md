# Deployment pins and network safety

Use the committed manifests as the machine-readable source of deployment truth:

- `deployments/agent-registries-mainnet-4663.json`
- `deployments/agent-registries-testnet-46630.json`

The same manifests live in the guarded monorepo deploy package. Do not derive a contract transaction from Foundry's top-level `transactions[].hash`; those labels can be cross-associated. Match `receipts[].contractAddress` to `receipts[].transactionHash`, then verify the receipt and runtime code.

## Robinhood Chain mainnet

- Chain ID: `4663`
- RPC: `https://rpc.mainnet.chain.robinhood.com`
- Explorer: `https://robinhoodchain.blockscout.com`
- Deployment block: `14150372`
- Block hash: `0x25f924abc0db569131557e7ad7f8bd10b5ca52e8a94372bd0d8fcd6649984b10`
- Deployed at: `2026-07-19T21:06:37Z`
- Deployer: `0x0d7b25825bf8b932a7475c9a53ed1c7018e813c1`

| Contract | Address | Creation transaction | `keccak256(runtime bytecode)` | Bytes |
|---|---|---|---|---:|
| Identity | `0x70361a37951d66f8c44cfb45873df2ba8b9fc950` | `0xfbd83784276d5463bb0a1cd419dc7634b3aff85a5b66456b1dbb6a3951aa6db0` | `0x1c3c472c561bd5f45b9056fe4716aa57d60fd4d06eef9e8616c926ed744d2aa3` | 7667 |
| Reputation | `0x8a4154a6c1ee44b4b790948f9613e3fb934628ff` | `0x7ac254c70427a5f744ddecec5fe90b265ba3d71d018ca227a36ba3a6aa813fa6` | `0xb145a0e76b834446b001d83fb4657c22d53c150983c8076eae8845d484e28a63` | 7882 |
| Validation | `0x020d053040da31195e5f9a992b8eda663dbb073b` | `0x04c7048be36330c91022161375729ce4488abf0815f558376b1ad5fcee1ca179` | `0x9193febb5cb157a71f4043e9cdd3e21bfcb982229ba04669be6a696621a11c89` | 4186 |

## Robinhood Chain testnet

- Chain ID: `46630`
- RPC: `https://rpc.testnet.chain.robinhood.com`
- Explorer: `https://explorer.testnet.chain.robinhood.com`
- Deployed at: `2026-07-19T20:55:41Z`
- Deployer: `0x0d7b25825bf8b932a7475c9a53ed1c7018e813c1`

| Contract | Address | Creation transaction | Block | `keccak256(runtime bytecode)` | Bytes |
|---|---|---|---:|---|---:|
| Identity | `0xf1a30080f5da64ab0456f3adc06dfd8fc9d2fdb3` | `0xffeaef9464b599e67c7ab21498fdfcc7d7500f3697781e7d54ff2d3ce1e4cd4d` | 91559343 | `0x1c3c472c561bd5f45b9056fe4716aa57d60fd4d06eef9e8616c926ed744d2aa3` | 7667 |
| Reputation | `0x2137528bf45480693fd22704a978f564a3bb1570` | `0xe21f750118bea24f8da1e5475e41bf588dba55b94c721ced219592ec26f7bab6` | 91559344 | `0xeaee2403701ef26109c97468855ddf7580b459bf0fa5089e3d383b637ba90547` | 7882 |
| Validation | `0x4126217abb0d12d8515698e819c543466f42eefd` | `0xfd92b02953b638f36d4b5580b21786b69e7935b208f8cd656bb5104485d03a7e` | 91559344 | `0x1383bce31f8d3adde3049587f63075fccfc76ea4a6b646020294df9aec515d31` | 4186 |

The reputation and validation deployments each have an immutable `identityRegistry` constructor link to the identity address in the same row's network. Verify `getIdentityRegistry()` before trusting either registry. The different reputation and validation runtime hashes between networks are expected because that immutable address is embedded in bytecode.

## Verification state

The manifests record runtime checks performed on `2026-07-19` with `eth_getCode` plus Keccak-256. Identity and validation source were explorer-verified on both networks at that snapshot. Reputation runtime code matched both manifests, but Blockscout source-verification submissions returned `Fail - Unable to verify`, so reputation source verification remains pending on both networks. That verifier failure does not mean the deployments or runtime-hash checks failed. Recheck the explorer before reporting a newer verification state.

## Ownership and administration

The three contracts do not expose an upgrade proxy or registry-owner administration path. The identity contract mints a transferable ERC-721 to the registering caller. Reputation and validation are permanently linked to the identity registry supplied at construction. This does not remove user-level authority: ERC-721 owners and approved operators can transfer or mutate identity metadata, and a transfer clears the stored nonzero `agentWallet`.

## New-environment deployment checklist

Use the standalone guarded Foundry tooling only for a genuinely new chain or namespace. Keep the existing `cheshire-agent-registries` targets blocked by the production manifests.

1. Review the exact source and compiler settings: Solidity `0.8.13`, optimizer enabled with 200 runs, `viaIR = true`.
2. Run tests and a simulation without `--broadcast`.
3. Confirm the chain ID, RPC, deployer, constructor links, and expected addresses.
4. Obtain an independent audit and explicit mainnet approval.
5. Broadcast once, capture receipts by contract address, and verify source.
6. Fetch deployed bytecode, compute Keccak-256, and publish a new immutable manifest.
7. Publish exact trusted addresses through `GET /api/robinhood/agents/config` only after every check passes.

Never infer an address from another network, a nonce prediction, or a stale `run-latest.json`.

## Solana programs

Treat devnet and mainnet-beta as separate clusters. Resolve Metaplex Core and Agent Registry program IDs from the installed official SDK and current runtime. Do not deploy replacement programs merely to mint a Core identity. Confirm the health-reported cluster, Core owner, treasury payer/update authority, permanent-freeze policy, registration PDA, metadata URI, and both signatures after creation.

Cross-chain links are metadata-level composition only. Never call identities bridged, canonical, or interchangeable without a separately audited protocol.
