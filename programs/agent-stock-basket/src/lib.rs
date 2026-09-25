use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use pyth_sdk_solana::load_price_feed_from_account_info;

declare_id!("EeVNS2rn7K7Pq2GvDHzfmPd1GtD9n9S6AtReLqETSR3R");

#[program]
pub mod agent_stock_basket {
    use super::*;

    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        basket_id: u64,
        ai_agent: Pubkey,
        max_rebalance_amount: u64,
        min_reserve_amount: u64,
    ) -> Result<()> {
        require!(ai_agent != Pubkey::default(), ErrorCode::InvalidAgent);
        require!(max_rebalance_amount > 0, ErrorCode::InvalidRebalanceLimit);
        require!(
            min_reserve_amount <= max_rebalance_amount,
            ErrorCode::InvalidReserve
        );

        let vault = &mut ctx.accounts.vault;
        vault.owner = ctx.accounts.owner.key();
        vault.ai_agent = ai_agent;
        vault.vault_mint = ctx.accounts.vault_mint.key();
        vault.id_basket = basket_id;
        vault.max_rebalance_amount = max_rebalance_amount;
        vault.min_reserve_amount = min_reserve_amount;
        vault.total_rebalanced = 0;
        vault.total_shares = 0;
        vault.accumulated_yield = 0;
        vault.total_yield_claimed = 0;
        vault.max_ltv_bps = 0;
        vault.total_collateral_locked = 0;
        vault.liquidation_ltv_bps = 0;
        vault.max_price_age_seconds = 0;
        vault.max_confidence_bps = 0;
        vault.liquidation_bonus_bps = 0;
        vault.oracle_price_feed = Pubkey::default();
        vault.oracle_program = Pubkey::default();
        vault.bump = ctx.bumps.vault;
        vault.authority_bump = ctx.bumps.vault_authority;

        emit!(VaultInitialized {
            vault: vault.key(),
            owner: vault.owner,
            ai_agent,
            basket_id,
            mint: vault.vault_mint,
        });

        Ok(())
    }

    pub fn execute_rebalance(
        ctx: Context<ExecuteRebalance>,
        amount: u64,
        expected_basket_id: u64,
    ) -> Result<()> {
        let vault = &ctx.accounts.vault;

        require!(
            ctx.accounts.signer_agent.key() == vault.ai_agent,
            ErrorCode::UnauthorizedAgent
        );
        require!(
            expected_basket_id == vault.id_basket,
            ErrorCode::BasketMismatch
        );
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(
            amount <= vault.max_rebalance_amount,
            ErrorCode::RebalanceLimitExceeded
        );

        require!(
            ctx.accounts.destination_token_account.owner == vault.owner,
            ErrorCode::InvalidDestinationOwner
        );
        require!(
            ctx.accounts.vault_token_account.mint == vault.vault_mint,
            ErrorCode::MintMismatch
        );
        require!(
            ctx.accounts.destination_token_account.mint == vault.vault_mint,
            ErrorCode::MintMismatch
        );
        require!(
            ctx.accounts.vault_token_account.amount >= amount,
            ErrorCode::InsufficientVaultBalance
        );

        let remaining = ctx
            .accounts
            .vault_token_account
            .amount
            .checked_sub(amount)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        require!(
            remaining >= vault.min_reserve_amount,
            ErrorCode::ReserveViolation
        );

        let vault = &mut ctx.accounts.vault;
        let vault_key = vault.key();
        let authority_bump = [vault.authority_bump];
        let authority_seeds: &[&[u8]] = &[
            b"vault_authority",
            vault_key.as_ref(),
            authority_bump.as_slice(),
        ];
        let signer_seeds = [authority_seeds];
        let transfer_accounts = TransferChecked {
            from: ctx.accounts.vault_token_account.to_account_info(),
            mint: ctx.accounts.vault_mint.to_account_info(),
            to: ctx.accounts.destination_token_account.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_accounts,
        )
        .with_signer(&signer_seeds);
        token_interface::transfer_checked(transfer_ctx, amount, ctx.accounts.vault_mint.decimals)?;

        vault.total_rebalanced = vault
            .total_rebalanced
            .checked_add(amount)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        emit!(RebalanceExecuted {
            vault: vault.key(),
            agent: ctx.accounts.signer_agent.key(),
            destination: ctx.accounts.destination_token_account.key(),
            amount,
            remaining_balance: remaining,
        });

        Ok(())
    }

    pub fn deposit_usdc(ctx: Context<DepositUsdc>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    mint: ctx.accounts.vault_mint.to_account_info(),
                    to: ctx.accounts.vault_token_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.vault_mint.decimals,
        )
    }

    pub fn initialize_yield_position(
        ctx: Context<InitializeYieldPosition>,
        shares: u64,
    ) -> Result<()> {
        require!(shares > 0, ErrorCode::InvalidShares);

        let vault = &mut ctx.accounts.vault;
        vault.total_shares = vault
            .total_shares
            .checked_add(shares)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        let position = &mut ctx.accounts.yield_position;
        position.vault = vault.key();
        position.beneficiary = ctx.accounts.beneficiary.key();
        position.shares = shares;
        position.claimed_yield = 0;
        position.bump = ctx.bumps.yield_position;
        Ok(())
    }

    pub fn record_yield(ctx: Context<RecordYield>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(
            ctx.accounts.signer_agent.key() == ctx.accounts.vault.ai_agent,
            ErrorCode::UnauthorizedAgent
        );

        let vault = &mut ctx.accounts.vault;
        vault.accumulated_yield = vault
            .accumulated_yield
            .checked_add(amount)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        Ok(())
    }

    pub fn configure_borrowing(
        ctx: Context<ConfigureBorrowing>,
        max_ltv_bps: u16,
        liquidation_ltv_bps: u16,
        max_price_age_seconds: u64,
        max_confidence_bps: u16,
        liquidation_bonus_bps: u16,
        oracle_price_feed: Pubkey,
        oracle_program: Pubkey,
    ) -> Result<()> {
        require!(
            max_ltv_bps > 0
                && max_ltv_bps <= liquidation_ltv_bps
                && liquidation_ltv_bps <= 10_000,
            ErrorCode::InvalidLtv
        );
        require!(max_price_age_seconds > 0, ErrorCode::InvalidOracleConfig);
        require!(max_confidence_bps <= 10_000, ErrorCode::InvalidOracleConfig);
        require!(liquidation_bonus_bps <= 10_000, ErrorCode::InvalidLiquidationBonus);
        ctx.accounts.vault.max_ltv_bps = max_ltv_bps;
        ctx.accounts.vault.liquidation_ltv_bps = liquidation_ltv_bps;
        ctx.accounts.vault.max_price_age_seconds = max_price_age_seconds;
        ctx.accounts.vault.max_confidence_bps = max_confidence_bps;
        ctx.accounts.vault.liquidation_bonus_bps = liquidation_bonus_bps;
        ctx.accounts.vault.oracle_price_feed = oracle_price_feed;
        ctx.accounts.vault.oracle_program = oracle_program;
        Ok(())
    }

    pub fn initialize_borrow_pool(ctx: Context<InitializeBorrowPool>) -> Result<()> {
        Ok(())
    }

    pub fn initialize_borrow_position(
        ctx: Context<InitializeBorrowPosition>,
    ) -> Result<()> {
        let position = &mut ctx.accounts.borrow_position;
        position.vault = ctx.accounts.vault.key();
        position.borrower = ctx.accounts.borrower.key();
        position.collateral_amount = 0;
        position.debt_amount = 0;
        position.repaid_amount = 0;
        position.bump = ctx.bumps.borrow_position;
        Ok(())
    }

    pub fn borrow_against_collateral(
        ctx: Context<BorrowAgainstCollateral>,
        collateral_amount: u64,
    ) -> Result<()> {
        require!(collateral_amount > 0, ErrorCode::InvalidAmount);
        require!(ctx.accounts.vault.max_ltv_bps > 0, ErrorCode::BorrowingDisabled);
        let price = read_oracle_price(&ctx.accounts.vault, &ctx.accounts.oracle_price_feed)?;
        require!(
            ctx.accounts.borrow_position.debt_amount == 0,
            ErrorCode::OutstandingDebt
        );
        let available_collateral = ctx.accounts.vault_token_account.amount
            .checked_sub(ctx.accounts.vault.total_collateral_locked)
            .ok_or(ErrorCode::InsufficientVaultBalance)?;
        require!(
            available_collateral >= collateral_amount,
            ErrorCode::InsufficientVaultBalance
        );

        let remaining = available_collateral
            .checked_sub(collateral_amount)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        require!(
            remaining >= ctx.accounts.vault.min_reserve_amount,
            ErrorCode::ReserveViolation
        );

        let debt = collateral_value(
            collateral_amount,
            ctx.accounts.vault_mint.decimals,
            ctx.accounts.loan_mint.decimals,
            price,
        )?
        .checked_mul(u128::from(ctx.accounts.vault.max_ltv_bps))
        .ok_or(ErrorCode::ArithmeticOverflow)?
        .checked_div(10_000)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
        let debt = u64::try_from(debt).map_err(|_| ErrorCode::ArithmeticOverflow)?;
        require!(debt > 0, ErrorCode::InvalidDebt);

        let vault_key = ctx.accounts.vault.key();
        let bump = [ctx.accounts.vault.authority_bump];
        let authority_seeds: &[&[u8]] =
            &[b"vault_authority", vault_key.as_ref(), bump.as_slice()];
        let signer_seeds = [authority_seeds];
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.loan_token_account.to_account_info(),
                    mint: ctx.accounts.loan_mint.to_account_info(),
                    to: ctx.accounts.borrower_loan_account.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
            )
            .with_signer(&signer_seeds),
            debt,
            ctx.accounts.loan_mint.decimals,
        )?;

        ctx.accounts.borrow_position.collateral_amount = collateral_amount;
        ctx.accounts.borrow_position.debt_amount = debt;
        ctx.accounts.vault.total_collateral_locked = ctx.accounts.vault
            .total_collateral_locked
            .checked_add(collateral_amount)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        emit!(BorrowCreated {
            vault: ctx.accounts.vault.key(),
            borrower: ctx.accounts.borrower.key(),
            collateral_amount,
            debt_amount: debt,
        });
        Ok(())
    }

    pub fn liquidate_position(
        ctx: Context<LiquidatePosition>,
        repay_amount: u64,
    ) -> Result<()> {
        require!(repay_amount > 0, ErrorCode::InvalidAmount);
        let position = &mut ctx.accounts.borrow_position;
        require!(position.debt_amount >= repay_amount, ErrorCode::RepaymentExceedsDebt);
        let price = read_oracle_price(&ctx.accounts.vault, &ctx.accounts.oracle_price_feed)?;
        let collateral_value = collateral_value(
            position.collateral_amount,
            ctx.accounts.vault_mint.decimals,
            ctx.accounts.loan_mint.decimals,
            price,
        )?;
        require!(
            is_position_liquidatable(
                position.debt_amount,
                collateral_value,
                ctx.accounts.vault.liquidation_ltv_bps,
            )?,
            ErrorCode::PositionHealthy
        );

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.liquidator_loan_account.to_account_info(),
                    mint: ctx.accounts.loan_mint.to_account_info(),
                    to: ctx.accounts.loan_token_account.to_account_info(),
                    authority: ctx.accounts.liquidator.to_account_info(),
                },
            ),
            repay_amount,
            ctx.accounts.loan_mint.decimals,
        )?;

        let base_collateral_to_release = u128::from(position.collateral_amount)
            .checked_mul(u128::from(repay_amount))
            .ok_or(ErrorCode::ArithmeticOverflow)?
            .checked_div(u128::from(position.debt_amount))
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        let collateral_to_release = base_collateral_to_release
            .checked_mul(
                10_000u128
                    .checked_add(u128::from(ctx.accounts.vault.liquidation_bonus_bps))
                    .ok_or(ErrorCode::ArithmeticOverflow)?,
            )
            .ok_or(ErrorCode::ArithmeticOverflow)?
            .checked_div(10_000)
            .ok_or(ErrorCode::ArithmeticOverflow)?
            .min(u128::from(position.collateral_amount));
        let collateral_to_release = u64::try_from(collateral_to_release)
            .map_err(|_| ErrorCode::ArithmeticOverflow)?;
        let vault_key = ctx.accounts.vault.key();
        let bump = [ctx.accounts.vault.authority_bump];
        let authority_seeds: &[&[u8]] =
            &[b"vault_authority", vault_key.as_ref(), bump.as_slice()];
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    mint: ctx.accounts.vault_mint.to_account_info(),
                    to: ctx.accounts.liquidator_collateral_account.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
            )
            .with_signer(&[authority_seeds]),
            collateral_to_release,
            ctx.accounts.vault_mint.decimals,
        )?;

        position.debt_amount = position.debt_amount
            .checked_sub(repay_amount)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        position.collateral_amount = position.collateral_amount
            .checked_sub(collateral_to_release)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        ctx.accounts.vault.total_collateral_locked = ctx.accounts.vault
            .total_collateral_locked
            .checked_sub(collateral_to_release)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        emit!(LiquidationExecuted {
            vault: ctx.accounts.vault.key(),
            borrower: ctx.accounts.borrower.key(),
            liquidator: ctx.accounts.liquidator.key(),
            repaid_amount: repay_amount,
            collateral_released: collateral_to_release,
            remaining_debt: position.debt_amount,
        });
        Ok(())
    }

    pub fn repay_borrow(
        ctx: Context<RepayBorrow>,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        let position = &mut ctx.accounts.borrow_position;
        require!(position.debt_amount >= amount, ErrorCode::RepaymentExceedsDebt);

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.borrower_loan_account.to_account_info(),
                    mint: ctx.accounts.loan_mint.to_account_info(),
                    to: ctx.accounts.loan_token_account.to_account_info(),
                    authority: ctx.accounts.borrower.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.loan_mint.decimals,
        )?;

        let unlocked = if amount == position.debt_amount {
            position.collateral_amount
        } else {
            u128::from(position.collateral_amount)
                .checked_mul(u128::from(amount))
                .ok_or(ErrorCode::ArithmeticOverflow)?
                .checked_div(u128::from(position.debt_amount))
                .and_then(|value| u64::try_from(value).ok())
                .ok_or(ErrorCode::ArithmeticOverflow)?
        };
        position.debt_amount = position
            .debt_amount
            .checked_sub(amount)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        position.collateral_amount = position
            .collateral_amount
            .checked_sub(unlocked)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        position.repaid_amount = position
            .repaid_amount
            .checked_add(amount)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        ctx.accounts.vault.total_collateral_locked = ctx.accounts.vault
            .total_collateral_locked
            .checked_sub(unlocked)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        emit!(BorrowRepaid {
            vault: ctx.accounts.vault.key(),
            borrower: ctx.accounts.borrower.key(),
            amount,
            collateral_released: unlocked,
            remaining_debt: position.debt_amount,
        });
        Ok(())
    }

    pub fn claim_yield(ctx: Context<ClaimYield>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        require!(vault.total_shares > 0, ErrorCode::NoShares);

        let position = &mut ctx.accounts.yield_position;
        let entitlement = (u128::from(vault.accumulated_yield)
            .checked_mul(u128::from(position.shares))
            .ok_or(ErrorCode::ArithmeticOverflow)?
            / u128::from(vault.total_shares)) as u64;
        let amount = entitlement
            .checked_sub(position.claimed_yield)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        require!(amount > 0, ErrorCode::NothingToClaim);

        let remaining = ctx
            .accounts
            .vault_token_account
            .amount
            .checked_sub(amount)
            .ok_or(ErrorCode::InsufficientVaultBalance)?;
        require!(
            remaining >= vault.min_reserve_amount,
            ErrorCode::ReserveViolation
        );
        require!(
            ctx.accounts.destination_token_account.owner == position.beneficiary,
            ErrorCode::InvalidDestinationOwner
        );
        require!(
            ctx.accounts.destination_token_account.mint == vault.vault_mint,
            ErrorCode::MintMismatch
        );

        let vault_key = vault.key();
        let authority_bump = [vault.authority_bump];
        let authority_seeds: &[&[u8]] = &[
            b"vault_authority",
            vault_key.as_ref(),
            authority_bump.as_slice(),
        ];
        let signer_seeds = [authority_seeds];
        let transfer_accounts = TransferChecked {
            from: ctx.accounts.vault_token_account.to_account_info(),
            mint: ctx.accounts.vault_mint.to_account_info(),
            to: ctx.accounts.destination_token_account.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                transfer_accounts,
            )
            .with_signer(&signer_seeds),
            amount,
            ctx.accounts.vault_mint.decimals,
        )?;

        position.claimed_yield = entitlement;
        vault.total_yield_claimed = vault
            .total_yield_claimed
            .checked_add(amount)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(basket_id: u64)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = Vault::SPACE,
        seeds = [b"vault", owner.key().as_ref(), &basket_id.to_le_bytes()],
        bump
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        seeds = [b"vault_authority", vault.key().as_ref()],
        bump
    )]
    /// CHECK: PDA authority is constrained by the vault seed and only signs
    /// Token-2022 transfers through the stored authority bump.
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = owner,
        seeds = [b"vault_token", vault.key().as_ref()],
        bump,
        token::mint = vault_mint,
        token::authority = vault_authority,
        token::token_program = token_program
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    pub vault_mint: InterfaceAccount<'info, Mint>,
    #[account(address = anchor_spl::token_2022::ID @ ErrorCode::Token2022Required)]
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteRebalance<'info> {
    pub signer_agent: Signer<'info>,

    #[account(mut)]
    pub vault: Account<'info, Vault>,

    #[account(
        seeds = [b"vault_authority", vault.key().as_ref()],
        bump = vault.authority_bump
    )]
    /// CHECK: PDA authority is constrained by the vault seed and only signs
    /// Token-2022 transfers through the stored authority bump.
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = vault_token_account.owner == vault_authority.key()
            @ ErrorCode::InvalidVaultAuthority,
        constraint = vault_token_account.mint == vault.vault_mint
            @ ErrorCode::MintMismatch
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        constraint = destination_token_account.mint == vault.vault_mint
            @ ErrorCode::MintMismatch
    )]
    pub destination_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(address = vault.vault_mint @ ErrorCode::MintMismatch)]
    pub vault_mint: InterfaceAccount<'info, Mint>,

    #[account(address = anchor_spl::token_2022::ID @ ErrorCode::Token2022Required)]
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct DepositUsdc<'info> {
    pub user: Signer<'info>,
    #[account(
        mut,
        constraint = user_token_account.owner == user.key()
            @ ErrorCode::InvalidUserTokenOwner,
        constraint = user_token_account.mint == vault.vault_mint
            @ ErrorCode::MintMismatch
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        seeds = [b"vault_authority", vault.key().as_ref()],
        bump = vault.authority_bump
    )]
    /// CHECK: PDA is constrained by the vault seed and receives deposited tokens.
    pub vault_pda: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = vault_token_account.owner == vault_pda.key()
            @ ErrorCode::InvalidVaultAuthority,
        constraint = vault_token_account.mint == vault.vault_mint
            @ ErrorCode::MintMismatch
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    #[account(address = vault.vault_mint @ ErrorCode::MintMismatch)]
    pub vault_mint: InterfaceAccount<'info, Mint>,
    #[account(address = anchor_spl::token_2022::ID @ ErrorCode::Token2022Required)]
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct InitializeYieldPosition<'info> {
    #[account(mut, has_one = owner)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: The owner explicitly assigns shares to this beneficiary.
    pub beneficiary: UncheckedAccount<'info>,
    #[account(
        init,
        payer = owner,
        space = YieldPosition::SPACE,
        seeds = [b"yield_position", vault.key().as_ref(), beneficiary.key().as_ref()],
        bump
    )]
    pub yield_position: Account<'info, YieldPosition>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordYield<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    pub signer_agent: Signer<'info>,
}

