//! Musebook ZkOmni Solana receiver.
//!
//! Receives msgType-4 payloads, enforces the ZK nullifier relation, and
//! **verifies the Ed25519 proof** by requiring a prior Ed25519Program
//! instruction in the same transaction (instructions sysvar check).
//!
//! Program id: Hfbc3tAGYE5nBUa5UncjSV6hoWd3JoVKdA49jPcreXFJ

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    ed25519_program,
    hash::hashv,
    sysvar::instructions::{load_instruction_at_checked, ID as IX_SYSVAR_ID},
};

declare_id!("Hfbc3tAGYE5nBUa5UncjSV6hoWd3JoVKdA49jPcreXFJ");

pub const STORE_SEED: &[u8] = b"zk_omni_store";
pub const NULLIFIER_SEED: &[u8] = b"zk_omni_nullifier";
pub const MSG_ZK_OMNI: u16 = 4;
pub const PROOF_LEN: usize = 64;
pub const PUBKEY_LEN: usize = 32;
pub const MAX_ACTION: usize = 64;
pub const MAX_MEMO: usize = 200;
pub const EID_ROBINHOOD: u32 = 30416;
pub const PUB_DOMAIN: &[u8] = b"clawd-zk-omni-public:v1";
pub const NF_DOMAIN: &[u8] = b"clawd-zk-omni-nullifier:v1";

/// Ed25519Program single-sig header size (num_signatures + padding + 1× offsets).
const ED25519_IX_HEADER_LEN: usize = 2 + 14; // 16

#[program]
pub mod zk_omni {
    use super::*;

    pub fn init_store(ctx: Context<InitStore>, robinhood_peer: [u8; 32]) -> Result<()> {
        let store = &mut ctx.accounts.store;
        store.admin = ctx.accounts.admin.key();
        store.robinhood_peer = robinhood_peer;
        store.delivered_count = 0;
        store.bump = ctx.bumps.store;
        store.last_nullifier = [0u8; 32];
        store.last_src_eid = 0;
        Ok(())
    }

