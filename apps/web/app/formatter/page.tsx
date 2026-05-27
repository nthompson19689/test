'use client';

import { useState, useRef, useEffect } from 'react';

const UNICODE_MAPS = {
  bold: Object.fromEntries([
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('').map((c, i) => {
      if (i < 26) return [c, String.fromCodePoint(0x1D400 + i)];
      if (i < 52) return [c, String.fromCodePoint(0x1D41A + (i - 26))];
      return [c, String.fromCodePoint(0x1D7CE + (i - 52))];
    })
  ]),
  italic: Object.fromEntries([
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('').map((c, i) => {
      if (i < 26) {
        if (c === 'h') return [c, 'ℎ'];
        return [c, String.fromCodePoint(0x1D434 + i)];
      }
      return [c, String.fromCodePoint(0x1D44E + (i - 26))];
    })
  ]),
  boldItalic: Object.fromEntries([
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('').map((c, i) => {
      if (i < 26) return [c, String.fromCodePoint(0x1D468 + i)];
      return [c, String.fromCodePoint(0x1D482 + (i - 26))];
    })
  ]),
} as Record<string, Record<string, string>>;

function applyFormat(text: string, format: string): string {
  if (format === 'strikethrough') return [...text].map(c => c + '̶').join('');
  if (format === 'underline') return [...text].map(c => c + '̲').join('');
  const map = UNICODE_MAPS[format];
  if (!map) return text;
  return [...text].map(c => map[c] || c).join('');
}

function applyBullets(text: string, bulletChar: string): string {
  return text.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    const cleaned = trimmed.replace(/^[-•→✓★►◆]\s*/, '');
    return `${bulletChar} ${cleaned}`;
  }).join('\n');
}

const BULLET_STYLES = [
  { char: '•', label: 'Bullet' },
  { char: '-', label: 'Dash' },
  { char: '→', label: 'Arrow' },
  { char: '✓', label: 'Check' },
  { char: '★', label: 'Star' },
  { char: '►', label: 'Triangle' },
];

const SEPARATORS = [
  { chars: '─'.repeat(20), label: 'Line' },
  { chars: '• • •', label: 'Dots' },
  { chars: '⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯', label: 'Dash' },
  { chars: '✦ ✦ ✦', label: 'Stars' },
];

const SEE_MORE_CUTOFF = 210;

