//SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import "./IContributorsVault.sol";
import "./ITeamsVault.sol";
import "./WasabiToken.sol";
import "./StakedWasabi.sol";

interface IMigratorChef {
    // Perform LP token migration from legacy PancakeSwap to CakeSwap.
    // Take the current LP token address and return the new LP token address.
    // Migrator should have full access to the caller's LP token.
    // Return the new LP token address.
    //
    // XXX Migrator must have allowance access to PancakeSwap LP tokens.
    // CakeSwap must mint EXACTLY the same amount of CakeSwap LP tokens or
    // else something bad will happen. Traditional PancakeSwap does not
    // do that so be careful!
    function migrate(IERC20 token) external returns (IERC20);
}

// MasterChef is the master of Wasabi. He can make Wasabi and he is a fair guy.
//
// Note that it's ownable and the owner wields tremendous power. The ownership
// will be transferred to a governance smart contract once WASABI is sufficiently
// distributed and the community can show to govern itself.
//
// Have fun reading it. Hopefully it's bug-free. God bless.
contract MasterChef is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // Info of each user.
    struct UserInfo {
        uint256 amount;     // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of WASABIs
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accWasabiPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accWasabiPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each pool.
    struct PoolInfo {
        IERC20 lpToken;           // Address of LP token contract.
        uint256 allocPoint;       // How many allocation points assigned to this pool. WASABIs to distribute per block.
        uint256 lastRewardBlock;  // Last block number that WASABIs distribution occurs.
        uint256 accWasabiPerShare; // Accumulated WASABIs per share, times 1e12. See below.
    }

    // The WASABI TOKEN!
    WasabiToken public wasabi;
    // The sWASABI TOKEN!
    StakedWasabi public sWasabi;
    address public vault;
    address public dev;
    uint256 public wasabiPerBlock;
    uint256 public lpRewardPercentage;
    uint256 public teamsRewardPercentage;
    uint256 public contributorsRewardPercentage;
    // Bonus muliplier for early wasabi makers.
    uint256 public BONUS_MULTIPLIER = 1;
    // The migrator contract. It has a lot of power. Can only be set through governance (owner).
    IMigratorChef public migrator;

    bool public bootstrappingValid = true;

    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Info of each user that stakes LP tokens.
    mapping (uint256 => mapping (address => UserInfo)) public userInfo;
    // Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;
    // The block number when WASABI mining starts.
    uint256 public startBlock;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);

    constructor(
        WasabiToken _wasabi,
        StakedWasabi _sWasabi,
        address _vault,
        address _dev,
        uint256 _wasabiPerBlock,
        uint256[] memory rewardPercentages, //[lp, teams, contributors]
        uint256 _startBlock
    ) public {
        wasabi = _wasabi;
        sWasabi = _sWasabi;
        vault = _vault;
        dev = _dev;
        wasabiPerBlock = _wasabiPerBlock;
        lpRewardPercentage = rewardPercentages[0];
        teamsRewardPercentage = rewardPercentages[1];
        contributorsRewardPercentage = rewardPercentages[2];
        startBlock = _startBlock;

        // staking pool
        poolInfo.push(PoolInfo({
            lpToken: _wasabi,
            allocPoint: 0,
            lastRewardBlock: startBlock,
            accWasabiPerShare: 0
        }));

        totalAllocPoint = 0;

        uint256 MAX_UINT256 = 2**256 - 1;
        wasabi.approve(vault, MAX_UINT256);
        wasabi.approve(dev, MAX_UINT256);
    }

    function updateWasabiPerBlock(uint256 _wasabiPerBlock) public onlyOwner {
        wasabiPerBlock = _wasabiPerBlock;
    }

    function updateRewardPercentage(uint256[] memory rewardPercentages) public onlyOwner {
        require(
            rewardPercentages.length == 3,
            "MasterChef: wrong length of the reward percentage array"
        );
            
        require(
            rewardPercentages[0].add(rewardPercentages[1]).add(rewardPercentages[2]) == 100, 
            "MasterChef: reward percentage not equals to 100"
        );

        lpRewardPercentage = rewardPercentages[0];
        teamsRewardPercentage = rewardPercentages[1];
        contributorsRewardPercentage = rewardPercentages[2];
    }

    function setBootstrappingValid(bool valid) public onlyOwner {
        bootstrappingValid = valid;
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    // Add a new lp to the pool. Can only be called by the owner.
    // XXX DO NOT add the same LP token more than once. Rewards will be messed up if you do.
    function add(uint256 _allocPoint, IERC20 _lpToken, bool _withUpdate) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        poolInfo.push(PoolInfo({
            lpToken: _lpToken,
            allocPoint: _allocPoint,
            lastRewardBlock: lastRewardBlock,
            accWasabiPerShare: 0
        }));
    }

    // Update the given pool's wasabi allocation point. Can only be called by the owner.
    function set(uint256 _pid, uint256 _allocPoint, bool _withUpdate) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 prevAllocPoint = poolInfo[_pid].allocPoint;
        poolInfo[_pid].allocPoint = _allocPoint;
        if (prevAllocPoint != _allocPoint) {
            totalAllocPoint = totalAllocPoint.sub(prevAllocPoint).add(_allocPoint);
        }
    }

    // Set the migrator contract. Can only be called by the owner.
    function setMigrator(IMigratorChef _migrator) public onlyOwner {
        migrator = _migrator;
    }

    // Migrate lp token to another lp contract. Can be called by anyone. We trust that migrator contract is good.
    function migrate(uint256 _pid) public {
        require(address(migrator) != address(0), "migrate: no migrator");
        PoolInfo storage pool = poolInfo[_pid];
        IERC20 lpToken = pool.lpToken;
        uint256 bal = lpToken.balanceOf(address(this));
        lpToken.safeApprove(address(migrator), bal);
        IERC20 newLpToken = migrator.migrate(lpToken);
        require(bal == newLpToken.balanceOf(address(this)), "migrate: bad");
        pool.lpToken = newLpToken;
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint256 _from, uint256 _to) public view returns (uint256) {
        return _to.sub(_from).mul(BONUS_MULTIPLIER);
    }

    // View function to see pending WASABIs on frontend.
    function pendingWasabi(uint256 _pid, address _user) external view returns (uint256) {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accWasabiPerShare = pool.accWasabiPerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
            uint256 lpWasabiPerBlock = wasabiPerBlock.mul(lpRewardPercentage).div(100);
            uint256 wasabiReward = multiplier.mul(lpWasabiPerBlock).mul(pool.allocPoint).div(totalAllocPoint);
            accWasabiPerShare = accWasabiPerShare.add(wasabiReward.mul(1e12).div(lpSupply));
        }
        return user.amount.mul(accWasabiPerShare).div(1e12).sub(user.rewardDebt);
    }

    // Update reward variables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0 || !bootstrappingValid) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint256 lpWasabiPerBlock = wasabiPerBlock.mul(lpRewardPercentage).div(100);
        uint256 lpWasabiReward = multiplier.mul(lpWasabiPerBlock).mul(pool.allocPoint).div(totalAllocPoint);
        if (lpWasabiReward > 0) {
            wasabi.mint(address(sWasabi), lpWasabiReward);
        }

        uint256 contributorsWasabiPerBlock = wasabiPerBlock.mul(contributorsRewardPercentage).div(100);
        uint256 vaultWasabiReward = multiplier.mul(contributorsWasabiPerBlock).mul(pool.allocPoint).div(totalAllocPoint);
        if (vaultWasabiReward > 0) {
            depositContributorsRewards(vaultWasabiReward);
        }

        uint256 teamsWasabiPerBlock = wasabiPerBlock.mul(teamsRewardPercentage).div(100);
        uint256 devWasabiReward = multiplier.mul(teamsWasabiPerBlock).mul(pool.allocPoint).div(totalAllocPoint);
        if (devWasabiReward > 0) {
            depositTeamsReward(devWasabiReward);
        }

        pool.accWasabiPerShare = pool.accWasabiPerShare.add(lpWasabiReward.mul(1e12).div(lpSupply));
        pool.lastRewardBlock = block.number;
    }

    // Allocate reward to vault
    function depositContributorsRewards(uint256 vaultReward) internal {
        wasabi.mint(address(this), vaultReward);
        IContributorsVault(vault).deposit(vaultReward);
    }

    // Allocate reward to dev
    function depositTeamsReward(uint256 devReward) internal {
        wasabi.mint(address(this), devReward);
        ITeamsVault(dev).deposit(devReward);
    }

    // Deposit LP tokens to MasterChef for WASABI allocation.
    function deposit(uint256 _pid, uint256 _amount) public {

        require (_pid != 0, 'deposit WASABI by staking');

        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        updatePool(_pid);
        if (user.amount > 0) {
            uint256 pending = user.amount.mul(pool.accWasabiPerShare).div(1e12).sub(user.rewardDebt);
            if(pending > 0) {
                safeWasabiTransfer(msg.sender, pending);
            }
        }
        if (_amount > 0) {
            pool.lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);
            user.amount = user.amount.add(_amount);
        }
        user.rewardDebt = user.amount.mul(pool.accWasabiPerShare).div(1e12);
        emit Deposit(msg.sender, _pid, _amount);
    }

    // Withdraw LP tokens from MasterChef.
    function withdraw(uint256 _pid, uint256 _amount) public {

        require (_pid != 0, 'withdraw WASABI by unstaking');
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, "withdraw: not good");

        updatePool(_pid);
        uint256 pending = user.amount.mul(pool.accWasabiPerShare).div(1e12).sub(user.rewardDebt);
        if(pending > 0) {
            safeWasabiTransfer(msg.sender, pending);
        }
        if(_amount > 0) {
            user.amount = user.amount.sub(_amount);
            pool.lpToken.safeTransfer(address(msg.sender), _amount);
        }
        user.rewardDebt = user.amount.mul(pool.accWasabiPerShare).div(1e12);
        emit Withdraw(msg.sender, _pid, _amount);
    }

    // Stake WASABI tokens to MasterChef
    function enterStaking(uint256 _amount) public {
        PoolInfo storage pool = poolInfo[0];
        UserInfo storage user = userInfo[0][msg.sender];
        updatePool(0);
        if (user.amount > 0) {
            uint256 pending = user.amount.mul(pool.accWasabiPerShare).div(1e12).sub(user.rewardDebt);
            if(pending > 0) {
                safeWasabiTransfer(msg.sender, pending);
            }
        }
        if(_amount > 0) {
            pool.lpToken.safeTransferFrom(address(msg.sender), address(this), _amount);
            user.amount = user.amount.add(_amount);
        }
        user.rewardDebt = user.amount.mul(pool.accWasabiPerShare).div(1e12);

        sWasabi.mint(msg.sender, _amount);
        emit Deposit(msg.sender, 0, _amount);
    }

    // Withdraw WASABI tokens from STAKING.
    function leaveStaking(uint256 _amount) public {
        PoolInfo storage pool = poolInfo[0];
        UserInfo storage user = userInfo[0][msg.sender];
        require(user.amount >= _amount, "withdraw: not good");
        updatePool(0);
        uint256 pending = user.amount.mul(pool.accWasabiPerShare).div(1e12).sub(user.rewardDebt);
        if(pending > 0) {
            safeWasabiTransfer(msg.sender, pending);
        }
        if(_amount > 0) {
            user.amount = user.amount.sub(_amount);
            pool.lpToken.safeTransfer(address(msg.sender), _amount);
        }
        user.rewardDebt = user.amount.mul(pool.accWasabiPerShare).div(1e12);

        sWasabi.burn(msg.sender, _amount);
        emit Withdraw(msg.sender, 0, _amount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        pool.lpToken.safeTransfer(address(msg.sender), user.amount);
        emit EmergencyWithdraw(msg.sender, _pid, user.amount);
        user.amount = 0;
        user.rewardDebt = 0;
    }

    // Safe WASABI transfer function, just in case if rounding error causes pool to not have enough WASABIs.
    function safeWasabiTransfer(address _to, uint256 _amount) internal {
        sWasabi.safeWasabiTransfer(_to, _amount);
    }

    function updateVaultAddress(address _vault) public onlyOwner{
        vault = _vault;
    }

    function updateDevAddress(address _dev) public onlyOwner {
        dev = _dev;
    }
}
