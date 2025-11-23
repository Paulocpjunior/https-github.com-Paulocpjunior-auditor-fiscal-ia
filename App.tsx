
import React, { useState, useCallback } from 'react';
import { Header } from './components/Header';
import { FileUpload } from './components/FileUpload';
import { AuditResults } from './components/AuditResults';
import { Chatbot } from './components/Chatbot';
import { Footer } from './components/Footer';
import { analyzeDocument } from './services/geminiService';
import { validateFile } from './services/fileValidator';
import { fetchCompanyData, type CompanyData } from './services/cnpjService';
import type { AuditResult } from './types';
import { SparkleIcon } from './components/icons/SparkleIcon';

declare const pdfjsLib: any;

const App: React.FC = () => {
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);

  const handleFileAudit = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    // Currently processing the first file. Future implementations can handle queues.
    const file = files[0];
    
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
      let fileContent = '';
      const fileType = file.type;
      const fileNameLower = file.name.toLowerCase();

      if (fileType.includes('pdf') || fileNameLower.endsWith('.pdf')) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;
          
          const arrayBuffer = await file.arrayBuffer();
          const loadingTask = pdfjsLib.getDocument(arrayBuffer);
          const pdf = await loadingTask.promise;
          
          let fullText = '';
          for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const textContent = await page.getTextContent();
              
              let lastY = -1;
              let pageText = '';
              
              // Sort items by Y descending (top to bottom), then X ascending (left to right)
              // This ensures reading order is respected before checking line breaks
              const items = textContent.items.map((item: any) => ({
                  str: item.str,
                  y: item.transform ? item.transform[5] : 0,
                  x: item.transform ? item.transform[4] : 0,
                  hasEOL: item.hasEOL
              }));

              for (const item of items) {
                  if (lastY !== -1 && Math.abs(item.y - lastY) > 8) { // Threshold for new line detection
                      pageText += '\n';
                  } else if (lastY !== -1 && item.str.trim().length > 0) {
                      // Add space if it's on the same line and not empty
                      pageText += ' '; 
                  }
                  pageText += item.str;
                  lastY = item.y;
              }
              fullText += pageText + '\n\n';
          }
          fileContent = fullText;
      } else {
          fileContent = await file.text();
      }

      if (!fileContent) {
        throw new Error("O arquivo está vazio ou o conteúdo não pôde ser extraído.");
      }
      
      let companyName: string | null = null;
      let emitterCnpj: string | null = null;
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
        // Uses findChild to be namespace safe
        const getTextContent = (baseElement: Element | undefined | null, path: string[]): string | null => {
            let current = baseElement;
            for (const tagName of path) {
                current = findChild(current, tagName);
                if (!current) return null;
            }
            return current?.textContent ?? null;
        };

        const getFirstContent = (baseElement: Element | undefined | null, paths: string[][]): string | null => {
            for (const path of paths) {
                const result = getTextContent(baseElement, path);
                if (result) return result;
            }
            return null;
        };
        
        const rootTagName = rootElement.localName;

        if (rootTagName === 'nfeProc' || rootTagName === 'NFe') {
            const nfeBase = rootTagName === 'nfeProc' ? findChild(rootElement, 'NFe') : rootElement;
            const infNFe = findChild(nfeBase, 'infNFe');

            companyName = getTextContent(infNFe, ['emit', 'xNome']);
            emitterCnpj = getTextContent(infNFe, ['emit', 'CNPJ']);
            
            // Try different paths for date (NFe 3.10 uses dhEmi, 2.0 uses dEmi)
            documentDate = getFirstContent(infNFe, [['ide', 'dhEmi'], ['ide', 'dEmi']]);
            
            takerName = getTextContent(infNFe, ['dest', 'xNome']);
            // Taker might be CNPJ or CPF
            takerCnpj = getFirstContent(infNFe, [['dest', 'CNPJ'], ['dest', 'CPF']]);

        } else if (rootTagName === 'cteProc' || rootTagName === 'CTe') {
            const cteBase = rootTagName === 'cteProc' ? findChild(rootElement, 'CTe') : rootElement;
            const infCte = findChild(cteBase, 'infCte');

            companyName = getTextContent(infCte, ['emit', 'xNome']);
            emitterCnpj = getTextContent(infCte, ['emit', 'CNPJ']);
            documentDate = getTextContent(infCte, ['ide', 'dhEmi']);
            
            // CTe taker can be rem, dest, exped, receb, or tomador
            // usually 'dest' is the recipient, but 'toma' defines the payer
            takerName = getFirstContent(infCte, [['dest', 'xNome'], ['rem', 'xNome']]);
            takerCnpj = getFirstContent(infCte, [['dest', 'CNPJ'], ['dest', 'CPF'], ['rem', 'CNPJ'], ['rem', 'CPF']]);
            
        } else if (rootTagName === 'NFSe' || rootTagName === 'CompNfse') { 
            // Handle ABRASF and other NFSe variations
            // Sometimes CompNfse wraps Nfse
            const nfseNode = rootTagName === 'CompNfse' ? findChild(rootElement, 'Nfse') : rootElement;
            const infNfse = findChild(nfseNode, 'InfNfse');
            
            documentDate = getTextContent(infNfse, ['DataEmissao']);
            companyName = getTextContent(infNfse, ['PrestadorServico', 'RazaoSocial']);
            emitterCnpj = getTextContent(infNfse, ['PrestadorServico', 'IdentificacaoPrestador', 'Cnpj']);
            
            takerName = getTextContent(infNfse, ['TomadorServico', 'RazaoSocial']);
            takerCnpj = getFirstContent(infNfse, [
                ['TomadorServico', 'IdentificacaoTomador', 'Cnpj'],
                ['TomadorServico', 'IdentificacaoTomador', 'Cpf']
            ]);
        }
      }
      
      // Fetch official company data if CNPJs are available
      let officialEmitterData: CompanyData | null = null;
      let officialTakerData: CompanyData | null = null;

      // Clean CNPJ strings before fetching (remove punctuation)
      if (emitterCnpj) {
        officialEmitterData = await fetchCompanyData(emitterCnpj.replace(/\D/g, ''));
      }
      if (takerCnpj && takerCnpj.replace(/\D/g, '').length === 14) {
        officialTakerData = await fetchCompanyData(takerCnpj.replace(/\D/g, ''));
      }

      const result = await analyzeDocument(
          fileContent, 
          file.name, 
          companyName, 
          documentDate, 
          takerCnpj, 
          takerName,
          officialEmitterData,
          officialTakerData
      );
      
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
              Faça upload de um ou mais documentos fiscais (XML ou PDF) para uma análise tributária inteligente.
            </p>
          </div>

          {!auditResult && !isLoading && <FileUpload onFileSelect={handleFileAudit} disabled={isLoading} />}
          
          {isLoading && (
            <div className="flex flex-col items-center justify-center p-8 bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700">
              <SparkleIcon className="w-12 h-12 text-indigo-500 animate-pulse" />
              <p className="mt-4 text-lg font-semibold text-slate-700 dark:text-slate-300">Analisando documento...</p>
              <p className="text-slate-500 dark:text-slate-400">{currentFile?.name}</p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 animate-pulse">Isso pode levar alguns instantes. Estamos consultando bases oficiais.</p>
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
