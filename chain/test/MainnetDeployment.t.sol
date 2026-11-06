// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.30;

import {DeployTestVm} from "./Deployment.t.sol";
import {DeployResidentsMainnet} from "../script/DeployResidentsMainnet.s.sol";
import {ResidentAccount} from "../src/ResidentAccount.sol";
import {ResidentNFT} from "../src/ResidentNFT.sol";
import {Registry} from "../src/Registry.sol";

interface MainnetTestVm {
    function prank(address sender) external;
    function deal(address target, uint256 amount) external;
}

contract MainnetDeploymentTest {
    DeployTestVm constant vm =
        DeployTestVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    MainnetTestVm constant actor =
        MainnetTestVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant ADMIN = 0x2222222222222222222222222222222222222222;
    DeployResidentsMainnet script;

    function setUp() public {
        script = new DeployResidentsMainnet();
        vm.chainId(56);
        vm.etch(
            Registry.ADDRESS, vm.parseJsonBytes(vm.readFile("fixtures/registry.json"), ".runtime")
        );
    }

    function testMainnetSimulationMintAndTransfer() public {
        (ResidentAccount implementation, ResidentNFT collection) = script.run(ADMIN);
        require(collection.owner() == ADMIN, "administrator");
        require(collection.accountImplementation() == address(implementation), "implementation");
        require(collection.residentChainId() == 56, "mainnet binding");
        actor.prank(ADMIN);
        (uint256 id, address accountAddress) =
            collection.mintResident(ADMIN, keccak256("mainnet-local-simulation"), "ipfs://fixture");
        ResidentAccount account = ResidentAccount(payable(accountAddress));
        (uint256 chainId, address nft, uint256 tokenId) = account.token();
        require(chainId == 56 && nft == address(collection) && id == tokenId, "NFT binding");
        actor.deal(accountAddress, 1 ether);
        actor.prank(ADMIN);
        account.grantSkill(
            address(0xd311), address(0xbeef), keccak256(""), block.timestamp + 60, 1, 1, 1
        );
        actor.prank(ADMIN);
        collection.transferFrom(ADMIN, address(0xb0b), id);
        require(account.owner() == address(0xb0b), "new owner");
        actor.prank(address(0xd311));
        vm.expectRevert();
        account.executeSkill(address(0xbeef), 1, "");
        actor.prank(address(0xb0b));
        account.execute(address(0xbeef), 1, "", 0);
        require(address(0xbeef).balance == 1, "new owner execution");
    }

    function testMainnetScriptRejectsTestnet() public {
        vm.chainId(97);
        vm.expectRevert();
        script.run(ADMIN);
    }

    function testMainnetScriptRejectsUnrelatedChain() public {
        vm.chainId(1);
        vm.expectRevert();
        script.run(ADMIN);
    }

    function testMainnetScriptRejectsRegistryMismatch() public {
        vm.etch(Registry.ADDRESS, hex"00");
        vm.expectRevert();
        script.run(ADMIN);
    }

    function testMainnetScriptRequiresAdministrator() public {
        vm.expectRevert();
        script.run(address(0));
    }
}
