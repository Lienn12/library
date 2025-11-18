// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MusicCopyrightRegistry is ERC721 {
    address public platformOwner;
    uint256 public registrationFee = 0.01 ether;
    uint256 public accessFee = 0.005 ether;
    uint256 public platformShareBps = 1000; // 10%

    bool private _locked;
    modifier nonReentrant() {
        require(!_locked, "Reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    struct Song {
        uint256 id;
        address registrant;
        string title;
        string artist;
        string ipfsHash;
        string license;
        uint256 timestamp;
        bool active;
        uint256 accessCount;
        uint256 tokenId; // NFT token ID
    }

    uint256 private _tokenIdCounter;
    mapping(address => mapping(uint256 => bool)) public hasPaidForAccess;
    uint256 public nextSongId = 1;
    mapping(uint256 => Song) private songs;
    mapping(address => uint256[]) private songsByRegistrant;
    mapping(uint256 => string) private _tokenURIs; // tokenId -> metadata URI
    uint256 public platformBalance;

    event SongRegistered(uint256 indexed id, address indexed registrant, string title, string ipfsHash, uint256 timestamp, uint256 feePaid, uint256 tokenId);
    event FeeSet(uint256 oldFee, uint256 newFee);
    event PlatformFeeWithdrawn(address indexed to, uint256 amount);
    event SongMetadataUpdated(uint256 indexed id, string newTitle, string newArtist, string newIpfsHash, string newLicense);
    event OwnershipTransferred(uint256 indexed id, address indexed previousOwner, address indexed newOwner);
    event SongRevoked(uint256 indexed id, address indexed revokedBy, uint256 timestamp);
    event AccessPaid(uint256 indexed songId, address indexed payer, address indexed recipient, uint256 recipientAmount, uint256 platformAmount);
    event PlatformFeeCollected(address indexed from, uint256 amount);
    event PlatformShareBpsUpdated(uint256 oldBps, uint256 newBps);

    modifier onlyPlatformOwner() {
        require(msg.sender == platformOwner, "Only platform owner");
        _;
    }

    modifier onlyRegistrant(uint256 _id) {
        require(songs[_id].registrant == msg.sender, "Only registrant/owner of this song");
        _;
    }

    modifier songExists(uint256 _id) {
        require(_id > 0 && _id < nextSongId, "Song does not exist");
        _;
    }

    constructor() ERC721("MusicCopyright", "MCREG") {
        platformOwner = msg.sender;
    }

    function setAccessFee(uint256 _newFee) external onlyPlatformOwner {
        emit FeeSet(accessFee, _newFee);
        accessFee = _newFee;
    }

    function setRegistrationFee(uint256 _newFee) external onlyPlatformOwner {
        emit FeeSet(registrationFee, _newFee);
        registrationFee = _newFee;
    }

    function setPlatformShareBps(uint256 _bps) external onlyPlatformOwner {
        require(_bps <= 10000, "BPS must be <= 10000");
        emit PlatformShareBpsUpdated(platformShareBps, _bps);
        platformShareBps = _bps;
    }

    /// @notice Register song and mint NFT. Pass metadata URI (IPFS JSON)
    function registerSong(
        string calldata _title,
        string calldata _artist,
        string calldata _ipfsHash,
        string calldata _license,
        string calldata _metadataURI
    ) external payable returns (uint256) {
        require(bytes(_title).length > 0, "Title required");
        require(bytes(_ipfsHash).length > 0, "IPFS hash required");
        require(msg.value == registrationFee, "Must send exactly the registration fee");

        uint256 songId = nextSongId;
        _tokenIdCounter++;
        uint256 newTokenId = _tokenIdCounter;

        songs[songId] = Song({
            id: songId,
            registrant: msg.sender,
            title: _title,
            artist: _artist,
            ipfsHash: _ipfsHash,
            license: _license,
            timestamp: block.timestamp,
            active: true,
            accessCount: 0,
            tokenId: newTokenId
        });

        songsByRegistrant[msg.sender].push(songId);
        nextSongId++;

        // Mint NFT to registrant
        _safeMint(msg.sender, newTokenId);
        _tokenURIs[newTokenId] = _metadataURI;

        platformBalance += msg.value;
        emit PlatformFeeCollected(msg.sender, msg.value);

        emit SongRegistered(songId, msg.sender, _title, _ipfsHash, block.timestamp, msg.value, newTokenId);
        return songId;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "Token does not exist");
        return _tokenURIs[tokenId];
    }

    function payForAccess(uint256 _songId) external payable songExists(_songId) nonReentrant {
        require(msg.value == accessFee, "Must send exactly the access fee");

        Song storage s = songs[_songId];
        require(s.active, "Song is revoked");
        require(s.registrant != msg.sender, "Registrant does not need to pay");
        require(s.registrant != address(0), "Invalid registrant");
        require(!hasPaidForAccess[msg.sender][_songId], "Access already paid for");

        hasPaidForAccess[msg.sender][_songId] = true;

        uint256 platformAmount = (msg.value * platformShareBps) / 10000;
        uint256 registrantAmount = msg.value - platformAmount;

        if (platformAmount > 0) {
            platformBalance += platformAmount;
            emit PlatformFeeCollected(msg.sender, platformAmount);
        }

        s.accessCount += 1;

        (bool success, ) = payable(s.registrant).call{value: registrantAmount}("");
        require(success, "Transfer to registrant failed");

        emit AccessPaid(_songId, msg.sender, s.registrant, registrantAmount, platformAmount);
    }

    function withdrawFees() external onlyPlatformOwner {
        uint256 amount = platformBalance;
        require(amount > 0, "No platform fees to withdraw");

        platformBalance = 0;
        (bool success, ) = payable(platformOwner).call{value: amount}("");
        require(success, "Withdraw failed");

        emit PlatformFeeWithdrawn(platformOwner, amount);
    }

    function updateSongMetadata(
        uint256 _id,
        string calldata _newTitle,
        string calldata _newArtist,
        string calldata _newIpfsHash,
        string calldata _newLicense
    ) external songExists(_id) onlyRegistrant(_id) {
        Song storage s = songs[_id];
        require(s.active, "Song is revoked");

        s.title = _newTitle;
        s.artist = _newArtist;
        s.ipfsHash = _newIpfsHash;
        s.license = _newLicense;

        emit SongMetadataUpdated(_id, _newTitle, _newArtist, _newIpfsHash, _newLicense);
    }

    function transferOwnership(uint256 _id, address _newOwner) external songExists(_id) onlyRegistrant(_id) {
        require(_newOwner != address(0), "Invalid new owner");
        Song storage s = songs[_id];
        address previous = s.registrant;
        s.registrant = _newOwner;
        songsByRegistrant[_newOwner].push(_id);
        
        // Transfer NFT
        _transfer(previous, _newOwner, s.tokenId);
        
        emit OwnershipTransferred(_id, previous, _newOwner);
    }

    function revokeSong(uint256 _id) external songExists(_id) {
        Song storage s = songs[_id];
        require(s.active, "Already revoked");
        require(msg.sender == s.registrant || msg.sender == platformOwner, "Not authorized to revoke");
        s.active = false;
        emit SongRevoked(_id, msg.sender, block.timestamp);
    }

    function getSong(uint256 _id) external view songExists(_id) returns (
        uint256 id,
        address registrant,
        string memory title,
        string memory artist,
        string memory ipfsHash,
        string memory license,
        uint256 timestamp,
        uint256 accessCount,
        bool active,
        uint256 tokenId
    ) {
        Song storage s = songs[_id];
        return (s.id, s.registrant, s.title, s.artist, s.ipfsHash, s.license, s.timestamp, s.accessCount, s.active, s.tokenId);
    }

    function getSongsByRegistrant(address _registrant) external view returns (uint256[] memory) {
        return songsByRegistrant[_registrant];
    }

    function verifyIpfsHash(uint256 _id, string calldata _ipfsHash) external view songExists(_id) returns (bool) {
        return keccak256(bytes(songs[_id].ipfsHash)) == keccak256(bytes(_ipfsHash));
    }

    function getTotalSongs() external view returns (uint256) {
        return nextSongId - 1;
    }
}