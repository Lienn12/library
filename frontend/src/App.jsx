import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { create } from "ipfs-http-client";
import { Music, UploadCloud, Wallet, FileText, ShieldCheck, DollarSign } from "lucide-react";
import "./App.css";

// ⚙️ Cấu hình IPFS (chạy ipfs daemon trước)
const client = create({
  host: "localhost",
  port: 5001,
  protocol: "http",
});

// ⚙️ ABI rút gọn phù hợp với contract của bạn (ĐÃ THÊM accessFee và payForAccess)
const contractABI = [
  "function registerSong(string,string,string,string) payable returns (uint256)",
  "function getSong(uint256) public view returns (uint256,address,string,string,string,string,uint256,uint256,bool)",
  "function getSongsByRegistrant(address) public view returns (uint256[] memory)",
  "function registrationFee() public view returns (uint256)",
  "function getTotalSongs() public view returns (uint256)",
  "function accessFee() public view returns (uint256)",
  "function payForAccess(uint256) payable",
];
const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // Vui lòng cập nhật sau khi deploy lại contract mới

// 💡 Cấu hình RPC Node cho các hàm view (tải dữ liệu)
const RPC_URL = "http://localhost:8545"; // Thay thế bằng RPC node của bạn

function App() {
  const [account, setAccount] = useState("");
  const [file, setFile] = useState(null);
  const [ipfsHash, setIpfsHash] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [license, setLicense] = useState("All Rights Reserved");
  const [status, setStatus] = useState("");
  const [songs, setSongs] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentCertificate, setCurrentCertificate] = useState(null);
  
  const [registrationFee, setRegistrationFee] = useState(0n);
  const [accessFee, setAccessFee] = useState(0n);

  // 🔗 Kết nối MetaMask
  const connectWallet = async () => {
    try {
      if (!window.ethereum) return alert("⚠️ Cài MetaMask trước!");
      const [address] = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      setAccount(address);
      setStatus(`✅ Đã kết nối ví: ${address.slice(0, 6)}...${address.slice(-4)}`);
      await fetchSongs();
    } catch (err) {
      console.error(err);
      setStatus("❌ Không thể kết nối ví!");
    }
  };

  // 📂 Chọn file
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];

    if (selectedFile) {
        if (selectedFile.type.startsWith('audio/')) {
            setFile(selectedFile);
            setStatus(`File đã chọn: ${selectedFile.name}`);
        } else {
            setFile(null);
            setStatus("❌ Vui lòng chỉ chọn file âm thanh (MP3, WAV, v.v.)!");
            e.target.value = null; 
        }
    } else {
        setFile(null);
    }
  };

  // 🚀 Upload lên IPFS
  const uploadToIPFS = async () => {
    if (!file) return alert("Hãy chọn file trước!");
    try {
      setStatus("⏳ Đang tải lên IPFS...");
      const added = await client.add(file);
      setIpfsHash(added.path);
      setStatus(`✅ Upload thành công: ${added.path}`);
    } catch (err) {
      console.error(err);
      setStatus("❌ Lỗi upload IPFS");
    }
  };

  // 📝 Ghi bài hát lên blockchain (Thêm value: registrationFee)
  const registerSong = async () => {
    if (!title || !artist || !ipfsHash) return alert("Vui lòng nhập đủ thông tin!");
    
    if (registrationFee === 0n) return alert("Phí đăng ký chưa được tải hoặc bằng 0.");
    
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, contractABI, signer);

      setStatus(`⏳ Đang gửi giao dịch. Phí đăng ký: ${ethers.formatEther(registrationFee)} ETH...`);
      
      const tx = await contract.registerSong(title, artist, ipfsHash, license, {
        value: registrationFee, // Gửi ETH bằng mức phí (thanh toán)
      });
      
      await tx.wait();
      setStatus("✅ Ghi thành công lên blockchain! Phí đã được thanh toán.");

      // Reset form
      setTitle("");
      setArtist("");
      setFile(null);
      setIpfsHash("");

      await fetchSongs();
    } catch (err) {
      console.error(err);
      if (err.code === 4001) {
          setStatus("❌ Giao dịch bị người dùng từ chối.");
      } else {
          setStatus("❌ Lỗi khi ghi lên blockchain!");
      }
    }
  };

  // 📜 Lấy danh sách bài hát ĐÃ ĐĂNG KÝ (CẬP NHẬT để lấy TẤT CẢ - Dùng JsonRpcProvider)
  const fetchSongs = async () => {
      try {
          // ✅ SỬA LỖI: Dùng JsonRpcProvider cho các hàm view (để tránh lỗi khi MetaMask không kết nối)
          const provider = new ethers.JsonRpcProvider(RPC_URL);
          const contract = new ethers.Contract(contractAddress, contractABI, provider);
          
          const totalSongsBigInt = await contract.getTotalSongs();
          const totalSongs = Number(totalSongsBigInt);
          
          const list = [];
          
          if (totalSongs > 0) {
              for (let i = 1; i <= totalSongs; i++) {
                  const song = await contract.getSong(i);
                  list.push({
                      id: Number(song[0]),
                      registrant: song[1],
                      title: song[2],
                      artist: song[3],
                      ipfsHash: song[4],
                      license: song[5],
                      timestamp: new Date(Number(song[6]) * 1000).toLocaleString(),
                      accessCount: Number(song[7]),
                      active: song[8],
                  });
              }
          }
          
          setSongs(list.reverse()); 
      } catch (err) {
          console.error("Lỗi khi tải tất cả bài hát:", err);
          // Nếu bạn thấy lỗi ở đây, hãy kiểm tra lại contractAddress và RPC_URL
      }
  };

  // 📝 Hàm Mở Modal Chứng nhận (ĐÃ CẬP NHẬT: XỬ LÝ THANH TOÁN)
  const viewCertificate = async (songData) => {
    if (!account) {
        setStatus("⚠️ Vui lòng kết nối ví để xem chứng nhận.");
        return;
    }
    
    // Kiểm tra nếu là người đăng ký (Registrant)
    if (songData.registrant.toLowerCase() === account.toLowerCase()) {
        setCurrentCertificate(songData);
        setIsModalOpen(true);
        setStatus("✅ Bạn là người đăng ký bản quyền này. Truy cập miễn phí.");
        return;
    }
    
    // ✅ Logic: Cho phép xem miễn phí nếu phí truy cập bằng 0
    if (accessFee === 0n) {
        setCurrentCertificate(songData);
        setIsModalOpen(true);
        setStatus("✅ Truy cập miễn phí. Phí đang bằng 0 ETH.");
        return;
    }
    
    // Debug / sanity checks trước khi gửi tx
    console.log("DEBUG viewCertificate:", { songId: songData.id, registrant: songData.registrant, accessFee });
    if (!songData.id) {
        setStatus("❌ Lỗi: ID bài hát không hợp lệ.");
        return;
    }
    if (songData.registrant === "0x0000000000000000000000000000000000000000") {
        setStatus("❌ Lỗi: registrant là zero address — có thể contract chưa được deploy/khởi tạo đúng.");
        return;
    }
    if (accessFee === undefined || accessFee === null) {
        setStatus("❌ Lỗi: không tải được accessFee từ contract.");
        return;
    }

    const confirmPayment = window.confirm(
        `Để xem chứng nhận này (ID: ${songData.id}), bạn cần thanh toán phí truy cập là ${ethers.formatEther(accessFee)} ETH. Bạn có muốn tiếp tục không?`
    );

    if (!confirmPayment) {
        setStatus("❌ Người dùng đã hủy thanh toán truy cập.");
        return;
    }

    // 4. Thực hiện giao dịch
    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const contractWithSigner = new ethers.Contract(contractAddress, contractABI, signer);

        // Optional: ensure signer != registrant and same network
        const signerAddr = await signer.getAddress();
        console.log("DEBUG addresses:", { account, signerAddr, registrant: songData.registrant });
        if (signerAddr.toLowerCase() === songData.registrant.toLowerCase()) {
            setStatus("✅ Bạn là registrant, không cần trả phí truy cập.");
            setCurrentCertificate(songData);
            setIsModalOpen(true);
            return;
        }

        // 0) Simulate call to get revert reason early (use JSON-RPC call for simulation)
        try {
            // encode function call and simulate via RPC to get revert reason before submitting TX
            const data = contractWithSigner.interface.encodeFunctionData("payForAccess", [songData.id]);
            const rpcProvider = new ethers.JsonRpcProvider(RPC_URL);
            // IMPORTANT: set `from` so simulation uses the same caller as the signer;
            // otherwise node may simulate from a different default account and give misleading revert reason.
            await rpcProvider.call({
                from: signerAddr,
                to: contractAddress,
                data,
                value: accessFee
            });
        } catch (simErr) {
            console.error("Simulation failed (revert reason):", simErr);
            // If simulation says "Registrant does not need to pay", likely you're using registrant account.
            if (simErr?.reason?.includes?.("Registrant does not need to pay") || (simErr?.message && simErr.message.includes("Registrant does not need to pay"))) {
                setStatus("❌ Bạn đang dùng tài khoản registrant của bài này — đổi sang tài khoản khác để trả phí truy cập.");
                return;
            }
            throw simErr;
        }

        setStatus(`⏳ Đang gửi giao dịch thanh toán ${ethers.formatEther(accessFee)} ETH để truy cập...`);

        // Send tx (keep gasLimit during debugging to avoid estimateGas errors)
        const tx = await contractWithSigner.payForAccess(songData.id, {
            value: accessFee,
            gasLimit: 300000n
        });

        const receipt = await tx.wait();
        console.log("payForAccess receipt:", receipt);

        setStatus("✅ Thanh toán thành công! Đang mở chứng nhận.");

        // refresh data to verify registrant balance/events
        await fetchSongs();
        console.log("DEBUG: after payForAccess, updated songs list and contract events may show recipient");

        // 5. Mở Modal sau khi thanh toán thành công
        setCurrentCertificate(songData);
        setIsModalOpen(true);

    } catch (err) {
        console.error("payForAccess error:", err);
        // Hiển thị thêm thông tin nếu có revert reason
        if (err?.reason) {
            setStatus(`❌ Lỗi thanh toán truy cập: ${err.reason}`);
        } else if (err?.code === "CALL_EXCEPTION" || err?.message?.includes("missing revert data")) {
            setStatus("❌ Giao dịch bị revert (kiểm tra accessFee, ABI, và contractAddress). Xem console để debug.");
        } else if (err.code === 4001) {
            setStatus("❌ Giao dịch bị người dùng từ chối.");
        } else {
            setStatus("❌ Lỗi thanh toán truy cập. Vui lòng kiểm tra ví và thử lại.");
        }
    }
  };

  // 🆕 EFFECT: Tải phí đăng ký VÀ phí truy cập từ Contract (Dùng JsonRpcProvider)
  useEffect(() => {
    const fetchFee = async () => {
      try {
        // ✅ SỬA LỖI: Dùng JsonRpcProvider cho các hàm view
        const provider = new ethers.JsonRpcProvider(RPC_URL); 
        const contract = new ethers.Contract(contractAddress, contractABI, provider);
        
        const regFee = await contract.registrationFee();
        setRegistrationFee(regFee); 
        
        const accFee = await contract.accessFee();
        setAccessFee(accFee);

      } catch (err) {
        console.error("Lỗi khi tải phí (kiểm tra RPC node):", err);
      }
    };
    fetchFee();
  }, []); 

  useEffect(() => {
    // Gọi fetchSongs khi tài khoản kết nối hoặc thay đổi (hoặc khi khởi động)
    fetchSongs(); 
  }, [account]); 

  // 📄 Component hiển thị nội dung chứng nhận
  const CertificateModal = () => {
    if (!currentCertificate) return null;

    const s = currentCertificate;
    const transactionUrl = `https://etherscan.io/address/${contractAddress}`; 

    return (
        <div className="certificate-modal">
            <div className="certificate-content">
                <button className="close-btn" onClick={() => setIsModalOpen(false)}>&times;</button>
                <div className="certificate-header">
                    <h2>BẢN CHỨNG NHẬN BẢN QUYỀN</h2>
                    <Music size={48} color="#007bff" />
                </div>
                <div className="certificate-body">
                    <p className="cert-intro">Chứng nhận này xác nhận rằng tác phẩm âm nhạc sau đây đã được đăng ký và ghi nhận trên **Blockchain Ethereum** và lưu trữ phi tập trung trên **IPFS**.</p>
                    
                    <div className="cert-data">
                        <div className="data-row">
                            <span>Tên Bài Hát:</span>
                            <span className="value-primary">{s.title}</span>
                        </div>
                        <div className="data-row">
                            <span>Nghệ Sĩ/Tác Giả:</span>
                            <span className="value-primary">{s.artist}</span>
                        </div>
                        <div className="data-row">
                            <span>Giấy Phép Bản Quyền:</span>
                            <span className="value-secondary">{s.license}</span>
                        </div>
                        <div className="data-row">
                            <span>Ngày Đăng Ký (Timestamp):</span>
                            <span className="value-secondary">{s.timestamp}</span>
                        </div>
                        <div className="data-row">
                            <span>Đăng Ký Bởi (Ví):</span>
                            <span className="value-secondary">{s.registrant}</span>
                        </div>
                        <div className="data-row">
                            <span>Mã Hash IPFS (Bằng Chứng):</span>
                            <span className="value-hash">{s.ipfsHash}</span>
                        </div>
                    </div>
                </div>

                <div className="certificate-footer">
                    <ShieldCheck size={18} color="#155724"/>
                    <p>Tính hợp lệ của bản quyền này có thể được xác minh vĩnh viễn trên: 
                        <a href={transactionUrl} target="_blank" rel="noreferrer">
                            Ethereum Blockchain (Địa chỉ Hợp đồng)
                        </a>
                        &nbsp;|&nbsp;
                        <a href={`https://ipfs.io/ipfs/${s.ipfsHash}`} target="_blank" rel="noreferrer">
                            Xem File Gốc trên IPFS
                        </a>
                    </p>
                    <p className="cert-signature">MusicChain Registry</p>
                </div>
            </div>
        </div>
    );
  };

  // thêm biến lọc bài của người dùng
  const mySongs = account
    ? songs.filter((s) => s.registrant.toLowerCase() === account.toLowerCase())
    : [];

  return (
    <div className="app">
      <header className="header">
        <Music className="icon" />
        <h1>🎵 Hệ thống Chứng nhận Bản quyền Âm nhạc</h1>
        <p>Lưu trữ bài hát hoặc tài liệu trên Blockchain + IPFS</p>
      </header>

      <button onClick={connectWallet} className="connect-btn">
        <Wallet size={18} />
        {account ? `Ví: ${account.slice(0, 6)}...${account.slice(-4)}` : "Kết nối MetaMask"}
      </button>

      {/* ÁP DỤNG CLASS GLASSMOPRHISM: THÊM 'glass-base' */}
      <div className="form glass-base">
        <input
          type="text"
          placeholder="🎵 Tên bài hát"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          type="text"
          placeholder="👤 Nghệ sĩ / tác giả"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
        />

        <select value={license} onChange={(e) => setLicense(e.target.value)}>
          <option>All Rights Reserved</option>
          <option>CC-BY-4.0</option>
          <option>CC-BY-NC-4.0</option>
          <option>CC0</option>
        </select>

        <label className="upload">
          <UploadCloud size={36} />
          <span>{file ? file.name : "Chọn file âm thanh"}</span> 
          <input 
              type="file" 
              accept="audio/*"
              onChange={handleFileChange} 
              hidden 
          />
        </label>

        <div className="btns">
          <button onClick={uploadToIPFS}>⬆️ Upload IPFS</button>
          
          <button 
            onClick={registerSong} 
            className="primary" 
            disabled={registrationFee === 0n} 
          >
            📝 Đăng ký 
            <span className="fee-display">
                <DollarSign size={14} style={{ marginRight: '4px' }}/> 
                {registrationFee === 0n ? 'Đang tải...' : ethers.formatEther(registrationFee) + ' ETH'}
            </span>
          </button>
        </div>

        {status && <p className="status">{status}</p>}
      </div>

      {/* MY REGISTERED SONGS */}
      <section className="list glass-base">
        <h2><FileText size={20} /> Bản đăng ký của tôi</h2>
        {mySongs.length === 0 ? (
          <p className="empty">Bạn chưa đăng ký bài hát nào.</p>
        ) : (
          <div className="table-container">
            <table className="songs-table">
              <thead>
                <tr>
                  <th># ID</th>
                  <th>Tên Bài Hát</th>
                  <th>Nghệ Sĩ</th>
                  <th>Giấy Phép</th>
                  <th>Ngày Đăng Ký</th>
                  <th>Trạng Thái</th>
                  <th>Chứng nhận</th>
                  <th>Số lượt truy cập</th> {/* Thêm cột số lượt truy cập */}
                </tr>
              </thead>
              <tbody>
                {mySongs.map((s) => (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td className="song-title">{s.title}</td>
                    <td>{s.artist}</td>
                    <td>{s.license}</td>
                    <td>{s.timestamp}</td>
                    <td>
                      {s.active ? (
                        <span className="status-tag active"><ShieldCheck size={14}/> Hợp lệ</span>
                      ) : (
                        <span className="status-tag revoked">Đã thu hồi</span>
                      )}
                    </td>
                    <td>
                      <button className="link-btn" onClick={() => viewCertificate(s)}>
                        Xem Chứng nhận
                      </button>
                    </td>
                    <td>{s.accessCount}</td> {/* Hiển thị số lượt truy cập */}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ALL REGISTERED SONGS */}
      <section className="list glass-base">
        <h2><FileText size={20} /> Tất cả bản đã đăng ký</h2>
        {songs.length === 0 ? (
          <p className="empty">Chưa có dữ liệu nào.</p>
        ) : (
          <div className="table-container">
            <table className="songs-table">
              <thead>
                <tr>
                  <th># ID</th>
                  <th>Tên Bài Hát</th>
                  <th>Nghệ Sĩ</th>
                  <th>Giấy Phép</th>
                  <th>Ngày Đăng Ký</th>
                  <th>Trạng Thái</th>
                  <th>Chứng nhận</th>
                  <th>Số lượt truy cập</th> {/* Thêm cột số lượt truy cập */}
                </tr>
              </thead>
              <tbody>
                {songs.map((s) => (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td className="song-title">{s.title}</td>
                    <td>{s.artist}</td>
                    <td>{s.license}</td>
                    <td>{s.timestamp}</td>
                    <td>
                      {s.active ? (
                        <span className="status-tag active"><ShieldCheck size={14}/> Hợp lệ</span>
                      ) : (
                        <span className="status-tag revoked">Đã thu hồi</span>
                      )}
                    </td>
                    <td>
                      <button className="link-btn" onClick={() => viewCertificate(s)}>
                        Xem Chứng nhận
                      </button>
                    </td>
                    <td>{s.accessCount}</td> {/* Hiển thị số lượt truy cập */}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer>© 2025 MusicChain Registry — Built with ❤️ React + IPFS + Ethereum</footer>
      {isModalOpen && <CertificateModal />}
    </div>
  );
}

export default App;