#[derive(Accounts)]
pub struct ConfigureBorrowing<'info> {
    #[account(mut, has_one = owner)]
    pub vault: Account<'info, Vault>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitializeBorrowPool<'info> {
    #[account(mut, has_one = owner)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [b"vault_authority", vault.key().as_ref()],
        bump = vault.authority_bump
    )]
    /// CHECK: PDA authority is constrained by the vault seed.
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = owner,
        seeds = [b"loan_token", vault.key().as_ref()],
        bump,
        token::mint = loan_mint,
        token::authority = vault_authority,
        token::token_program = token_program
    )]
    pub loan_token_account: InterfaceAccount<'info, TokenAccount>,
    pub loan_mint: InterfaceAccount<'info, Mint>,
    #[account(address = anchor_spl::token_2022::ID @ ErrorCode::Token2022Required)]
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeBorrowPosition<'info> {
    #[account(has_one = owner)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: The vault owner explicitly authorizes this borrower.
    pub borrower: UncheckedAccount<'info>,
    #[account(
        init,
        payer = owner,
        space = BorrowPosition::SPACE,
        seeds = [b"borrow_position", vault.key().as_ref(), borrower.key().as_ref()],
        bump
    )]
    pub borrow_position: Account<'info, BorrowPosition>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BorrowAgainstCollateral<'info> {
    #[account(mut, has_one = owner)]
    pub vault: Account<'info, Vault>,
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"borrow_position", vault.key().as_ref(), borrower.key().as_ref()],
        bump = borrow_position.bump,
        has_one = vault,
        has_one = borrower
    )]
    pub borrow_position: Account<'info, BorrowPosition>,
    /// CHECK: The borrower identity is constrained by the borrow position.
    pub borrower: UncheckedAccount<'info>,
    #[account(
        seeds = [b"vault_authority", vault.key().as_ref()],
        bump = vault.authority_bump
    )]
    /// CHECK: PDA signs only the Token-2022 loan transfer.
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = vault_token_account.owner == vault_authority.key()
            @ ErrorCode::InvalidVaultAuthority,
        constraint = vault_token_account.mint == vault.vault_mint
            @ ErrorCode::MintMismatch
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(address = vault.vault_mint @ ErrorCode::MintMismatch)]
    pub vault_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [b"loan_token", vault.key().as_ref()],
        bump,
        constraint = loan_token_account.owner == vault_authority.key()
            @ ErrorCode::InvalidVaultAuthority,
        constraint = loan_token_account.mint == loan_mint.key()
            @ ErrorCode::MintMismatch
    )]
    pub loan_token_account: InterfaceAccount<'info, TokenAccount>,
    pub loan_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        constraint = borrower_loan_account.owner == borrower.key()
            @ ErrorCode::InvalidUserTokenOwner,
        constraint = borrower_loan_account.mint == loan_mint.key()
            @ ErrorCode::MintMismatch
    )]
    pub borrower_loan_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: The account owner and key are validated by `read_oracle_price`.
    pub oracle_price_feed: UncheckedAccount<'info>,
    #[account(address = anchor_spl::token_2022::ID @ ErrorCode::Token2022Required)]
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct RepayBorrow<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [b"borrow_position", vault.key().as_ref(), borrower.key().as_ref()],
        bump = borrow_position.bump,
        has_one = vault,
        has_one = borrower
    )]
    pub borrow_position: Account<'info, BorrowPosition>,
    pub borrower: Signer<'info>,
    #[account(
        mut,
        seeds = [b"vault_authority", vault.key().as_ref()],
        bump = vault.authority_bump
    )]
    /// CHECK: PDA receives only the configured Token-2022 loan mint.
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"loan_token", vault.key().as_ref()],
        bump,
        constraint = loan_token_account.owner == vault_authority.key()
            @ ErrorCode::InvalidVaultAuthority,
        constraint = loan_token_account.mint == loan_mint.key()
            @ ErrorCode::MintMismatch
    )]
    pub loan_token_account: InterfaceAccount<'info, TokenAccount>,
    pub loan_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        constraint = borrower_loan_account.owner == borrower.key()
            @ ErrorCode::InvalidUserTokenOwner,
        constraint = borrower_loan_account.mint == loan_mint.key()
            @ ErrorCode::MintMismatch
    )]
    pub borrower_loan_account: InterfaceAccount<'info, TokenAccount>,
    #[account(address = anchor_spl::token_2022::ID @ ErrorCode::Token2022Required)]
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct LiquidatePosition<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [b"borrow_position", vault.key().as_ref(), borrower.key().as_ref()],
        bump = borrow_position.bump,
        has_one = vault,
        has_one = borrower
    )]
    pub borrow_position: Account<'info, BorrowPosition>,
    /// CHECK: Borrower identity is constrained by the position PDA.
    pub borrower: UncheckedAccount<'info>,
    pub liquidator: Signer<'info>,
    #[account(
        mut,
        seeds = [b"vault_authority", vault.key().as_ref()],
        bump = vault.authority_bump
    )]
    /// CHECK: PDA signs only collateral release.
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = vault_token_account.owner == vault_authority.key()
            @ ErrorCode::InvalidVaultAuthority,
        constraint = vault_token_account.mint == vault.vault_mint
            @ ErrorCode::MintMismatch
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(address = vault.vault_mint @ ErrorCode::MintMismatch)]
    pub vault_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [b"loan_token", vault.key().as_ref()],
        bump,
        constraint = loan_token_account.owner == vault_authority.key()
            @ ErrorCode::InvalidVaultAuthority,
        constraint = loan_token_account.mint == loan_mint.key()
            @ ErrorCode::MintMismatch
    )]
    pub loan_token_account: InterfaceAccount<'info, TokenAccount>,
    pub loan_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        constraint = liquidator_loan_account.owner == liquidator.key()
            @ ErrorCode::InvalidUserTokenOwner,
        constraint = liquidator_loan_account.mint == loan_mint.key()
            @ ErrorCode::MintMismatch
    )]
    pub liquidator_loan_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        constraint = liquidator_collateral_account.owner == liquidator.key()
            @ ErrorCode::InvalidUserTokenOwner,
        constraint = liquidator_collateral_account.mint == vault.vault_mint
            @ ErrorCode::MintMismatch
    )]
    pub liquidator_collateral_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: The account owner, key, freshness, and confidence are validated.
    pub oracle_price_feed: UncheckedAccount<'info>,
    #[account(address = anchor_spl::token_2022::ID @ ErrorCode::Token2022Required)]
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ClaimYield<'info> {
    #[account(mut)]
    pub beneficiary: Signer<'info>,
    #[account(
        mut,
        seeds = [b"yield_position", vault.key().as_ref(), beneficiary.key().as_ref()],
        bump = yield_position.bump,
        has_one = beneficiary,
        has_one = vault
    )]
    pub yield_position: Account<'info, YieldPosition>,
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    #[account(
        seeds = [b"vault_authority", vault.key().as_ref()],
        bump = vault.authority_bump
    )]
    /// CHECK: PDA authority is constrained by the vault seed.
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = vault_token_account.owner == vault_authority.key()
            @ ErrorCode::InvalidVaultAuthority,
        constraint = vault_token_account.mint == vault.vault_mint
            @ ErrorCode::MintMismatch
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(address = vault.vault_mint @ ErrorCode::MintMismatch)]
    pub vault_mint: InterfaceAccount<'info, Mint>,
    #[account(address = anchor_spl::token_2022::ID @ ErrorCode::Token2022Required)]
    pub token_program: Interface<'info, TokenInterface>,
    #[account(mut)]
    pub destination_token_account: InterfaceAccount<'info, TokenAccount>,
}