    pub fn set_peer(ctx: Context<SetPeer>, robinhood_peer: [u8; 32]) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.admin.key(),
            ctx.accounts.store.admin,
            ZkOmniError::Unauthorized
        );
        require!(robinhood_peer != [0u8; 32], ZkOmniError::InvalidPeer);
        ctx.accounts.store.robinhood_peer = robinhood_peer;
        Ok(())
    }

    /// Receive a ZkOmni message. Must be preceded in the same transaction by an
    /// Ed25519Program instruction that verifies `proof` over `public_inputs_hash`
    /// under `proof_pubkey`.
    pub fn receive_zk_omni(
        ctx: Context<ReceiveZkOmni>,
        src_eid: u32,
        src_sender: [u8; 32],
        guid: [u8; 32],
        agent_id: [u8; 32],
        controller: [u8; 32],
        nullifier: [u8; 32],
        payload_commitment: [u8; 32],
        model_hash: [u8; 32],
        proof_pubkey: [u8; 32],
        expires_at: u64,
        action: String,
        memo: String,
        proof: Vec<u8>,
    ) -> Result<()> {
        require!(src_eid == EID_ROBINHOOD, ZkOmniError::InvalidSrcEid);
        require!(
            src_sender == ctx.accounts.store.robinhood_peer,
            ZkOmniError::UnauthorizedPeer
        );
        require!(agent_id != [0u8; 32], ZkOmniError::InvalidAgentId);
        require!(controller != [0u8; 32], ZkOmniError::InvalidController);
        require!(nullifier != [0u8; 32], ZkOmniError::InvalidNullifier);
        require!(proof_pubkey != [0u8; 32], ZkOmniError::InvalidProof);
        require!(proof.len() == PROOF_LEN, ZkOmniError::InvalidProof);
        require!(action.len() <= MAX_ACTION, ZkOmniError::TextTooLong);
        require!(memo.len() <= MAX_MEMO, ZkOmniError::TextTooLong);

        let now = Clock::get()?.unix_timestamp as u64;
        require!(expires_at > now, ZkOmniError::Expired);

        // ZK relation: nullifier == SHA256(NF_DOMAIN || 0x00 || pk || 0x00 || binding)
        let binding = hashv(&[&agent_id, &payload_commitment, &model_hash]).to_bytes();
        let expected_nf = hashv(&[NF_DOMAIN, &[0u8], &proof_pubkey, &[0u8], &binding]).to_bytes();
        require!(expected_nf == nullifier, ZkOmniError::InvalidProofRelation);

        // Public inputs hash — must match src/zkOmni/proof.js computePublicInputsHash
        let public_hash = compute_public_inputs_hash(
            &agent_id,
            &controller,
            &nullifier,
            &payload_commitment,
            &model_hash,
            &proof_pubkey,
            expires_at,
            action.as_bytes(),
            memo.as_bytes(),
        );

        // Verify Ed25519 via prior instruction in this transaction
        verify_ed25519_ix(
            &ctx.accounts.instructions_sysvar,
            &proof_pubkey,
            &public_hash,
            &proof,
        )?;

        let nf = &mut ctx.accounts.nullifier_account;
        nf.nullifier = nullifier;
        nf.guid = guid;
        nf.src_eid = src_eid;
        nf.agent_id = agent_id;
        nf.controller = controller;
        nf.payload_commitment = payload_commitment;
        nf.model_hash = model_hash;
        nf.proof_pubkey = proof_pubkey;
        nf.proof_hash = hashv(&[&proof]).to_bytes();
        nf.public_inputs_hash = public_hash;
        nf.expires_at = expires_at;
        nf.bump = ctx.bumps.nullifier_account;

        let store = &mut ctx.accounts.store;
        store.delivered_count = store
            .delivered_count
            .checked_add(1)
            .ok_or(ZkOmniError::Overflow)?;
        store.last_nullifier = nullifier;
        store.last_src_eid = src_eid;

        emit!(ZkOmniReceived {
            src_eid,
            guid,
            nullifier,
            agent_id,
            controller,
            payload_commitment,
            proof_pubkey,
            public_inputs_hash: public_hash,
            action,
        });
        Ok(())
    }
}

/// Mirrors JS computePublicInputsHash (SHA-256 over fixed field layout).
pub fn compute_public_inputs_hash(
    agent_id: &[u8; 32],
    controller: &[u8; 32],
    nullifier: &[u8; 32],
    payload_commitment: &[u8; 32],
    model_hash: &[u8; 32],
    proof_pubkey: &[u8; 32],
    expires_at: u64,
    action: &[u8],
    memo: &[u8],
) -> [u8; 32] {
    let expires_be = expires_at.to_be_bytes();
    let action_len = [action.len() as u8];
    let memo_len = [memo.len() as u8];
    hashv(&[
        PUB_DOMAIN,
        agent_id,
        controller,
        nullifier,
        payload_commitment,
        model_hash,
        proof_pubkey,
        &expires_be,
        &action_len,
        action,
        &memo_len,
        memo,
    ])
    .to_bytes()
}

/// Require that some instruction in this tx is Ed25519Program verifying
/// (proof_pubkey, public_hash, proof). Runtime rejects the tx if the
/// Ed25519Program ix itself fails; we additionally bind pk/msg/sig to the
/// ZkOmni fields so a stray verify cannot authorize a different message.
fn verify_ed25519_ix(
    ix_sysvar: &AccountInfo,
    proof_pubkey: &[u8; 32],
    public_hash: &[u8; 32],
    proof: &[u8],
) -> Result<()> {
    require_keys_eq!(*ix_sysvar.key, IX_SYSVAR_ID, ZkOmniError::InvalidInstructionsSysvar);
    let found = scan_ed25519(ix_sysvar, proof_pubkey, public_hash, proof)?;
    require!(found, ZkOmniError::MissingEd25519Ix);
    Ok(())
}

