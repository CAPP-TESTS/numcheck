import React, { useState } from "react";
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  Search,
  Loader2,
  Phone,
  Link as LinkIcon,
  Info,
  Globe,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

export default function App() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const analyzeText = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Analisi fallita");
      }
      const data = await res.json();
      setResults(data.analysis);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-600" />
            <h1 className="text-xl font-semibold tracking-tight">
              ScamGuard
            </h1>
          </div>
          <span className="text-xs text-slate-400 hidden sm:inline">
            Analisi anti-frode per SMS e Email
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* ── Input Section ─────────────────────────────────── */}
          <div className="lg:col-span-5 space-y-6">
            <div>
              <h2 className="text-lg font-medium mb-2">Analizza Messaggio</h2>
              <p className="text-sm text-slate-500 mb-4">
                Incolla il testo di un SMS o di un'email per verificare la
                presenza di numeri a sovrapprezzo, call center sospetti o link
                malevoli.
              </p>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Incolla qui il testo del messaggio..."
                className="w-full h-64 p-4 rounded-xl border border-slate-200 bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none transition-shadow"
              />
            </div>

            <button
              onClick={analyzeText}
              disabled={loading || !text.trim()}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Analisi in corso...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  Verifica Messaggio
                </>
              )}
            </button>

            {error && (
              <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-sm">{error}</p>
              </div>
            )}
          </div>

          {/* ── Results Section ────────────────────────────────── */}
          <div className="lg:col-span-7">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 min-h-[400px]">
              {!results && !loading && (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4 py-20">
                  <Shield className="w-16 h-16 opacity-20" />
                  <p>I risultati dell'analisi appariranno qui.</p>
                </div>
              )}

              {loading && (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4 py-20">
                  <Loader2 className="w-12 h-12 animate-spin text-indigo-500" />
                  <p>Estrazione e verifica in corso...</p>
                </div>
              )}

              {results && !loading && (
                <div className="space-y-8">
                  <h2 className="text-xl font-semibold border-b border-slate-100 pb-4">
                    Risultati Analisi
                  </h2>

                  {/* ── Phone Numbers ──────────────────────────── */}
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Phone className="w-4 h-4" /> Numeri Telefonici (
                      {results.phones?.length || 0})
                    </h3>

                    {results.phones?.length === 0 ? (
                      <p className="text-slate-500 text-sm italic">
                        Nessun numero rilevato.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {results.phones.map((phone: any, i: number) => (
                          <React.Fragment key={i}>
                            <PhoneCard phone={phone} />
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── URLs ───────────────────────────────────── */}
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <LinkIcon className="w-4 h-4" /> Link e Siti Web (
                      {results.urls?.length || 0})
                    </h3>

                    {results.urls?.length === 0 ? (
                      <p className="text-slate-500 text-sm italic">
                        Nessun link rilevato.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {results.urls.map((urlItem: any, i: number) => (
                          <React.Fragment key={i}>
                            <UrlCard urlItem={urlItem} />
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Phone result card ───────────────────────────────────────────────────────

function PhoneCard({ phone }: { phone: any }) {
  const premium = phone.checks.premiumCheck;
  const agcom = phone.checks.agcom;
  const tellows = phone.checks.tellows;

  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
      <div className="font-mono text-lg font-medium mb-3">{phone.number}</div>

      <div className="space-y-2 text-sm">
        {/* 1. Verifica sovrapprezzo (WindTre + Iliad) */}
        <CheckRow
          icon={
            premium?.isPremium ? (
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            ) : (
              <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
            )
          }
          label="Sovrapprezzo"
          value={
            premium?.isPremium ? (
              <span className="text-red-600 font-medium">
                Avviso rosso &mdash; Numero a sovrapprezzo confermato
                {premium.operator && (
                  <span className="font-normal text-red-500">
                    {" "}(fonte: {premium.operator})
                  </span>
                )}
                {premium.service && (
                  <span className="font-normal text-red-500">
                    {" "}&mdash; {premium.service}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-slate-600">
                Non presente nei listini a sovrapprezzo.
              </span>
            )
          }
        />

        {/* 2. AGCOM ROC */}
        {!premium?.isPremium && agcom && (
          <CheckRow
            icon={
              agcom.found ? (
                <Info className="w-5 h-5 text-amber-500 shrink-0" />
              ) : (
                <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
              )
            }
            label="AGCOM ROC"
            value={
              agcom.found ? (
                <span className="text-amber-700">
                  Registrato come Call Center.
                </span>
              ) : (
                <span className="text-slate-600">
                  Non registrato nel ROC.
                </span>
              )
            }
          />
        )}

        {/* 3. Tellows */}
        {!premium?.isPremium && agcom && !agcom.found && tellows && (
          <CheckRow
            icon={
              tellows.found ? (
                <Info className="w-5 h-5 text-indigo-500 shrink-0" />
              ) : (
                <CheckCircle className="w-5 h-5 text-slate-400 shrink-0" />
              )
            }
            label="Tellows"
            value={
              tellows.found ? (
                <span className="text-slate-700">
                  Score: {tellows.score} | {tellows.name}
                  {tellows.details && (
                    <span className="text-slate-500">
                      {" "}
                      ({tellows.details})
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-slate-500">
                  Nessuna informazione trovata.
                </span>
              )
            }
          />
        )}
      </div>
    </div>
  );
}

// ─── URL result card ─────────────────────────────────────────────────────────

function UrlCard({ urlItem }: { urlItem: any }) {
  const uv = urlItem.checks.urlVoid;
  const su = urlItem.checks.sucuri;
  const sb = urlItem.checks.safeBrowsing;

  const uvSafe =
    uv?.success && (uv.detections === 0 || uv.blacklistStatus?.startsWith("0/"));
  const suSafe = su?.success && !su.malware && !su.blacklisted;
  const sbSafe = sb?.success && sb.safe;

  // Overall danger assessment
  const dangerCount = [!uvSafe && uv?.success, !suSafe && su?.success, !sbSafe && sb?.success].filter(Boolean).length;

  return (
    <div
      className={`p-4 rounded-xl border ${
        dangerCount >= 2
          ? "border-red-200 bg-red-50"
          : dangerCount === 1
          ? "border-amber-200 bg-amber-50"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <div className="font-mono text-indigo-600 font-medium mb-3 break-all">
        {urlItem.url}
      </div>

      <div className="space-y-2 text-sm">
        {/* A. URLVoid */}
        <CheckRow
          icon={
            !uv?.success ? (
              <Info className="w-5 h-5 text-slate-400 shrink-0" />
            ) : uvSafe ? (
              <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-red-500 shrink-0" />
            )
          }
          label="URLVoid"
          value={
            !uv?.success ? (
              <span className="text-slate-500">Impossibile verificare.</span>
            ) : (
              <span className={uvSafe ? "text-slate-600" : "text-red-600 font-medium"}>
                Detections: {uv.blacklistStatus}
                {uv.registration !== "N/A" && (
                  <span className="text-slate-500">
                    {" "}| Registrato: {uv.registration}
                  </span>
                )}
              </span>
            )
          }
        />

        {/* B. Sucuri */}
        <CheckRow
          icon={
            !su?.success ? (
              <Info className="w-5 h-5 text-slate-400 shrink-0" />
            ) : suSafe ? (
              <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-red-500 shrink-0" />
            )
          }
          label="Sucuri"
          value={
            !su?.success ? (
              <span className="text-slate-500">Impossibile verificare.</span>
            ) : (
              <span className={suSafe ? "text-slate-600" : "text-red-600 font-medium"}>
                Rischio: {su.riskLevel}
                {su.malware && " | Malware rilevato"}
                {su.blacklisted && " | In blacklist"}
              </span>
            )
          }
        />

        {/* C. Google Safe Browsing */}
        <CheckRow
          icon={
            !sb?.success ? (
              <Info className="w-5 h-5 text-slate-400 shrink-0" />
            ) : sbSafe ? (
              <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-red-500 shrink-0" />
            )
          }
          label={
            <>
              <Globe className="w-3.5 h-3.5 inline mr-1" />
              Google Safe Browsing
            </>
          }
          value={
            !sb?.success ? (
              <span className="text-slate-500">Impossibile verificare.</span>
            ) : (
              <span className={sbSafe ? "text-slate-600" : "text-red-600 font-medium"}>
                {sb.status}
              </span>
            )
          }
        />
      </div>
    </div>
  );
}

// ─── Shared check row component ──────────────────────────────────────────────

function CheckRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      {icon}
      <div>
        <span className="font-medium">{label}:</span> {value}
      </div>
    </div>
  );
}
