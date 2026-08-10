import { useEffect, useRef, useState } from 'react';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function defaultCrop() {
  return { x: 0.04, y: 0.36, w: 0.92, h: 0.22 };
}

export default function ChassisCropEditor({ file, onConfirm, onCancel }) {
  const imgRef = useRef(null);
  const [imageUrl, setImageUrl] = useState('');
  const [crop, setCrop] = useState(defaultCrop);
  const [drag, setDrag] = useState(null);

  useEffect(function () {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setCrop(defaultCrop());
    return function () { URL.revokeObjectURL(url); };
  }, [file]);

  const pointToCrop = function (clientX, clientY) {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp((clientY - rect.top) / rect.height, 0, 1)
    };
  };

  const onPointerDown = function (e, mode) {
    e.preventDefault();
    const point = pointToCrop(e.clientX, e.clientY);
    if (!point) return;
    setDrag({ mode, startPoint: point, startCrop: { ...crop } });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = function (e) {
    if (!drag) return;
    const point = pointToCrop(e.clientX, e.clientY);
    if (!point) return;
    const dx = point.x - drag.startPoint.x;
    const dy = point.y - drag.startPoint.y;
    const start = drag.startCrop;

    if (drag.mode === 'move') {
      setCrop({
        x: clamp(start.x + dx, 0, 1 - start.w),
        y: clamp(start.y + dy, 0, 1 - start.h),
        w: start.w,
        h: start.h
      });
      return;
    }

    setCrop({
      x: start.x,
      y: start.y,
      w: clamp(start.w + dx, 0.25, 1 - start.x),
      h: clamp(start.h + dy, 0.08, 1 - start.y)
    });
  };

  const onPointerUp = function () {
    setDrag(null);
  };

  const nudge = function (patch) {
    setCrop(function (prev) {
      const next = { ...prev, ...patch };
      next.x = clamp(next.x, 0, 1 - next.w);
      next.y = clamp(next.y, 0, 1 - next.h);
      next.w = clamp(next.w, 0.25, 1 - next.x);
      next.h = clamp(next.h, 0.08, 1 - next.y);
      return next;
    });
  };

  const exportCropBlob = async function () {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) throw new Error('Bildet er ikke klart.');

    const sx = Math.round(crop.x * img.naturalWidth);
    const sy = Math.round(crop.y * img.naturalHeight);
    const sw = Math.max(1, Math.round(crop.w * img.naturalWidth));
    const sh = Math.max(1, Math.round(crop.h * img.naturalHeight));
    const scale = Math.max(2, 2800 / sw);

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) reject(new Error('Kunne ikke klargjøre utsnitt.'));
        else resolve(blob);
      }, 'image/jpeg', 0.96);
    });
  };

  const confirm = async function () {
    const blob = await exportCropBlob();
    onConfirm(blob);
  };

  if (!imageUrl) return null;

  return (
    <div className="chassis-crop">
      <div className="chassis-crop__hint">
        Juster rammen over chassisnummeret. Dra rammen for å flytte, eller hjørnet for å endre størrelse.
      </div>

      <div
        className="chassis-crop__stage"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <img ref={imgRef} src={imageUrl} alt="Marker chassisnummer" className="chassis-crop__image" draggable={false} />

        <div
          className="chassis-crop__box"
          style={{
            left: (crop.x * 100) + '%',
            top: (crop.y * 100) + '%',
            width: (crop.w * 100) + '%',
            height: (crop.h * 100) + '%'
          }}
          onPointerDown={function (e) { onPointerDown(e, 'move'); }}
        >
          <div
            className="chassis-crop__handle"
            onPointerDown={function (e) {
              e.stopPropagation();
              onPointerDown(e, 'resize');
            }}
          />
        </div>
      </div>

      <div className="chassis-crop__nudge">
        <button type="button" className="btn btn-g btn-xs" onClick={() => nudge({ y: crop.y - 0.02 })}>Opp</button>
        <button type="button" className="btn btn-g btn-xs" onClick={() => nudge({ y: crop.y + 0.02 })}>Ned</button>
        <button type="button" className="btn btn-g btn-xs" onClick={() => nudge({ h: crop.h - 0.02 })}>Smalere</button>
        <button type="button" className="btn btn-g btn-xs" onClick={() => nudge({ h: crop.h + 0.02 })}>Høyere</button>
      </div>

      <div className="chassis-crop__actions">
        <button type="button" className="btn btn-p btn-sm" onClick={confirm}>Les chassisnummer</button>
        <button type="button" className="btn btn-g btn-sm" onClick={onCancel}>Avbryt</button>
      </div>
    </div>
  );
}
