const { advanceBlockTo } = require('@openzeppelin/test-helpers/src/time');
const { assert } = require('chai');
const WasabiToken = artifacts.require('WasabiToken');
const StakedWasabi = artifacts.require('StakedWasabi');

contract('StakedWasabi', ([alice, bob, carol, dev, minter]) => {
  beforeEach(async () => {
    this.wasabi = await WasabiToken.new({ from: minter });
    this.sWasabi = await StakedWasabi.new(this.wasabi.address, { from: minter });
  });

  it('mint', async () => {
    await this.sWasabi.mint(alice, 1000, { from: minter });
    assert.equal((await this.sWasabi.balanceOf(alice)).toString(), '1000');
  });

  it('burn', async () => {
    await advanceBlockTo('650');
    await this.sWasabi.mint(alice, 1000, { from: minter });
    await this.sWasabi.mint(bob, 1000, { from: minter });
    assert.equal((await this.sWasabi.totalSupply()).toString(), '2000');
    await this.sWasabi.burn(alice, 200, { from: minter });

    assert.equal((await this.sWasabi.balanceOf(alice)).toString(), '800');
    assert.equal((await this.sWasabi.totalSupply()).toString(), '1800');
  });

  it('safeWasabiTransfer', async () => {
    assert.equal(
      (await this.wasabi.balanceOf(this.sWasabi.address)).toString(),
      '0'
    );
    await this.wasabi.mint(this.sWasabi.address, 1000, { from: minter });
    await this.sWasabi.safeWasabiTransfer(bob, 200, { from: minter });
    assert.equal((await this.wasabi.balanceOf(bob)).toString(), '200');
    assert.equal(
      (await this.wasabi.balanceOf(this.sWasabi.address)).toString(),
      '800'
    );
    await this.sWasabi.safeWasabiTransfer(bob, 2000, { from: minter });
    assert.equal((await this.wasabi.balanceOf(bob)).toString(), '1000');
  });
});
