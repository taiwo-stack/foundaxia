import React, { useRef, useState } from 'react';
import { ImagePlus, RefreshCw, Trash2, Link2, Loader2 } from 'lucide-react';
import { uploadCourseImage } from '../services/dataService';
import '../styles/CourseImageField.css';

// Course cover image: pick/drop a file (uploaded right away, compressed first), with a
// preview, Change / Remove, and "paste a link instead" as a fallback.
export default function CourseImageField({ value, onChange, onBusyChange }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [showLink, setShowLink] = useState(false);

  const setBusyState = (b) => { setBusy(b); onBusyChange?.(b); };

  const handleFile = async (file) => {
    if (!file) return;
    setError('');
    setBusyState(true);
    try {
      onChange(await uploadCourseImage(file));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyState(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const openPicker = () => { if (!busy) inputRef.current?.click(); };

  return (
    <div className="cif">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(e) => handleFile(e.target.files?.[0])}
        hidden
      />

      {value ? (
        <div className="cif-preview">
          <img src={value} alt="Course cover preview" onError={() => setError("This image couldn't be loaded. Try uploading it again.")} />
          {busy && <div className="cif-overlay"><Loader2 size={22} className="cif-spin" /> Uploading…</div>}
          <div className="cif-actions">
            <button type="button" onClick={openPicker} disabled={busy}><RefreshCw size={14} /> Change</button>
            <button type="button" className="is-danger" onClick={() => { onChange(''); setError(''); }} disabled={busy}><Trash2 size={14} /> Remove</button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={`cif-drop ${dragOver ? 'is-over' : ''}`}
          onClick={openPicker}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
          disabled={busy}
        >
          {busy ? <Loader2 size={26} className="cif-spin" /> : <ImagePlus size={26} />}
          <strong>{busy ? 'Uploading…' : 'Upload course image'}</strong>
          <span>{busy ? 'Resizing and uploading your picture' : 'Click to choose a picture, or drag one here. JPG, PNG or WebP.'}</span>
        </button>
      )}

      {error && <div className="cif-error">{error}</div>}

      {showLink ? (
        <input
          type="url"
          className="cif-link-input"
          value={value?.startsWith('data:') ? '' : (value || '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://… or /images/book1.jpg"
        />
      ) : (
        <button type="button" className="cif-link-toggle" onClick={() => setShowLink(true)}>
          <Link2 size={13} /> Paste an image link instead
        </button>
      )}
    </div>
  );
}
