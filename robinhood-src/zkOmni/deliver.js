/**
 * Production delivery paths for ZkOmni relayer.
 *
 * - deliverToRobinhood: encode + call CheshireZkOmniMessenger.sendZkOmni via viem
 * - deliverToSolana: build receive_zk_omni ix and send via @solana/web3.js when available
 *
 * Both paths FAIL CLOSED when credentials/RPC are missing unless simulate:true is explicit.
 */
import { createHash } from "node:crypto";
import { decodeZkOmniMessage, EID_ROBINHOOD_MAINNET, EID_SOLANA_MAINNET } from "./codec.js";
import { verifyZkProof } from "./proof.js";
import { planSolanaReceive, ZK_OMNI_PROGRAM_ID_DEFAULT } from "./solana.js";

const SEND_PARAMS_COMPONENTS = [
  { name: "dstEid", type: "uint32" },
  { name: "agentId", type: "bytes32" },
  { name: "nullifier", type: "bytes32" },
  { name: "payloadCommitment", type: "bytes32" },
  { name: "modelHash", type: "bytes32" },
  { name: "proofPubkey", type: "bytes32" },
  { name: "expiresAt", type: "uint64" },
  { name: "action", type: "string" },
  { name: "memo", type: "string" },
  { name: "proof", type: "bytes" },
  { name: "options", type: "bytes" },
];

