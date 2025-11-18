const hre = require("hardhat");

async function main() {
  const publicClient = await hre.viem.getPublicClient();
  const [deployer] = await hre.viem.getWalletClients();
  
  console.log("Deploying contracts with account:", deployer.account.address);
  
  const balance = await publicClient.getBalance({ address: deployer.account.address });
  console.log("Account balance:", balance.toString(), "wei");

  console.log("Deploying MusicCopyrightRegistry...");
  const contract = await hre.viem.deployContract("MusicCopyrightRegistry");

  console.log("✅ MusicCopyrightRegistry deployed to:", contract.address);
  console.log("📝 Update your frontend .env with:");
  console.log(`REACT_APP_CONTRACT_ADDRESS=${contract.address}`);
  console.log(`REACT_APP_SEPOLIA_RPC=${process.env.SEPOLIA_RPC_URL}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
