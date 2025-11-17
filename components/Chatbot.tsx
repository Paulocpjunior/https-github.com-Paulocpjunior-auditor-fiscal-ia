import React, { useState, useRef, useEffect, useCallback } from 'react';
import { getChatResponse } from '../services/geminiService';
import type { ChatMessage, AuditResult } from '../types';
import { ChatIcon } from './icons/ChatIcon';
import { CloseIcon } from './icons/CloseIcon';
import { SendIcon } from './icons/SendIcon';
import { GoogleIcon } from './icons/GoogleIcon';

interface ChatbotProps {
  auditResult: AuditResult | null;
}

const suggestions = [
  'Quais são as principais obrigações para NFe?',
  'Explique a regra do ICMS na base do PIS/COFINS.',
  'O que é CFOP e qual sua importância?',
];

export const Chatbot: React.FC<ChatbotProps> = ({ auditResult }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages, isTyping]);
  
  useEffect(() => {
    if (!isOpen) return;
    if (messages.length === 0) {
        const initialMessage: ChatMessage = {
            id: 'initial-message',
            role: 'model',
            text: 'Olá! Sou seu assistente fiscal. Como posso ajudar com suas dúvidas sobre tributação brasileira?',
            timestamp: new Date().toISOString()
        };
        setMessages([initialMessage]);
    }
  }, [isOpen, messages.length]);

  const submitMessage = useCallback(async (messageText: string) => {
    if (messageText.trim() === '' || isTyping) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: messageText,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);

    try {
      const response = await getChatResponse(messages, messageText, auditResult);
      const modelMessage: ChatMessage = {
        id: `model-${Date.now()}`,
        role: 'model',
        text: response.text,
        timestamp: new Date().toISOString(),
        sources: response.sources
      };
      setMessages(prev => [...prev, modelMessage]);
    } catch (error) {
      console.error('Chatbot error:', error);
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'model',
        text: 'Desculpe, não consegui processar sua solicitação. Por favor, tente novamente.',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  }, [input, messages, isTyping, auditResult]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    submitMessage(input);
    setInput('');
  };
  
  const handleSuggestionClick = (suggestion: string) => {
    submitMessage(suggestion);
  };
  
  const toggleChat = () => setIsOpen(!isOpen);

  return (
    <>
      <button
        onClick={toggleChat}
        className="fixed bottom-6 right-6 w-16 h-16 bg-indigo-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-transform transform hover:scale-110"
        aria-label="Open chat"
      >
        {isOpen ? <CloseIcon className="w-8 h-8" /> : <ChatIcon className="w-8 h-8" />}
      </button>

      {isOpen && (
        <div className="fixed bottom-24 right-4 left-4 h-[70vh] sm:h-[60vh] sm:w-full sm:max-w-sm sm:left-auto sm:right-6 bg-white dark:bg-slate-800 rounded-lg shadow-2xl flex flex-col border border-slate-200 dark:border-slate-700 animate-slide-up">
          <header className="p-4 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 rounded-t-lg">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Assistente Fiscal AI</h3>
          </header>
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="space-y-4">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs md:max-w-sm px-4 py-2 rounded-2xl ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-none'}`}>
                    <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                     {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-2 border-t border-slate-300 dark:border-slate-600 pt-2">
                            <h4 className="text-xs font-semibold mb-1 flex items-center"><GoogleIcon className="w-4 h-4 mr-1"/>Fontes:</h4>
                            <ul className="space-y-1">
                                {msg.sources.map((source, index) => (
                                    <li key={index}>
                                        <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-400 hover:underline truncate block">
                                            {source.title}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                    <div className="px-4 py-2 rounded-2xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-none">
                        <div className="flex items-center space-x-1">
                            <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-75"></span>
                            <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-150"></span>
                            <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-300"></span>
                        </div>
                    </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
          <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 rounded-b-lg">
            {!isTyping && messages.length > 0 && (
              <div className="px-4 pt-3 pb-2">
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => handleSuggestionClick(suggestion)}
                      className="px-3 py-1 text-xs font-medium bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-full hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <form onSubmit={handleSendMessage} className={`p-4 ${!isTyping && messages.length > 0 ? 'pt-2' : ''}`}>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Pergunte algo..."
                  className="flex-1 px-4 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={isTyping}
                />
                <button type="submit" disabled={isTyping || !input.trim()} className="w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center disabled:bg-slate-400 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors">
                  <SendIcon className="w-5 h-5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
