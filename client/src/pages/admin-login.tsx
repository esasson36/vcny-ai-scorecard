import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, AlertCircle } from "lucide-react";

interface Props { onLogin: () => void; }

export default function AdminLogin({ onLogin }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/login", { username, password });
      if (!res.ok) throw new Error("Invalid credentials");
      return res.json();
    },
    onSuccess: () => onLogin(),
  });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground mb-2" style={{ fontFamily: "'Geist Mono', monospace" }}>VCNY · AI Scorecard</p>
          <h1 className="text-2xl font-medium" style={{ fontFamily: "'Fraunces', serif" }}>Admin access</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to view submissions</p>
          <a href="/#/" className="text-xs text-muted-foreground underline underline-offset-2 mt-2 inline-block hover:text-foreground transition-colors">← Back to form</a>
        </div>

        {mutation.isError && (
          <div className="flex items-center gap-2 text-sm mb-4 px-3 py-2 rounded-sm bg-red-50 border border-red-200 text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Incorrect username or password
          </div>
        )}

        <div className="bg-card border border-border rounded-sm p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 tracking-[0.04em]">Username</label>
            <input
              data-testid="input-username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              className="w-full px-3 py-2 border-[1.5px] border-input rounded-sm text-sm bg-white focus:border-foreground focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 tracking-[0.04em]">Password</label>
            <input
              data-testid="input-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              onKeyDown={e => e.key === "Enter" && mutation.mutate()}
              className="w-full px-3 py-2 border-[1.5px] border-input rounded-sm text-sm bg-white focus:border-foreground focus:outline-none transition-colors"
            />
          </div>
          <button
            data-testid="button-login"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="w-full bg-foreground text-background py-2.5 rounded-sm font-semibold text-sm hover:opacity-85 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {mutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Signing in...</> : "Unlock"}
          </button>
        </div>
      </div>
    </div>
  );
}
