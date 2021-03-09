const WasabiToken = artifacts.require('WasabiToken.sol');
const StakedWasabi = artifacts.require('StakedWasabi.sol');
const MasterChef = artifacts.require('MasterChef.sol');
const ContributorsVault = artifacts.require('ContributorsVault.sol');
const TeamsVault = artifacts.require('TeamsVault.sol');

module.exports = async function (deployer) {
  await deployer.deploy(WasabiToken);
  let wsb = await WasabiToken.deployed();

  await deployer.deploy(StakedWasabi, wsb.address);
  let sWsb = await StakedWasabi.deployed();

  await deployer.deploy(ContributorsVault, wsb.address, [], [], []);
  let vault = await ContributorsVault.deployed();

  await deployer.deploy(TeamsVault, wsb.address, [], [], []);
  let dev = await TeamsVault.deployed();

  await deployer.deploy(MasterChef, wsb.address, sWsb.address, vault.address, dev.address, '60000000000000000000', 0);
  let masterChef = await MasterChef.deployed();

  await wsb.transferOwnership(masterChef.address);
  await sWsb.transferOwnership(masterChef.address);

  console.log('wsb:',wsb.address);
  console.log('sWsb:',sWsb.address);
  console.log('vault:', vault.address);
  console.log('dev:', dev.address);
  console.log('masterChef:',masterChef.address);
};