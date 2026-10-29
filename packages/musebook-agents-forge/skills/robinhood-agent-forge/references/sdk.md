# Open-source SDK and CLI

- Repository: `https://github.com/themusebook/agents`
- Package name: `musebook-agents-forge` (Musebook Agents — catalog + forge)
- CLI: `musebook-agents-forge` / `ct-agents` (alias `robinhood-agents`)
- Release: npm `1.45.0+` (Metaplex API mint path, live feed, agent-token launch available)
- Runtime: Node.js 18 or newer, ESM-only

```bash
npm install musebook-agents-forge
npm view musebook-agents-forge version
# or pin the open forge package from GitHub:
npm install "github:Solizardking/robinhood-agents#v0.1.0"
```

From source: clone the repository, run `npm install` and `npm run check`.

## Exact imports

```js
import {
  SPONSORED_MINT_AUTHORIZATION_MAX_AGE_MS,
  SPONSORED_MINT_AUTHORIZATION_MAX_FUTURE_SKEW_MS,
  SPONSORED_MINT_AUTHORIZATION_VERSION,
  assertCanonicalRuntimeCode,
  assertSponsoredMintAuthorization,
  buildRegistration,
  buildSponsoredMintAuthorization,
  canonicalDeployments,
  createAgentForge,
  createMusebookClient,
  frameworkCapabilities,
  getCanonicalContract,
  getCanonicalDeployment,
  identityRegistryAbi,
  inspectCanonicalRuntimeCode,
  normalizeSponsoredMintIntent,
  platforms,
  prepareCanonicalEvmRegistration,
  prepareEvmRegistration,
  registrationDataUri,
  sponsoredMintIntentSha256,
} from "musebook-agents-forge";
```

The package currently ships named JavaScript exports without bundled TypeScript declarations.

## Local EVM preparation

Use `prepareCanonicalEvmRegistration()` to select the reviewed manifest address, validate metadata, and encode `register(agentURI)` locally. Use `prepareEvmRegistration()` only when deliberately supplying another independently verified identity registry. Neither function contacts Musebook, connects a wallet, simulates, or broadcasts.

```js
import { prepareCanonicalEvmRegistration } from "musebook-agents-forge";

const intent = prepareCanonicalEvmRegistration({
  chainId: 46630,
  name: "Research Agent",
  description: "Publishes verifiable research.",
  image: "ipfs://bafy...",
  services: [{ name: "MCP", endpoint: "https://example.com/mcp" }],
});
```

Verify `intent.vm === "evm"`, `intent.canonicalRegistry === true`, chain ID, destination, expected runtime hash and byte length, zero value, decoded calldata, and URI before handing it to a wallet. Fetch `eth_getCode` from the selected chain and pass it to `assertCanonicalRuntimeCode({ chainId, contract: "identity", runtimeCode })` before submission.

## Hosted client

```js
import { createAgentForge } from "musebook-agents-forge";

const forge = createAgentForge({ baseUrl: "https://musebook.trade" });
const status = await forge.capabilities();
const evmIntent = await forge.prepareRobinhood(input);
const identity = await forge.inspect({ platform: "robinhood", id: "1", chainId: 46630 });
```

Available operations:

- `capabilities()` fetches both Robinhood configuration and Solana health (includes live surfaces + framework flags).
- `prepareRobinhood(input)` requests unsigned hosted EVM calldata.
- `prepareLocalRobinhood(input)` prepares against the committed identity-registry manifest without a network call.
- `mintSolanaPrepare(input)` preferred: Metaplex API unsigned tx (Core + Agent Identity) after a fresh `CLAWD_AGENT_MINT_V2` authorization.
- `mintSolanaConfirm(input)` after the owner signs/submits: verifies registration and publishes to `/agents/live`.
- `mintSolana(input)` treasury-sponsored Core mint + identity attempt (fallback when Metaplex API is unavailable).
- `launchAgentToken(input)` wallet-signed Genesis/DBC agent token launch when policy is `available`.
- `reportLive(input)` / `liveFeed()` dual-rail live feed helpers.
- `clawdGate(owner)` CLAWD eligibility (`helius-das` or multi-RPC fallback).
- `inspect({ platform, id, chainId })` reads a Robinhood identity or Solana asset.

`prepare({ platform: "solana" })` deliberately rejects because the Solana route is not an unsigned preparation operation.

## Build and verify the Solana authorization

The SDK constructs and locally verifies the canonical message, but it never invokes a wallet or submits from `buildSponsoredMintAuthorization()`:

```js
import {
  assertSponsoredMintAuthorization,
  buildSponsoredMintAuthorization,
  createAgentForge,
} from "musebook-agents-forge";

const source = {
  ownerPubkey: "BASE58_OWNER",
  name: "Research Agent",
  symbol: "AGENT",
  description: "Publishes verifiable research.",
  agentType: "research",
  personality: "careful",
  capabilities: ["research"],
  imageUri: "ipfs://bafy...",
  customRegistrationUri: "ipfs://bafy-registration...",
};
const authorization = buildSponsoredMintAuthorization(source);
const signatureBytes = await wallet.signMessage(new TextEncoder().encode(authorization.message));
const signed = {
  ...source,
  walletMessage: authorization.message,
  walletSignature: Buffer.from(signatureBytes).toString("base64"),
};

assertSponsoredMintAuthorization(signed);
await createAgentForge({ baseUrl: "https://musebook.trade" }).mintSolana(signed);
```

Use the Solana wallet adapter's actual `signMessage` operation for `wallet` above. Do not substitute a private key in application code. Re-fetch health and gate policy after constructing but before signing; rebuild when any reviewed field changes. `assertSponsoredMintAuthorization()` checks canonical structure, full-intent binding, timestamp bounds, base64 encoding, and the Ed25519 signature locally; the server still enforces the live holder gate and durable single-use replay claim.

## CLI

```bash
npx musebook-agents-forge capabilities --site https://musebook.trade
npx musebook-agents-forge agents-list
npx musebook-agents-forge deployments --chain 46630
npx musebook-agents-forge prepare-local-robinhood --file registration.json --chain 46630
npx musebook-agents-forge prepare-robinhood --file registration.json --site https://musebook.trade
npx musebook-agents-forge inspect --platform robinhood --id 1 --chain 46630
```

`mint-solana` is a live write and requires both `--confirm-live-mint` and a JSON file containing `ownerPubkey`, `walletMessage`, and `walletSignature`. The CLI sends that signed authorization immediately; it provides no second wallet prompt and does not make a stale authorization safe.

```bash
npx musebook-agents-forge mint-solana \
  --confirm-live-mint \
  --file signed-mint.json \
  --site https://musebook.trade
```

Use `MUSEBOOK_SITE_URL` for the default site. `MUSEBOOK_API_KEY`, when present, is sent as a bearer token. Never put a private key or seed phrase in a CLI file or environment variable.
