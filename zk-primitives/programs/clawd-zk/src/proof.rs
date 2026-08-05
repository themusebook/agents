//! Groth16 proof verification using Solana's alt-bn128 syscalls.
//!
//! Verifying keys use the canonical `groth16-solana` byte layout:
//! alpha G1 (64), beta/gamma/delta G2 (3 × 128), then `N + 1` IC G1
//! points (64 bytes each), where `N` is the public-input count.

use anchor_lang::{prelude::Result, solana_program::program_error::ProgramError};
use groth16_solana::groth16::{
    Groth16Verifier,
    Groth16Verifyingkey,
};

const VK_FIXED_BYTES: usize = 64 + 128 * 3;
const MAX_PUBLIC_INPUTS: usize = 16;

fn invalid_proof_data() -> anchor_lang::error::Error {
    ProgramError::InvalidInstructionData.into()
}

fn fixed<const N: usize>(bytes: &[u8]) -> Result<[u8; N]> {
    bytes.try_into().map_err(|_| invalid_proof_data())
}

fn verify_fixed<const N: usize>(
    proof_a: &[u8; 64],
    proof_b: &[u8; 128],
    proof_c: &[u8; 64],
    public_inputs: &[[u8; 32]],
    verifying_key: &Groth16Verifyingkey<'_>,
) -> Result<()> {
    let inputs: &[[u8; 32]; N] = public_inputs
        .try_into()
        .map_err(|_| invalid_proof_data())?;
    let mut verifier = Groth16Verifier::<N>::new(
        proof_a,
        proof_b,
        proof_c,
        inputs,
        verifying_key,
    )
    .map_err(|_| invalid_proof_data())?;
    verifier.verify().map_err(|_| invalid_proof_data())
}

/// Verify a Groth16 proof against the supplied public inputs and serialized
/// verifying key. The input-count dispatch is bounded to keep instruction
/// size and compute predictable.
pub fn verify_groth16(
    proof_a: &[u8; 64],
    proof_b: &[u8; 128],
    proof_c: &[u8; 64],
    public_inputs: &[[u8; 32]],
    verifying_key_bytes: &[u8],
) -> Result<()> {
    if public_inputs.is_empty() || public_inputs.len() > MAX_PUBLIC_INPUTS {
        return Err(invalid_proof_data());
    }
    let expected = VK_FIXED_BYTES + (public_inputs.len() + 1) * 64;
    if verifying_key_bytes.len() != expected {
        return Err(invalid_proof_data());
    }

    let alpha = fixed::<64>(&verifying_key_bytes[0..64])?;
    let beta = fixed::<128>(&verifying_key_bytes[64..192])?;
    let gamma = fixed::<128>(&verifying_key_bytes[192..320])?;
    let delta = fixed::<128>(&verifying_key_bytes[320..448])?;
    let ic = verifying_key_bytes[VK_FIXED_BYTES..]
        .chunks_exact(64)
        .map(fixed::<64>)
        .collect::<Result<Vec<_>>>()?;
    let verifying_key = Groth16Verifyingkey {
        nr_pubinputs: public_inputs.len() + 1,
        vk_alpha_g1: alpha,
        vk_beta_g2: beta,
        vk_gamme_g2: gamma,
        vk_delta_g2: delta,
        vk_ic: &ic,
    };

    match public_inputs.len() {
        1 => verify_fixed::<1>(proof_a, proof_b, proof_c, public_inputs, &verifying_key),
        2 => verify_fixed::<2>(proof_a, proof_b, proof_c, public_inputs, &verifying_key),
        3 => verify_fixed::<3>(proof_a, proof_b, proof_c, public_inputs, &verifying_key),
        4 => verify_fixed::<4>(proof_a, proof_b, proof_c, public_inputs, &verifying_key),
        5 => verify_fixed::<5>(proof_a, proof_b, proof_c, public_inputs, &verifying_key),
        6 => verify_fixed::<6>(proof_a, proof_b, proof_c, public_inputs, &verifying_key),
        7 => verify_fixed::<7>(proof_a, proof_b, proof_c, public_inputs, &verifying_key),
        8 => verify_fixed::<8>(proof_a, proof_b, proof_c, public_inputs, &verifying_key),
        9 => verify_fixed::<9>(proof_a, proof_b, proof_c, public_inputs, &verifying_key),
        10 => verify_fixed::<10>(proof_a, proof_b, proof_c, public_inputs, &verifying_key),
        11 => verify_fixed::<11>(proof_a, proof_b, proof_c, public_inputs, &verifying_key),
        12 => verify_fixed::<12>(proof_a, proof_b, proof_c, public_inputs, &verifying_key),
        13 => verify_fixed::<13>(proof_a, proof_b, proof_c, public_inputs, &verifying_key),
        14 => verify_fixed::<14>(proof_a, proof_b, proof_c, public_inputs, &verifying_key),
        15 => verify_fixed::<15>(proof_a, proof_b, proof_c, public_inputs, &verifying_key),
        16 => verify_fixed::<16>(proof_a, proof_b, proof_c, public_inputs, &verifying_key),
        _ => Err(invalid_proof_data()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_wrong_verifying_key_size() {
        let result = verify_groth16(
            &[0; 64],
            &[0; 128],
            &[0; 64],
            &[[0; 32]; 4],
            &[0; 32],
        );
        assert!(result.is_err());
    }

    #[test]
    fn rejects_unbounded_public_input_count() {
        let result = verify_groth16(
            &[0; 64],
            &[0; 128],
            &[0; 64],
            &[[0; 32]; MAX_PUBLIC_INPUTS + 1],
            &[],
        );
        assert!(result.is_err());
    }
}