#[account]
pub struct Vault {
    pub owner: Pubkey,
    pub ai_agent: Pubkey,
    pub vault_mint: Pubkey,
    pub id_basket: u64,
    pub max_rebalance_amount: u64,
    pub min_reserve_amount: u64,
    pub total_rebalanced: u64,
    pub total_shares: u64,
    pub accumulated_yield: u64,
    pub total_yield_claimed: u64,
    pub bump: u8,
    pub authority_bump: u8,
    pub max_ltv_bps: u16,
    pub total_collateral_locked: u64,
    pub liquidation_ltv_bps: u16,
    pub max_price_age_seconds: u64,
    pub max_confidence_bps: u16,
    pub liquidation_bonus_bps: u16,
    pub oracle_price_feed: Pubkey,
    pub oracle_program: Pubkey,
}

impl Vault {
    pub const SPACE: usize = 8 + (32 * 5) + (8 * 9) + 1 + 1 + 8;
}

struct OraclePrice {
    price: u64,
    expo: i32,
}

fn read_oracle_price(
    vault: &Vault,
    oracle_account: &UncheckedAccount,
) -> Result<OraclePrice> {
    require_keys_eq!(
        oracle_account.key(),
        vault.oracle_price_feed,
        ErrorCode::InvalidOracleAccount
    );
    require_keys_eq!(
        *oracle_account.owner,
        vault.oracle_program,
        ErrorCode::InvalidOracleAccount
    );
    let clock = Clock::get()?;
    let feed = load_price_feed_from_account_info(&oracle_account.to_account_info())
        .map_err(|_| error!(ErrorCode::InvalidOracleAccount))?;
    let price = feed
        .get_price_no_older_than(clock.unix_timestamp, vault.max_price_age_seconds)
        .ok_or(ErrorCode::StaleOraclePrice)?;
    require!(price.price > 0 && price.conf >= 0, ErrorCode::InvalidOraclePrice);
    let confidence_bps = u128::try_from(price.conf)
        .map_err(|_| error!(ErrorCode::InvalidOraclePrice))?
        .checked_mul(10_000)
        .ok_or(ErrorCode::ArithmeticOverflow)?
        .checked_div(u128::try_from(price.price).map_err(|_| error!(ErrorCode::InvalidOraclePrice))?)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    require!(
        confidence_bps <= u128::from(vault.max_confidence_bps),
        ErrorCode::OracleConfidenceTooWide
    );
    Ok(OraclePrice {
        price: u64::try_from(price.price).map_err(|_| error!(ErrorCode::InvalidOraclePrice))?,
        expo: price.expo,
    })
}

