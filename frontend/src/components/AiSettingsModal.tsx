import { useEffect, useState } from 'react';
import axios from 'axios';
import { Check, KeyRound, LoaderCircle, Save, Settings2, X } from 'lucide-react';
import { api } from '../api';

type Provider = {
  id: 'openai' | 'gemini' | 'deepseek';
  label: string;
  configured: boolean;
  apiKeySet: boolean;
  model: string;
  supportsEmbeddings: boolean;
};

type ProviderResponse = {
  activeProvider: Provider['id'];
  activeModel: string;
  providers: Provider[];
};

type AiSettingsModalProps = {
  onClose: () => void;
};

export function AiSettingsModal({ onClose }: AiSettingsModalProps) {
  const [settings, setSettings] = useState<ProviderResponse | null>(null);
  const [provider, setProvider] = useState<Provider['id']>('openai');
  const [model, setModel] = useState('gpt-4o');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api.get<ProviderResponse>('/api/ai/providers')
      .then(({ data }) => {
        setSettings(data);
        setProvider(data.activeProvider);
        setModel(data.activeModel);
      })
      .catch(() => setError('Unable to load AI provider settings.'));
  }, []);

  const selectedProvider = settings?.providers.find((item) => item.id === provider);

  const selectProvider = (nextProvider: Provider['id']) => {
    setProvider(nextProvider);
    const next = settings?.providers.find((item) => item.id === nextProvider);
    setModel(next?.model ?? '');
    setApiKey('');
    setStatus('');
  };

  const save = async () => {
    if (!model.trim()) {
      setError('Enter a model name.');
      return;
    }
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const { data } = await api.put<ProviderResponse>(`/api/ai/providers/${provider}`, { model, apiKey: apiKey || undefined });
      setSettings(data);
      setProvider(data.activeProvider);
      setModel(data.activeModel);
      setApiKey('');
      setStatus('AI settings saved.');
    } catch (requestError) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.error ?? 'Unable to save AI settings.' : 'Unable to save AI settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#030711]/75 p-3 backdrop-blur-sm md:items-center" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title">
      <section className="w-full max-w-2xl overflow-hidden rounded-2xl border border-cyan-200/15 bg-[#0b1424] shadow-2xl shadow-black/40">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-300/15 text-cyan-200"><Settings2 size={17} /></span><div><h2 id="ai-settings-title" className="text-sm font-semibold text-white">AI provider settings</h2><p className="mt-1 text-xs text-slate-500">Choose the model used by graph intelligence.</p></div></div>
          <button type="button" aria-label="Close AI settings" onClick={onClose} className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"><X size={17} /></button>
        </header>
        <div className="space-y-5 p-5">
          <div className="grid gap-2 sm:grid-cols-3">
            {(settings?.providers ?? []).map((item) => <button key={item.id} type="button" onClick={() => selectProvider(item.id)} className={`flex items-center justify-between rounded-xl border px-3 py-3 text-left transition ${provider === item.id ? 'border-cyan-300/60 bg-cyan-300/10 text-cyan-100' : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25'}`}><span><span className="block text-xs font-semibold">{item.label}</span><span className="mt-1 block text-[10px] text-slate-500">{item.apiKeySet ? 'Key saved' : 'Key not set'}</span></span>{provider === item.id && <Check size={15} />}</button>)}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-300">Model<input value={model} onChange={(event) => setModel(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#07101d] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/60" placeholder="Model identifier" /></label>
            <label className="block text-xs font-semibold text-slate-300">API key{selectedProvider?.apiKeySet && <span className="ml-2 font-normal text-emerald-300">saved</span>}<div className="relative mt-2"><KeyRound size={15} className="absolute left-3 top-3 text-slate-600" /><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#07101d] py-2.5 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/60" placeholder={selectedProvider?.apiKeySet ? 'Leave blank to keep saved key' : 'Paste provider API key'} autoComplete="off" /></div></label>
          </div>
          {selectedProvider && <p className="text-[11px] text-slate-500">Embeddings: {selectedProvider.supportsEmbeddings ? 'supported by this provider' : 'use a separate OpenAI embedding configuration'}</p>}
          {error && <p className="rounded-lg border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">{error}</p>}
          {status && <p className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs text-emerald-100">{status}</p>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-white/10 px-5 py-4"><button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 transition hover:bg-white/10 hover:text-white">Cancel</button><button type="button" onClick={() => void save()} disabled={saving || !settings} className="flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2 text-xs font-bold text-[#06101b] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50">{saving ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}Save settings</button></footer>
      </section>
    </div>
  );
}