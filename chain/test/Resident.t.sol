// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.30;

import {ResidentAccount} from "../src/ResidentAccount.sol";
import {ResidentNFT} from "../src/ResidentNFT.sol";
import {Registry} from "../src/Registry.sol";
import {IERC6551Registry} from "../src/interfaces/IERC6551.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";

interface Vm {
    function etch(address target, bytes calldata code) external;
    function deal(address target, uint256 balance) external;
    function prank(address sender) external;
    function expectRevert() external;
    function expectRevert(bytes4 error) external;
    function warp(uint256 timestamp) external;
    function chainId(uint256 chainId) external;
    function addr(uint256 key) external returns (address);
    function sign(uint256 key, bytes32 digest) external returns (uint8, bytes32, bytes32);
    function readFile(string calldata path) external view returns (string memory);
    function parseJsonBytes(string calldata json, string calldata key)
        external
        pure
        returns (bytes memory);
}

contract Toy is ERC721 {
    constructor() ERC721("Toy", "TOY") {}

    function mint(address to, uint256 id) external {
        _safeMint(to, id);
    }
}

contract Action {
    uint256 public count;
    uint256 public valueReceived;

    function act(uint256 n) external payable returns (uint256) {
        count += n;
        valueReceived += msg.value;
        return count;
    }

    function fail() external pure {
        revert("action failed");
    }
}

contract ReentrantAction {
    ResidentAccount public account;
    bool public reentered;

    function configure(ResidentAccount a) external {
        account = a;
    }

    function act() external {
        (reentered,) = address(account)
            .call(
                abi.encodeCall(
                    account.executeSkill, (address(this), 0, abi.encodeCall(this.act, ()))
                )
            );
    }

    function run() external {
        account.executeSkill(address(this), 0, abi.encodeCall(this.act, ()));
    }
}

contract ContractOwner is IERC1271, IERC721Receiver {
    bytes32 public accepted;

    function accept(bytes32 digest) external {
        accepted = digest;
    }

    function isValidSignature(bytes32 hash, bytes memory) external view returns (bytes4) {
        return hash == accepted ? IERC1271.isValidSignature.selector : bytes4(0);
    }

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }
}

