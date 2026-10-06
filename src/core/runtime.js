// Wrapping and compiling user controller code.
// User code declares `function init(ctx)` (optional), `function control(ctx)` and,
// optionally, `function onTune(ctx, name, value)` for live slider changes.
export const WRAP_HEAD = 'self.__userFactory = (function(){"use strict";\n';
export const WRAP_TAIL = '\n;return { init: typeof init === "function" ? init : null, control: typeof control === "function" ? control : null, onTune: typeof onTune === "function" ? onTune : null };\n});\n';

// Compile in environments that allow eval (Node tests). Returns a factory.
export function compileFactory(code) {
  const src = '"use strict";\nreturn (function(){\n' + code + WRAP_TAIL.replace(/;\n$/, '') + ';';
  // eslint-disable-next-line no-new-func
  return new Function(src)();
}

// Map an error stack / line number from the worker script to a user-code line.
export function userLineFromStack(stack, userStartLine, userLineCount) {
  if (!stack) return null;
  for (const line of String(stack).split('\n')) {
    const m = line.match(/:(\d+):(\d+)\)?\s*$/);
    if (!m) continue;
    const ln = +m[1];
    if (ln >= userStartLine && ln < userStartLine + userLineCount) return { line: ln - userStartLine + 1, col: +m[2] };
  }
  return null;
}
