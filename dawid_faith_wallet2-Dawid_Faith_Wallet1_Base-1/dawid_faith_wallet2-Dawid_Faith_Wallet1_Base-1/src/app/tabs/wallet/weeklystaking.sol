// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract WeeklyTokenStaking is ReentrancyGuard, Pausable {
    IERC20 public stakingToken;   // 0 Decimals
    IERC20 public rewardToken;    // 2 Decimals

    uint256 public constant WEEK = 7 days;
    uint256 public constant SECONDS_PER_WEEK = 604800; // 7 * 24 * 60 * 60
    uint256 public constant MIN_CLAIM_AMOUNT = 1; // 0.01 Token with 2 decimals
    uint256 public totalStakedTokens;
    uint256 public userCount;
    uint256 public totalRewardsDistributed;

    struct StakeInfo {
        uint256 amount;
        uint256 lastRewardUpdate;
        uint256 stakeTimestamp;
        uint256 accumulatedRewards;
    }

    struct RewardStage {
        uint256 maxTotalDistributed;
        uint256 rewardRate; // Rate pro Woche in Prozent
    }

    RewardStage[] public stages;
    mapping(address => StakeInfo) public stakers;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 reward);
    event RewardTokensReceived(address indexed sender, uint256 amount);

    constructor(address _stakingToken, address _rewardToken) {
        require(_stakingToken != address(0), "Invalid staking token");
        require(_rewardToken != address(0), "Invalid reward token");
        require(_stakingToken != _rewardToken, "Tokens must be different");

        stakingToken = IERC20(_stakingToken);
        rewardToken = IERC20(_rewardToken);

        stages.push(RewardStage(10_000 ether, 10)); // 0.1
        stages.push(RewardStage(20_000 ether, 5));  // 0.05
        stages.push(RewardStage(40_000 ether, 3));  // 0.03
        stages.push(RewardStage(60_000 ether, 2));  // 0.02
        stages.push(RewardStage(80_000 ether, 1));  // 0.01
        stages.push(RewardStage(type(uint256).max, 1)); // stays at 0.01
    }

    function _getCurrentRewardRate() public view returns (uint256) {
        for (uint i = 0; i < stages.length; i++) {
            if (totalRewardsDistributed < stages[i].maxTotalDistributed) {
                return stages[i].rewardRate;
            }
        }
        // Wenn alle Stufen erreicht sind, verwende die letzte Rate (1%)
        return stages[stages.length - 1].rewardRate;
    }

    function getCurrentStage() public view returns (uint8) {
        for (uint8 i = 0; i < stages.length; i++) {
            if (totalRewardsDistributed < stages[i].maxTotalDistributed) {
                return i + 1;
            }
        }
        return uint8(stages.length);
    }

    function _updateRewards(address _user) internal {
        StakeInfo storage user = stakers[_user];
        if (user.amount == 0 || user.lastRewardUpdate == 0) {
            return;
        }

        uint256 timeElapsed = block.timestamp - user.lastRewardUpdate;
        if (timeElapsed > 0) {
            uint256 rewardRate = _getCurrentRewardRate();
            // Berechne Reward pro Sekunde: (amount * rate / 100) / SECONDS_PER_WEEK
            uint256 rewardPerSecond = (user.amount * rewardRate) / (100 * SECONDS_PER_WEEK);
            uint256 newRewards = rewardPerSecond * timeElapsed;
            
            user.accumulatedRewards += newRewards;
            user.lastRewardUpdate = block.timestamp;
        }
    }

    function stake(uint256 _amount) external whenNotPaused nonReentrant {
        require(_amount > 0, "Amount must be > 0");
        require(stakingToken.transferFrom(msg.sender, address(this), _amount), "Transfer failed");

        StakeInfo storage user = stakers[msg.sender];

        // Update rewards before changing stake amount
        _updateRewards(msg.sender);

        if (user.amount == 0) {
            userCount += 1;
            user.stakeTimestamp = block.timestamp;
            user.lastRewardUpdate = block.timestamp;
        }

        user.amount += _amount;
        totalStakedTokens += _amount;

        emit Staked(msg.sender, _amount);
    }

    function unstake() external nonReentrant {
        StakeInfo storage user = stakers[msg.sender];
        require(user.amount > 0, "No tokens to unstake");
        require(block.timestamp >= user.stakeTimestamp + WEEK, "Minimum staking period of 7 days not met");

        // Update and claim all rewards first
        _updateRewards(msg.sender);
        if (user.accumulatedRewards > 0) {
            _claimAccumulatedRewards(msg.sender);
        }

        uint256 amountToUnstake = user.amount;
        user.amount = 0;
        user.lastRewardUpdate = 0;
        user.stakeTimestamp = 0;
        user.accumulatedRewards = 0;

        totalStakedTokens -= amountToUnstake;
        userCount--;

        require(stakingToken.transfer(msg.sender, amountToUnstake), "Unstake transfer failed");

        emit Unstaked(msg.sender, amountToUnstake);
    }

    // Partielles Unstaking
    function unstakePartial(uint256 amount) external nonReentrant {
        StakeInfo storage user = stakers[msg.sender];
        require(amount > 0, "Amount must be > 0");
        require(user.amount >= amount, "Not enough tokens staked");
        require(block.timestamp >= user.stakeTimestamp + WEEK, "Minimum staking period of 7 days not met");

        // Update and claim all rewards first
        _updateRewards(msg.sender);
        if (user.accumulatedRewards > 0) {
            _claimAccumulatedRewards(msg.sender);
        }

        user.amount -= amount;
        totalStakedTokens -= amount;

        // Wenn alles unstaked, setze Felder zurück und dekrementiere userCount
        if (user.amount == 0) {
            user.lastRewardUpdate = 0;
            user.stakeTimestamp = 0;
            user.accumulatedRewards = 0;
            userCount--;
        } else {
            user.lastRewardUpdate = block.timestamp;
        }

        require(stakingToken.transfer(msg.sender, amount), "Unstake transfer failed");

        emit Unstaked(msg.sender, amount);
    }

    function claimReward() public nonReentrant whenNotPaused {
        StakeInfo storage user = stakers[msg.sender];
        require(user.amount > 0, "Nothing staked");

        // Update rewards bis zum aktuellen Zeitpunkt
        _updateRewards(msg.sender);

        // Check if minimum claimable amount is reached
        require(user.accumulatedRewards >= MIN_CLAIM_AMOUNT, "Minimum claimable amount not reached (0.01 tokens)");

        // Claim accumulated rewards
        _claimAccumulatedRewards(msg.sender);
    }

    function _claimAccumulatedRewards(address _user) internal {
        StakeInfo storage user = stakers[_user];
        uint256 reward = user.accumulatedRewards;

        if (reward > 0) {
            require(rewardToken.balanceOf(address(this)) >= reward, "Insufficient reward tokens");
            
            user.accumulatedRewards = 0;
            totalRewardsDistributed += reward;
            
            require(rewardToken.transfer(_user, reward), "Reward transfer failed");
            emit RewardClaimed(_user, reward);
        }
    }

    function notifyRewardDeposit() external {
        uint256 currentBalance = rewardToken.balanceOf(address(this));
        emit RewardTokensReceived(msg.sender, currentBalance);
    }

    function getClaimableReward(address _user) external view returns (uint256) {
        StakeInfo storage user = stakers[_user];
        if (user.amount == 0 || user.lastRewardUpdate == 0) {
            return user.accumulatedRewards;
        }
        
        uint256 timeElapsed = block.timestamp - user.lastRewardUpdate;
        uint256 rewardRate = _getCurrentRewardRate();
        uint256 rewardPerSecond = (user.amount * rewardRate) / (100 * SECONDS_PER_WEEK);
        uint256 pendingRewards = rewardPerSecond * timeElapsed;
        
        return user.accumulatedRewards + pendingRewards;
    }

    function getUserStakeInfo(address _user) external view returns (
        uint256 stakedAmount,
        uint256 claimableReward,
        uint256 stakeTimestamp,
        uint256 timeUntilUnstake,
        bool canUnstake,
        uint256 timeUntilNextClaim,
        bool canClaim
    ) {
        StakeInfo storage user = stakers[_user];
        stakedAmount = user.amount;
        claimableReward = this.getClaimableReward(_user);
        stakeTimestamp = user.stakeTimestamp;
        
        // Unstake info
        if (user.stakeTimestamp > 0) {
            uint256 unlockTime = user.stakeTimestamp + WEEK;
            if (block.timestamp >= unlockTime) {
                timeUntilUnstake = 0;
                canUnstake = true;
            } else {
                timeUntilUnstake = unlockTime - block.timestamp;
                canUnstake = false;
            }
        } else {
            timeUntilUnstake = 0;
            canUnstake = false;
        }
        
        // Claim info
        if (claimableReward >= MIN_CLAIM_AMOUNT) {
            timeUntilNextClaim = 0;
            canClaim = true;
        } else if (user.amount > 0 && user.lastRewardUpdate > 0) {
            // Berechne Zeit bis MIN_CLAIM_AMOUNT erreicht wird
            uint256 rewardRate = _getCurrentRewardRate();
            uint256 rewardPerSecond = (user.amount * rewardRate) / (100 * SECONDS_PER_WEEK);
            if (rewardPerSecond > 0) {
                uint256 remainingRewards = MIN_CLAIM_AMOUNT - claimableReward;
                timeUntilNextClaim = remainingRewards / rewardPerSecond;
            } else {
                timeUntilNextClaim = type(uint256).max; // Praktisch unendlich wenn Rate 0
            }
            canClaim = false;
        } else {
            timeUntilNextClaim = 0;
            canClaim = false;
        }
    }

    function getStakingStatus() external view returns (
        uint8 currentStage,
        uint256 currentRewardRate,
        uint256 totalDistributed
    ) {
        currentRewardRate = _getCurrentRewardRate();
        totalDistributed = totalRewardsDistributed;
        currentStage = getCurrentStage();
    }

    function getRewardTokenBalance() external view returns (uint256) {
        return rewardToken.balanceOf(address(this));
    }
    
    function getContractInfo() external view returns (
        uint256 totalStaked,
        uint256 totalUsers,
        uint256 rewardBalance,
        uint8 currentStage,
        uint256 currentRate
    ) {
        totalStaked = totalStakedTokens;
        totalUsers = userCount;
        rewardBalance = rewardToken.balanceOf(address(this));
        currentStage = getCurrentStage();
        currentRate = _getCurrentRewardRate();
    }

    // Emergency function to update rewards for a user (can be called by anyone)
    function updateUserRewards(address _user) external {
        _updateRewards(_user);
    }

    // Get current reward rate per second for a given amount
    function getRewardPerSecond(uint256 _amount) external view returns (uint256) {
        uint256 rewardRate = _getCurrentRewardRate();
        return (_amount * rewardRate) / (100 * SECONDS_PER_WEEK);
    }

    // Calculate time needed to reach minimum claimable amount for a given stake
    function getTimeToMinClaim(uint256 _stakedAmount) external view returns (uint256) {
        if (_stakedAmount == 0) return type(uint256).max;
        
        uint256 rewardRate = _getCurrentRewardRate();
        uint256 rewardPerSecond = (_stakedAmount * rewardRate) / (100 * SECONDS_PER_WEEK);
        
        if (rewardPerSecond == 0) return type(uint256).max;
        // Neue Formel: erst multiplizieren, dann dividieren, um Integer-Division zu vermeiden
        return (MIN_CLAIM_AMOUNT * 100 * SECONDS_PER_WEEK) / (_stakedAmount * rewardRate);
    }

    // Get minimum claim amount (for UI display)
    function getMinClaimAmount() external pure returns (uint256) {
        return MIN_CLAIM_AMOUNT;
    }
}
