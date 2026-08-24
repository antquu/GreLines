/**
 * Le bloc de code de la documentation.
 *
 * Une barre de titre qui porte le nom du fichier et un bouton pour copier, puis
 * le code lui-même, coloré. C'est la forme qu'ont prise toutes les
 * documentations techniques, et pour de bonnes raisons : le nom du fichier dit
 * où coller ce qu'on lit, et le bouton évite la sélection à la souris, qui
 * attrape une ligne de trop une fois sur deux.
 *
 * La coloration est faite ici, à la main, plutôt que par une bibliothèque.
 * Celles qui font ça bien pèsent plusieurs centaines de kilo-octets et
 * connaissent deux cents langages ; il en faut quatre, sur des extraits de dix
 * lignes, dans une page qu'on veut légère. Le découpage ci-dessous est donc
 * volontairement grossier : il ne comprend pas le code, il reconnaît des
 * formes. Sur un extrait de documentation, cela suffit ; sur un fichier entier,
 * cela se verrait, et c'est pourquoi on n'en met pas.
 */

import { useState } from 'react';

export type CodeLang = 'ts' | 'bash' | 'env' | 'sql' | 'json' | 'txt';

/** Un morceau de code et ce qu'on en a reconnu. */
interface Token {
  text: string;
  kind: 'plain' | 'comment' | 'string' | 'number' | 'keyword' | 'call' | 'punct';
}

const KEYWORDS: Record<CodeLang, string[]> = {
  ts: [
    'import', 'from', 'export', 'const', 'let', 'var', 'function', 'async', 'await',
    'return', 'if', 'else', 'for', 'of', 'in', 'new', 'class', 'interface', 'type',
    'try', 'catch', 'throw', 'default', 'null', 'true', 'false',
  ],
  bash: [
    'npm', 'npx', 'git', 'cd', 'cp', 'echo', 'export', 'run', 'install', 'clone',
    'vercel', 'supabase', 'psql', 'node',
  ],
  env: [],
  sql: [
    'create', 'table', 'if', 'not', 'exists', 'select', 'insert', 'update', 'delete',
    'from', 'where', 'primary', 'key', 'default', 'null', 'text', 'uuid', 'timestamptz',
    'boolean', 'alter', 'enable', 'row', 'level', 'security', 'policy', 'on', 'to',
    'using', 'grant',
  ],
  json: ['true', 'false', 'null'],
  txt: [],
};

/**
 * Découpe une ligne en morceaux reconnus.
 *
 * L'ordre des essais compte : un commentaire peut contenir une apostrophe, une
 * chaîne peut contenir un dièse. On teste donc du plus englobant au plus
 * précis, et l'on avance dans la ligne sans jamais revenir en arrière.
 */
function tokenize(line: string, lang: CodeLang): Token[] {
  const tokens: Token[] = [];
  const keywords = new Set(KEYWORDS[lang]);
  let index = 0;
  let buffer = '';

  const flush = () => {
    if (!buffer) return;
    tokens.push({ text: buffer, kind: 'plain' });
    buffer = '';
  };

  /* Une ligne entièrement en commentaire se règle d'un coup. */
  const trimmed = line.trimStart();
  const commentStart =
    (lang === 'ts' || lang === 'json') && trimmed.startsWith('//')
      ? '//'
      : (lang === 'bash' || lang === 'env') && trimmed.startsWith('#')
        ? '#'
        : lang === 'sql' && trimmed.startsWith('--')
          ? '--'
          : null;
  if (commentStart) return [{ text: line, kind: 'comment' }];

  while (index < line.length) {
    const char = line[index];

    /* Les chaînes, de leur ouverture à leur fermeture, ou à la fin de la ligne
       si l'extrait est coupé. */
    if (char === '"' || char === "'" || char === '`') {
      flush();
      let end = index + 1;
      while (end < line.length && line[end] !== char) {
        if (line[end] === '\\') end += 1;
        end += 1;
      }
      tokens.push({ text: line.slice(index, Math.min(end + 1, line.length)), kind: 'string' });
      index = end + 1;
      continue;
    }

    /* Un mot : mot-clé, appel de fonction, ou rien de particulier. */
    if (/[A-Za-z_$]/.test(char)) {
      flush();
      let end = index;
      while (end < line.length && /[A-Za-z0-9_$]/.test(line[end])) end += 1;
      const word = line.slice(index, end);
      const isCall = line[end] === '(';
      const lowered = word.toLowerCase();
      tokens.push({
        text: word,
        kind: keywords.has(lang === 'sql' ? lowered : word)
          ? 'keyword'
          : isCall
            ? 'call'
            : 'plain',
      });
      index = end;
      continue;
    }

    /* Un nombre. */
    if (/[0-9]/.test(char)) {
      flush();
      let end = index;
      while (end < line.length && /[0-9._]/.test(line[end])) end += 1;
      tokens.push({ text: line.slice(index, end), kind: 'number' });
      index = end;
      continue;
    }

    if (/[{}[\]().,;:=<>+\-*/|&!?]/.test(char)) {
      flush();
      tokens.push({ text: char, kind: 'punct' });
      index += 1;
      continue;
    }

    buffer += char;
    index += 1;
  }

  flush();
  return tokens;
}

function CopyIcon({ copied }: { copied: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      {copied ? (
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      ) : (
        <>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M15 6.5V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h1.5" />
        </>
      )}
    </svg>
  );
}

/** L'étiquette du langage, dans la pastille à gauche du nom de fichier. */
const BADGE: Record<CodeLang, string> = {
  ts: 'TS',
  bash: '>_',
  env: 'ENV',
  sql: 'SQL',
  json: '{ }',
  txt: 'TXT',
};

export function CodeBlock({
  code,
  lang = 'txt',
  file,
  copyLabel,
  copiedLabel,
}: {
  code: string;
  lang?: CodeLang;
  /** Le nom du fichier, s'il y en a un. Sans lui, la barre de titre disparaît. */
  file?: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Presse-papier refusé, en http ou sur un vieux navigateur : le code
         reste sélectionnable à la main, ce qui marchait déjà avant. */
    }
  };

  const lines = code.split('\n');

  return (
    <figure className="docs-code">
      {file && (
        <figcaption className="docs-code-bar">
          <span className="docs-code-badge">{BADGE[lang]}</span>
          <span className="docs-code-file">{file}</span>
          <button
            type="button"
            onClick={copy}
            className="docs-code-copy"
            aria-label={copied ? copiedLabel : copyLabel}
            title={copied ? copiedLabel : copyLabel}
          >
            <CopyIcon copied={copied} />
          </button>
        </figcaption>
      )}

      <div className="docs-code-body">
        {!file && (
          <button
            type="button"
            onClick={copy}
            className="docs-code-copy docs-code-copy-float"
            aria-label={copied ? copiedLabel : copyLabel}
            title={copied ? copiedLabel : copyLabel}
          >
            <CopyIcon copied={copied} />
          </button>
        )}
        <pre>
          <code>
            {lines.map((line, lineIndex) => (
              <span key={lineIndex} className="docs-code-line">
                {tokenize(line, lang).map((token, tokenIndex) => (
                  <span key={tokenIndex} className={`tok-${token.kind}`}>
                    {token.text}
                  </span>
                ))}
                {'\n'}
              </span>
            ))}
          </code>
        </pre>
      </div>
    </figure>
  );
}