fn scan_ed25519(
    ix_sysvar: &AccountInfo,
    proof_pubkey: &[u8; 32],
    public_hash: &[u8; 32],
    proof: &[u8],
) -> Result<bool> {
    let data = ix_sysvar.try_borrow_data()?;
    require!(data.len() >= 2, ZkOmniError::MissingEd25519Ix);
    let num_ix = u16::from_le_bytes([data[0], data[1]]) as usize;
    drop(data);

    for i in 0..num_ix {
        let ix = load_instruction_at_checked(i, ix_sysvar)
            .map_err(|_| error!(ZkOmniError::MissingEd25519Ix))?;
        if ix.program_id != ed25519_program::id() {
            continue;
        }
        let d = &ix.data;
        if d.len() < ED25519_IX_HEADER_LEN || d[0] < 1 {
            continue;
        }
        // Offsets for first signature (solana_sdk::ed25519_instruction layout)
        let sig_offset = u16::from_le_bytes([d[2], d[3]]) as usize;
        let pk_offset = u16::from_le_bytes([d[6], d[7]]) as usize;
        let msg_offset = u16::from_le_bytes([d[10], d[11]]) as usize;
        let msg_size = u16::from_le_bytes([d[12], d[13]]) as usize;
        if pk_offset + PUBKEY_LEN > d.len()
            || sig_offset + PROOF_LEN > d.len()
            || msg_offset + msg_size > d.len()
            || msg_size != 32
        {
            continue;
        }
        if &d[pk_offset..pk_offset + PUBKEY_LEN] != proof_pubkey {
            return err!(ZkOmniError::Ed25519PubkeyMismatch);
        }
        if &d[sig_offset..sig_offset + PROOF_LEN] != proof {
            return err!(ZkOmniError::Ed25519SigMismatch);
        }
        if &d[msg_offset..msg_offset + 32] != public_hash {
            return err!(ZkOmniError::Ed25519MsgMismatch);
        }
        return Ok(true);
    }
    Ok(false)
}

#[derive(Accounts)]
pub struct InitStore<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Store::SIZE,
        seeds = [STORE_SEED],
        bump
    )]
    pub store: Account<'info, Store>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetPeer<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [STORE_SEED], bump = store.bump)]
    pub store: Account<'info, Store>,
}

#[derive(Accounts)]
#[instruction(
    src_eid: u32,
    src_sender: [u8; 32],
    guid: [u8; 32],
    agent_id: [u8; 32],
    controller: [u8; 32],
    nullifier: [u8; 32]
)]
pub struct ReceiveZkOmni<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [STORE_SEED], bump = store.bump)]
    pub store: Account<'info, Store>,
    #[account(
        init,
        payer = payer,
        space = 8 + NullifierAccount::SIZE,
        seeds = [NULLIFIER_SEED, nullifier.as_ref()],
        bump
    )]
    pub nullifier_account: Account<'info, NullifierAccount>,
    /// CHECK: instructions sysvar — validated by key equality in verify_ed25519_ix
    #[account(address = IX_SYSVAR_ID)]
    pub instructions_sysvar: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Store {
    pub admin: Pubkey,                 // 32
    pub robinhood_peer: [u8; 32],      // 32
    pub delivered_count: u64,          // 8
    pub last_nullifier: [u8; 32],      // 32
    pub last_src_eid: u32,             // 4
    pub bump: u8,                      // 1
}

impl Store {
    // Named field sizes (must match struct order above — no magic aggregates).
    pub const SZ_ADMIN: usize = 32;
    pub const SZ_ROBINHOOD_PEER: usize = 32;
    pub const SZ_DELIVERED_COUNT: usize = 8;
    pub const SZ_LAST_NULLIFIER: usize = 32;
    pub const SZ_LAST_SRC_EID: usize = 4;
    pub const SZ_BUMP: usize = 1;

    pub const SIZE: usize = Self::SZ_ADMIN
        + Self::SZ_ROBINHOOD_PEER
        + Self::SZ_DELIVERED_COUNT
        + Self::SZ_LAST_NULLIFIER
        + Self::SZ_LAST_SRC_EID
        + Self::SZ_BUMP;
}

