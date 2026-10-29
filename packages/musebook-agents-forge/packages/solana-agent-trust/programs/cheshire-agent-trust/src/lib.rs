use anchor_lang::prelude::*;
use solana_program::pubkey;
use mpl_core::{accounts::BaseAssetV1, ID as CORE_PROGRAM_ID};

declare_id!("ChesHirtRUsT1111111111111111111111111111111");

pub const MAX_DECIMALS: u8 = 18;
pub const MPL_AGENT_IDENTITY_PROGRAM_ID: Pubkey = pubkey!("1DREGFgysWYxLnRnKQnwrxnJQeSMk2HmGaC6whw2B2p");

#[program]
pub mod cheshire_agent_trust {
    use super::*;

    pub fn initialize_agent_root(
        ctx: Context<InitializeAgentRoot>,
        caid: [u8; 32],
        registration_hash: [u8; 32],
    ) -> Result<()> {
        let asset = decode_asset(&ctx.accounts.asset)?;
        require_keys_eq!(asset.owner, ctx.accounts.owner.key(), TrustError::InvalidOwner);
        let root = &mut ctx.accounts.agent_root;
        root.caid = caid;
        root.asset = ctx.accounts.asset.key();
        root.owner = ctx.accounts.owner.key();
        root.registration_hash = registration_hash;
        root.sequence = 0;
        root.status = AgentStatus::Active;
        root.bump = ctx.bumps.agent_root;
        emit!(AgentRootInitialized { caid, asset: root.asset, owner: root.owner });
        Ok(())
    }

    pub fn refresh_owner(ctx: Context<RefreshOwner>) -> Result<()> {
        let asset = decode_asset(&ctx.accounts.asset)?;
        require_keys_eq!(asset.owner, ctx.accounts.new_owner.key(), TrustError::InvalidOwner);
        let root = &mut ctx.accounts.agent_root;
        require_keys_eq!(root.asset, ctx.accounts.asset.key(), TrustError::InvalidAsset);
        let previous_owner = root.owner;
        root.owner = ctx.accounts.new_owner.key();
        root.sequence = root.sequence.checked_add(1).ok_or(TrustError::CounterOverflow)?;
        emit!(AgentOwnerRefreshed { caid: root.caid, previous_owner, new_owner: root.owner, sequence: root.sequence });
        Ok(())
    }

    pub fn give_feedback(
        ctx: Context<GiveFeedback>,
        index: u64,
        value: i128,
        decimals: u8,
        tag1_hash: [u8; 32],
        tag2_hash: [u8; 32],
        content_hash: [u8; 32],
    ) -> Result<()> {
        require!(decimals <= MAX_DECIMALS, TrustError::InvalidDecimals);
        require_keys_neq!(ctx.accounts.agent_root.owner, ctx.accounts.reviewer.key(), TrustError::SelfReview);
        let sequence = &mut ctx.accounts.reviewer_sequence;
        require!(index == sequence.next_index, TrustError::InvalidFeedbackIndex);
        sequence.agent_root = ctx.accounts.agent_root.key();
        sequence.reviewer = ctx.accounts.reviewer.key();
        sequence.next_index = index.checked_add(1).ok_or(TrustError::CounterOverflow)?;
        sequence.bump = ctx.bumps.reviewer_sequence;

        let feedback = &mut ctx.accounts.feedback;
        feedback.agent_root = ctx.accounts.agent_root.key();
        feedback.reviewer = ctx.accounts.reviewer.key();
        feedback.index = index;
        feedback.value = value;
        feedback.decimals = decimals;
        feedback.tag1_hash = tag1_hash;
        feedback.tag2_hash = tag2_hash;
        feedback.content_hash = content_hash;
        feedback.revoked = false;
        feedback.created_slot = Clock::get()?.slot;
        feedback.bump = ctx.bumps.feedback;
        emit!(FeedbackGiven { agent_root: feedback.agent_root, reviewer: feedback.reviewer, index, value, decimals, content_hash });
        Ok(())
    }

    pub fn revoke_feedback(ctx: Context<RevokeFeedback>) -> Result<()> {
        let feedback = &mut ctx.accounts.feedback;
        require!(!feedback.revoked, TrustError::AlreadyRevoked);
        feedback.revoked = true;
        emit!(FeedbackRevoked { agent_root: feedback.agent_root, reviewer: feedback.reviewer, index: feedback.index });
        Ok(())
    }

