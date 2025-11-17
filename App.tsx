import React, { useState, useCallback } from 'react';
import { Header } from './components/Header';
import { FileUpload } from './components/FileUpload';
import { AuditResults } from './components/AuditResults';
import { Chatbot } from './components/Chatbot';
import { Footer } from './components/Footer';
import { analyzeDocument } from './services/geminiService';
import { validateFile } from './services/fileValidator';
import type { AuditResult } from './types';
import { SparkleIcon } from './components/icons/SparkleIcon';

const App: React.FC = () => {
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);

  const handleFileAudit = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    setAuditResult(null);
    setCurrentFile(file);

    const { isValid, error: validationError } = await validateFile(file);

    if (!isValid) {
      setError(validationError || 'O arquivo enviado é inválido ou não é suportado.');
      setIsLoading(false);
      return;
    }

    try {
      const fileContent = await file.text();
      if (!fileContent) {
        throw new Error("File is empty or could not be read.");
      }
      
      let companyName: string | null = null;
      let documentDate: string | null = null;
      let takerCnpj: string | null = null;
      let takerName: string | null = null;

      if (file.name.toLowerCase().endsWith('.xml')) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(fileContent, "application/xml");
        const rootElement = xmlDoc.documentElement;

        // Helper to find a direct child by its local name (namespace-agnostic)
        const findChild = (el: Element | undefined | null, localName: string): Element | undefined => {
          if (!el) return undefined;
          return Array.from(el.children).find(child => child.localName === localName);
        };
        
        // Helper to get text content from a path of local names
        const getTextContent = (baseElement: Element | undefined | null, path: string[]): string | null => {
            let current = baseElement;
            for (const tagName of path) {
                current = findChild(current, tagName);
                if (!current) return null;
            }
            return current?.textContent ?? null;
        };
        
        const rootTagName = rootElement.localName;

        if (rootTagName === 'nfeProc' || rootTagName === 'NFe') {
            const nfeBase = rootTagName === 'nfeProc' ? findChild(rootElement, 'NFe') : rootElement;
            const infNFe = findChild(nfeBase, 'infNFe');

            companyName = getTextContent(infNFe, ['emit', 'xNome']);
            documentDate = getTextContent(infNFe, ['ide', 'dhEmi']);
            takerCnpj = getTextContent(infNFe, ['dest', 'CNPJ']);
            takerName = getTextContent(infNFe, ['dest', 'xNome']);

        } else if (rootTagName === 'cteProc' || rootTagName === 'CTe') {
            const cteBase = rootTagName === 'cteProc' ? findChild(rootElement, 'CTe') : rootElement;
            const infCte = findChild(cteBase, 'infCte');

            companyName = getTextContent(infCte, ['emit', 'xNome']);
            documentDate = getTextContent(infCte, ['ide', 'dhEmi']);
            takerCnpj = getTextContent(infCte, ['dest', 'CNPJ']);
            takerName = getTextContent(infCte, ['dest', 'xNome']);
            
        } else if (rootTagName === 'NFSe') { // ABRASF-like pattern
            const infNfse = findChild(rootElement, 'InfNfse');
            
            documentDate = getTextContent(infNfse, ['DataEmissao']);
            companyName = getTextContent(infNfse, ['PrestadorServico', 'RazaoSocial']);
            takerCnpj = getTextContent(infNfse, ['TomadorServico', 'IdentificacaoTomador', 'Cnpj']);
            takerName = getTextContent(infNfse, ['TomadorServico', 'RazaoSocial']);
        }
      }
      
      const result = await analyzeDocument(fileContent, file.name, companyName, documentDate, takerCnpj, takerName);
      setAuditResult(result);

    } catch (err) {
      console.error("Audit Error:", err);
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred during the audit.";
      setError(`Failed to audit document. ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  const handleReset = () => {
    setAuditResult(null);
    setError(null);
    setCurrentFile(null);
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-200 flex flex-col">
      <Header />
      <main className="container mx-auto p-4 md:p-8 flex-grow">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-indigo-600 dark:text-indigo-400">Auditor Fiscal AI</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 tracking-wide">
              Desenvolvido BY - SP Assessoria Contabil
            </p>
            <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
              Faça upload de um documento fiscal (XML ou PDF) para uma análise tributária inteligente.
            </p>
          </div>

          {!auditResult && !isLoading && <FileUpload onFileSelect={handleFileAudit} disabled={isLoading} />}
          
          {isLoading && (
            <div className="flex flex-col items-center justify-center p-8 bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700">
              <SparkleIcon className="w-12 h-12 text-indigo-500 animate-pulse" />
              <p className="mt-4 text-lg font-semibold text-slate-700 dark:text-slate-300">Analisando documento...</p>
              <p className="text-slate-500 dark:text-slate-400">{currentFile?.name}</p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 animate-pulse">Isso pode levar alguns instantes.</p>
            </div>
          )}

          {error && (
            <div className="p-4 my-4 text-sm text-red-800 rounded-lg bg-red-100 dark:bg-red-900 dark:text-red-300" role="alert">
              <span className="font-medium">Erro!</span> {error}
              <button onClick={handleReset} className="ml-4 font-bold underline">Tente novamente</button>
            </div>
          )}

          {auditResult && !isLoading && (
            <AuditResults result={auditResult} fileName={currentFile?.name || ''} onReset={handleReset} />
          )}

        </div>
      </main>
      <Chatbot auditResult={auditResult} />
      <Footer />
    </div>
  );
};

export default App;