export default function LinkedInFormatter() {
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('format');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    import('@iframe-resizer/child');
  }, []);

  const getSelection = () => {
    const el = textareaRef.current;
    if (!el) return { start: 0, end: 0, selected: '' };
    return { start: el.selectionStart, end: el.selectionEnd, selected: text.substring(el.selectionStart, el.selectionEnd) };
  };

  const replaceSelection = (newText: string, start: number, end: number) => {
    const updated = text.substring(0, start) + newText + text.substring(end);
    setText(updated);
    setTimeout(() => {
      const el = textareaRef.current;
      if (el) { el.focus(); el.setSelectionRange(start, start + newText.length); }
    }, 0);
  };

  const handleFormat = (format: string) => {
    const { start, end, selected } = getSelection();
    if (!selected) return;
    replaceSelection(applyFormat(selected, format), start, end);
  };

  const handleBullet = (bulletChar: string) => {
    const { start, end, selected } = getSelection();
    if (selected) {
      replaceSelection(applyBullets(selected, bulletChar), start, end);
    } else {
      setText(text.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        return `${bulletChar} ${trimmed.replace(/^[-•→✓★►◆]\s*/, '')}`;
      }).join('\n'));
    }
  };

  const handleSeparator = (sep: string) => {
    const { start } = getSelection();
    const before = text.substring(0, start);
    const after = text.substring(start);
    const nl1 = before && !before.endsWith('\n') ? '\n' : '';
    const nl2 = after && !after.startsWith('\n') ? '\n' : '';
    setText(before + nl1 + sep + nl2 + after);
  };

  const handleLineSpacing = () => setText(text.split('\n').join('\n\n'));

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(text); } catch {
      const el = textareaRef.current;
      if (el) { el.select(); document.execCommand('copy'); }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const charCount = [...text].length;
  const lineCount = text ? text.split('\n').length : 0;
  const willTruncate = charCount > SEE_MORE_CUTOFF;

  return (
    <div style={{
      fontFamily: "'Source Sans 3', 'Source Sans Pro', -apple-system, sans-serif",
      background: '#f5f2ec',
      color: '#1a1a1a',
      minHeight: '100vh',
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{
        background: '#ffffff',
        borderBottom: '1px solid #e5e0d8',
        padding: '14px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 100 100" fill="none">
              <circle cx="50" cy="50" r="48" stroke="#1a1a1a" strokeWidth="4"/>
              <path d="M35 65 C35 35, 50 25, 50 25 C50 25, 65 35, 65 65" stroke="#1a1a1a" strokeWidth="4" fill="none"/>
              <path d="M30 55 C30 35, 50 20, 50 20 C50 20, 70 35, 70 55" stroke="#1a1a1a" strokeWidth="3" fill="none" opacity="0.4"/>
            </svg>
          </div>
          <div>
            <span style={{ fontSize: '15px', fontWeight: '700', color: '#1a1a1a', letterSpacing: '-0.02em' }}>Ordinal</span>
            <span style={{ fontSize: '13px', color: '#888', fontWeight: '400', marginLeft: '6px' }}>LinkedIn Post Formatter</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setText('')} style={{
            background: '#fff', border: '1px solid #ddd8d0', color: '#666',
            padding: '7px 14px', borderRadius: '6px', fontSize: '13px',
            fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit',
          }}>Clear</button>
          <button onClick={handleCopy} style={{
            background: copied ? '#e8f5e9' : '#2d6a4f',
            border: copied ? '1px solid #a5d6a7' : '1px solid #2d6a4f',
            color: copied ? '#2e7d32' : '#ffffff',
            padding: '7px 16px', borderRadius: '6px', fontSize: '13px',
            fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
          }}>
            {copied ? '✓ Copied' : 'Copy to Clipboard'}
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '20px',
        maxWidth: '1120px',
        margin: '0 auto',
        padding: '20px 24px',
        minHeight: 'calc(100vh - 57px)',
      }}>
        {/* Editor Card */}
        <div style={{
          background: '#ffffff', borderRadius: '10px', border: '1px solid #e5e0d8',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid #eee9e2',
            fontSize: '11px', fontWeight: '700', color: '#999',
            letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>Editor</div>

          {/* Tabs */}
          <div style={{
            display: 'flex', borderBottom: '1px solid #eee9e2',
            padding: '0 12px', background: '#faf8f5',
          }}>
            {[{ id: 'format', label: 'Format' }, { id: 'bullets', label: 'Lists' }, { id: 'extras', label: 'Extras' }].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                background: 'none', border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid #2d6a4f' : '2px solid transparent',
                color: activeTab === tab.id ? '#1a1a1a' : '#999',
                padding: '9px 14px', fontSize: '12px', fontWeight: '600',
                cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.02em',
              }}>{tab.label}</button>
            ))}
          </div>

          {/* Toolbar */}
          <div style={{
            padding: '10px 14px', borderBottom: '1px solid #eee9e2',
            display: 'flex', alignItems: 'center', flexWrap: 'wrap',
            gap: '5px', minHeight: '48px', background: '#faf8f5',
          }}>
            {activeTab === 'format' && (
              <>
                {[
                  { format: 'bold', label: 'B', extra: { fontWeight: '800' as const } },
                  { format: 'italic', label: 'I', extra: { fontStyle: 'italic' as const } },
                  { format: 'boldItalic', label: 'BI', extra: { fontWeight: '800' as const, fontStyle: 'italic' as const, fontSize: '11px' } },
                  { format: 'strikethrough', label: 'S', extra: { textDecoration: 'line-through' as const } },
                  { format: 'underline', label: 'U', extra: { textDecoration: 'underline' as const } },
                ].map(btn => (
                  <button key={btn.format} onClick={() => handleFormat(btn.format)} style={{
                    background: '#fff', border: '1px solid #ddd8d0', color: '#444',
                    width: '34px', height: '34px', borderRadius: '6px', fontSize: '13px',
                    cursor: 'pointer', fontFamily: "'Georgia', serif",
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    ...btn.extra,
                  }}>{btn.label}</button>
                ))}
                <span style={{ color: '#bbb', fontSize: '11px', marginLeft: '6px' }}>Select text first</span>
              </>
            )}
            {activeTab === 'bullets' && BULLET_STYLES.map(b => (
              <button key={b.char} onClick={() => handleBullet(b.char)} style={{
                background: '#fff', border: '1px solid #ddd8d0', color: '#555',
                padding: '5px 10px', borderRadius: '6px', fontSize: '12px',
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}>
                <span style={{ fontSize: '14px' }}>{b.char}</span>
                <span style={{ color: '#999', fontSize: '11px' }}>{b.label}</span>
              </button>
            ))}
            {activeTab === 'extras' && (
              <>
                {SEPARATORS.map(s => (
                  <button key={s.label} onClick={() => handleSeparator(s.chars)} style={{
                    background: '#fff', border: '1px solid #ddd8d0', color: '#555',
                    padding: '5px 10px', borderRadius: '6px', fontSize: '12px',
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: '4px',
                  }}>{s.label}</button>
                ))}
                <button onClick={handleLineSpacing} style={{
                  background: '#fff', border: '1px solid #ddd8d0', color: '#555',
                  padding: '5px 10px', borderRadius: '6px', fontSize: '12px',
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: '4px',
                }}>↕ Spacing</button>
              </>
            )}
          </div>

          {/* Textarea */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={"Write or paste your LinkedIn post here...\n\nSelect any text and use the toolbar above to apply bold, italic, or other formatting."}
              style={{
                flex: 1, background: '#fff', border: 'none', color: '#1a1a1a',
                padding: '16px', fontSize: '14px', lineHeight: '1.75',
                fontFamily: "'Source Sans 3', 'Source Sans Pro', -apple-system, sans-serif",
                resize: 'none', outline: 'none', minHeight: '320px',
              }}
            />
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 16px', fontSize: '11px', color: '#999',
              borderTop: '1px solid #eee9e2', background: '#faf8f5',
            }}>
              <div style={{ display: 'flex', gap: '14px' }}>
                <span>{charCount} chars</span>
                <span>{lineCount} lines</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: willTruncate ? '#c77d00' : '#999' }}>
                <span style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: willTruncate ? '#c77d00' : '#ddd', display: 'inline-block',
                }} />
                {willTruncate ? '"See more" will appear' : 'Full post visible in feed'}
              </div>
            </div>
          </div>
        </div>

        {/* Preview Card */}
        <div style={{
          background: '#ffffff', borderRadius: '10px', border: '1px solid #e5e0d8',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid #eee9e2',
            fontSize: '11px', fontWeight: '700', color: '#999',
            letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>Live Preview</div>

          <div style={{
            flex: 1, padding: '20px', overflowY: 'auto',
            display: 'flex', justifyContent: 'center', background: '#faf8f5',
          }}>
            <div style={{
              background: '#fff', borderRadius: '8px', border: '1px solid #e8e8e8',
              width: '100%', maxWidth: '460px', alignSelf: 'flex-start',
            }}>
              <div style={{ padding: '12px 16px 8px', display: 'flex', gap: '10px' }}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '50%', background: '#2d6a4f',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '16px', fontWeight: '700', color: '#fff', flexShrink: 0,
                }}>YN</div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a' }}>Your Name</div>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>Your headline here</div>
                  <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>Just now · 🌐</div>
                </div>
              </div>

              <div style={{
                padding: '4px 16px 16px', fontSize: '14px', lineHeight: '1.5',
                color: '#1a1a1a', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {text ? (
                  willTruncate ? (
                    <>
                      {text.substring(0, SEE_MORE_CUTOFF)}
                      <span style={{ color: '#999' }}>... </span>
                      <span style={{ color: '#0a66c2', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>see more</span>
                    </>
                  ) : text
                ) : (
                  <span style={{ color: '#bbb', fontStyle: 'italic' }}>Your formatted post will preview here...</span>
                )}
              </div>

              <div style={{
                padding: '8px 16px', borderTop: '1px solid #eee',
                display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#888',
              }}>
                <span>👍 ❤️ 12</span>
                <span>3 comments · 1 repost</span>
              </div>
              <div style={{
                padding: '4px 16px 8px', borderTop: '1px solid #eee',
                display: 'flex', justifyContent: 'space-around', fontSize: '13px', color: '#666',
              }}>
                <span>👍 Like</span>
                <span>💬 Comment</span>
                <span>🔄 Repost</span>
                <span>📤 Send</span>
              </div>
            </div>
          </div>

          <div style={{ padding: '14px 16px', borderTop: '1px solid #eee9e2', textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>
              Want scheduling, auto-engagement, and analytics?
            </div>
            <a href="https://www.tryordinal.com" target="_blank" rel="noopener noreferrer"
              style={{ color: '#2d6a4f', fontSize: '13px', fontWeight: '600', textDecoration: 'none' }}>
              Try Ordinal free →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