export const MESSENGER_ABI = [
  {
    type: "function",
    name: "sendZkOmni",
    stateMutability: "payable",
    inputs: [
      { name: "p", type: "tuple", components: SEND_PARAMS_COMPONENTS },
      {
        name: "fee",
        type: "tuple",
        components: [
          { name: "nativeFee", type: "uint256" },
          { name: "lzTokenFee", type: "uint256" },
        ],
      },
    ],
    outputs: [
      {
        name: "receipt",
        type: "tuple",
        components: [
          { name: "guid", type: "bytes32" },
          { name: "nonce", type: "uint64" },
          {
            name: "fee",
            type: "tuple",
            components: [
              { name: "nativeFee", type: "uint256" },
              { name: "lzTokenFee", type: "uint256" },
            ],
          },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "quoteSend",
    stateMutability: "view",
    inputs: [
      { name: "p", type: "tuple", components: SEND_PARAMS_COMPONENTS },
      { name: "payInLzToken", type: "bool" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "nativeFee", type: "uint256" },
          { name: "lzTokenFee", type: "uint256" },
        ],
      },
    ],
  },
];

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

/**
 * Resolve deliver config from env + job.
 */
export function resolveDeliverConfig(job, overrides = {}) {
  const direction = job.direction || overrides.direction || "robinhood-to-solana";
  return {
    direction,
    simulate: overrides.simulate === true || env("ZK_OMNI_SIMULATE") === "1",
    rhRpc: overrides.rhRpc || env("RH_RPC_URL") || env("RPC_URL_ROBINHOOD"),
    rhPrivateKey: overrides.rhPrivateKey || env("ZK_OMNI_RH_PRIVATE_KEY") || env("PRIVATE_KEY"),
    messenger: overrides.messenger || env("ZK_OMNI_MESSENGER_ROBINHOOD"),
    solanaRpc: overrides.solanaRpc || env("SOLANA_RPC_URL") || env("ZK_OMNI_SOLANA_RPC"),
    solanaKeypairPath: overrides.solanaKeypairPath || env("ZK_OMNI_SOLANA_KEYPAIR") || env("SOLANA_KEYPAIR_PATH"),
    solanaProgramId: overrides.solanaProgramId || env("ZK_OMNI_SOLANA_PROGRAM") || ZK_OMNI_PROGRAM_ID_DEFAULT,
    robinhoodPeerBytes32:
      overrides.robinhoodPeerBytes32 || env("ZK_OMNI_MESSENGER_ROBINHOOD_BYTES32") || env("ZK_OMNI_PEER_ROBINHOOD"),
    nativeFee: overrides.nativeFee ?? env("ZK_OMNI_NATIVE_FEE") ?? "0",
  };
}

/**
 * Always run ZK verification before any network send.
 */
export function assertJobZkValid(job) {
  const message = job.message || decodeZkOmniMessage(job.payloadHex);
  const result = verifyZkProof(message);
  if (!result.ok) {
    const err = new Error(`ZK proof verification failed: ${result.reason}`);
    err.code = "ZK_VERIFY_FAILED";
    throw err;
  }
  return { message, ...result };
}

/**
 * Build the exact call object for sendZkOmni (testable without network).
 */
export function buildRobinhoodSendParams(message, opts = {}) {
  return {
    dstEid: opts.dstEid ?? EID_SOLANA_MAINNET,
    agentId: message.agentId,
    nullifier: message.nullifier,
    payloadCommitment: message.payloadCommitment,
    modelHash: message.modelHash,
    proofPubkey: message.proofPubkey,
    expiresAt: BigInt(message.expiresAt),
    action: message.action,
    memo: message.memo,
    proof: message.proof,
    options: opts.options ?? "0x",
  };
}

export function buildRobinhoodSendCall(message, opts = {}) {
  const p = buildRobinhoodSendParams(message, opts);
  return {
    address: opts.messenger,
    abi: MESSENGER_ABI,
    functionName: "sendZkOmni",
    args: [
      p,
      {
        nativeFee: BigInt(opts.nativeFee ?? 0),
        lzTokenFee: 0n,
      },
    ],
    value: BigInt(opts.nativeFee ?? 0),
  };
}

/**
 * Deliver toward Solana: either via RH messenger.sendZkOmni (LZ path) or
 * direct Solana receive_zk_omni when direction is already on Solana side.
 */
export async function deliverJob(job, overrides = {}) {
  const cfg = resolveDeliverConfig(job, overrides);
  const { message } = assertJobZkValid(job);

  if (cfg.simulate) {
    // Explicit simulation only — never the silent default in production configs.
    const plan =
      cfg.direction === "robinhood-to-solana"
        ? {
            path: "robinhood-sendZkOmni",
            call: buildRobinhoodSendCall(message, {
              messenger: cfg.messenger || "0x0000000000000000000000000000000000000001",
              nativeFee: cfg.nativeFee,
            }),
          }
        : {
            path: "solana-receive_zk_omni",
            plan: planSolanaReceive(message, {
              programId: cfg.solanaProgramId || "Hfbc3tAGYE5nBUa5UncjSV6hoWd3JoVKdA49jPcreXFJ",
              srcSender: cfg.robinhoodPeerBytes32 || `0x${"aa".repeat(32)}`,
            }),
          };
    return {
      ok: true,
      simulated: true,
      txHash: `sim-${createHash("sha256").update(job.payloadHex).digest("hex").slice(0, 16)}`,
      plan,
    };
  }

  if (cfg.direction === "robinhood-to-solana") {
    return deliverRobinhoodToSolana(message, cfg);
  }
  if (cfg.direction === "solana-to-robinhood") {
    // Destination is Robinhood: still send from Solana via peer program (not yet wired)
    // or receive on RH via endpoint — for inbound to Solana peer of RH messages we use receive.
    return deliverSolanaReceive(message, cfg);
  }
  return deliverRobinhoodToSolana(message, cfg);
}

async function deliverRobinhoodToSolana(message, cfg) {
  if (!cfg.rhRpc) {
    const err = new Error("RH_RPC_URL required for live Robinhood delivery (or set ZK_OMNI_SIMULATE=1)");
    err.code = "MISSING_RH_RPC";
    throw err;
  }
  if (!cfg.messenger) {
    const err = new Error("ZK_OMNI_MESSENGER_ROBINHOOD required for live delivery");
    err.code = "MISSING_MESSENGER";
    throw err;
  }
  if (!cfg.rhPrivateKey) {
    const err = new Error("ZK_OMNI_RH_PRIVATE_KEY or PRIVATE_KEY required for live delivery");
    err.code = "MISSING_KEY";
    throw err;
  }

  const viem = await import("viem");
  const accounts = await import("viem/accounts");
  const chains = await import("viem/chains");

  // Robinhood is not always in viem chains — define minimal chain
  const robinhood = {
    id: Number(process.env.EXPECTED_CHAIN_ID || 4663),
    name: "Robinhood Chain",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rhRpc] } },
  };

  const account = accounts.privateKeyToAccount(
    cfg.rhPrivateKey.startsWith("0x") ? cfg.rhPrivateKey : `0x${cfg.rhPrivateKey}`,
  );
  const walletClient = viem.createWalletClient({
    account,
    chain: robinhood,
    transport: viem.http(cfg.rhRpc),
  });
  const publicClient = viem.createPublicClient({
    chain: robinhood,
    transport: viem.http(cfg.rhRpc),
  });

  let nativeFee = BigInt(cfg.nativeFee || 0);
  if (nativeFee === 0n) {
    try {
      const quoted = await publicClient.readContract({
        address: cfg.messenger,
        abi: MESSENGER_ABI,
        functionName: "quoteSend",
        args: [buildRobinhoodSendParams(message, { options: "0x" }), false],
        account: account.address,
      });
      nativeFee = quoted.nativeFee;
    } catch {
      // quote may fail if peer not set; require explicit fee
      const err = new Error("quoteSend failed; set ZK_OMNI_NATIVE_FEE for live send");
      err.code = "QUOTE_FAILED";
      throw err;
    }
  }

  const call = buildRobinhoodSendCall(message, {
    messenger: cfg.messenger,
    nativeFee: nativeFee.toString(),
  });

  const hash = await walletClient.writeContract({
    address: call.address,
    abi: call.abi,
    functionName: call.functionName,
    args: call.args,
    value: call.value,
    chain: robinhood,
    account,
  });

  return {
    ok: true,
    simulated: false,
    path: "robinhood-sendZkOmni",
    txHash: hash,
    dstEid: EID_SOLANA_MAINNET,
    nativeFee: nativeFee.toString(),
  };
}

