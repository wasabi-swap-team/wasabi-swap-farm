const { assert } = require("chai");

const WasabiToken = artifacts.require('WasabiToken');

contract('WasabiToken', ([alice, bob, carol, dev, minter]) => {
    beforeEach(async () => {
        this.wasabi = await WasabiToken.new({ from: minter });
    });


    it('mint', async () => {
        await this.wasabi.mint(alice, 1000, { from: minter });
        assert.equal((await this.wasabi.balanceOf(alice)).toString(), '1000');
    })
});