    pub fn request_validation(
        ctx: Context<RequestValidation>,
        request_hash: [u8; 32],
        evidence_hash: [u8; 32],
    ) -> Result<()> {
        require_keys_eq!(ctx.accounts.agent_root.owner, ctx.accounts.requester.key(), TrustError::InvalidOwner);
        let request = &mut ctx.accounts.validation_request;
        request.agent_root = ctx.accounts.agent_root.key();
        request.requester = ctx.accounts.requester.key();
        request.validator = ctx.accounts.validator.key();
        request.request_hash = request_hash;
        request.evidence_hash = evidence_hash;
        request.response = None;
        request.response_hash = [0; 32];
        request.response_sequence = 0;
        request.last_updated_slot = Clock::get()?.slot;
        request.bump = ctx.bumps.validation_request;
        emit!(ValidationRequested { agent_root: request.agent_root, validator: request.validator, request_hash, evidence_hash });
        Ok(())
    }

    pub fn respond_validation(
        ctx: Context<RespondValidation>,
        response: u8,
        response_hash: [u8; 32],
        tag_hash: [u8; 32],
    ) -> Result<()> {
        require!(response <= 100, TrustError::InvalidResponse);
        let request = &mut ctx.accounts.validation_request;
        request.response = Some(response);
        request.response_hash = response_hash;
        request.response_sequence = request.response_sequence.checked_add(1).ok_or(TrustError::CounterOverflow)?;
        request.last_updated_slot = Clock::get()?.slot;
        emit!(ValidationResponded {
            agent_root: request.agent_root,
            validator: request.validator,
            request_hash: request.request_hash,
            response,
            response_hash,
            tag_hash,
            sequence: request.response_sequence,
        });
        Ok(())
    }
}

fn decode_asset<'info>(account: &UncheckedAccount<'info>) -> Result<BaseAssetV1> {
    BaseAssetV1::try_from(&account.to_account_info()).map_err(|_| error!(TrustError::InvalidAsset))
}

#[derive(Accounts)]
#[instruction(caid: [u8; 32])]
pub struct InitializeAgentRoot<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub owner: Signer<'info>,
    #[account(owner = CORE_PROGRAM_ID)]
    /// CHECK: owner is pinned to MPL Core and data is decoded in the handler.
    pub asset: UncheckedAccount<'info>,
    #[account(
        seeds = [b"agent_identity", asset.key().as_ref()],
        bump,
        seeds::program = MPL_AGENT_IDENTITY_PROGRAM_ID,
        owner = MPL_AGENT_IDENTITY_PROGRAM_ID,
    )]
    /// CHECK: constrained to the canonical Agent Identity PDA for this asset.
    pub agent_identity: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + AgentRoot::INIT_SPACE,
        seeds = [b"agent_root", caid.as_ref()],
        bump
    )]
    pub agent_root: Account<'info, AgentRoot>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RefreshOwner<'info> {
    pub new_owner: Signer<'info>,
    #[account(owner = CORE_PROGRAM_ID)]
    /// CHECK: owner is pinned to MPL Core and data is decoded in the handler.
    pub asset: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"agent_root", agent_root.caid.as_ref()], bump = agent_root.bump)]
    pub agent_root: Account<'info, AgentRoot>,
}

#[derive(Accounts)]
#[instruction(index: u64)]
pub struct GiveFeedback<'info> {
    #[account(mut)]
    pub reviewer: Signer<'info>,
    pub agent_root: Account<'info, AgentRoot>,
    #[account(
        init_if_needed,
        payer = reviewer,
        space = 8 + ReviewerSequence::INIT_SPACE,
        seeds = [b"reviewer", agent_root.key().as_ref(), reviewer.key().as_ref()],
        bump
    )]
    pub reviewer_sequence: Account<'info, ReviewerSequence>,
    #[account(
        init,
        payer = reviewer,
        space = 8 + Feedback::INIT_SPACE,
        seeds = [b"feedback", agent_root.key().as_ref(), reviewer.key().as_ref(), &index.to_le_bytes()],
        bump
    )]
    pub feedback: Account<'info, Feedback>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeFeedback<'info> {
    pub reviewer: Signer<'info>,
    #[account(mut, has_one = reviewer)]
    pub feedback: Account<'info, Feedback>,
}

