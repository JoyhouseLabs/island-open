// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.30;

import {ResidentAccount} from "../src/ResidentAccount.sol";
import {ResidentNFT} from "../src/ResidentNFT.sol";
import {Registry} from "../src/Registry.sol";

interface DeploymentVm {
    function envAddress(string calldata key) external returns (address);
    function startBroadcast() external;
    function stopBroadcast() external;
}

/// @notice Testnet-only deployment. Without --broadcast, forge simulates the transactions.
/// Sign with an external wallet or local keystore; no private key is read by this script.
contract DeployResidents {
    DeploymentVm constant vm =
        DeploymentVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (ResidentAccount implementation, ResidentNFT collection) {
        require(block.chainid == 97, "Only BSC testnet (97) is supported by this deployment script");
        require(
            Registry.ADDRESS.codehash == Registry.CODE_HASH, "Canonical registry missing/mismatched"
        );
        address administrator = vm.envAddress("ISLAND_NFT_ADMIN");
        require(administrator != address(0), "Administrator required");
        vm.startBroadcast();
        implementation = new ResidentAccount();
        collection = new ResidentNFT(administrator, address(implementation));
        vm.stopBroadcast();
    }
}