fn collateral_value(
    collateral_amount: u64,
    collateral_decimals: u8,
    loan_decimals: u8,
    price: OraclePrice,
) -> Result<u128> {
    let mut numerator = u128::from(collateral_amount)
        .checked_mul(u128::from(price.price))
        .ok_or(ErrorCode::ArithmeticOverflow)?
        .checked_mul(10u128.pow(u32::from(loan_decimals)))
        .ok_or(ErrorCode::ArithmeticOverflow)?
        .checked_div(10u128.pow(u32::from(collateral_decimals)))
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    if price.expo >= 0 {
        numerator = numerator
            .checked_mul(
                10u128
                    .checked_pow(
                        u32::try_from(price.expo)
                            .map_err(|_| error!(ErrorCode::InvalidOraclePrice))?,
                    )
                    .ok_or(ErrorCode::ArithmeticOverflow)?,
            )
            .ok_or(ErrorCode::ArithmeticOverflow)?;
    } else {
        numerator = numerator
            .checked_div(
                10u128
                    .checked_pow(
                        u32::try_from(-price.expo)
                            .map_err(|_| error!(ErrorCode::InvalidOraclePrice))?,
                    )
                    .ok_or(ErrorCode::ArithmeticOverflow)?,
            )
            .ok_or(ErrorCode::ArithmeticOverflow)?;
    }

    Ok(numerator)
}