/// Compile-time: Store body is 109 bytes (8-byte Anchor disc added at init).
const _: () = assert!(Store::SIZE == 109);

#[account]
pub struct NullifierAccount {
    pub nullifier: [u8; 32],           // 32
    pub guid: [u8; 32],                // 32
    pub src_eid: u32,                  // 4
    pub agent_id: [u8; 32],            // 32
    pub controller: [u8; 32],          // 32
    pub payload_commitment: [u8; 32],  // 32
    pub model_hash: [u8; 32],          // 32
    pub proof_pubkey: [u8; 32],        // 32
    pub proof_hash: [u8; 32],          // 32
    pub public_inputs_hash: [u8; 32],  // 32  ← was missing from SIZE (was 8×32)
    pub expires_at: u64,               // 8
    pub bump: u8,                      // 1
}

impl NullifierAccount {
    // Named field sizes — one constant per field, same order as the struct.
    pub const SZ_NULLIFIER: usize = 32;
    pub const SZ_GUID: usize = 32;
    pub const SZ_SRC_EID: usize = 4;
    pub const SZ_AGENT_ID: usize = 32;
    pub const SZ_CONTROLLER: usize = 32;
    pub const SZ_PAYLOAD_COMMITMENT: usize = 32;
    pub const SZ_MODEL_HASH: usize = 32;
    pub const SZ_PROOF_PUBKEY: usize = 32;
    pub const SZ_PROOF_HASH: usize = 32;
    pub const SZ_PUBLIC_INPUTS_HASH: usize = 32;
    pub const SZ_EXPIRES_AT: usize = 8;
    pub const SZ_BUMP: usize = 1;

    pub const SIZE: usize = Self::SZ_NULLIFIER
        + Self::SZ_GUID
        + Self::SZ_SRC_EID
        + Self::SZ_AGENT_ID
        + Self::SZ_CONTROLLER
        + Self::SZ_PAYLOAD_COMMITMENT
        + Self::SZ_MODEL_HASH
        + Self::SZ_PROOF_PUBKEY
        + Self::SZ_PROOF_HASH
        + Self::SZ_PUBLIC_INPUTS_HASH
        + Self::SZ_EXPIRES_AT
        + Self::SZ_BUMP;
}

/// Compile-time: NullifierAccount body is 301 bytes (9×32 + 4 + 8 + 1).
/// Adding a field without updating SIZE fails `cargo check`.
const _: () = assert!(NullifierAccount::SIZE == 301);
const _: () = assert!(NullifierAccount::SIZE == 9 * 32 + 4 + 8 + 1);

#[event]
pub struct ZkOmniReceived {
    pub src_eid: u32,
    pub guid: [u8; 32],
    pub nullifier: [u8; 32],
    pub agent_id: [u8; 32],
    pub controller: [u8; 32],
    pub payload_commitment: [u8; 32],
    pub proof_pubkey: [u8; 32],
    pub public_inputs_hash: [u8; 32],
    pub action: String,
}

