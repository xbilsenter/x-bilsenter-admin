import { useEffect, useRef, useState } from 'react';
import { normalizeChassisInput, readChassisFromImage } from '../chassisOcr.js';

function candidateLabel(item) {
  if (item.validChecksum) return 'Gyldig VIN';
  if (item.validVin) return '17 tegn';
  return `${item.value.length} tegn`;
}

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
      const list = result.candidates || [];
      setCandidates(list);
      setChassis(result.best || '');
      if (!result.best) {
        setOcrError('Fant ikke tydelig chassisnummer i bildet. Prøv nærbilde med god belysning, eller skriv inn manuelt.');
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
        <div className="chassis-scan__status">Analyserer bildet og leter etter chassisnummer…</div>
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

      {candidates.length > 0 && (
        <div className="chassis-scan__candidates">
          <div className="fl">{candidates.length > 1 ? 'Mulige chassisnummer i bildet' : 'Funnet chassisnummer'}</div>
          <div className="chassis-scan__candidate-list">
            {candidates.slice(0, 6).map(function (item) {
              return (
                <button
                  key={item.value}
                  type="button"
                  className={`chassis-scan__candidate ${chassis === item.value ? 'is-active' : ''}`}
                  onClick={function () { setChassis(item.value); }}
                  disabled={busy}
                >
                  <span className="chassis-scan__candidate-value">{item.value}</span>
                  <span className={`chassis-scan__candidate-tag ${item.validChecksum ? 'is-valid' : ''}`}>
                    {candidateLabel(item)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="chassis-scan__hint">
        Systemet leter aktivt etter VIN/chassisnummer i bildet og prioriterer 17-tegns kombinasjoner med gyldig VIN-kontrollsiffer.
      </div>
    </div>
  );
}
