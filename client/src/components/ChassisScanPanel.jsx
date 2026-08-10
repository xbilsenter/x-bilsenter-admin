import { useEffect, useRef, useState } from 'react';
import { scanChassisImage } from '../api.js';
import { normalizeChassisInput, readChassisFromImage } from '../chassisOcr.js';
import ChassisCropEditor from './ChassisCropEditor.jsx';

function candidateLabel(item) {
  if (item.validChecksum) return 'Gyldig VIN';
  if (item.validVin) return '17 tegn';
  return `${item.value.length} tegn`;
}

export default function ChassisScanPanel({ onLookup, loading, disabled }) {
  const fileRef = useRef(null);
  const [sourceFile, setSourceFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [showCrop, setShowCrop] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState('');
  const [ocrEngine, setOcrEngine] = useState('');
  const [visionWarning, setVisionWarning] = useState('');
  const [chassis, setChassis] = useState('');
  const [candidates, setCandidates] = useState([]);

  useEffect(function () {
    return function () {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const resetAll = function () {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSourceFile(null);
    setPreviewUrl('');
    setShowCrop(false);
    setOcrError('');
    setOcrEngine('');
    setVisionWarning('');
    setCandidates([]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onFileChange = function (e) {
    const file = e.target.files?.[0];
    if (!file) return;
    resetAll();
    setSourceFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setShowCrop(true);
    setChassis('');
  };

  const openPicker = function (capture) {
    if (!fileRef.current) return;
    if (capture) fileRef.current.setAttribute('capture', 'environment');
    else fileRef.current.removeAttribute('capture');
    fileRef.current.click();
  };

  const runOcr = async function (croppedBlob) {
    setShowCrop(false);
    setOcrLoading(true);
    setOcrError('');
    setCandidates([]);
    setChassis('');
    try {
      const result = await readChassisFromImage(croppedBlob, scanChassisImage);
      const list = result.candidates || [];
      setCandidates(list);
      setChassis(result.best || '');
      setOcrEngine(result.engine || 'local');
      setVisionWarning(result.visionWarning || '');
      if (!result.best && !result.visionWarning) {
        setOcrError('Fant ikke tydelig chassisnummer i utsnittet. Juster rammen tettere rundt nummeret, eller skriv inn manuelt.');
        setShowCrop(true);
      } else if (!result.best && result.visionWarning) {
        setShowCrop(true);
      }
    } catch (err) {
      setOcrError(err.message || 'Kunne ikke lese chassisnummer fra bildet.');
      setShowCrop(true);
    } finally {
      setOcrLoading(false);
    }
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
        {sourceFile && (
          <button type="button" className="btn btn-g btn-sm" onClick={resetAll} disabled={busy}>
            Nullstill
          </button>
        )}
      </div>

      {showCrop && sourceFile && (
        <ChassisCropEditor
          file={sourceFile}
          onConfirm={runOcr}
          onCancel={resetAll}
        />
      )}

      {!showCrop && previewUrl && (
        <div className="chassis-scan__preview">
          <img src={previewUrl} alt="Chassisnummer" />
        </div>
      )}

      {ocrLoading && (
        <div className="chassis-scan__status">Leser chassisnummer fra utsnittet…</div>
      )}

      {ocrError && !ocrLoading && (
        <div className="chassis-scan__error">{ocrError}</div>
      )}

      {visionWarning && !ocrLoading && (
        <div className="chassis-scan__warn">{visionWarning}</div>
      )}

      {ocrEngine && !ocrLoading && candidates.length > 0 && !visionWarning && (
        <div className="chassis-scan__engine">
          {ocrEngine === 'openai' ? 'Lest med AI-visjon' : 'Lest lokalt – kontroller nummeret'}
        </div>
      )}

      {ocrEngine === 'local' && visionWarning && !ocrLoading && candidates.length > 0 && (
        <div className="chassis-scan__engine">Lokal OCR brukt som reserve</div>
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
          <div className="fl">Mulige chassisnummer</div>
          <div className="chassis-scan__candidate-list">
            {candidates.slice(0, 4).map(function (item) {
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
        Marker kun området med chassisnummer før lesing. Systemet foreslår bare VIN-lignende kombinasjoner – ikke annen tekst fra bildet.
      </div>
    </div>
  );
}
