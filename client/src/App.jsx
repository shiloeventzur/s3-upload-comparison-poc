import { useState, useRef } from "react";
import "./App.css";

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB — must match server
const MAX_CONCURRENT = 5;

function App() {
  const inputRef = useRef(null);
  const [fileProgress, setFileProgress] = useState([]); // [{ name, sent, total, status }]
  const [uploading, setUploading] = useState(false);

  /** Upload all chunks for one file with a concurrency pool of MAX_CONCURRENT. */
  async function uploadFileChunks(file, layerId, fileId, totalChunks, onChunkDone) {
    let nextIdx = 0;

    async function worker() {
      while (nextIdx < totalChunks) {
        const idx = nextIdx++;
        const start = idx * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const blob = file.slice(start, end);

        const form = new FormData();
        form.append("chunk", blob, "chunk");

        const res = await fetch(`/write/upload-old/${layerId}/${fileId}`, {
          method: "POST",
          headers: { chunkindex: String(idx) },
          body: form,
        });

        if (!res.ok) throw new Error(`Chunk ${idx} failed (HTTP ${res.status})`);
        onChunkDone();
      }
    }

    // Spawn up to MAX_CONCURRENT workers
    const workers = Array.from({ length: Math.min(MAX_CONCURRENT, totalChunks) }, () => worker());
    await Promise.all(workers);
  }

  async function handleUpload() {
    const fileList = inputRef.current?.files;
    if (!fileList || fileList.length === 0) return;

    setUploading(true);

    const filesArr = Array.from(fileList);

    // Initialise progress tracking
    const progress = filesArr.map((f) => ({
      name: f.name,
      sent: 0,
      total: Math.ceil(f.size / CHUNK_SIZE),
      status: "pending",
    }));
    setFileProgress([...progress]);

    // Build metadata — include totalChunks so the server doesn't need to compute it
    const fileMeta = filesArr.map((f, i) => ({
      fileName: f.name,
      size: f.size,
      totalChunks: progress[i].total,
    }));

    try {
      // 1. Prepare
      const prepRes = await fetch("/write/upload-old/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: fileMeta }),
      });

      if (!prepRes.ok) throw new Error("Prepare request failed");
      const { layerId, files: serverFiles } = await prepRes.json();

      // 2. Upload chunks per file (concurrently capped at MAX_CONCURRENT)
      for (let i = 0; i < filesArr.length; i++) {
        const file = filesArr[i];
        const { fileId } = serverFiles[i];
        const totalChunks = progress[i].total;

        progress[i].status = "uploading";
        setFileProgress([...progress]);

        await uploadFileChunks(file, layerId, fileId, totalChunks, () => {
          progress[i].sent += 1;
          setFileProgress([...progress]);
        });

        progress[i].status = "done";
        setFileProgress([...progress]);
      }
    } catch (err) {
      console.error(err);
      for (const p of progress) {
        if (p.status === "uploading" || p.status === "pending") {
          p.status = "error";
        }
      }
      setFileProgress([...progress]);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1>S3 Upload <span className="accent">POC</span></h1>
        <p className="subtitle">Old Architecture — Server-Handled Upload</p>
      </header>

      <main className="main">
        <div className="upload-card">
          <label htmlFor="file-input" className="file-label">
            <svg className="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 16V4m0 0L8 8m4-4l4 4" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M20 16v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Choose files</span>
          </label>
          <input
            id="file-input"
            ref={inputRef}
            type="file"
            multiple
            className="file-input"
          />

          <button
            className="upload-btn"
            onClick={handleUpload}
            disabled={uploading}
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>

        {fileProgress.length > 0 && (
          <div className="progress-list">
            {fileProgress.map((fp, idx) => (
              <div
                key={idx}
                className={`progress-item ${fp.status}`}
              >
                <div className="progress-header">
                  <span className="file-name">{fp.name}</span>
                  <span className="chunk-count">
                    {fp.sent}/{fp.total} chunks
                  </span>
                </div>
                <div className="bar-bg">
                  <div
                    className="bar-fill"
                    style={{ width: `${(fp.sent / fp.total) * 100}%` }}
                  />
                </div>
                <span className="status-tag">{fp.status}</span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
