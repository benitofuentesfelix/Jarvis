"use client";

import { motion } from "motion/react";
import { ArrowRight, KeyRound, Loader2, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Orb } from "@/components/Orb";
import { Button } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

type Mode = "entrar" | "crear" | "confirmar";

/** Private access with email and password (stored by Supabase as a hash, never in plain text). */
export default function Entrar() {
  const [mode, setMode] = useState<Mode>("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sb = supabaseBrowser();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!sb) return;
    setBusy(true);
    setError(null);
    const mail = email.trim().toLowerCase();
    if (mode === "crear") {
      const { data, error } = await sb.auth.signUp({ email: mail, password, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
      setBusy(false);
      if (error) return setError(traducir(error.message, error.status));
      if (data.session) return location.replace("/");
      return setMode("confirmar");
    }
    const { error } = await sb.auth.signInWithPassword({ email: mail, password });
    setBusy(false);
    if (error) return setError(traducir(error.message, error.status));
    location.replace("/");
  }

  const title =
    mode === "crear" ? "Crea tu acceso. Solo tu correo puede entrar." : mode === "confirmar" ? "Revisa tu correo" : "Acceso privado.";

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
          <p className="mt-1.5 text-[14px] text-muted">{title}</p>
        </div>

        {!sb ? (
          <p className="text-center text-[14px] text-muted">El acceso con cuenta no está configurado en este servidor.</p>
        ) : mode === "confirmar" ? (
          <div className="space-y-4 text-center text-[14px] leading-relaxed text-muted">
            <p>
              Te hemos enviado un correo a <strong className="text-ink">{email}</strong>. Pulsa el enlace para confirmar que es tuyo.
            </p>
            <p className="text-[13px] text-faint">Después vuelve aquí y entra con tu contraseña. Si el enlace abre una página que no carga, no pasa nada: la cuenta ya queda confirmada.</p>
            <Button variant="primary" className="h-11 w-full" onClick={() => { setMode("entrar"); setError(null); }}>
              Ya lo he confirmado
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label className="micro block" htmlFor="email">
              Correo
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-line bg-white/[0.03] px-3 focus-within:border-cyan/50">
              <Mail className="size-4 text-faint" strokeWidth={1.75} />
              <input
                id="email"
                type="email"
                autoComplete="username"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-faint"
                placeholder="tu@correo.com"
              />
            </div>
            <label className="micro block pt-1" htmlFor="password">
              Contraseña
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-line bg-white/[0.03] px-3 focus-within:border-cyan/50">
              <KeyRound className="size-4 text-faint" strokeWidth={1.75} />
              <input
                id="password"
                type="password"
                autoComplete={mode === "crear" ? "new-password" : "current-password"}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-faint"
                placeholder={mode === "crear" ? "Mínimo 8 caracteres" : ""}
              />
            </div>
            <Button type="submit" variant="primary" className="h-11 w-full" disabled={busy || !email || password.length < 8}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <>{mode === "crear" ? "Crear acceso" : "Entrar"} <ArrowRight className="size-4" /></>}
            </Button>
            <button
              type="button"
              onClick={() => { setMode(mode === "crear" ? "entrar" : "crear"); setError(null); }}
              className="w-full py-1 text-[13px] text-faint hover:text-ink"
            >
              {mode === "crear" ? "Ya tengo acceso: entrar" : "Primera vez: crear acceso"}
            </button>
          </form>
        )}

        {error && <p className="mt-4 text-center text-[13px] text-bad">{error}</p>}
      </motion.div>
    </div>
  );
}

function traducir(msg: string, status?: number) {
  if (/database error|no tiene acceso/i.test(msg) || status === 500) return "Este correo no tiene acceso a JARVIS.";
  if (/already registered|already exists/i.test(msg)) return "Ese correo ya tiene acceso. Entra con tu contraseña.";
  if (/invalid login credentials/i.test(msg)) return "Correo o contraseña incorrectos.";
  if (/email not confirmed/i.test(msg)) return "Aún no has confirmado tu correo: busca el mensaje de Supabase y pulsa el enlace.";
  if (/password/i.test(msg)) return "La contraseña debe tener al menos 8 caracteres.";
  if (/rate limit|too many|seconds/i.test(msg)) return "Demasiados intentos seguidos. Espera un minuto y vuelve a probar.";
  if (/invalid.*email/i.test(msg)) return "Ese correo no parece válido.";
  return "No se ha podido completar. Inténtalo de nuevo.";
}