#[error_code]
pub enum ZkOmniError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid peer")]
    InvalidPeer,
    #[msg("Unauthorized peer / src sender")]
    UnauthorizedPeer,
    #[msg("Invalid source EID")]
    InvalidSrcEid,
    #[msg("Invalid agent id")]
    InvalidAgentId,
    #[msg("Invalid controller")]
    InvalidController,
    #[msg("Invalid nullifier")]
    InvalidNullifier,
    #[msg("Invalid proof")]
    InvalidProof,
    #[msg("Nullifier does not match proofPubkey binding")]
    InvalidProofRelation,
    #[msg("Message expired")]
    Expired,
    #[msg("Text too long")]
    TextTooLong,
    #[msg("Counter overflow")]
    Overflow,
    #[msg("Missing Ed25519 verify instruction in transaction")]
    MissingEd25519Ix,
    #[msg("Invalid Ed25519 instruction data")]
    InvalidEd25519Ix,
    #[msg("Ed25519 public key mismatch")]
    Ed25519PubkeyMismatch,
    #[msg("Ed25519 signature mismatch")]
    Ed25519SigMismatch,
    #[msg("Ed25519 message (public inputs hash) mismatch")]
    Ed25519MsgMismatch,
    #[msg("Invalid instructions sysvar")]
    InvalidInstructionsSysvar,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_inputs_hash_is_32_bytes() {
        let h = compute_public_inputs_hash(
            &[1u8; 32],
            &[2u8; 32],
            &[3u8; 32],
            &[4u8; 32],
            &[5u8; 32],
            &[6u8; 32],
            1_700_000_000,
            b"attest",
            b"memo",
        );
        assert_eq!(h.len(), 32);
        assert_ne!(h, [0u8; 32]);
    }

    #[test]
    fn program_id_decodes() {
        assert_eq!(
            ID.to_string(),
            "Hfbc3tAGYE5nBUa5UncjSV6hoWd3JoVKdA49jPcreXFJ"
        );
    }

    /// Re-sum Store field sizes independently of the SIZE expression so a
    /// hand-edit that only changes one side fails `cargo test`.
    #[test]
    fn store_size_matches_field_sum() {
        let resum: usize = 32  // admin
            + 32               // robinhood_peer
            + 8                // delivered_count
            + 32               // last_nullifier
            + 4                // last_src_eid
            + 1; // bump
        assert_eq!(Store::SIZE, 109);
        assert_eq!(Store::SIZE, resum);
        assert_eq!(
            Store::SIZE,
            Store::SZ_ADMIN
                + Store::SZ_ROBINHOOD_PEER
                + Store::SZ_DELIVERED_COUNT
                + Store::SZ_LAST_NULLIFIER
                + Store::SZ_LAST_SRC_EID
                + Store::SZ_BUMP
        );
        // Anchor discriminator is added separately at account init.
        assert_eq!(8 + Store::SIZE, 117);
    }

    #[test]
    fn nullifier_account_size_includes_public_inputs_hash() {
        // Explicit one-line-per-field sum (order matches struct).
        let resum: usize = 32  // nullifier
            + 32               // guid
            + 4                // src_eid
            + 32               // agent_id
            + 32               // controller
            + 32               // payload_commitment
            + 32               // model_hash
            + 32               // proof_pubkey
            + 32               // proof_hash
            + 32               // public_inputs_hash  (the field that was under-counted)
            + 8                // expires_at
            + 1; // bump
        assert_eq!(resum, 301);
        assert_eq!(NullifierAccount::SIZE, 301);
        assert_eq!(NullifierAccount::SIZE, resum);
        assert_eq!(
            NullifierAccount::SIZE,
            NullifierAccount::SZ_NULLIFIER
                + NullifierAccount::SZ_GUID
                + NullifierAccount::SZ_SRC_EID
                + NullifierAccount::SZ_AGENT_ID
                + NullifierAccount::SZ_CONTROLLER
                + NullifierAccount::SZ_PAYLOAD_COMMITMENT
                + NullifierAccount::SZ_MODEL_HASH
                + NullifierAccount::SZ_PROOF_PUBKEY
                + NullifierAccount::SZ_PROOF_HASH
                + NullifierAccount::SZ_PUBLIC_INPUTS_HASH
                + NullifierAccount::SZ_EXPIRES_AT
                + NullifierAccount::SZ_BUMP
        );
        // Nine 32-byte blobs + src_eid + expires_at + bump
        assert_eq!(NullifierAccount::SIZE, 9 * 32 + 4 + 8 + 1);
        assert_eq!(8 + NullifierAccount::SIZE, 309); // disc + body
    }

    #[test]
    fn nullifier_size_not_the_old_wrong_value() {
        // Guard against regressing to `32 * 8 + 4 + 8 + 1` (269).
        assert_ne!(NullifierAccount::SIZE, 32 * 8 + 4 + 8 + 1);
        assert!(NullifierAccount::SIZE > 269);
        assert_eq!(NullifierAccount::SZ_PUBLIC_INPUTS_HASH, 32);
    }
}