fn is_position_liquidatable(
    debt_amount: u64,
    collateral_value: u128,
    liquidation_ltv_bps: u16,
) -> Result<bool> {
    require!(liquidation_ltv_bps > 0, ErrorCode::InvalidLtv);
    let debt_value = u128::from(debt_amount)
        .checked_mul(10_000)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    let liquidation_value = collateral_value
        .checked_mul(u128::from(liquidation_ltv_bps))
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    Ok(debt_value >= liquidation_value)
}

#[cfg(test)]
mod valuation_tests {
    use super::*;

    #[test]
    fn values_raw_collateral_with_negative_pyth_exponent() {
        let value = collateral_value(
            1_500_000,
            6,
            6,
            OraclePrice {
                price: 180_25,
                expo: -2,
            },
        )
        .unwrap();
        assert_eq!(value, 270_375_000);
    }

    #[test]
    fn supports_positive_pyth_exponent() {
        let value = collateral_value(
            1,
            0,
            0,
            OraclePrice {
                price: 2,
                expo: 2,
            },
        )
        .unwrap();
        assert_eq!(value, 200);
    }

    #[test]
    fn floors_fractional_loan_units_conservatively() {
        let value = collateral_value(
            1,
            0,
            0,
            OraclePrice {
                price: 1,
                expo: -1,
            },
        )
        .unwrap();
        assert_eq!(value, 0);
    }