async function deliverSolanaReceive(message, cfg) {
  if (!cfg.solanaRpc) {
    const err = new Error("SOLANA_RPC_URL required for live Solana receive (or set ZK_OMNI_SIMULATE=1)");
    err.code = "MISSING_SOLANA_RPC";
    throw err;
  }
  if (!cfg.robinhoodPeerBytes32) {
    const err = new Error("ZK_OMNI_MESSENGER_ROBINHOOD_BYTES32 required (bytes32 peer)");
    err.code = "MISSING_PEER";
    throw err;
  }

  const plan = planSolanaReceive(message, {
    programId: cfg.solanaProgramId,
    srcSender: cfg.robinhoodPeerBytes32,
  });

  let web3;
  try {
    web3 = await import("@solana/web3.js");
  } catch {
    const err = new Error("@solana/web3.js is required for live Solana delivery");
    err.code = "MISSING_SOLANA_WEB3";
    throw err;
  }

  const connection = new web3.Connection(cfg.solanaRpc, "confirmed");
  const programId = new web3.PublicKey(cfg.solanaProgramId);

  let payer;
  if (cfg.solanaKeypairPath) {
    const { readFile } = await import("node:fs/promises");
    const raw = JSON.parse(await readFile(cfg.solanaKeypairPath, "utf8"));
    payer = web3.Keypair.fromSecretKey(Uint8Array.from(raw));
  } else if (process.env.SOLANA_PRIVATE_KEY) {
    try {
      const arr = JSON.parse(process.env.SOLANA_PRIVATE_KEY);
      payer = web3.Keypair.fromSecretKey(Uint8Array.from(arr));
    } catch {
      const err = new Error("Provide ZK_OMNI_SOLANA_KEYPAIR as JSON keypair path");
      err.code = "MISSING_SOLANA_KEY";
      throw err;
    }
  } else {
    const err = new Error("ZK_OMNI_SOLANA_KEYPAIR required for live Solana delivery");
    err.code = "MISSING_SOLANA_KEY";
    throw err;
  }

  const [store] = web3.PublicKey.findProgramAddressSync([Buffer.from("zk_omni_store")], programId);
  const nfBuf = Buffer.from(message.nullifier.replace(/^0x/i, ""), "hex");
  const [nullifierAccount] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("zk_omni_nullifier"), nfBuf],
    programId,
  );

  // 1) Ed25519Program precompile — verifies proof over publicInputsHash
  const ed25519Data = Buffer.from(plan.ed25519Ix.dataHex.slice(2), "hex");
  const ed25519Ix = new web3.TransactionInstruction({
    programId: new web3.PublicKey(plan.ed25519ProgramId),
    keys: [],
    data: ed25519Data,
  });

  // 2) receive_zk_omni — checks sysvar for ed25519 ix + nullifier PDA
  const receiveData = Buffer.from(plan.receiveIx.dataHex.slice(2), "hex");
  const receiveIx = new web3.TransactionInstruction({
    programId,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: store, isSigner: false, isWritable: true },
      { pubkey: nullifierAccount, isSigner: false, isWritable: true },
      {
        pubkey: new web3.PublicKey(plan.instructionsSysvar),
        isSigner: false,
        isWritable: false,
      },
      { pubkey: web3.SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: receiveData,
  });

  const tx = new web3.Transaction().add(ed25519Ix).add(receiveIx);
  const sig = await web3.sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: "confirmed",
  });

  return {
    ok: true,
    simulated: false,
    path: "solana-receive_zk_omni",
    txHash: sig,
    programId: cfg.solanaProgramId,
    nullifierAccount: nullifierAccount.toBase58(),
    store: store.toBase58(),
    ed25519Verified: true,
    publicInputsHash: plan.publicInputsHash,
  };
}

/**
 * Create a deliver function for the relayer.
 * Default: LIVE when env configured, otherwise throws (no silent sim).
 * Pass { allowSimulateFallback: true } for CLI oneshot without keys.
 */
export function createDeliverFn(opts = {}) {
  return async (job) => {
    const simulate =
      opts.simulate === true ||
      process.env.ZK_OMNI_SIMULATE === "1" ||
      (opts.allowSimulateFallback &&
        !process.env.ZK_OMNI_MESSENGER_ROBINHOOD &&
        !process.env.RH_RPC_URL);

    try {
      return await deliverJob(job, { ...opts, simulate });
    } catch (err) {
      if (opts.allowSimulateFallback && err && err.code && String(err.code).startsWith("MISSING_")) {
        return deliverJob(job, { ...opts, simulate: true });
      }
      throw err;
    }
  };
}
