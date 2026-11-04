"use client";

import { motion } from "motion/react";
import { ArrowRight, Loader2, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Orb } from "@/components/Orb";
import { Button } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

type Step = "email" | "code";

/** Private access: a one-time code by email. No passwords are stored anywhere. */
export default function Entrar() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sb = supabaseBrowser();

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!sb) return;
    setBusy(true);
    setError(null);
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true, emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setError(error.message.includes("no tiene acceso") || error.status === 500 ? "Este correo no tiene acceso a JARVIS." : traducir(error.message));
    else setStep("code");
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!sb) return;
    setBusy(true);
    setError(null);
    const { error } = await sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setError("El código no es correcto o ha caducado. Pide otro.");
    else location.replace("/");
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="glass w-full max-w-[380px] p-7"
      >
        <div className="mb-7 flex flex-col items-center text-center">
          <Orb size={56} working={busy} />
          <h1 className="glow-text mt-5 text-[26px] font-semibold tracking-tight">JARVIS</h1>
          <p className="mt-1.5 text-[14px] text-muted">{step === "email" ? "Acceso privado. Te enviamos un código al correo." : `Escribe el código que te hemos enviado a ${email}.`}</p>
        </div>

        {!sb ? (
          <p className="text-center text-[14px] text-muted">El acceso con cuenta no está configurado en este servidor.</p>
        ) : step === "email" ? (
          <form onSubmit={send} className="space-y-3">
            <label className="micro block" htmlFor="email">
              Correo
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-line bg-white/[0.03] px-3 focus-within:border-cyan/50">
              <Mail className="size-4 text-faint" strokeWidth={1.75} />
              <input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-faint"
                placeholder="tu@correo.com"
              />
            </div>
            <Button type="submit" variant="primary" className="h-11 w-full" disabled={busy || !email}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <>Enviar código <ArrowRight className="size-4" /></>}
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-3">
            <label className="micro block" htmlFor="code">
              Código
            </label>
            <input
              id="code"
              autoFocus
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="tabular h-12 w-full rounded-xl border border-line bg-white/[0.03] text-center font-mono text-[22px] tracking-[0.4em] text-ink outline-none focus:border-cyan/50"
            />
            <Button type="submit" variant="primary" className="h-11 w-full" disabled={busy || code.length < 6}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Entrar"}
            </Button>
            <button type="button" onClick={() => { setStep("email"); setCode(""); setError(null); }} className="w-full py-1 text-[13px] text-faint hover:text-ink">
              Usar otro correo o pedir otro código
            </button>
          </form>
        )}

        {error && <p className="mt-4 text-center text-[13px] text-bad">{error}</p>}
      </motion.div>
    </div>
  );
}

function traducir(msg: string) {
  if (/rate limit|too many|seconds/i.test(msg)) return "Has pedido muchos códigos seguidos. Espera un minuto y vuelve a intentarlo.";
  if (/invalid.*email/i.test(msg)) return "Ese correo no parece válido.";
  return "No se ha podido enviar el código. Inténtalo de nuevo.";
}
