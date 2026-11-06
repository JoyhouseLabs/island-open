// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.30;

import {DeploymentVm} from "./DeployResidents.s.sol";
import {ResidentAccount} from "../src/ResidentAccount.sol";
import {ResidentNFT} from "../src/ResidentNFT.sol";
import {Registry} from "../src/Registry.sol";

/// @notice Explicit BSC mainnet entry point. Simulation is the default; --broadcast sends transactions.
/// A separate script keeps the existing testnet entry point pinned to chain 97.
contract DeployResidentsMainnet {
    DeploymentVm constant vm =
        DeploymentVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run(address administrator)
        external
        returns (ResidentAccount implementation, ResidentNFT collection)
    {
        require(block.chainid == 56, "Only BSC mainnet (56) is supported by this deployment script");
        require(
            Registry.ADDRESS.codehash == Registry.CODE_HASH, "Canonical registry missing/mismatched"
        );
        require(administrator != address(0), "Administrator required");
        vm.startBroadcast();
        implementation = new ResidentAccount();
        collection = new ResidentNFT(administrator, address(implementation));
        vm.stopBroadcast();
    }
}