    #[test]
    fn rejects_scale_overflow() {
        let result = collateral_value(
            u64::MAX,
            0,
            38,
            OraclePrice {
                price: u64::MAX,
                expo: 0,
            },
        );
        assert!(result.is_err());
    }

    #[test]
    fn liquidation_threshold_is_checked_in_basis_points() {
        assert!(!is_position_liquidatable(49, 100, 5_000).unwrap());
        assert!(is_position_liquidatable(50, 100, 5_000).unwrap());
    }

    #[test]
    fn zero_liquidation_threshold_is_rejected() {
        assert!(is_position_liquidatable(1, 1, 0).is_err());
    }
}

#[account]
pub struct BorrowPosition {
    pub vault: Pubkey,
    pub borrower: Pubkey,
    pub collateral_amount: u64,
    pub debt_amount: u64,
    pub repaid_amount: u64,
    pub bump: u8,
}

impl BorrowPosition {
    pub const SPACE: usize = 8 + (32 * 2) + (8 * 3) + 1;
}

#[account]
pub struct YieldPosition {
    pub vault: Pubkey,
    pub beneficiary: Pubkey,
    pub shares: u64,
    pub claimed_yield: u64,
    pub bump: u8,
}

impl YieldPosition {
    pub const SPACE: usize = 8 + (32 * 2) + (8 * 2) + 1;
}

