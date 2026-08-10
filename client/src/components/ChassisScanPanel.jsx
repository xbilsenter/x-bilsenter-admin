import { useEffect, useRef, useState } from 'react';
import { normalizeChassisInput, readChassisFromImage } from '../chassisOcr.js';

export default function ChassisScanPanel({ onLookup, loading, disabled }) {
  const fileRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState('');
  const [chassis, setChassis] = useState('');
  const [candidates, setCandidates] = useState([]);

  useEffect(function () {
    return function () {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const resetImage = function () {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setOcrError('');
    setCandidates([]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const processFile = async function (file) {
    if (!file) return;
    resetImage();
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setOcrLoading(true);
    setOcrError('');
    try {
      const result = await readChassisFromImage(file);
      setCandidates(result.candidates || []);
      setChassis(result.best || '');
      if (!result.best) {
        setOcrError('Fant ikke chassisnummer i bildet. Skriv inn manuelt eller prøv et tydeligere bilde.');
      }
    } catch (err) {
      setOcrError(err.message || 'Kunne ikke lese chassisnummer fra bildet.');
      setChassis('');
      setCandidates([]);
    } finally {
      setOcrLoading(false);
    }
  };

  const onFileChange = function (e) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const openPicker = function (capture) {
    if (!fileRef.current) return;
    if (capture) fileRef.current.setAttribute('capture', 'environment');
    else fileRef.current.removeAttribute('capture');
    fileRef.current.click();
  };

  const slaOpp = function () {
    const value = normalizeChassisInput(chassis);
    if (!value || value.length < 5) return;
    onLookup(value);
  };

  const busy = loading || ocrLoading || disabled;

  return (
    <div className="chassis-scan">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="chassis-scan__file"
        onChange={onFileChange}
      />

      <div className="chassis-scan__actions">
        <button type="button" className="btn btn-g btn-sm" onClick={() => openPicker(true)} disabled={busy}>
          Ta bilde
        </button>
        <button type="button" className="btn btn-g btn-sm" onClick={() => openPicker(false)} disabled={busy}>
          Last opp bilde
        </button>
        {previewUrl && (
          <button type="button" className="btn btn-g btn-sm" onClick={resetImage} disabled={busy}>
            Fjern bilde
          </button>
        )}
      </div>

      {previewUrl && (
        <div className="chassis-scan__preview">
          <img src={previewUrl} alt="Chassisnummer" />
        </div>
      )}

      {ocrLoading && (
        <div className="chassis-scan__status">Leser chassisnummer fra bildet…</div>
      )}

      {ocrError && !ocrLoading && (
        <div className="chassis-scan__error">{ocrError}</div>
      )}

      <div className="lookup-row" style={{ marginTop: 12 }}>
        <div className="lookup-row__field">
          <div className="fl">Understellsnummer (chassis)</div>
          <input
            value={chassis}
            onChange={function (e) { setChassis(normalizeChassisInput(e.target.value)); }}
            onKeyDown={function (e) { if (e.key === 'Enter') slaOpp(); }}
            placeholder="F.eks. WBADT43452G123456"
            style={{ fontSize: 15, fontWeight: 700, letterSpacing: 1.5, fontFamily: 'monospace' }}
            disabled={busy}
          />
        </div>
        <button
          type="button"
          className="btn btn-p"
          onClick={slaOpp}
          disabled={busy || normalizeChassisInput(chassis).length < 5}
        >
          {loading ? 'Søker…' : 'Slå opp'}
        </button>
      </div>

      {candidates.length > 1 && (
        <div className="chassis-scan__candidates">
          <div className="fl">Andre treff i bildet</div>
          <div className="chassis-scan__candidate-list">
            {candidates.slice(0, 4).map(function (item) {
              return (
                <button
                  key={item}
                  type="button"
                  className={`btn btn-g btn-xs ${chassis === item ? 'btn-p' : ''}`}
                  onClick={function () { setChassis(item); }}
                  disabled={busy}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="chassis-scan__hint">
        Ta bilde av understellsnummer/chassisnummer på bilen. Kontroller nummeret før oppslag.
      </div>
    </div>
  );
}
