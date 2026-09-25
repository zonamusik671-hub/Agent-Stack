import * as anchor from '@coral-xyz/anchor';
import { TOKEN_2022_PROGRAM_ID, } from '@solana/spl-token';
import { PublicKey, SystemProgram, } from '@solana/web3.js';
import generatedIdl from '../generated/agent_stock_basket.json' with { type: 'json' };
export const AGENT_STOCK_BASKET_PROGRAM_ID = new PublicKey('EeVNS2rn7K7Pq2GvDHzfmPd1GtD9n9S6AtReLqETSR3R');
// Keep a small fallback for environments that package the client without target/idl.
const FALLBACK_IDL = {
    version: '0.1.0',
    name: 'agent_stock_basket',
    address: AGENT_STOCK_BASKET_PROGRAM_ID.toBase58(),
    instructions: [
        {
            name: 'initializeVault',
            discriminator: [48, 191, 163, 44, 71, 129, 63, 164],
            accounts: [
                { name: 'owner', writable: true, signer: true },
                { name: 'vault', writable: true, signer: false },
                { name: 'vaultAuthority', signer: false },
                { name: 'vaultTokenAccount', writable: true, signer: false },
                { name: 'vaultMint', signer: false },
                { name: 'tokenProgram', signer: false },
                { name: 'systemProgram', signer: false },
            ],
            args: [
                { name: 'basketId', type: 'u64' },
                { name: 'aiAgent', type: 'pubkey' },
                { name: 'maxRebalanceAmount', type: 'u64' },
                { name: 'minReserveAmount', type: 'u64' },
            ],
        },
        {
            name: 'executeRebalance',
            discriminator: [36, 232, 110, 192, 96, 226, 100, 120],
            accounts: [
                { name: 'signerAgent', signer: true },
                { name: 'vault', writable: true, signer: false },
                { name: 'vaultAuthority', signer: false },
                { name: 'vaultTokenAccount', writable: true, signer: false },
                { name: 'destinationTokenAccount', writable: true, signer: false },
                { name: 'vaultMint', signer: false },
                { name: 'tokenProgram', signer: false },
            ],
            args: [
                { name: 'amount', type: 'u64' },
                { name: 'expectedBasketId', type: 'u64' },
            ],
        },
        {
            name: 'depositUsdc',
            discriminator: [184, 148, 250, 169, 224, 213, 34, 126],
            accounts: [
                { name: 'user', signer: true },
                { name: 'userTokenAccount', writable: true, signer: false },
                { name: 'vaultPda', signer: false },
                { name: 'vaultTokenAccount', writable: true, signer: false },
                { name: 'vault', writable: true, signer: false },
                { name: 'vaultMint', signer: false },
                { name: 'tokenProgram', signer: false },
            ],
            args: [{ name: 'amount', type: 'u64' }],
        },
    ],
};
function loadIdl() {
    return generatedIdl;
}
export function deriveVault(owner, basketId) {
    const id = new anchor.BN(basketId);
    return PublicKey.findProgramAddressSync([Buffer.from('vault'), owner.toBuffer(), id.toArrayLike(Buffer, 'le', 8)], AGENT_STOCK_BASKET_PROGRAM_ID);
}
export function deriveVaultAuthority(vault) {
    return PublicKey.findProgramAddressSync([Buffer.from('vault_authority'), vault.toBuffer()], AGENT_STOCK_BASKET_PROGRAM_ID);
}
export function deriveVaultTokenAccount(vault) {
    return PublicKey.findProgramAddressSync([Buffer.from('vault_token'), vault.toBuffer()], AGENT_STOCK_BASKET_PROGRAM_ID);
}
export class AnchorClient {
    provider;
    program;
    constructor(connection, wallet, opts) {
        this.provider = new anchor.AnchorProvider(connection, wallet, {
            commitment: 'confirmed',
            preflightCommitment: 'confirmed',
            ...opts,
        });
        this.program = new anchor.Program(loadIdl(), this.provider);
    }
    async initializeVault(params) {
        const [vault] = deriveVault(this.provider.wallet.publicKey, params.basketId);
        const [vaultAuthority] = deriveVaultAuthority(vault);
        const [vaultTokenAccount] = deriveVaultTokenAccount(vault);
        return this.program.methods
            .initializeVault(new anchor.BN(params.basketId), params.aiAgent, params.maxRebalanceAmount, params.minReserveAmount)
            .accounts({
            owner: this.provider.wallet.publicKey,
            vault,
            vaultAuthority,
            vaultTokenAccount,
            vaultMint: params.vaultMint,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
            .rpc();
    }
    async executeRebalance(params) {
        const [vaultAuthority] = deriveVaultAuthority(params.vault);
        return this.program.methods
            .executeRebalance(params.amount, new anchor.BN(params.expectedBasketId))
            .accounts({
            signerAgent: this.provider.wallet.publicKey,
            vault: params.vault,
            vaultAuthority,
            vaultTokenAccount: params.vaultTokenAccount,
            destinationTokenAccount: params.destinationTokenAccount,
            vaultMint: params.vaultMint,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
            .rpc();
    }
    async depositUsdc(params) {
        return this.program.methods
            .depositUsdc(params.amount)
            .accounts({
            user: this.provider.wallet.publicKey,
            userTokenAccount: params.userTokenAccount,
            vaultPda: params.vaultPda,
            vaultTokenAccount: params.vaultTokenAccount,
            vault: params.vault,
            vaultMint: params.vaultMint,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
            .rpc();
    }
    async configureBorrowing(params) {
        return this.program.methods
            .configureBorrowing(params.maxLtvBps, params.liquidationLtvBps, params.maxPriceAgeSeconds, params.maxConfidenceBps, params.liquidationBonusBps, params.oraclePriceFeed, params.oracleProgram)
            .accounts({
            vault: params.vault,
            owner: this.provider.wallet.publicKey,
        })
            .rpc();
    }
    async initializeBorrowPool(params) {
        const [vaultAuthority] = deriveVaultAuthority(params.vault);
        const [loanTokenAccount] = PublicKey.findProgramAddressSync([Buffer.from('loan_token'), params.vault.toBuffer()], AGENT_STOCK_BASKET_PROGRAM_ID);
        return this.program.methods
            .initializeBorrowPool()
            .accounts({
            vault: params.vault,
            owner: this.provider.wallet.publicKey,
            vaultAuthority,
            loanTokenAccount,
            loanMint: params.loanMint,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
            .rpc();
    }
    async initializeBorrowPosition(params) {
        const [borrowPosition] = PublicKey.findProgramAddressSync([Buffer.from('borrow_position'), params.vault.toBuffer(), params.borrower.toBuffer()], AGENT_STOCK_BASKET_PROGRAM_ID);
        return this.program.methods
            .initializeBorrowPosition()
            .accounts({
            vault: params.vault,
            owner: this.provider.wallet.publicKey,
            borrower: params.borrower,
            borrowPosition,
            systemProgram: SystemProgram.programId,
        })
            .rpc();
    }
    async borrowAgainstCollateral(params) {
        const [vaultAuthority] = deriveVaultAuthority(params.vault);
        const [borrowPosition] = PublicKey.findProgramAddressSync([Buffer.from('borrow_position'), params.vault.toBuffer(), params.borrower.toBuffer()], AGENT_STOCK_BASKET_PROGRAM_ID);
        const [loanTokenAccount] = PublicKey.findProgramAddressSync([Buffer.from('loan_token'), params.vault.toBuffer()], AGENT_STOCK_BASKET_PROGRAM_ID);
        return this.program.methods
            .borrowAgainstCollateral(params.collateralAmount)
            .accounts({
            vault: params.vault,
            owner: this.provider.wallet.publicKey,
            borrowPosition,
            borrower: params.borrower,
            vaultAuthority,
            vaultTokenAccount: params.vaultTokenAccount,
            vaultMint: params.vaultMint,
            loanTokenAccount,
            loanMint: params.loanMint,
            borrowerLoanAccount: params.borrowerLoanAccount,
            oraclePriceFeed: params.oraclePriceFeed,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
            .rpc();
    }
    async liquidatePosition(params) {
        const [vaultAuthority] = deriveVaultAuthority(params.vault);
        const [borrowPosition] = PublicKey.findProgramAddressSync([Buffer.from('borrow_position'), params.vault.toBuffer(), params.borrower.toBuffer()], AGENT_STOCK_BASKET_PROGRAM_ID);
        const [loanTokenAccount] = PublicKey.findProgramAddressSync([Buffer.from('loan_token'), params.vault.toBuffer()], AGENT_STOCK_BASKET_PROGRAM_ID);
        return this.program.methods
            .liquidatePosition(params.repayAmount)
            .accounts({
            vault: params.vault,
            borrowPosition,
            borrower: params.borrower,
            liquidator: this.provider.wallet.publicKey,
            vaultAuthority,
            vaultTokenAccount: params.vaultTokenAccount,
            vaultMint: params.vaultMint,
            loanTokenAccount,
            loanMint: params.loanMint,
            liquidatorLoanAccount: params.liquidatorLoanAccount,
            liquidatorCollateralAccount: params.liquidatorCollateralAccount,
            oraclePriceFeed: params.oraclePriceFeed,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
            .rpc();
    }
}