#[event]
pub struct VaultInitialized {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub ai_agent: Pubkey,
    pub basket_id: u64,
    pub mint: Pubkey,
}

#[event]
pub struct RebalanceExecuted {
    pub vault: Pubkey,
    pub agent: Pubkey,
    pub destination: Pubkey,
    pub amount: u64,
    pub remaining_balance: u64,
}

#[event]
pub struct BorrowCreated {
    pub vault: Pubkey,
    pub borrower: Pubkey,
    pub collateral_amount: u64,
    pub debt_amount: u64,
}

#[event]
pub struct BorrowRepaid {
    pub vault: Pubkey,
    pub borrower: Pubkey,
    pub amount: u64,
    pub collateral_released: u64,
    pub remaining_debt: u64,
}

#[event]
pub struct LiquidationExecuted {
    pub vault: Pubkey,
    pub borrower: Pubkey,
    pub liquidator: Pubkey,
    pub repaid_amount: u64,
    pub collateral_released: u64,
    pub remaining_debt: u64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("The configured AI agent must be a non-default public key.")]
    InvalidAgent,
    #[msg("The maximum rebalance amount must be greater than zero.")]
    InvalidRebalanceLimit,
    #[msg("The minimum reserve cannot exceed the maximum rebalance amount.")]
    InvalidReserve,
    #[msg("The transaction signer is not the AI agent registered for this vault.")]
    UnauthorizedAgent,
    #[msg("The basket identifier does not match the vault.")]
    BasketMismatch,
    #[msg("The rebalance amount must be greater than zero.")]
    InvalidAmount,
    #[msg("The rebalance amount exceeds the configured per-transaction limit.")]
    RebalanceLimitExceeded,
    #[msg("The destination token account is not owned by the vault owner.")]
    InvalidDestinationOwner,
    #[msg("The vault token account does not contain enough tokens.")]
    InsufficientVaultBalance,
    #[msg("The rebalance would violate the configured reserve.")]
    ReserveViolation,
    #[msg("The vault token account is not controlled by the vault authority.")]
    InvalidVaultAuthority,
    #[msg("The user token account is not controlled by the depositing user.")]
    InvalidUserTokenOwner,
    #[msg("The token mint does not match the vault mint.")]
    MintMismatch,
    #[msg("This vault only accepts the Solana Token-2022 program.")]
    Token2022Required,
    #[msg("An arithmetic operation overflowed.")]
    ArithmeticOverflow,
    #[msg("The number of shares must be greater than zero.")]
    InvalidShares,
    #[msg("The vault has no shares.")]
    NoShares,
    #[msg("There is no yield available to claim.")]
    NothingToClaim,
    #[msg("The loan-to-value ratio must be between 0 and 10000 basis points.")]
    InvalidLtv,
    #[msg("Borrowing is disabled until the vault owner configures an LTV.")]
    BorrowingDisabled,
    #[msg("The borrowing position already has outstanding debt.")]
    OutstandingDebt,
    #[msg("The calculated debt is too small or invalid.")]
    InvalidDebt,
    #[msg("The repayment exceeds the outstanding debt.")]
    RepaymentExceedsDebt,
    #[msg("The oracle configuration is invalid.")]
    InvalidOracleConfig,
    #[msg("The configured oracle account is invalid.")]
    InvalidOracleAccount,
    #[msg("The oracle price is stale.")]
    StaleOraclePrice,
    #[msg("The oracle price is invalid.")]
    InvalidOraclePrice,
    #[msg("The oracle confidence interval is too wide.")]
    OracleConfidenceTooWide,
    #[msg("The liquidation bonus must be between 0 and 10000 basis points.")]
    InvalidLiquidationBonus,
    #[msg("The borrowing position is still healthy.")]
    PositionHealthy,
}
