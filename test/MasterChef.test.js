const { expectRevert, time } = require('@openzeppelin/test-helpers');
const WasabiToken = artifacts.require('WasabiToken');
const StakedWasabi = artifacts.require('StakedWasabi');
const MasterChef = artifacts.require('MasterChef');
const ContributorsVault = artifacts.require('ContributorsVault');
const TeamsVault = artifacts.require('TeamsVault');

const MockERC20 = artifacts.require('libs/MockERC20');

contract('MasterChef', ([alice, bob, dev1, dev2, minter]) => {
    beforeEach(async () => {
        this.wasabi = await WasabiToken.new({ from: minter });
        this.sWasabi = await StakedWasabi.new(this.wasabi.address, { from: minter });
        this.vault = await ContributorsVault.new(this.wasabi.address,
                                            [alice, bob],
                                            [1200,2400],
                                            [1000,2000],
                                            { from: minter }
                                          );
        this.dev = await TeamsVault.new(this.wasabi.address,
                                         [dev1, dev2],[1000, 1000],[5000, 5000], { from: minter });
        this.lp1 = await MockERC20.new('LPToken', 'LP1', '1000000', { from: minter });
        this.lp2 = await MockERC20.new('LPToken', 'LP2', '1000000', { from: minter });
        this.lp3 = await MockERC20.new('LPToken', 'LP3', '1000000', { from: minter });
        this.chef = await MasterChef.new(this.wasabi.address, this.sWasabi.address, this.vault.address, this.dev.address, '1177', [85, 10, 5], '100', { from: minter });
        await this.wasabi.transferOwnership(this.chef.address, { from: minter });
        await this.sWasabi.transferOwnership(this.chef.address, { from: minter });

        await this.lp1.transfer(bob, '2000', { from: minter });
        await this.lp2.transfer(bob, '2000', { from: minter });
        await this.lp3.transfer(bob, '2000', { from: minter });

        await this.lp1.transfer(alice, '2000', { from: minter });
        await this.lp2.transfer(alice, '2000', { from: minter });
        await this.lp3.transfer(alice, '2000', { from: minter });
    });

    it('real case', async () => {
      await this.chef.add('2000', this.lp1.address, true, { from: minter });
      await this.chef.add('1000', this.lp2.address, true, { from: minter });
      await this.chef.add('500', this.lp3.address, true, { from: minter });
      assert.equal((await this.chef.poolLength()).toString(), "4");

      await time.advanceBlockTo('170');
      await this.lp1.approve(this.chef.address, '1000', { from: alice });
      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '0');
      await this.chef.deposit(1, '20', { from: alice });
      await this.chef.withdraw(1, '20', { from: alice });
      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '571'); //2000/3500*1000

      await this.wasabi.approve(this.chef.address, '1000', { from: alice });
      await this.chef.enterStaking('20', { from: alice });
      await this.chef.enterStaking('0', { from: alice });
      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '551');
    });

    it('deposit/withdraw', async () => {
      await this.chef.add('1000', this.lp1.address, true, { from: minter });
      await this.chef.add('1000', this.lp2.address, true, { from: minter });

      await this.lp1.approve(this.chef.address, '100', { from: alice });
      await this.chef.deposit(1, '10', { from: alice });
      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '0');
      await this.chef.deposit(1, '0', { from: alice });
      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '500');
      await this.chef.deposit(1, '10', { from: alice });
      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '1000');
      await this.chef.deposit(1, '0', { from: alice });
      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '1500');

      assert.equal((await this.lp1.balanceOf(alice)).toString(), '1980');
      await this.chef.withdraw(1, '10', { from: alice });
      assert.equal((await this.lp1.balanceOf(alice)).toString(), '1990');
      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '2000');
      assert.equal((await this.wasabi.balanceOf(this.vault.address)).toString(), '116');
      assert.equal((await this.wasabi.balanceOf(this.dev.address)).toString(), '232');

      await this.lp1.approve(this.chef.address, '100', { from: bob });
      assert.equal((await this.lp1.balanceOf(bob)).toString(), '2000');
      await this.chef.deposit(1, '30', { from: bob });
      assert.equal((await this.lp1.balanceOf(bob)).toString(), '1970');
      await this.chef.deposit(1, '0', { from: bob });
      assert.equal((await this.wasabi.balanceOf(bob)).toString(), '375');
      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '2000');
      await this.chef.emergencyWithdraw(1, { from: bob });
      assert.equal((await this.lp1.balanceOf(bob)).toString(), '2000');
    })

    it('staking/unstaking', async () => {
      await this.chef.add('1000', this.lp1.address, true, { from: minter });
      await this.chef.add('1000', this.lp2.address, true, { from: minter });

      await this.lp1.approve(this.chef.address, '10', { from: alice });
      await this.chef.deposit(1, '2', { from: alice }); //0
      await this.chef.withdraw(1, '2', { from: alice }); //1
      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '500');

      await this.wasabi.approve(this.chef.address, '250', { from: alice });
      await this.chef.enterStaking('240', { from: alice }); //3
      assert.equal((await this.sWasabi.balanceOf(alice)).toString(), '240');
      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '260');
      await this.chef.enterStaking('10', { from: alice }); //4
      assert.equal((await this.sWasabi.balanceOf(alice)).toString(), '250');
      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '250');
      await this.chef.leaveStaking(250);
      assert.equal((await this.sWasabi.balanceOf(alice)).toString(), '0');
      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '500');
    });


    it('update reward per block', async () => {
      await this.chef.add('1000', this.lp1.address, true, { from: minter });
      await this.chef.add('1000', this.lp2.address, true, { from: minter });

      await this.lp1.approve(this.chef.address, '100', { from: alice });
      await this.lp1.approve(this.chef.address, '100', { from: bob });
      await this.chef.deposit(1, '100', { from: alice });
      await this.chef.deposit(1, '100', { from: bob });
      await this.chef.deposit(1, '0', { from: alice });
      await this.chef.deposit(1, '0', { from: bob });

      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '750');
      assert.equal((await this.chef.pendingWasabi(1, alice)).toString(), '250');
      assert.equal((await this.wasabi.balanceOf(bob)).toString(), '500');
      assert.equal((await this.chef.pendingWasabi(1, bob)).toString(), '0');

      await this.chef.updateWasabiPerBlock('0', { from: minter });

      await this.chef.deposit(1, '0', { from: alice });
      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '1000');
      await this.chef.deposit(1, '0', { from: bob });
      assert.equal((await this.wasabi.balanceOf(bob)).toString(), '500');

      await this.lp1.approve(this.chef.address, '100', { from: alice });
      await this.lp1.approve(this.chef.address, '100', { from: bob });
      await this.chef.deposit(1, '100', { from: alice });
      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '1000');
      assert.equal((await this.chef.pendingWasabi(1, alice)).toString(), '0');
      assert.equal((await this.wasabi.balanceOf(bob)).toString(), '500');
      assert.equal((await this.chef.pendingWasabi(1, bob)).toString(), '0');

      await this.chef.deposit(1, '50', { from: bob });
      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '1000');
      assert.equal((await this.chef.pendingWasabi(1, alice)).toString(), '0');
      assert.equal((await this.wasabi.balanceOf(bob)).toString(), '500');
      assert.equal((await this.chef.pendingWasabi(1, bob)).toString(), '0');

      await this.chef.updateWasabiPerBlock('2000', { from: minter });
      assert.equal((await this.chef.pendingWasabi(1, alice)).toString(), '485');
      assert.equal((await this.chef.pendingWasabi(1, bob)).toString(), '364');

      await this.chef.deposit(1, '0', { from: alice });
      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '1971');
      assert.equal((await this.chef.pendingWasabi(1, alice)).toString(), '0');
      assert.equal((await this.wasabi.balanceOf(bob)).toString(), '500');
      assert.equal((await this.chef.pendingWasabi(1, bob)).toString(), '728');
    });

    it('update reward percentage', async () => {

      await expectRevert(this.chef.updateRewardPercentage([], { from: bob }), 'Ownable: caller is not the owner');
      await expectRevert(this.chef.updateRewardPercentage([], { from: minter }), 'MasterChef: wrong length of the reward percentage array');
      await expectRevert(this.chef.updateRewardPercentage([100,10,10], { from: minter }), 'MasterChef: reward percentage not equals to 100');

      await this.chef.updateRewardPercentage([80, 10, 10], { from: minter });
      await this.chef.add('1000', this.lp1.address, true, { from: minter });
      await this.chef.add('1000', this.lp2.address, true, { from: minter });

      await this.lp1.approve(this.chef.address, '100', { from: alice });
      await this.lp1.approve(this.chef.address, '100', { from: bob });
      await this.chef.deposit(1, '100', { from: alice });
      await this.chef.deposit(1, '100', { from: bob });
      await this.chef.deposit(1, '0', { from: alice });
      await this.chef.deposit(1, '0', { from: bob });

      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '705');
      assert.equal((await this.wasabi.balanceOf(bob)).toString(), '470');
      assert.equal((await this.wasabi.balanceOf(this.vault.address)).toString(), '174');
      assert.equal((await this.wasabi.balanceOf(this.dev.address)).toString(), '174');
    });

    it('should allow owner and only owner to update vault', async () => {
        assert.equal((await this.chef.vault()).valueOf(), this.vault.address);
        await expectRevert(this.chef.updateVaultAddress(bob, { from: bob }), 'Ownable: caller is not the owner');
        await this.chef.updateVaultAddress(bob, { from: minter });
        assert.equal((await this.chef.vault()).valueOf(), bob);
    });

    it('is not valid', async () => {
      await this.chef.add('1000', this.lp1.address, true, { from: minter });
      await this.chef.add('1000', this.lp2.address, true, { from: minter });

      await this.lp1.approve(this.chef.address, '100', { from: alice });
      await this.chef.deposit(1, '10', { from: alice });
      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '0');
      await this.chef.deposit(1, '0', { from: alice });
      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '500');
      await this.chef.deposit(1, '10', { from: alice });
      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '1000');
      await this.chef.deposit(1, '0', { from: alice });
      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '1500');

      await this.chef.setBootstrappingValid(false,{from:minter});
      await this.chef.deposit(1, '0', { from: alice });
      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '1500');
      await this.chef.deposit(1, '0', { from: alice });
      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '1500');
    });
});
