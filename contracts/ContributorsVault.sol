//SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title TokenVesting
 */
contract ContributorsVault is Ownable {
  using SafeMath for uint256;

  event AllocationRegistered(
      address indexed beneficiary,
      uint256 amount,
      uint256 percentage
  );
  event TokensWithdrawal(address userAddress, uint256 amount);

  event RewardDeposit(uint256 amount);

  struct Allocation {
    uint256 amount;
    uint256 released;
    uint256 percentage;
    bool revoked;
  }

  // beneficiary of tokens after they are released
  mapping(address => Allocation) private _beneficiaryAllocations;

  // beneficiary that has been registered
  mapping(address => bool) private _isRegistered;

  // all beneficiary address1
  address[] private _allBeneficiary;

  // total deposit reward
  uint256 private _totalDepositReward = 0;

  // token in vault
  IERC20 private _token;

  constructor(
    IERC20 token_,
    address[] memory beneficiaries_,
    uint256[] memory amounts_,
    uint256[] memory percentage_ // divided by 10000
  )
    public
  {
    require(
      beneficiaries_.length == amounts_.length
      ,"Length of input arrays do not match."
    );

    require(
      amounts_.length == percentage_.length
      ,"Length of input arrays do not match."
    );


    // init beneficiaries
    for (uint256 i = 0; i < beneficiaries_.length; i++) {
            require(
                beneficiaries_[i] != address(0),
                "Beneficiary cannot be 0 address."
            );

            require(
                amounts_[i] > 0,
                "Cannot allocate zero amount."
            );

            // store all beneficiaries address
            _allBeneficiary.push(beneficiaries_[i]);

            // Add new allocation to beneficiaryAllocations
            _beneficiaryAllocations[beneficiaries_[i]] = Allocation(
                amounts_[i],
                0,
                percentage_[i],
                false
            );

            _isRegistered[beneficiaries_[i]] = true;

            emit AllocationRegistered(beneficiaries_[i], amounts_[i], percentage_[i]);
        }

    _token = token_;
  }

  /**
    * add adddress with allocation
    */
  function addAddressWithAllocation(address beneficiaryAddress, uint256 amount, uint256 percentage) public onlyOwner {
    require(
        beneficiaryAddress != address(0),
        "Beneficiary cannot be 0 address."
    );
    _isRegistered[beneficiaryAddress] = true;
    _beneficiaryAllocations[beneficiaryAddress] = Allocation(
      amount,
      0,
      percentage,
      false
    );
  }

  /**
    * revoke beneficiary
    */
  function revoke(address beneficiaryAddress) public onlyOwner {
      require(
        _isRegistered[beneficiaryAddress] = true,
        "revoke unregistered address"
      );

      _beneficiaryAllocations[beneficiaryAddress].revoked = true;
  }

  /**
    * revoke beneficiary
    */
  function deposit(uint256 rewardAmount) public{
      require(
        rewardAmount > 0,
        "deposit zero wasabi"
      );
      _totalDepositReward = _totalDepositReward + rewardAmount;

      _token.transferFrom(msg.sender, address(this), rewardAmount);

      emit RewardDeposit(rewardAmount);

  }

  /**
   * @return the registerd state.
   */
  function getRegisteredStatus(address userAddress) public view returns(bool) {
    return _isRegistered[userAddress];
  }

  /**
   * return user registerd vesting amount.
   */
  function getUserRegisterdAmount(address userAddress) public view returns (uint256 amount) {
    return _beneficiaryAllocations[userAddress].amount;
  }

  /**
   * return user claimed amount.
   */
  function getUserClaimedAmount(address userAddress) public view returns (uint256 amount) {
    return _beneficiaryAllocations[userAddress].released;
  }

  /**
   * return user amountAvailable (vested- released)
   */
  function getUserAvailableAmount(address userAddress) public view returns (uint256 amountAvailable) {

      // for revoked user, return 0;
      if(_beneficiaryAllocations[userAddress].revoked == true){
        return 0;
      }

      uint256 avalible = _getAllocatedAmount(userAddress).sub(_beneficiaryAllocations[userAddress].released);
      return avalible;
  }
  /**
   * return amountAllocated
   */
  function _getAllocatedAmount(address userAddress) internal view returns (uint256 amountAllocated) {

    uint256 allocated = 0;

    allocated = _totalDepositReward.mul(_beneficiaryAllocations[userAddress].percentage).div(10000);

    if(allocated >= _beneficiaryAllocations[userAddress].amount ){
      allocated = _beneficiaryAllocations[userAddress].amount;
    }

    return allocated;
  }


  /**
    withdraw function
   */
  function withdraw(uint256 withdrawAmount) public {

    address userAddress = msg.sender;

    require(
        _isRegistered[userAddress] == true,
        "You have to be a registered address in order to release tokens."
    );

    require(getUserAvailableAmount(userAddress) >= withdrawAmount,"insufficient avalible balance");

    _beneficiaryAllocations[userAddress].released = _beneficiaryAllocations[userAddress].released.add(withdrawAmount);

    _token.transfer(userAddress, withdrawAmount);

    emit TokensWithdrawal(userAddress, withdrawAmount);
  }

  // admin emergency to transfer token to owner
  function emergencyWithdraw(uint256 amount) public onlyOwner {

    _token.transfer(msg.sender, amount);

  }
}
