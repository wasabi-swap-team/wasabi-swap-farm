const { assert } = require("chai");
const { expectRevert, time } = require('@openzeppelin/test-helpers');

const WasabiToken = artifacts.require('WasabiToken');
const ContributorsVault = artifacts.require('ContributorsVault');

contract('ContributorsVault', ([alice, bob, carol, admin]) => {
    beforeEach(async () => {
        this.wasabi = await WasabiToken.new({ from: admin });
        this.vault = await ContributorsVault.new( this.wasabi.address,
                                                [alice, bob],
                                                [1200,2400],
                                                [1000,2000],
                                                { from: admin }
                                              );
        await this.wasabi.mint(admin, 10000000000, { from: admin });
        await this.wasabi.approve(this.vault.address, 10000000000, { from: admin });
    });

    it("vault should have zero token before deposit", async ()=> {
      assert.equal((await this.wasabi.balanceOf(this.vault.address)).toString(), '0');
    });

    it("has zero vested", async() => {
      assert.equal((await this.vault.getUserAvailableAmount(alice)).toString(), '0');
      assert.equal((await this.vault.getUserAvailableAmount(bob)).toString(), '0');
    })

    it("single deposit", async() => {

      await this.vault.deposit(100,{from:admin});
      assert.equal((await this.vault.getUserAvailableAmount(alice)).toString(), '10');
      assert.equal((await this.vault.getUserAvailableAmount(bob)).toString(), '20');
      assert.equal((await this.wasabi.balanceOf(this.vault.address)).toString(), '100');
    })

    it("multiple deposit", async() => {

      await this.vault.deposit(100,{from:admin});
      await this.vault.deposit(200,{from:admin});
      await this.vault.deposit(300,{from:admin});
      assert.equal((await this.vault.getUserAvailableAmount(alice)).toString(), '60');
      assert.equal((await this.vault.getUserAvailableAmount(bob)).toString(), '120');
      assert.equal((await this.wasabi.balanceOf(this.vault.address)).toString(), '600');
    })

    it("has 30 available after after withdraw", async() => {

      await this.vault.deposit(100,{from:admin});
      assert.equal((await this.vault.getUserAvailableAmount(alice)).toString(), '10');

      await this.vault.withdraw(3, { from: alice });

      assert.equal((await this.vault.getUserAvailableAmount(alice)).toString(), '7');
      assert.equal((await this.wasabi.balanceOf(alice)).toString(), '3');

    })

    it("will fail for insufficient balance", async() => {

      await this.vault.deposit(100,{from:admin});
      assert.equal((await this.vault.getUserAvailableAmount(alice)).toString(), '10');

      await expectRevert(
          this.vault.withdraw(80, { from: alice }),
          'insufficient avalible balance',
      );

    })


    it("has right availableBalance after withdraw + new vested", async() => {

      await this.vault.deposit(100,{from:admin});
      assert.equal((await this.vault.getUserAvailableAmount(alice)).toString(), '10');
      await this.vault.withdraw(6, { from: alice });

      await this.vault.deposit(100,{from:admin});

      assert.equal((await this.vault.getUserAvailableAmount(alice)).toString(), '14');

    })

    it("allocated over registerd", async () => {
      await this.vault.deposit(100,{from:admin});
      assert.equal((await this.vault.getUserAvailableAmount(bob)).toString(), '20');
      await this.vault.deposit(1000000,{from:admin});
      assert.equal((await this.vault.getUserAvailableAmount(bob)).toString(), '2400');
    })

    it("address 3 is not registered", async () => {
      assert.equal((await this.vault.getRegisteredStatus(carol)).valueOf(),false);
    })

    it("others can not add allocation", async () => {
      await expectRevert(
          this.vault.addAddressWithAllocation(carol,"1500","3000",{ from: alice }),
          'Ownable: caller is not the owner',
      );
    })



    it("address 3 should be registered with right amount", async () => {
      // add allocation for address2
      await this.vault.addAddressWithAllocation(carol,"4800","3000",{ from: admin }),

      assert.equal((await this.vault.getRegisteredStatus(carol)).valueOf(),true);
      assert.equal((await this.vault.getUserRegisterdAmount(carol)).toString(), '4800');
    })

    it("add address3 deposit 1000 reward", async () => {
      await this.vault.deposit(1000,{from:admin});
      // add allocation for address3
      await this.vault.addAddressWithAllocation(carol,"4800","3000",{ from: admin }),

      assert.equal((await this.vault.getUserRegisterdAmount(carol)).toString(), '4800');
      assert.equal((await this.vault.getUserAvailableAmount(carol)).toString(), '300');

      await this.vault.withdraw(10, { from: carol });
      await this.vault.withdraw(30, { from: carol });

      assert.equal((await this.vault.getUserAvailableAmount(carol)).toString(), '260');

      await this.vault.deposit(100,{from:admin});
      assert.equal((await this.vault.getUserAvailableAmount(carol)).toString(), '290');
      await this.vault.withdraw(290, { from: carol });
      assert.equal((await this.vault.getUserAvailableAmount(carol)).toString(), '0');
    })

    it("revoke address2", async () => {
      await this.vault.deposit(1000,{from:admin});

      assert.equal((await this.vault.getUserAvailableAmount(bob)).toString(), '200');

      // only owner can revoke
      await expectRevert(
          this.vault.revoke(bob,{ from: alice }),
          'Ownable: caller is not the owner',
      );

      await this.vault.revoke(bob,{ from: admin });

      // withdraw after revoke
      await expectRevert(
          this.vault.withdraw(1, { from: bob }),
          'insufficient avalible balance',
      );

      assert.equal((await this.vault.getUserAvailableAmount(bob)).toString(), '0');
    })

    it("emergency withdraw", async () => {

      assert.equal((await this.wasabi.balanceOf(this.vault.address)).toString(), '0');

      await this.vault.deposit(10000000000,{from:admin});
      // only owner can revoke
      await expectRevert(
          this.vault.emergencyWithdraw(400,{ from: alice }),
          'Ownable: caller is not the owner',
      );

      await this.vault.emergencyWithdraw(4000000000,{ from: admin });

      assert.equal((await this.wasabi.balanceOf(admin)).toString(), '4000000000');
      assert.equal((await this.wasabi.balanceOf(this.vault.address)).toString(), '6000000000');

    })


});
