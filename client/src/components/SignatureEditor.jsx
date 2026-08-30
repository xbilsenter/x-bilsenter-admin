import { useEffect, useRef, useState } from 'react';
import { uploadSignatureImage } from '../api.js';
import { normalizeOutgoingHtml, prepareSignatureHtmlForSend } from '../mailHtmlNormalize.js';
import { buildOutgoingMailPreviewHtml } from '../mailContent.js';

function escapeHtmlAttr(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function escapeHtmlText(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const TEMPLATES = {
  enkel: `
<p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#000000">
  <strong>Navn Etternavn</strong>
</p>
<p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:13px;color:#000000">X Bilsenter AS</p>
<p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#000000">post@xbilsenter.no · 64 80 40 40</p>`.trim(),
  logo: `
<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:Arial,sans-serif">
  <tr>
    <td style="padding-right:14px;vertical-align:top">
      <img src="/assets/logo.svg" alt="Logo" data-placeholder="logo" style="width:84px;height:84px;object-fit:contain;border-radius:8px;background:#f2f5f2" />
    </td>
    <td style="vertical-align:top">
      <p style="margin:0 0 4px;font-size:14px;line-height:1.4"><strong>Navn Etternavn</strong></p>
      <p style="margin:0 0 4px;font-size:13px;color:#000000;font-weight:700">X Bilsenter AS</p>
      <p style="margin:0 0 4px;font-size:12px;color:#000000">AUTOREG-godkjent bilforhandler · Fetsund</p>
      <p style="margin:0;font-size:12px;color:#000000">
        <a href="mailto:post@xbilsenter.no" style="color:#19BA60;text-decoration:none">post@xbilsenter.no</a>
        · <a href="https://xbilsenter.no" style="color:#19BA60;text-decoration:none">xbilsenter.no</a>
        · 64 80 40 40
      </p>
    </td>
  </tr>
</table>`.trim(),
  banner: `
<div style="font-family:Arial,sans-serif;max-width:520px">
  <img src="/assets/logo.svg" alt="Banner" data-placeholder="banner" style="display:block;width:100%;max-width:420px;height:auto;border-radius:10px;margin-bottom:10px" />
  <p style="margin:0 0 4px;font-size:14px;color:#000000"><strong>Navn Etternavn</strong> · X Bilsenter AS</p>
  <p style="margin:0;font-size:12px;color:#000000">Vi hjelper deg finne riktig bil · Prøvekjøring etter avtale</p>
</div>`.trim()
};

function expandUploadUrls(html) {
  const origin = window.location.origin;
  return String(html || '').replace(/src=["'](\/uploads\/[^"']+)["']/gi, function (_m, path) {
    return `src="${origin}${path}"`;
  });
}

function normalizeUploadUrls(html) {
  const origin = window.location.origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(html || '')
    .replace(new RegExp(`src=["']${origin}(/uploads/[^"']+)["']`, 'gi'), 'src="$1"')
    .replace(/src=["'](\/uploads\/[^"']+)["']/gi, 'src="$1"');
}

export function buildSignaturePreviewHtml(bodyText, signaturHtml) {
  return buildOutgoingMailPreviewHtml({
    text: bodyText,
    signatur: signaturHtml
  });
}

export default function SignatureEditor({ value, onChange, accountName, accountEmail }) {
  const editorRef = useRef(null);
  const fileRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showHtml, setShowHtml] = useState(false);
  const [htmlSource, setHtmlSource] = useState(value || '');

  useEffect(function () {
    if (focused || showHtml) return;
    if (editorRef.current) {
      editorRef.current.innerHTML = expandUploadUrls(value || '');
    }
    setHtmlSource(value || '');
  }, [value, focused, showHtml]);

  const emit = () => {
    if (!editorRef.current) return;
    const html = prepareSignatureHtmlForSend(normalizeUploadUrls(editorRef.current.innerHTML));
    setHtmlSource(html);
    onChange(html);
  };

  const focusEditor = () => {
    editorRef.current?.focus();
  };

  const run = (command, val = null) => {
    focusEditor();
    document.execCommand(command, false, val);
    emit();
  };

  const insertHtml = (html) => {
    focusEditor();
    document.execCommand('insertHTML', false, html);
    emit();
  };

  const insertLink = () => {
    const url = window.prompt('Lenke (https://...)');
    if (!url) return;
    const sel = window.getSelection();
    const label = (sel && sel.toString()) || url;
    insertHtml(
      `<a href="${escapeHtmlAttr(url)}" style="color:#19BA60;text-decoration:none">${escapeHtmlText(label)}</a>`
    );
  };

  const insertTemplate = (key) => {
    let html = TEMPLATES[key];
    if (!html) return;
    html = html
      .replace(/post@xbilsenter.no/g, accountEmail || 'post@xbilsenter.no')
      .replace(/X Bilsenter AS/g, accountName ? `X Bilsenter AS` : 'X Bilsenter AS');
    if (editorRef.current?.innerHTML.trim()) {
      if (!window.confirm('Erstatt nåværende signatur med mal?')) return;
    }
    if (editorRef.current) {
      editorRef.current.innerHTML = expandUploadUrls(html);
      emit();
    }
  };

  const handleImage = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadSignatureImage(file);
      const src = res.absoluteUrl || `${window.location.origin}${res.url}`;
      insertHtml(`<img src="${src}" alt="" style="max-width:220px;height:auto;border-radius:8px;display:inline-block;margin:6px 0" />`);
    } catch (err) {
      window.alert(err.message || 'Kunne ikke laste opp bilde.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const applyHtmlSource = () => {
    const normalized = prepareSignatureHtmlForSend(normalizeUploadUrls(htmlSource));
    if (editorRef.current) editorRef.current.innerHTML = expandUploadUrls(normalized);
    onChange(normalized);
    setShowHtml(false);
  };

  return (
    <div className="sig-editor">
      <div className="sig-editor__toolbar">
        <div className="sig-editor__group">
          <button type="button" className="sig-btn" onClick={() => run('bold')} title="Fet"><b>B</b></button>
          <button type="button" className="sig-btn" onClick={() => run('italic')} title="Kursiv"><i>I</i></button>
          <button type="button" className="sig-btn" onClick={() => run('underline')} title="Understrek"><u>U</u></button>
          <button type="button" className="sig-btn" onClick={() => run('strikeThrough')} title="Gjennomstrek"><s>S</s></button>
        </div>
        <div className="sig-editor__group">
          <button type="button" className="sig-btn" onClick={() => run('formatBlock', 'p')} title="Normal">¶</button>
          <button type="button" className="sig-btn" onClick={() => run('formatBlock', 'h3')} title="Overskrift">H</button>
          <button type="button" className="sig-btn" onClick={() => run('insertUnorderedList')} title="Punktliste">•</button>
        </div>
        <div className="sig-editor__group">
          <button type="button" className="sig-btn" onClick={() => run('justifyLeft')} title="Venstre">⬅</button>
          <button type="button" className="sig-btn" onClick={() => run('justifyCenter')} title="Midtstilt">↔</button>
          <button type="button" className="sig-btn" onClick={() => run('justifyRight')} title="Høyre">➡</button>
        </div>
        <div className="sig-editor__group">
          <label className="sig-color" title="Tekstfarge">
            <span>A</span>
            <input type="color" defaultValue="#000000" onChange={e => run('foreColor', e.target.value)} />
          </label>
          <label className="sig-color sig-color--bg" title="Markering">
            <span>▮</span>
            <input type="color" defaultValue="#E8F7EE" onChange={e => run('hiliteColor', e.target.value)} />
          </label>
          <button type="button" className="sig-btn" onClick={insertLink} title="Lenke">🔗</button>
          <button type="button" className="sig-btn" onClick={() => run('insertHorizontalRule')} title="Linje">―</button>
        </div>
        <div className="sig-editor__group">
          <button type="button" className="sig-btn" onClick={() => fileRef.current?.click()} disabled={uploading} title="Last opp bilde">
            {uploading ? '…' : '🖼'}
          </button>
          <button type="button" className="sig-btn" onClick={() => run('removeFormat')} title="Fjern formatering">⌫</button>
          <button type="button" className="sig-btn" onClick={() => setShowHtml(v => !v)} title="HTML-kode">&lt;/&gt;</button>
        </div>
      </div>

      <div className="sig-editor__templates">
        <span className="sig-editor__templates-label">Maler:</span>
        <button type="button" className="btn btn-g btn-xs" onClick={() => insertTemplate('enkel')}>Enkel</button>
        <button type="button" className="btn btn-g btn-xs" onClick={() => insertTemplate('logo')}>Med logo</button>
        <button type="button" className="btn btn-g btn-xs" onClick={() => insertTemplate('banner')}>Med banner</button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={e => handleImage(e.target.files?.[0])}
      />

      {!showHtml ? (
        <div
          ref={editorRef}
          className="sig-editor__area"
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          data-placeholder="Bygg signatur med tekst, logo, lenker og farger…"
        />
      ) : (
        <div className="sig-editor__html">
          <textarea rows={10} value={htmlSource} onChange={e => setHtmlSource(e.target.value)} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-p btn-sm" onClick={applyHtmlSource}>Bruk HTML</button>
            <button type="button" className="btn btn-g btn-sm" onClick={() => setShowHtml(false)}>Tilbake til editor</button>
          </div>
        </div>
      )}

      {value && !showHtml && (
        <div className="sig-editor__preview">
          <div className="mail-signatur-preview__label">Forhåndsvisning</div>
          <div
            className="sig-editor__preview-body"
            dangerouslySetInnerHTML={{ __html: expandUploadUrls(prepareSignatureHtmlForSend(value)) }}
          />
        </div>
      )}
    </div>
  );
}
