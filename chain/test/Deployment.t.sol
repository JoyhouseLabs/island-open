// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.30;

import {DeployResidents} from "../script/DeployResidents.s.sol";
import {ResidentAccount} from "../src/ResidentAccount.sol";
import {ResidentNFT} from "../src/ResidentNFT.sol";
import {Registry} from "../src/Registry.sol";

interface DeployTestVm {
    function chainId(uint256 id) external;
    function setEnv(string calldata name, string calldata value) external;
    function etch(address target, bytes calldata code) external;
    function readFile(string calldata path) external view returns (string memory);
    function parseJsonBytes(string calldata json, string calldata key)
        external
        pure
        returns (bytes memory);
    function expectRevert() external;
}

contract DeploymentTest {
    DeployTestVm constant vm =
        DeployTestVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    DeployResidents script;

    function setUp() public {
        script = new DeployResidents();
        vm.chainId(97);
        vm.setEnv("ISLAND_NFT_ADMIN", "0x2222222222222222222222222222222222222222");
        vm.etch(
            Registry.ADDRESS, vm.parseJsonBytes(vm.readFile("fixtures/registry.json"), ".runtime")
        );
    }

    function testDeployScriptSimulation() public {
        (ResidentAccount implementation, ResidentNFT collection) = script.run();
        require(collection.owner() == 0x2222222222222222222222222222222222222222, "administrator");
        require(collection.accountImplementation() == address(implementation), "implementation");
        require(collection.residentChainId() == 97, "testnet");
    }

    function testMainnetBroadcastPathIsRejected() public {
        vm.chainId(56);
        vm.expectRevert();
        script.run();
    }

    function testDeploymentRequiresCorrectRegistry() public {
        vm.etch(Registry.ADDRESS, hex"00");
        vm.expectRevert();
        script.run();
    }

    function testDeploymentRequiresAdministrator() public {
        vm.setEnv("ISLAND_NFT_ADMIN", "0x0000000000000000000000000000000000000000");
        vm.expectRevert();
        script.run();
    }
}
