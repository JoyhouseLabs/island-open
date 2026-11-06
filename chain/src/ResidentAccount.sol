// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.30;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC6551Account, IERC6551Executable, IResidentOwnership} from "./interfaces/IERC6551.sol";

/// @notice Immutable ERC-6551 implementation. Owner calls are unrestricted CALLs;
/// agent delegates may execute only an explicitly granted exact call with bounded value/count.
/// No owner keys, relayer keys, model secrets or memories are stored here.
contract ResidentAccount is
    IERC6551Account,
    IERC6551Executable,
    IERC1271,
    IERC721Receiver,
    ERC1155Holder,
    ReentrancyGuard
{
    struct SkillGrant {
        address owner;
        address target;
        bytes32 dataHash;
        uint256 ownershipNonce;
        uint256 expiresAt;
        uint256 remainingCalls;
        uint256 maxValuePerCall;
        uint256 remainingValue;
    }

    uint256 public state;
    mapping(address delegate => SkillGrant) public skillGrants;

    error Unauthorized();
    error InvalidGrant();
    error UnsupportedOperation();
    error InvalidAccount();
    error OwnershipCycle();

    event SkillGranted(
        address indexed delegate,
        address indexed target,
        bytes32 dataHash,
        uint256 ownershipNonce,
        uint256 expiresAt,
        uint256 calls,
        uint256 totalValue
    );
    event SkillRevoked(address indexed delegate);
    event Executed(address indexed caller, address indexed target, uint256 value, bytes32 dataHash);

    receive() external payable {}

    function token() public view returns (uint256 chainId, address tokenContract, uint256 tokenId) {
        // Canonical ERC-1167 runtime (45 bytes) + salt and three immutable arguments (128 bytes).
        // Calls to the implementation itself must never acquire an owner.
        if (address(this).code.length != 173) revert InvalidAccount();
        bytes memory footer = new bytes(96);
        assembly ("memory-safe") {
            extcodecopy(address(), add(footer, 32), 77, 96)
        }
        return abi.decode(footer, (uint256, address, uint256));
    }

    function owner() public view returns (address) {
        (uint256 chainId, address nft, uint256 id) = token();
        if (chainId != block.chainid) return address(0);
        try IERC721(nft).ownerOf(id) returns (address holder) {
            return holder == address(this) ? address(0) : holder;
        } catch {
            return address(0);
        }
    }

    function _requireOwner() private view returns (address holder) {
        holder = owner();
        if (holder == address(0) || msg.sender != holder) revert Unauthorized();
    }

    function _ownershipNonce() private view returns (uint256) {
        (, address nft, uint256 id) = token();
        return IResidentOwnership(nft).ownershipNonce(id);
    }

    function isValidSigner(address signer, bytes calldata) external view returns (bytes4) {
        address holder = owner();
        return holder != address(0) && signer == holder
            ? IERC6551Account.isValidSigner.selector
            : bytes4(0);
    }

    /// @notice ERC-1271 owners sign this account/chain/ownership-specific digest, not the raw hash.
    /// NFT transfers (including transfer-away-and-back) invalidate old signatures.
    function signatureDigest(bytes32 hash) public view returns (bytes32) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("Island Resident Account"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
        bytes32 message = keccak256(
            abi.encode(
                keccak256("ResidentSignature(bytes32 hash,uint256 ownershipNonce)"),
                hash,
                _ownershipNonce()
            )
        );
        return keccak256(abi.encodePacked(hex"1901", domain, message));
    }

    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4) {
        address holder = owner();
        if (holder == address(0)) return bytes4(0);
        return SignatureChecker.isValidSignatureNow(holder, signatureDigest(hash), signature)
            ? IERC1271.isValidSignature.selector
            : bytes4(0);
    }

    function execute(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        payable
        nonReentrant
        returns (bytes memory)
    {
        _requireOwner();
        if (operation != 0) revert UnsupportedOperation();
        return _call(to, value, data);
    }

    /// @dev A delegate has one exact-call grant. Re-granting replaces it; zero calls are not allowed.
    /// Token movement encoded in data must be reviewed by the owner as part of this exact call.
    function grantSkill(
        address delegate,
        address target,
        bytes32 dataHash,
        uint256 expiresAt,
        uint256 calls,
        uint256 maxValuePerCall,
        uint256 totalValue
    ) external nonReentrant {
        address holder = _requireOwner();
        (, address nft,) = token();
        if (
            delegate == address(0) || delegate == address(this) || target == address(0)
                || target == address(this) || target == nft || expiresAt <= block.timestamp
                || expiresAt > block.timestamp + 30 days || calls == 0 || calls > 1000
                || maxValuePerCall > totalValue
        ) revert InvalidGrant();
        uint256 nonce = _ownershipNonce();
        skillGrants[delegate] = SkillGrant(
            holder, target, dataHash, nonce, expiresAt, calls, maxValuePerCall, totalValue
        );
        ++state;
        emit SkillGranted(delegate, target, dataHash, nonce, expiresAt, calls, totalValue);
    }

    function revokeSkill(address delegate) external nonReentrant {
        _requireOwner();
        delete skillGrants[delegate];
        ++state;
        emit SkillRevoked(delegate);
    }

    function executeSkill(address to, uint256 value, bytes calldata data)
        external
        nonReentrant
        returns (bytes memory)
    {
        SkillGrant storage grant = skillGrants[msg.sender];
        address holder = owner();
        if (
            holder == address(0) || grant.owner != holder || grant.remainingCalls == 0
                || grant.ownershipNonce != _ownershipNonce() || block.timestamp >= grant.expiresAt
                || grant.target != to || grant.dataHash != keccak256(data)
                || value > grant.maxValuePerCall || value > grant.remainingValue
        ) revert Unauthorized();
        --grant.remainingCalls;
        grant.remainingValue -= value;
        return _call(to, value, data);
    }

    function _call(address to, uint256 value, bytes calldata data) private returns (bytes memory) {
        ++state;
        (bool ok, bytes memory result) = to.call{value: value}(data);
        if (!ok) assembly ("memory-safe") { revert(add(result, 32), mload(result)) }
        emit Executed(msg.sender, to, value, keccak256(data));
        return result;
    }

    function onERC721Received(address, address, uint256 id, bytes calldata)
        external
        view
        returns (bytes4)
    {
        (uint256 chainId, address nft, uint256 tokenId) = token();
        if (chainId == block.chainid && msg.sender == nft && id == tokenId) {
            revert OwnershipCycle();
        }
        return IERC721Receiver.onERC721Received.selector;
    }

    function supportsInterface(bytes4 id) public view override(ERC1155Holder) returns (bool) {
        return id == type(IERC6551Account).interfaceId || id == type(IERC6551Executable).interfaceId
            || id == type(IERC1271).interfaceId || super.supportsInterface(id);
    }
}