#[derive(Accounts)]
#[instruction(request_hash: [u8; 32])]
pub struct RequestValidation<'info> {
    #[account(mut)]
    pub requester: Signer<'info>,
    /// CHECK: only its public key is recorded; it must sign responses later.
    pub validator: UncheckedAccount<'info>,
    pub agent_root: Account<'info, AgentRoot>,
    #[account(
        init,
        payer = requester,
        space = 8 + ValidationRequest::INIT_SPACE,
        seeds = [b"validation", agent_root.key().as_ref(), request_hash.as_ref()],
        bump
    )]
    pub validation_request: Account<'info, ValidationRequest>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RespondValidation<'info> {
    pub validator: Signer<'info>,
    #[account(mut, has_one = validator)]
    pub validation_request: Account<'info, ValidationRequest>,
}

#[account]
#[derive(InitSpace)]
pub struct AgentRoot {
    pub caid: [u8; 32],
    pub asset: Pubkey,
    pub owner: Pubkey,
    pub registration_hash: [u8; 32],
    pub sequence: u64,
    pub status: AgentStatus,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq)]
pub enum AgentStatus { Active, Suspended, Retired }

#[account]
#[derive(InitSpace)]
pub struct ReviewerSequence {
    pub agent_root: Pubkey,
    pub reviewer: Pubkey,
    pub next_index: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Feedback {
    pub agent_root: Pubkey,
    pub reviewer: Pubkey,
    pub index: u64,
    pub value: i128,
    pub decimals: u8,
    pub tag1_hash: [u8; 32],
    pub tag2_hash: [u8; 32],
    pub content_hash: [u8; 32],
    pub revoked: bool,
    pub created_slot: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ValidationRequest {
    pub agent_root: Pubkey,
    pub requester: Pubkey,
    pub validator: Pubkey,
    pub request_hash: [u8; 32],
    pub evidence_hash: [u8; 32],
    pub response: Option<u8>,
    pub response_hash: [u8; 32],
    pub response_sequence: u32,
    pub last_updated_slot: u64,
    pub bump: u8,
}

#[event]
pub struct AgentRootInitialized { pub caid: [u8; 32], pub asset: Pubkey, pub owner: Pubkey }
#[event]
pub struct AgentOwnerRefreshed { pub caid: [u8; 32], pub previous_owner: Pubkey, pub new_owner: Pubkey, pub sequence: u64 }
#[event]
pub struct FeedbackGiven { pub agent_root: Pubkey, pub reviewer: Pubkey, pub index: u64, pub value: i128, pub decimals: u8, pub content_hash: [u8; 32] }
#[event]
pub struct FeedbackRevoked { pub agent_root: Pubkey, pub reviewer: Pubkey, pub index: u64 }
#[event]
pub struct ValidationRequested { pub agent_root: Pubkey, pub validator: Pubkey, pub request_hash: [u8; 32], pub evidence_hash: [u8; 32] }
#[event]
pub struct ValidationResponded { pub agent_root: Pubkey, pub validator: Pubkey, pub request_hash: [u8; 32], pub response: u8, pub response_hash: [u8; 32], pub tag_hash: [u8; 32], pub sequence: u32 }

#[error_code]
pub enum TrustError {
    #[msg("Caller is not the current MPL Core asset owner")]
    InvalidOwner,
    #[msg("MPL Core asset account is invalid")]
    InvalidAsset,
    #[msg("Agent owners cannot review their own agent")]
    SelfReview,
    #[msg("Feedback decimals must be between zero and eighteen")]
    InvalidDecimals,
    #[msg("Feedback index is not the reviewer's next sequence")]
    InvalidFeedbackIndex,
    #[msg("Feedback has already been revoked")]
    AlreadyRevoked,
    #[msg("Validation response must be between zero and one hundred")]
    InvalidResponse,
    #[msg("Counter overflow")]
    CounterOverflow,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn account_sizes_are_bounded() {
        assert!(AgentRoot::INIT_SPACE < 256);
        assert!(Feedback::INIT_SPACE < 256);
        assert!(ValidationRequest::INIT_SPACE < 256);
    }

    #[test]
    fn decimals_boundary_matches_erc_8004() {
        assert_eq!(MAX_DECIMALS, 18);
    }
}
