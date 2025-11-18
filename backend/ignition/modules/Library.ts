import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const MusicModule = buildModule("MusicModule", (m) => {
  const music = m.contract("MusicCopyrightRegistry", []);

  return { music };
});

export default MusicModule;
