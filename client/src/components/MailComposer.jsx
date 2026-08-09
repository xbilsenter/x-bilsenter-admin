import { useEffect, useRef, useState } from 'react';
import { uploadSignatureImage } from '../api.js';
import { normalizeOutgoingHtml } from '../mailHtmlNormalize.js';
import { buildOutgoingMailPreviewHtml } from '../mailContent.js';

const FONTS = [
  { label: 'Arial', value: 'Arial' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Times New Roman', value: 'Times New Roman' },
  { label: 'Verdana', value: 'Verdana' },
  { label: 'Courier New', value: 'Courier New' }
];

const FONT_SIZES = [
  { label: 'Liten', value: '12px' },
  { label: 'Normal', value: '14px' },
  { label: 'Medium', value: '16px' },
  { label: 'Stor', value: '18px' },
  { label: 'Overskrift', value: '24px' }
];

const LINE_HEIGHTS = [
  { label: 'Tett', value: '1.3' },
  { label: 'Normal', value: '1.6' },
  { label: 'Luftig', value: '1.9' },
  { label: 'Ekstra luftig', value: '2.2' }
];

const PARAGRAPH_SPACING = [
  { label: 'Ingen', value: '0' },
  { label: 'Liten', value: '8px' },
  { label: 'Normal', value: '16px' },
  { label: 'Stor', value: '24px' }
];

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

export function htmlIsEmpty(html) {
  return !String(html || '')
    .replace(/\u200B/g, '')
    .replace(/&#8203;/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
}

export function cleanComposeHtml(html) {
  return normalizeOutgoingHtml(html);
}

export function buildMailPreviewHtml(bodyHtml, signaturHtml, quoteHtml) {
  return buildOutgoingMailPreviewHtml({
    html: cleanComposeHtml(bodyHtml),
    signatur: signaturHtml,
    quoteHtml: quoteHtml || ''
  });
}

export default function MailComposer({ value, onChange, placeholder }) {
  const editorRef = useRef(null);
  const imageRef = useRef(null);
  const htmlHistoryRef = useRef({ past: [], future: [] });
  const editorHistoryRef = useRef({ past: [''], future: [], recording: true });
  const [focused, setFocused] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showHtml, setShowHtml] = useState(false);
  const [htmlSource, setHtmlSource] = useState(value || '');
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });

  useEffect(function () {
    if (focused || showHtml) return;
    const html = value || '';
    if (editorRef.current) {
      editorRef.current.innerHTML = expandUploadUrls(html);
    }
    setHtmlSource(html);
    editorHistoryRef.current = { past: [normalizeUploadUrls(html)], future: [], recording: true };
    refreshHistory(true);
  }, [value, focused, showHtml]);

  const getEditorHtml = () => normalizeUploadUrls(editorRef.current?.innerHTML || '');

  const refreshHistory = (useEditorStack) => {
    if (showHtml) {
      const h = htmlHistoryRef.current;
      setHistoryState({
        canUndo: h.past.length > 0,
        canRedo: h.future.length > 0
      });
      return;
    }
    if (useEditorStack) {
      const h = editorHistoryRef.current;
      setHistoryState({
        canUndo: h.past.length > 1,
        canRedo: h.future.length > 0
      });
      return;
    }
    const h = editorHistoryRef.current;
    setHistoryState({
      canUndo: h.past.length > 1 || document.queryCommandEnabled('undo'),
      canRedo: h.future.length > 0 || document.queryCommandEnabled('redo')
    });
  };

  useEffect(function () {
    refreshHistory(true);
  }, [showHtml]);

  const pushEditorHistory = () => {
    const h = editorHistoryRef.current;
    if (!h.recording || !editorRef.current) return;
    const html = getEditorHtml();
    const last = h.past[h.past.length - 1];
    if (last === html) return;
    h.past.push(html);
    if (h.past.length > 100) h.past.shift();
    h.future = [];
    refreshHistory(true);
  };

  const emit = () => {
    if (!editorRef.current) return;
    const html = getEditorHtml();
    setHtmlSource(html);
    onChange(html);
    pushEditorHistory();
  };

  const focusEditor = () => {
    editorRef.current?.focus();
  };

  const undo = () => {
    if (showHtml) {
      const h = htmlHistoryRef.current;
      if (!h.past.length) return;
      h.future.unshift(htmlSource);
      const prev = h.past.pop();
      setHtmlSource(prev);
      refreshHistory(true);
      return;
    }

    const h = editorHistoryRef.current;
    if (h.past.length > 1) {
      h.recording = false;
      h.future.unshift(getEditorHtml());
      h.past.pop();
      const prev = h.past[h.past.length - 1] || '';
      if (editorRef.current) editorRef.current.innerHTML = expandUploadUrls(prev);
      const html = getEditorHtml();
      setHtmlSource(html);
      onChange(html);
      h.recording = true;
      refreshHistory(true);
      return;
    }

    focusEditor();
    document.execCommand('undo');
    const html = getEditorHtml();
    setHtmlSource(html);
    onChange(html);
    refreshHistory(true);
  };

  const redo = () => {
    if (showHtml) {
      const h = htmlHistoryRef.current;
      if (!h.future.length) return;
      h.past.push(htmlSource);
      const next = h.future.shift();
      setHtmlSource(next);
      refreshHistory(true);
      return;
    }

    const h = editorHistoryRef.current;
    if (h.future.length) {
      h.recording = false;
      h.past.push(getEditorHtml());
      const next = h.future.shift() || '';
      if (editorRef.current) editorRef.current.innerHTML = expandUploadUrls(next);
      const html = getEditorHtml();
      setHtmlSource(html);
      onChange(html);
      h.recording = true;
      refreshHistory(true);
      return;
    }

    focusEditor();
    document.execCommand('redo');
    const html = getEditorHtml();
    setHtmlSource(html);
    onChange(html);
    refreshHistory(true);
  };

  const handleEditorKeyDown = (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    if (e.key === 'z' || e.key === 'Z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (e.key === 'y' || e.key === 'Y') {
      e.preventDefault();
      redo();
    }
  };

  const handleHtmlChange = (next) => {
    const h = htmlHistoryRef.current;
    h.past.push(htmlSource);
    if (h.past.length > 100) h.past.shift();
    h.future = [];
    setHtmlSource(next);
    refreshHistory(true);
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

  const getBlockElement = () => {
    const sel = window.getSelection();
    let node = sel?.anchorNode;
    if (!node || !editorRef.current) return null;
    if (node.nodeType === 3) node = node.parentElement;
    while (node && node !== editorRef.current) {
      if (/^(P|DIV|H[1-6]|LI|BLOCKQUOTE)$/i.test(node.tagName)) return node;
      node = node.parentElement;
    }
    return editorRef.current;
  };

  const applyBlockStyle = (prop, val) => {
    focusEditor();
    const block = getBlockElement();
    if (!block || block === editorRef.current) {
      document.execCommand('formatBlock', false, 'p');
    }
    const target = getBlockElement();
    if (target && target !== editorRef.current) {
      target.style[prop] = val;
    }
    emit();
  };

  const applyFontFamily = (family) => {
    focusEditor();
    document.execCommand('fontName', false, family);
    emit();
  };

  const applyFontSize = (size) => {
    focusEditor();
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) {
      insertHtml(`<span style="font-size:${size}">&#8203;</span>`);
      return;
    }
    const span = document.createElement('span');
    span.style.fontSize = size;
    try {
      range.surroundContents(span);
    } catch {
      document.execCommand('insertHTML', false, `<span style="font-size:${size}">${range.toString()}</span>`);
    }
    emit();
  };

  const insertLink = () => {
    const url = window.prompt('Lenke (https://...)');
    if (!url) return;
    run('createLink', url);
  };

  const handleImage = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadSignatureImage(file);
      const src = res.absoluteUrl || `${window.location.origin}${res.url}`;
      insertHtml(`<img src="${src}" alt="" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:10px 0" />`);
    } catch (err) {
      window.alert(err.message || 'Kunne ikke laste opp bilde.');
    } finally {
      setUploading(false);
      if (imageRef.current) imageRef.current.value = '';
    }
  };

  const applyHtmlSource = () => {
    const normalized = normalizeUploadUrls(htmlSource);
    if (editorRef.current) editorRef.current.innerHTML = expandUploadUrls(normalized);
    onChange(normalized);
    htmlHistoryRef.current = { past: [], future: [] };
    editorHistoryRef.current = { past: [normalized], future: [], recording: true };
    setShowHtml(false);
    refreshHistory(true);
  };

  const toggleHtml = () => {
    setShowHtml(function (prev) {
      if (!prev) {
        htmlHistoryRef.current = { past: [], future: [] };
      } else {
        editorHistoryRef.current = {
          past: [getEditorHtml()],
          future: [],
          recording: true
        };
      }
      return !prev;
    });
  };

  return (
    <div className="sig-editor mail-composer">
      <div className="mail-composer__history">
        <button type="button" className="sig-btn sig-btn--wide" onClick={undo} disabled={!historyState.canUndo} title="Angre siste endring (Ctrl+Z)">
          ↶ Angre
        </button>
        <button type="button" className="sig-btn sig-btn--wide" onClick={redo} disabled={!historyState.canRedo} title="Gjør om (Ctrl+Y)">
          ↷ Gjør om
        </button>
        <span className="mail-composer__history-hint">Tastatur: Ctrl+Z / Ctrl+Y</span>
      </div>
      <div className="sig-editor__toolbar">
        <div className="sig-editor__group">
          <button type="button" className="sig-btn" onClick={() => run('bold')} title="Fet"><b>B</b></button>
          <button type="button" className="sig-btn" onClick={() => run('italic')} title="Kursiv"><i>I</i></button>
          <button type="button" className="sig-btn" onClick={() => run('underline')} title="Understrek"><u>U</u></button>
          <button type="button" className="sig-btn" onClick={() => run('strikeThrough')} title="Gjennomstrek"><s>S</s></button>
        </div>
        <div className="sig-editor__group">
          <select className="mail-composer__select" defaultValue="Arial" onChange={e => applyFontFamily(e.target.value)} title="Skrifttype">
            {FONTS.map(function (f) {
              return <option key={f.value} value={f.value}>{f.label}</option>;
            })}
          </select>
          <select className="mail-composer__select" defaultValue="14px" onChange={e => applyFontSize(e.target.value)} title="Størrelse">
            {FONT_SIZES.map(function (f) {
              return <option key={f.value} value={f.value}>{f.label}</option>;
            })}
          </select>
        </div>
        <div className="sig-editor__group">
          <button type="button" className="sig-btn" onClick={() => run('formatBlock', 'p')} title="Avsnitt">¶</button>
          <button type="button" className="sig-btn" onClick={() => run('formatBlock', 'h3')} title="Overskrift">H</button>
          <button type="button" className="sig-btn" onClick={() => run('insertUnorderedList')} title="Punktliste">•</button>
          <button type="button" className="sig-btn" onClick={() => run('insertOrderedList')} title="Nummerert liste">1.</button>
        </div>
        <div className="sig-editor__group">
          <select className="mail-composer__select" defaultValue="1.6" onChange={e => applyBlockStyle('lineHeight', e.target.value)} title="Linjeavstand">
            {LINE_HEIGHTS.map(function (f) {
              return <option key={f.value} value={f.value}>{f.label}</option>;
            })}
          </select>
          <select className="mail-composer__select" defaultValue="16px" onChange={e => applyBlockStyle('marginBottom', e.target.value)} title="Avstand mellom avsnitt">
            {PARAGRAPH_SPACING.map(function (f) {
              return <option key={f.value} value={f.value}>{f.label}</option>;
            })}
          </select>
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
          <button type="button" className="sig-btn" onClick={() => imageRef.current?.click()} disabled={uploading} title="Sett inn bilde">
            {uploading ? '…' : '🖼'}
          </button>
          <button type="button" className="sig-btn" onClick={() => run('removeFormat')} title="Fjern formatering">⌫</button>
          <button type="button" className="sig-btn" onClick={toggleHtml} title="HTML-kode">&lt;/&gt;</button>
        </div>
      </div>

      <input
        ref={imageRef}
        type="file"
        accept="image/*"
        hidden
        onChange={e => handleImage(e.target.files?.[0])}
      />

      {!showHtml ? (
        <div
          ref={editorRef}
          className="sig-editor__area mail-composer__area"
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onKeyDown={handleEditorKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            const html = cleanComposeHtml(getEditorHtml());
            if (html !== String(value || '')) onChange(html);
          }}
          data-placeholder={placeholder || 'Skriv meldingen her…'}
        />
      ) : (
        <div className="sig-editor__html">
          <textarea
            rows={12}
            value={htmlSource}
            onChange={e => handleHtmlChange(e.target.value)}
            onKeyDown={handleEditorKeyDown}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-g btn-sm" onClick={undo} disabled={!historyState.canUndo}>Angre</button>
            <button type="button" className="btn btn-g btn-sm" onClick={redo} disabled={!historyState.canRedo}>Gjør om</button>
            <button type="button" className="btn btn-p btn-sm" onClick={applyHtmlSource}>Bruk HTML</button>
            <button type="button" className="btn btn-g btn-sm" onClick={() => setShowHtml(false)}>Tilbake til editor</button>
          </div>
        </div>
      )}
    </div>
  );
}
