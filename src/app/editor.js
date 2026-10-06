// Code editor: CodeMirror 5 (loaded from CDN as a global) with a textarea fallback.
const JS_WORDS = ['function', 'return', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'Math', 'Math.sin', 'Math.cos', 'Math.atan2', 'Math.sqrt', 'Math.abs', 'Math.min', 'Math.max', 'Math.sign', 'Math.PI', 'Math.hypot', 'Math.exp', 'Math.tanh', 'console.log', 'Array.from', 'Number.isFinite'];

export class CodeEditor {
  constructor(host, { onRun, onChange, completions } = {}) {
    this.host = host;
    this.onRun = onRun;
    this.onChange = onChange;
    this.completions = completions || (() => ({}));
    this.errorMarks = [];
    const CM = window.CodeMirror;
    if (CM) {
      this.cm = CM(host, {
        value: '',
        mode: 'javascript',
        lineNumbers: true,
        indentUnit: 2,
        tabSize: 2,
        indentWithTabs: false,
        matchBrackets: true,
        autoCloseBrackets: true,
        styleActiveLine: true,
        lineWrapping: false,
        gutters: ['cm-err-gutter', 'CodeMirror-linenumbers'],
        extraKeys: {
          'Ctrl-Enter': () => this.onRun?.(),
          'Cmd-Enter': () => this.onRun?.(),
          'Shift-Enter': () => this.onRun?.({ keepState: true }),
          'Ctrl-/': 'toggleComment',
          'Cmd-/': 'toggleComment',
          'Ctrl-Space': 'autocomplete',
          Tab: (cm) => {
            if (cm.somethingSelected()) cm.indentSelection('add');
            else cm.replaceSelection('  ', 'end');
          },
          'Shift-Tab': (cm) => cm.indentSelection('subtract'),
        },
        hintOptions: { hint: (cm) => this._hint(cm), completeSingle: false },
      });
      this.cm.on('change', () => this.onChange?.(this.getValue()));
      this.cm.on('inputRead', (cm, change) => {
        if (change.text.length === 1 && /[\w.]/.test(change.text[0]) && cm.showHint) {
          const cur = cm.getCursor();
          const line = cm.getLine(cur.line).slice(0, cur.ch);
          if (/(ctx(\.\w+)*\.)$|(\b[a-zA-Z]{2,})$/.test(line)) cm.showHint({ completeSingle: false });
        }
      });
    } else {
      const ta = document.createElement('textarea');
      ta.className = 'code-fallback';
      ta.spellcheck = false;
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const s = ta.selectionStart;
          ta.setRangeText('  ', s, ta.selectionEnd, 'end');
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          this.onRun?.();
        }
      });
      ta.addEventListener('input', () => this.onChange?.(this.getValue()));
      host.appendChild(ta);
      this.ta = ta;
    }
  }
  getValue() {
    return this.cm ? this.cm.getValue() : this.ta.value;
  }
  setValue(v) {
    this.clearError();
    if (this.cm) {
      this.cm.setValue(v);
      this.cm.clearHistory();
    } else this.ta.value = v;
  }
  refresh() {
    this.cm?.refresh();
  }
  // Replace character ranges (offsets into getValue()) as one undoable edit.
  replaceSpans(spans) {
    const sorted = [...spans].sort((a, b) => b.start - a.start);
    if (this.cm) {
      const cm = this.cm;
      cm.operation(() => {
        for (const s of sorted) cm.replaceRange(s.text, cm.posFromIndex(s.start), cm.posFromIndex(s.end), '+tune');
      });
    } else {
      let v = this.ta.value;
      for (const s of sorted) v = v.slice(0, s.start) + s.text + v.slice(s.end);
      this.ta.value = v;
      this.onChange?.(v);
    }
  }
  focus() {
    (this.cm || this.ta)?.focus();
  }
  clearError() {
    if (!this.cm) return;
    for (const m of this.errorMarks) {
      if (m.widget) m.widget.clear();
      if (m.line != null) {
        this.cm.removeLineClass(m.line, 'background', 'cm-err-line');
        this.cm.setGutterMarker(m.line, 'cm-err-gutter', null);
      }
    }
    this.errorMarks = [];
  }
  markError(line, message) {
    this.clearError();
    if (!this.cm || !line) return;
    const ln = Math.max(0, Math.min(this.cm.lineCount() - 1, line - 1));
    this.cm.addLineClass(ln, 'background', 'cm-err-line');
    const dot = document.createElement('div');
    dot.className = 'cm-err-dot';
    dot.title = message;
    this.cm.setGutterMarker(ln, 'cm-err-gutter', dot);
    const w = document.createElement('div');
    w.className = 'cm-err-widget';
    w.textContent = message;
    const widget = this.cm.addLineWidget(ln, w, { coverGutter: false, noHScroll: true });
    this.errorMarks.push({ line: ln, widget });
    this.cm.scrollIntoView({ line: ln, ch: 0 }, 80);
  }

  _hint(cm) {
    const cur = cm.getCursor();
    const line = cm.getLine(cur.line);
    let start = cur.ch;
    while (start > 0 && /[\w$]/.test(line[start - 1])) start--;
    const word = line.slice(start, cur.ch);
    const before = line.slice(0, start);
    const C = this.completions();
    let list = [];
    const m = before.match(/((?:[\w$]+\.)+)$/);
    if (m) {
      const path = m[1].slice(0, -1); // e.g. "ctx.y"
      const entries = C.members?.[path.replace(/^.*?\b(ctx(?:\.\w+)*)$/, '$1')] || C.members?.[path];
      if (entries) list = entries;
    } else {
      list = [...(C.globals || []), ...JS_WORDS.map((w) => ({ text: w, hint: '' }))];
    }
    const w = word.toLowerCase();
    const items = list
      .filter((e) => e.text.toLowerCase().startsWith(w))
      .slice(0, 60)
      .map((e) => ({
        text: e.text,
        displayText: e.text,
        render: (el) => {
          const a = document.createElement('span');
          a.className = 'hint-name';
          a.textContent = e.text;
          const b = document.createElement('span');
          b.className = 'hint-doc';
          b.textContent = e.hint || '';
          el.append(a, b);
        },
      }));
    return { list: items, from: { line: cur.line, ch: start }, to: { line: cur.line, ch: cur.ch } };
  }
}
