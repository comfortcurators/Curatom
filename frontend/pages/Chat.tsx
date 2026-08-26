import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Loader2, TerminalSquare, ExternalLink, AlertTriangle, ShieldCheck, Zap } from 'lucide-react';
import { api } from '../api';
import { ChatMessage } from '../types';

export const Chat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { 
      id: '1', 
      role: 'system', 
      text: 'Curatom Fleet Control Plane initialized. Multi-tenant policy active. Type your command, query, or select an operational scenario.' 
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (overrideInput?: string) => {
    const textToSend = overrideInput || input;
    if (!textToSend.trim()) return;
    
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: textToSend };
    setMessages(prev => [...prev, userMsg]);
    if (!overrideInput) setInput('');
    setLoading(true);

    try {
      const response = await api.ask(textToSend);
      const sysMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'system',
        text: response.text,
        options: response.options,
        is_stale: response.is_stale,
        was_cached: response.was_cached,
        sources: response.sources
      };
      setMessages(prev => [...prev, sysMsg]);
    } catch (e: any) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'system', text: `Execution refused: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleOptionClick = (opt: any) => {
    if (opt.action === 'NAVIGATE') {
      navigate(opt.target);
    } else if (opt.action === 'SCENARIO') {
      navigate('/playground');
    } else {
      handleSend(opt.label);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface-100 border border-surface-300 rounded-lg overflow-hidden">
      <div className="flex-1 overflow-y-auto p-24 space-y-20">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg p-16 ${
              msg.role === 'user' 
                ? 'bg-surface-300 text-ink-primary border border-surface-400' 
                : 'bg-surface-200 text-ink-secondary border border-surface-300'
            }`}>
              <div className="flex items-center gap-8 mb-8 text-11 font-mono uppercase tracking-wider opacity-75">
                {msg.role === 'system' && <TerminalSquare size={13} className="text-accent" />}
                <span>{msg.role}</span>
                {msg.was_cached && (
                  <span className="flex items-center gap-3 text-ink-primary bg-surface-400 px-6 py-1 rounded text-10">
                    <Zap size={10} className="text-accent" /> CACHED RESPONSE
                  </span>
                )}
                {msg.is_stale && (
                  <span className="flex items-center gap-3 text-accent bg-accent/10 px-6 py-1 rounded text-10">
                    <AlertTriangle size={10} /> STALE MEMORY
                  </span>
                )}
              </div>
              
              <div className="font-prose text-14 leading-relaxed whitespace-pre-wrap text-ink-primary">
                {msg.text}
              </div>

              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-12 pt-12 border-t border-surface-300 text-11 font-mono">
                  <div className="text-ink-secondary mb-4 flex items-center gap-4">
                    <ShieldCheck size={12} className="text-accent" /> Grounded Ingested Excerpts:
                  </div>
                  <ul className="space-y-2">
                    {msg.sources.map((s, i) => (
                      <li key={i} className="truncate">
                        <a href={s.uri} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                          {s.uri}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {msg.options && msg.options.length > 0 && (
                <div className="mt-14 flex flex-wrap gap-8 pt-8 border-t border-surface-300/50">
                  {msg.options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => handleOptionClick(opt)}
                      className="px-10 py-5 bg-surface-300 hover:bg-surface-400 text-ink-primary text-12 rounded border border-surface-400 transition-colors font-ui"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-surface-200 border border-surface-300 rounded-lg p-16 flex items-center gap-8 text-ink-secondary text-12 font-mono">
              <Loader2 size={14} className="animate-spin text-accent" />
              <span>Evaluating policy and executing tenant vector retrieval...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-16 border-t border-surface-300 bg-surface-200">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Instruct Curatom fleet control plane (e.g., 'Inspect fleet health', 'Recall booking topology')..."
            className="w-full bg-surface-100 border border-surface-400 rounded-md py-10 pl-16 pr-44 text-13 text-ink-primary focus:border-accent outline-none font-ui"
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            className="absolute right-8 top-1/2 -translate-y-1/2 p-6 text-ink-secondary hover:text-accent disabled:opacity-40 transition-colors"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};
