// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.30;

// Interfaces specified by https://eips.ethereum.org/EIPS/eip-6551.
interface IERC6551Registry {
    event ERC6551AccountCreated(
        address account,
        address indexed implementation,
        bytes32 salt,
        uint256 chainId,
        address indexed tokenContract,
        uint256 indexed tokenId
    );

    function createAccount(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external returns (address);
    function account(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external view returns (address);
}

interface IERC6551Account {
    receive() external payable;
    function token() external view returns (uint256, address, uint256);
    function state() external view returns (uint256);
    function isValidSigner(address signer, bytes calldata context) external view returns (bytes4);
}

interface IERC6551Executable {
    function execute(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        payable
        returns (bytes memory);
}

interface IResidentOwnership {
    function ownershipNonce(uint256 tokenId) external view returns (uint256);
}
