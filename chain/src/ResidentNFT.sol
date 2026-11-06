// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.30;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {
    ERC721URIStorage
} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC6551Registry} from "./interfaces/IERC6551.sol";
import {Registry} from "./Registry.sol";

/// @notice One immutable agentId per NFT. Issuance is controlled by the collection administrator;
/// holding the NFT, not collection administration, controls the resident's account and assets.
contract ResidentNFT is ERC721URIStorage, Ownable2Step {
    address public immutable accountImplementation;
    uint256 public immutable residentChainId;
    bytes32 public constant ACCOUNT_SALT = bytes32(0);
    mapping(uint256 tokenId => uint256 nonce) public ownershipNonce;

    error InvalidRegistry();
    error InvalidImplementation();
    error InvalidResident();
    error OwnershipCycle();
    error WrongChain();

    event ResidentMinted(
        bytes32 indexed agentId,
        uint256 indexed tokenId,
        address indexed recipient,
        address account,
        string metadataURI
    );

    constructor(address administrator, address implementation)
        ERC721("Island Residents", "ISLAND")
        Ownable(administrator)
    {
        if (Registry.ADDRESS.codehash != Registry.CODE_HASH) {
            revert InvalidRegistry();
        }
        if (implementation.code.length == 0) revert InvalidImplementation();
        accountImplementation = implementation;
        residentChainId = block.chainid;
    }

    function predictAccount(bytes32 agentId) public view returns (address) {
        return IERC6551Registry(Registry.ADDRESS)
            .account(
                accountImplementation,
                ACCOUNT_SALT,
                residentChainId,
                address(this),
                uint256(agentId)
            );
    }

    function accountOf(uint256 id) external view returns (address) {
        _requireOwned(id);
        return predictAccount(bytes32(id));
    }

    /// @notice agentId should be a domain-separated hash of a permanent random resident UUID;
    /// never hash a person's name, wallet address, conversation or other private information.
    /// Metadata is immutable here; mutable AI memories remain in the private runtime.
    function mintResident(address recipient, bytes32 agentId, string calldata metadataURI)
        external
        onlyOwner
        returns (uint256 id, address account)
    {
        if (block.chainid != residentChainId) revert WrongChain();
        if (
            agentId == bytes32(0) || bytes(metadataURI).length == 0
                || bytes(metadataURI).length > 512
        ) revert InvalidResident();
        id = uint256(agentId);
        account = IERC6551Registry(Registry.ADDRESS)
            .createAccount(accountImplementation, ACCOUNT_SALT, residentChainId, address(this), id);
        _safeMint(recipient, id);
        _setTokenURI(id, metadataURI);
        emit ResidentMinted(agentId, id, recipient, account, metadataURI);
    }

    function _update(address to, uint256 id, address auth) internal override returns (address) {
        if (block.chainid != residentChainId) revert WrongChain();
        // Also covers unsafe transferFrom and a not-yet-deployed primary account.
        if (to == predictAccount(bytes32(id))) revert OwnershipCycle();
        address previous = super._update(to, id, auth);
        ++ownershipNonce[id];
        return previous;
    }
}