contract ResidentTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 constant ALICE_KEY = 0xa11ce;
    address alice;
    address bob = address(0xb0b);
    address delegate = address(0xd311);
    bytes32 agentId = keccak256("island:resident:unique-test-uuid");
    ResidentAccount implementation;
    ResidentAccount account;
    ResidentNFT nft;
    Action action;
    uint256 id;

    function setUp() public {
        vm.chainId(97);
        vm.warp(1000);
        vm.etch(
            Registry.ADDRESS, vm.parseJsonBytes(vm.readFile("fixtures/registry.json"), ".runtime")
        );
        require(Registry.ADDRESS.codehash == Registry.CODE_HASH, "canonical registry mismatch");
        alice = vm.addr(ALICE_KEY);
        implementation = new ResidentAccount();
        nft = new ResidentNFT(address(this), address(implementation));
        address deployed;
        (id, deployed) = nft.mintResident(alice, agentId, "ipfs://resident-metadata");
        account = ResidentAccount(payable(deployed));
        action = new Action();
        vm.deal(deployed, 10 ether);
    }

    function grant(bytes memory data, uint256 calls, uint256 perCall, uint256 total) internal {
        vm.prank(alice);
        account.grantSkill(
            delegate, address(action), keccak256(data), block.timestamp + 60, calls, perCall, total
        );
    }

    function signature(ResidentAccount a, bytes32 hash) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ALICE_KEY, a.signatureDigest(hash));
        return abi.encodePacked(r, s, v);
    }

    function testMintCreatesCanonicalAccountAndImmutableIdentity() public view {
        require(id == uint256(agentId), "identity");
        require(nft.ownerOf(id) == alice && account.owner() == alice, "owner");
        require(nft.predictAccount(agentId) == address(account), "prediction");
        require(nft.accountOf(id) == address(account), "primary");
        require(address(account).code.length == 173, "proxy");
        (uint256 chainId, address collection, uint256 tokenId) = account.token();
        require(chainId == 97 && collection == address(nft) && tokenId == id, "binding");
        require(
            keccak256(bytes(nft.tokenURI(id))) == keccak256("ipfs://resident-metadata"), "metadata"
        );
        require(nft.ownershipNonce(id) == 1, "initial epoch");
    }

    function testInterfaceDetectionAndSigner() public view {
        require(account.supportsInterface(0x01ffc9a7), "ERC165");
        require(account.supportsInterface(0x6faff5f1), "ERC6551");
        require(account.supportsInterface(0x51945447), "execute");
        require(account.supportsInterface(0x1626ba7e), "ERC1271");
        require(account.supportsInterface(0x4e2312e0), "ERC1155 receiver");
        require(!account.supportsInterface(0xffffffff), "invalid interface");
        require(account.isValidSigner(alice, "") == 0x523e3260, "valid owner");
        require(account.isValidSigner(bob, "") == bytes4(0), "invalid signer");
    }

    function testRegistryCreationIsIdempotentAndCannotChangePrimary() public {
        address same = IERC6551Registry(Registry.ADDRESS)
            .createAccount(address(implementation), bytes32(0), 97, address(nft), id);
        require(same == address(account) && account.owner() == alice, "idempotent");
        address alternate = IERC6551Registry(Registry.ADDRESS)
            .createAccount(address(implementation), bytes32(uint256(1)), 97, address(nft), id);
        require(alternate != same && nft.accountOf(id) == same, "alternate is not primary");
    }

    function testOnlyAdministratorCanMintAndCannotMintTwice() public {
        vm.prank(bob);
        vm.expectRevert();
        nft.mintResident(bob, keccak256("other"), "ipfs://other");
        vm.expectRevert();
        nft.mintResident(bob, agentId, "ipfs://duplicate");
        require(nft.ownerOf(id) == alice, "not replaced");
    }

    function testRejectsInvalidMintAndWrongRegistry() public {
        vm.expectRevert(ResidentNFT.InvalidResident.selector);
        nft.mintResident(alice, bytes32(0), "ipfs://x");
        vm.expectRevert(ResidentNFT.InvalidResident.selector);
        nft.mintResident(alice, keccak256("empty"), "");
        vm.etch(Registry.ADDRESS, hex"00");
        vm.expectRevert(ResidentNFT.InvalidRegistry.selector);
        new ResidentNFT(address(this), address(implementation));
    }

    function testCollectionAdminCannotSpendResidentAssets() public {
        vm.expectRevert(ResidentAccount.Unauthorized.selector);
        account.execute(bob, 1 ether, "", 0);
        require(address(account).balance == 10 ether, "balance");
    }

    function testOwnerCanExecuteAndWithdraw() public {
        vm.prank(alice);
        bytes memory returned =
            account.execute(address(action), 1 ether, abi.encodeCall(action.act, (3)), 0);
        require(abi.decode(returned, (uint256)) == 3 && action.valueReceived() == 1 ether, "call");
        vm.prank(alice);
        account.execute(bob, 2 ether, "", 0);
        require(bob.balance == 2 ether && account.state() == 2, "withdraw");
    }

    function testOwnerCannotDelegatecallOrChangeImplementation() public {
        vm.prank(alice);
        vm.expectRevert(ResidentAccount.UnsupportedOperation.selector);
        account.execute(address(action), 0, abi.encodeCall(action.act, (1)), 1);
        require(account.state() == 0, "reverted state");
    }

    function testOwnerTransferMovesControlAndKeepsAccountAssets() public {
        vm.prank(alice);
        nft.transferFrom(alice, bob, id);
        require(account.owner() == bob && nft.accountOf(id) == address(account), "new control");
        require(address(account).balance == 10 ether && nft.ownershipNonce(id) == 2, "assets/epoch");
        vm.prank(alice);
        vm.expectRevert(ResidentAccount.Unauthorized.selector);
        account.execute(alice, 1, "", 0);
        vm.prank(bob);
        account.execute(bob, 1 ether, "", 0);
        require(bob.balance == 1 ether, "new owner spend");
    }

    function testNftApprovalDoesNotGrantAccountExecution() public {
        vm.prank(alice);
        nft.approve(delegate, id);
        vm.prank(delegate);
        vm.expectRevert(ResidentAccount.Unauthorized.selector);
        account.execute(delegate, 1 ether, "", 0);
    }

    function testGrantExactCallAndCount() public {
        bytes memory data = abi.encodeCall(action.act, (2));
        grant(data, 1, 0, 0);
        require(account.isValidSigner(delegate, "") == bytes4(0), "no blanket signer grant");
        vm.prank(delegate);
        account.executeSkill(address(action), 0, data);
        require(action.count() == 2 && account.state() == 2, "skill executed");
        vm.prank(delegate);
        vm.expectRevert(ResidentAccount.Unauthorized.selector);
        account.executeSkill(address(action), 0, data);
    }

    function testGrantRejectsChangedArgumentsAndTarget() public {
        grant(abi.encodeCall(action.act, (2)), 2, 0, 0);
        vm.prank(delegate);
        vm.expectRevert(ResidentAccount.Unauthorized.selector);
        account.executeSkill(address(action), 0, abi.encodeCall(action.act, (200)));
        vm.prank(delegate);
        vm.expectRevert(ResidentAccount.Unauthorized.selector);
        account.executeSkill(bob, 0, abi.encodeCall(action.act, (2)));
    }

    function testNativeValuePerCallAndTotalBudget() public {
        bytes memory data = abi.encodeCall(action.act, (1));
        grant(data, 10, 1 ether, 1.5 ether);
        vm.prank(delegate);
        vm.expectRevert(ResidentAccount.Unauthorized.selector);
        account.executeSkill(address(action), 1.1 ether, data);
        vm.prank(delegate);
        account.executeSkill(address(action), 1 ether, data);
        vm.prank(delegate);
        vm.expectRevert(ResidentAccount.Unauthorized.selector);
        account.executeSkill(address(action), 1 ether, data);
        vm.prank(delegate);
        account.executeSkill(address(action), 0.5 ether, data);
        require(action.valueReceived() == 1.5 ether, "budget enforced");
    }

    function testExpiryAndRevocation() public {
        bytes memory data = abi.encodeCall(action.act, (1));
        grant(data, 5, 0, 0);
        vm.warp(block.timestamp + 60);
        vm.prank(delegate);
        vm.expectRevert(ResidentAccount.Unauthorized.selector);
        account.executeSkill(address(action), 0, data);
        grant(data, 5, 0, 0);
        vm.prank(alice);
        account.revokeSkill(delegate);
        vm.prank(delegate);
        vm.expectRevert(ResidentAccount.Unauthorized.selector);
        account.executeSkill(address(action), 0, data);
    }

    function testTransferAwayAndBackDoesNotReviveDelegate() public {
        bytes memory data = abi.encodeCall(action.act, (1));
        grant(data, 5, 0, 0);
        vm.prank(alice);
        nft.transferFrom(alice, bob, id);
        vm.prank(delegate);
        vm.expectRevert(ResidentAccount.Unauthorized.selector);
        account.executeSkill(address(action), 0, data);
        vm.prank(bob);
        nft.transferFrom(bob, alice, id);
        vm.prank(delegate);
        vm.expectRevert(ResidentAccount.Unauthorized.selector);
        account.executeSkill(address(action), 0, data);
        grant(data, 5, 0, 0);
        vm.prank(delegate);
        account.executeSkill(address(action), 0, data);
        require(action.count() == 1, "explicit new grant works");
    }

    function testRevertingActionRollsBackStateAndBudget() public {
        bytes memory data = abi.encodeCall(action.fail, ());
        grant(data, 1, 1 ether, 1 ether);
        vm.prank(delegate);
        vm.expectRevert();
        account.executeSkill(address(action), 1 ether, data);
        (,,,,, uint256 calls,, uint256 balance) = account.skillGrants(delegate);
        require(calls == 1 && balance == 1 ether && account.state() == 1, "atomic rollback");
    }

    function testDelegateCannotGrantItselfBroaderAccess() public {
        bytes memory data = abi.encodeCall(action.act, (1));
        grant(data, 1, 0, 0);
        vm.prank(delegate);
        vm.expectRevert(ResidentAccount.Unauthorized.selector);
        account.grantSkill(
            delegate, bob, keccak256(""), block.timestamp + 60, 100, 1 ether, 1 ether
        );
        vm.prank(alice);
        vm.expectRevert(ResidentAccount.InvalidGrant.selector);
        account.grantSkill(delegate, address(account), keccak256(""), block.timestamp + 60, 1, 0, 0);
        vm.prank(alice);
        vm.expectRevert(ResidentAccount.InvalidGrant.selector);
        account.grantSkill(delegate, address(nft), keccak256(""), block.timestamp + 60, 1, 0, 0);
    }

    function testReentrantSkillIsBlocked() public {
        ReentrantAction target = new ReentrantAction();
        target.configure(account);
        vm.prank(alice);
        account.grantSkill(
            address(target),
            address(target),
            keccak256(abi.encodeCall(target.act, ())),
            block.timestamp + 60,
            5,
            0,
            0
        );
        target.run();
        require(!target.reentered(), "reentrancy denied");
        (,,,,, uint256 calls,,) = account.skillGrants(address(target));
        require(calls == 4, "exactly one call");
    }

    function testEOASignatureBoundToAccountAndOwnershipEpoch() public {
        bytes32 hash = keccak256("login challenge with nonce");
        bytes memory sig = signature(account, hash);
        require(account.isValidSignature(hash, sig) == 0x1626ba7e, "owner signature");
        require(account.isValidSignature(keccak256("other"), sig) == bytes4(0), "different hash");
        (, address second) = nft.mintResident(alice, keccak256("second"), "ipfs://second");
        require(
            ResidentAccount(payable(second)).isValidSignature(hash, sig) == bytes4(0),
            "other account"
        );
        vm.prank(alice);
        nft.transferFrom(alice, bob, id);
        require(account.isValidSignature(hash, sig) == bytes4(0), "new owner");
        vm.prank(bob);
        nft.transferFrom(bob, alice, id);
        require(account.isValidSignature(hash, sig) == bytes4(0), "old epoch");
        require(
            account.isValidSignature(hash, signature(account, hash)) == 0x1626ba7e, "new signature"
        );
    }

    function testSmartContractOwnerSignature() public {
        ContractOwner wallet = new ContractOwner();
        vm.prank(alice);
        nft.safeTransferFrom(alice, address(wallet), id);
        bytes32 hash = keccak256("smart wallet login");
        wallet.accept(account.signatureDigest(hash));
        require(account.isValidSignature(hash, hex"01") == 0x1626ba7e, "contract signer");
        require(
            account.isValidSignature(keccak256("wrong"), hex"01") == bytes4(0), "contract rejects"
        );
    }

    function testAccountCanHoldAndTransferOtherNFTs() public {
        Toy toy = new Toy();
        toy.mint(address(account), 1);
        require(toy.ownerOf(1) == address(account), "inventory");
        vm.prank(alice);
        account.execute(
            address(toy),
            0,
            abi.encodeWithSignature(
                "safeTransferFrom(address,address,uint256)", address(account), bob, 1
            ),
            0
        );
        require(toy.ownerOf(1) == bob, "item transfer");
    }

    function testRejectsSafeAndUnsafeSelfOwnership() public {
        vm.prank(alice);
        vm.expectRevert(ResidentNFT.OwnershipCycle.selector);
        nft.transferFrom(alice, address(account), id);
        vm.prank(alice);
        vm.expectRevert(ResidentNFT.OwnershipCycle.selector);
        nft.safeTransferFrom(alice, address(account), id);
        bytes32 future = keccak256("future");
        address futureAccount = nft.predictAccount(future);
        vm.expectRevert(ResidentNFT.OwnershipCycle.selector);
        nft.mintResident(futureAccount, future, "ipfs://future");
    }

    function testWrongChainCannotExecuteOrMint() public {
        vm.chainId(56);
        require(account.owner() == address(0), "chain isolation");
        vm.prank(alice);
        vm.expectRevert(ResidentAccount.Unauthorized.selector);
        account.execute(alice, 1 ether, "", 0);
        vm.expectRevert(ResidentNFT.WrongChain.selector);
        nft.mintResident(alice, keccak256("wrongchain"), "ipfs://wrong");
    }

    function testImplementationCannotActAsWallet() public {
        vm.expectRevert(ResidentAccount.InvalidAccount.selector);
        implementation.execute(bob, 0, "", 0);
    }

    function testFuzzDeterministicAgentIdentity(bytes32 unique) public {
        if (unique == bytes32(0) || unique == agentId) return;
        address predicted = nft.predictAccount(unique);
        (uint256 minted, address deployed) = nft.mintResident(bob, unique, "ipfs://fuzz");
        require(minted == uint256(unique) && predicted == deployed, "identity/prediction");
        require(ResidentAccount(payable(deployed)).owner() == bob, "holder");
        require(deployed != address(account), "isolated account");
    }

    function testFuzzDelegateCannotChangeCallArguments(uint256 n) public {
        if (n == 1) return;
        grant(abi.encodeCall(action.act, (1)), 1, 0, 0);
        vm.prank(delegate);
        vm.expectRevert(ResidentAccount.Unauthorized.selector);
        account.executeSkill(address(action), 0, abi.encodeCall(action.act, (n)));
    }
}
