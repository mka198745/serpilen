/**
 * Mini ifade çözümleyici — MC çıkış formülü için. eval YOK.
 * Desteklenenler: sayılar, değişken adları ([A-Za-z_][A-Za-z0-9_]*),
 * operatörler + - * / % ^, parantez, virgül; fonksiyonlar: min, max (variadic), abs, sqrt, pow, floor, ceil, exp, ln.
 * Bilinmeyen değişken/fonksiyon → hata. Bölme sıfıra → NaN (caller eler).
 */
export function evaluateExpression(expr: string, vars: Record<string, number>): number {
  const rpn = toRpn(tokenize(expr));
  return evalRpn(rpn, vars);
}

/** Sadece sözdizimi kontrolü (MC çalıştırmadan önce). */
export function validateExpression(expr: string, knownVariables?: string[]): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  try {
    const rpn = toRpn(tokenize(expr));
    // Bilinen değişken kontrolü (varsa)
    if (knownVariables) {
      const known = new Set(knownVariables);
      for (const t of rpn) {
        if (t.kind === "name" && !known.has(t.value)) errors.push(`Bilinmeyen değişken: "${t.value}"`);
      }
    }
    // Rastgele girdiyle çalıştırmayı dene (0 olmayan değerlerle)
    const vars: Record<string, number> = {};
    for (const t of rpn) if (t.kind === "name") vars[t.value] = 1;
    const v = evalRpn(rpn, vars);
    if (Number.isNaN(v)) errors.push("Formül çalışma zamanında geçersiz (ör. sıfıra bölme / negatif karekök).");
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }
  return { ok: errors.length === 0, errors };
}

type Token =
  | { kind: "num"; value: number }
  | { kind: "name"; value: string }
  | { kind: "op"; value: string }
  | { kind: "func"; name: string; argc: number }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" };

function tokenize(s: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const num = Number(s.slice(i, j));
      if (!Number.isFinite(num)) throw new Error(`Geçersiz sayı: "${s.slice(i, j)}"`);
      out.push({ kind: "num", value: num });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
      out.push({ kind: "name", value: s.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/%^".includes(ch)) { out.push({ kind: "op", value: ch }); i++; continue; }
    if (ch === "(") { out.push({ kind: "lparen" }); i++; continue; }
    if (ch === ")") { out.push({ kind: "rparen" }); i++; continue; }
    if (ch === ",") { out.push({ kind: "comma" }); i++; continue; }
    throw new Error(`İzin verilmeyen karakter: "${ch}"`);
  }
  return out;
}

const PRECEDENCE: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "^": 3 };
const RIGHT_ASSOC: Record<string, boolean> = { "^": true };

const FUNCTIONS: Record<string, { arity: number | "variadic"; fn: (...args: number[]) => number }> = {
  min: { arity: "variadic", fn: (...a) => Math.min(...a) },
  max: { arity: "variadic", fn: (...a) => Math.max(...a) },
  abs: { arity: 1, fn: (a) => Math.abs(a) },
  sqrt: { arity: 1, fn: (a) => Math.sqrt(a) },
  pow: { arity: 2, fn: (a, b) => Math.pow(a, b) },
  floor: { arity: 1, fn: (a) => Math.floor(a) },
  ceil: { arity: 1, fn: (a) => Math.ceil(a) },
  exp: { arity: 1, fn: (a) => Math.exp(a) },
  ln: { arity: 1, fn: (a) => Math.log(a) },
};

function toRpn(tokens: Token[]): Token[] {
  const output: Token[] = [];
  const ops: Token[] = [];
  const argcStack: number[] = [];

  const isUnaryMinus = (index: number) => {
    const t = tokens[index];
    if (t.kind !== "op" || (t.value !== "-" && t.value !== "+")) return false;
    const prev = tokens[index - 1];
    return !prev || prev.kind === "op" || prev.kind === "lparen" || prev.kind === "comma";
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === "num") { output.push(t); continue; }
    if (t.kind === "name") {
      const next = tokens[i + 1];
      if (next?.kind === "lparen" && t.value in FUNCTIONS) { ops.push(t); continue; }
      output.push(t);
      continue;
    }
    if (t.kind === "op") {
      if (isUnaryMinus(i)) output.push({ kind: "num", value: 0 });
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.kind === "op") {
          const p1 = PRECEDENCE[t.value];
          const p2 = PRECEDENCE[top.value];
          if (RIGHT_ASSOC[t.value] ? p1 < p2 : p1 <= p2) { output.push(ops.pop() as Token); continue; }
        }
        break;
      }
      ops.push(t);
      continue;
    }
    if (t.kind === "lparen") {
      ops.push(t);
      // Bu parantez bir fonksiyon çağrısıysa arg sayacını başlat
      const prev = ops[ops.length - 2];
      argcStack.push(prev?.kind === "name" ? 1 : 0);
      continue;
    }
    if (t.kind === "comma") {
      while (ops.length && ops[ops.length - 1].kind !== "lparen") output.push(ops.pop() as Token);
      argcStack[argcStack.length - 1] = (argcStack[argcStack.length - 1] ?? 0) + 1;
      continue;
    }
    if (t.kind === "rparen") {
      while (ops.length && ops[ops.length - 1].kind !== "lparen") output.push(ops.pop() as Token);
      if (!ops.length) throw new Error("Eşleşmeyen parantez.");
      ops.pop(); // lparen
      const argc = argcStack.pop() ?? 0;
      const top = ops[ops.length - 1];
      if (top?.kind === "name") {
        const fn = ops.pop() as { kind: "name"; value: string };
        const def = FUNCTIONS[fn.value];
        const count = argc === 0 && def.arity !== "variadic" ? (def.arity as number) : Math.max(argc, def.arity === "variadic" ? 1 : (def.arity as number));
        output.push({ kind: "func", name: fn.value, argc: count });
      }
      continue;
    }
  }
  while (ops.length) {
    const top = ops.pop() as Token;
    if (top.kind === "lparen") throw new Error("Kapanmayan parantez.");
    if (top.kind === "name") { output.push(top); continue; } // fonksiyonsuz parantez ismi olamaz; hoşgörü
    output.push(top);
  }
  return output;
}

function evalRpn(rpn: Token[], vars: Record<string, number>): number {
  const stack: number[] = [];
  for (const t of rpn) {
    if (t.kind === "num") { stack.push(t.value); continue; }
    if (t.kind === "name") {
      const v = vars[t.value];
      if (v === undefined) throw new Error(`Bilinmeyen değişken: "${t.value}"`);
      stack.push(v);
      continue;
    }
    if (t.kind === "op") {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) throw new Error("Eksik operand.");
      switch (t.value) {
        case "+": stack.push(a + b); break;
        case "-": stack.push(a - b); break;
        case "*": stack.push(a * b); break;
        case "/": stack.push(b === 0 ? NaN : a / b); break;
        case "%": stack.push(b === 0 ? NaN : a % b); break;
        case "^": stack.push(Math.pow(a, b)); break;
        default: throw new Error(`Bilinmeyen operatör: ${t.value}`);
      }
      continue;
    }
    if (t.kind === "func") {
      const args = stack.splice(stack.length - t.argc, t.argc);
      if (args.length !== t.argc) throw new Error(`"${t.name}" ${t.argc} argüman bekler.`);
      const def = FUNCTIONS[t.name];
      if (!def) throw new Error(`Bilinmeyen fonksiyon: ${t.name}`);
      stack.push(def.fn(...args));
      continue;
    }
  }
  if (stack.length !== 1) throw new Error("İfade tek bir sonuç üretmiyor.");
  return stack[0];
}
