import { useState } from "react";
import { Shield, AlertTriangle, CheckCircle, Search, Loader2, Phone, Link as LinkIcon, Info } from "lucide-react";

export default function App() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const analyzeText = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Analysis failed");
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
            <h1 className="text-xl font-semibold tracking-tight">ScamGuard</h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Input Section */}
          <div className="lg:col-span-5 space-y-6">
            <div>
              <h2 className="text-lg font-medium mb-2">Analizza Messaggio</h2>
              <p className="text-sm text-slate-500 mb-4">
                Incolla il testo di un SMS o di un'email per verificare la presenza di numeri a sovrapprezzo, call center sospetti o link malevoli.
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

          {/* Results Section */}
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
                  <h2 className="text-xl font-semibold border-b border-slate-100 pb-4">Risultati Analisi</h2>
                  
                  {/* Phone Numbers */}
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Phone className="w-4 h-4" /> Numeri Telefonici ({results.phones?.length || 0})
                    </h3>
                    
                    {results.phones?.length === 0 ? (
                      <p className="text-slate-500 text-sm italic">Nessun numero rilevato.</p>
                    ) : (
                      <div className="space-y-4">
                        {results.phones.map((phone: any, i: number) => (
                          <div key={i} className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                            <div className="font-mono text-lg font-medium mb-3">{phone.number}</div>
                            
                            <div className="space-y-2 text-sm">
                              {/* WindTre Check */}
                              <div className="flex items-start gap-2">
                                {phone.checks.windTrePremium ? (
                                  <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                                ) : (
                                  <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                                )}
                                <div>
                                  <span className="font-medium">WindTre Premium:</span>{" "}
                                  {phone.checks.windTrePremium ? (
                                    <span className="text-red-600 font-medium">Numero a sovrapprezzo rilevato!</span>
                                  ) : (
                                    <span className="text-slate-600">Non presente nei listini a sovrapprezzo.</span>
                                  )}
                                </div>
                              </div>

                              {/* AGCOM Check */}
                              {!phone.checks.windTrePremium && (
                                <div className="flex items-start gap-2">
                                  {phone.checks.agcom ? (
                                    <Info className="w-5 h-5 text-amber-500 shrink-0" />
                                  ) : (
                                    <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                                  )}
                                  <div>
                                    <span className="font-medium">AGCOM ROC:</span>{" "}
                                    {phone.checks.agcom ? (
                                      <span className="text-amber-700">Registrato come Call Center.</span>
                                    ) : (
                                      <span className="text-slate-600">Non registrato nel ROC.</span>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Tellows Check */}
                              {!phone.checks.windTrePremium && !phone.checks.agcom && (
                                <div className="flex items-start gap-2">
                                  {phone.checks.tellows ? (
                                    <Info className="w-5 h-5 text-indigo-500 shrink-0" />
                                  ) : (
                                    <CheckCircle className="w-5 h-5 text-slate-400 shrink-0" />
                                  )}
                                  <div>
                                    <span className="font-medium">Tellows:</span>{" "}
                                    {phone.checks.tellows ? (
                                      <span className="text-slate-700">
                                        Score: {phone.checks.tellows.score} | {phone.checks.tellows.name}
                                        {phone.checks.tellows.details && ` (${phone.checks.tellows.details})`}
                                      </span>
                                    ) : (
                                      <span className="text-slate-500">Nessuna informazione trovata.</span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* URLs */}
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <LinkIcon className="w-4 h-4" /> Link e Siti Web ({results.urls?.length || 0})
                    </h3>
                    
                    {results.urls?.length === 0 ? (
                      <p className="text-slate-500 text-sm italic">Nessun link rilevato.</p>
                    ) : (
                      <div className="space-y-4">
                        {results.urls.map((urlItem: any, i: number) => {
                          const isSafe = urlItem.checks.urlVoid?.blacklistStatus?.toLowerCase().includes("0/");
                          return (
                            <div key={i} className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                              <div className="font-mono text-indigo-600 font-medium mb-3 break-all">{urlItem.url}</div>
                              
                              <div className="space-y-2 text-sm">
                                <div className="flex items-start gap-2">
                                  {urlItem.checks.urlVoid ? (
                                    isSafe ? (
                                      <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                                    ) : (
                                      <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                                    )
                                  ) : (
                                    <Info className="w-5 h-5 text-slate-400 shrink-0" />
                                  )}
                                  <div>
                                    <span className="font-medium">URLVoid:</span>{" "}
                                    {urlItem.checks.urlVoid ? (
                                      <span className={isSafe ? "text-slate-600" : "text-red-600 font-medium"}>
                                        Detections: {urlItem.checks.urlVoid.blacklistStatus}
                                        {urlItem.checks.urlVoid.registration !== "N/A" && ` | Registrato: ${urlItem.checks.urlVoid.registration}`}
                                      </span>
                                    ) : (
                                      <span className="text-slate-500">Impossibile verificare.</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
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
