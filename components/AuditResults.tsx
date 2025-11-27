
import React, { useState, useMemo, useCallback } from 'react';
import type { AuditResult, Anomaly } from '../types';
import type { CompanyData } from '../services/cnpjService';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { XCircleIcon } from './icons/XCircleIcon';
import { WarningIcon } from './icons/WarningIcon';
import { InfoIcon } from './icons/InfoIcon';
import { SparkleIcon } from './icons/SparkleIcon';
import { DownloadIcon } from './icons/DownloadIcon';
import { ShareIcon } from './icons/ShareIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { EyeIcon } from './icons/EyeIcon';

interface AuditResultsProps {
  result: AuditResult;
  fileName: string;
  onReset: () => void;
  officialEmitterData?: CompanyData | null;
  officialTakerData?: CompanyData | null;
}

const getRiskColorClasses = (level: 'low' | 'medium' | 'high' | 'critical') => {
  switch (level) {
    case 'low':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    case 'high':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
    case 'critical':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    default:
      return 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300';
  }
};

const getAnomalyIcon = (type: 'error' | 'warning' | 'info') => {
    switch (type) {
        case 'error': return <XCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0" />;
        case 'warning': return <WarningIcon className="w-5 h-5 text-yellow-500 flex-shrink-0" />;
        case 'info': return <InfoIcon className="w-5 h-5 text-indigo-500 flex-shrink-0" />;
        default: return null;
    }
}

const AnomalyItem: React.FC<{ anomaly: Anomaly }> = ({ anomaly }) => (
    <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600/50">
        <div className="flex items-start space-x-3">
            {getAnomalyIcon(anomaly.type)}
            <div className="flex-1">
                <p className="font-semibold text-slate-800 dark:text-slate-200">{anomaly.message}</p>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 grid grid-cols-2 gap-x-4 gap-y-1">
                    <p><span className="font-medium">Severidade:</span> <span className={`capitalize ${getRiskColorClasses(anomaly.severity)} px-1.5 py-0.5 rounded-full text-xs`}>{anomaly.severity}</span></p>
                    <p><span className="font-medium">Código:</span> {anomaly.code}</p>
                    {anomaly.field && <p><span className="font-medium">Campo:</span> {anomaly.field}</p>}
                    {anomaly.expected && <p><span className="font-medium">Esperado:</span> {anomaly.expected}</p>}
                    {anomaly.found && <p><span className="font-medium">Encontrado:</span> <span className="font-mono bg-slate-200 dark:bg-slate-600 px-1 rounded">{anomaly.found}</span></p>}
                </div>
            </div>
        </div>
    </div>
);

const FilterButton: React.FC<{label: string; value: string; isActive: boolean; onClick: (value: string) => void}> = ({ label, value, isActive, onClick }) => (
    <button
        onClick={() => onClick(value)}
        className={`px-3 py-1 text-xs rounded-full transition-colors font-medium ${
        isActive
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
        }`}
    >
        {label}
    </button>
);

export const AuditResults: React.FC<AuditResultsProps> = ({ result, fileName, onReset, officialEmitterData, officialTakerData }) => {
  const [filters, setFilters] = useState<{ type: string; severity: string }>({ type: 'all', severity: 'all' });
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyData | null>(null);
  const [copyStatus, setCopyStatus] = useState('Copiar para Área de Transferência');
  const [anomaliesCopyStatus, setAnomaliesCopyStatus] = useState('Compartilhar Anomalias');
  const [openSection, setOpenSection] = useState<'anomalies' | 'recommendations' | null>(
    result.anomalies.length > 0 ? 'anomalies' : (result.recommendations.length > 0 ? 'recommendations' : null)
  );

  const toggleSection = (section: 'anomalies' | 'recommendations') => {
    setOpenSection(prev => (prev === section ? null : section));
  };

  const formatDate = useCallback((isoString: string | undefined) => {
    if (!isoString) return 'Data não informada';
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return isoString; 
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
    } catch (e) {
        return isoString; 
    }
  }, []);

  const getShareableText = useCallback(() => {
    const padRight = (str: string, length: number): string => str.padEnd(length, ' ');
    const divider = '='.repeat(70);
    const subDivider = '-'.repeat(70);
    const KEY_WIDTH = 18;

    const wordWrap = (text: string, maxWidth: number, indent: string): string => {
        if (!text) return '';
        const words = text.split(' ');
        let lines: string[] = [];
        let currentLine = '';

        words.forEach(word => {
            if (currentLine.length === 0) {
                currentLine = indent + word;
            } else if ((currentLine + ' ' + word).length > maxWidth) {
                lines.push(currentLine);
                currentLine = indent + word;
            } else {
                currentLine += ' ' + word;
            }
        });
        lines.push(currentLine);
        return lines.join('\n');
    };

    let content = '';
    content += '******************************************************\n';
    content += '*                                                    *\n';
    content += '*           RELATÓRIO DE AUDITORIA FISCAL AI         *\n';
    content += '*                                                    *\n';
    content += '******************************************************\n\n';

    content += `${divider}\n`;
    content += ' DADOS DO DOCUMENTO\n';
    content += `${divider}\n`;
    content += `${padRight('Arquivo', KEY_WIDTH)}: ${fileName}\n`;
    content += `${padRight('Empresa', KEY_WIDTH)}: ${result.companyName || 'Não informado'}\n`;
    if (result.takerName) {
        content += `${padRight('Nome Tomador', KEY_WIDTH)}: ${result.takerName}\n`;
    }
    if (result.takerCnpj) {
        content += `${padRight('CNPJ Tomador', KEY_WIDTH)}: ${result.takerCnpj}\n`;
    }
    content += `${padRight('Data do Documento', KEY_WIDTH)}: ${formatDate(result.documentDate)}\n\n`;

    content += `${divider}\n`;
    content += ' SUMÁRIO DA ANÁLISE\n';
    content += `${divider}\n`;
    content += `${padRight('Nível de Risco', KEY_WIDTH)}: ${result.riskLevel.toUpperCase()} (${result.riskScore}/100)\n`;
    content += `${padRight('Resumo da IA', KEY_WIDTH)}:\n${wordWrap(result.summary, 70, '  ')}\n\n`;

    content += `${divider}\n`;
    content += ` ANOMALIAS ENCONTRADAS (${result.anomalies.length})\n`;
    content += `${divider}\n`;

    if (result.anomalies.length > 0) {
        result.anomalies.forEach((anomaly, index) => {
            content += `\n-----------[ ANOMALIA #${index + 1} ]-----------\n`;
            content += `${padRight('Mensagem', KEY_WIDTH)}:\n${wordWrap(anomaly.message, 70, '  ')}\n`;
            content += `${padRight('Tipo', KEY_WIDTH)}: ${anomaly.type}\n`;
            content += `${padRight('Severidade', KEY_WIDTH)}: ${anomaly.severity}\n`;
            content += `${padRight('Código', KEY_WIDTH)}: ${anomaly.code}\n`;
            if (anomaly.field) content += `${padRight('Campo', KEY_WIDTH)}: ${anomaly.field}\n`;
            if (anomaly.expected) content += `${padRight('Esperado', KEY_WIDTH)}: ${anomaly.expected}\n`;
            if (anomaly.found) content += `${padRight('Encontrado', KEY_WIDTH)}: ${anomaly.found}\n`;
        });
    } else {
        content += 'Nenhuma anomalia encontrada.\n';
    }
    content += '\n';

    content += `${divider}\n`;
    content += ' RECOMENDAÇÕES DA IA\n';
    content += `${divider}\n`;
    if (result.recommendations.length > 0) {
        result.recommendations.forEach((rec, index) => {
            content += `${wordWrap(`${index + 1}. ${rec}`, 70, '')}\n`;
        });
    } else {
        content += 'Nenhuma recomendação necessária.\n';
    }
    content += '\n';

    content += `${subDivider}\n`;
    content += ` Relatório gerado por Auditor Fiscal AI em ${new Date().toLocaleDateString('pt-BR')}\n`;
    content += `${subDivider}\n`;

    return content;
  }, [result, fileName, formatDate]);
    
  const filteredAnomalies = useMemo(() => {
    return result.anomalies.filter(anomaly => {
        const typeMatch = filters.type === 'all' || anomaly.type === filters.type;
        const severityMatch = filters.severity === 'all' || anomaly.severity === filters.severity;
        return typeMatch && severityMatch;
    });
  }, [result.anomalies, filters]);
  
  const handleExport = () => {
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF();
    let currentY = 22;

    // --- HEADER ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor('#2c3e50');
    doc.text('Relatório de Auditoria Fiscal AI', 105, currentY, { align: 'center' });
    currentY += 12;

    // --- DOCUMENT DETAILS ---
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor('#34495e');
    const details = [
        { label: 'Arquivo', value: fileName },
        { label: 'Empresa', value: result.companyName || 'Não informado' },
        { label: 'Data', value: formatDate(result.documentDate) },
    ];
    if (result.takerName) {
        details.push({ label: 'Nome Tomador', value: result.takerName });
    }
    if (result.takerCnpj) {
        details.push({ label: 'CNPJ Tomador', value: result.takerCnpj });
    }
    details.forEach(detail => {
        doc.setFont('helvetica', 'bold');
        doc.text(`${detail.label}:`, 14, currentY);
        doc.setFont('helvetica', 'normal');
        doc.text(detail.value, 45, currentY);
        currentY += 6;
    });

    // --- SUMMARY ---
    currentY += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor('#2c3e50');
    doc.text('Sumário da Análise', 14, currentY);
    doc.setLineWidth(0.2);
    doc.line(14, currentY + 1, 196, currentY + 1);
    currentY += 8;
    doc.setFontSize(11);
    doc.setTextColor('#34495e');
    doc.setFont('helvetica', 'bold');
    doc.text('Nível de Risco:', 14, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(`${result.riskLevel.toUpperCase()} (Pontuação: ${result.riskScore}/100)`, 45, currentY);
    currentY += 7;
    doc.setFont('helvetica', 'bold');
    doc.text('Resumo da IA:', 14, currentY);
    doc.setFont('helvetica', 'normal');
    const summaryLines = doc.splitTextToSize(result.summary, 150);
    doc.text(summaryLines, 14, currentY + 5);
    currentY += 5 + (summaryLines.length * 4);

    // --- ANOMALIES TABLE (uses filteredAnomalies) ---
    if (filteredAnomalies.length > 0) {
        const tableColumn = ["Tipo", "Severidade", "Mensagem", "Campo", "Encontrado"];
        const tableRows = filteredAnomalies.map(anom => [
            anom.type,
            anom.severity,
            anom.message,
            anom.field || '-',
            anom.found || '-'
        ]);
        (doc as any).autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: currentY + 4,
            theme: 'grid',
            headStyles: { fillColor: '#34495e', textColor: '#ffffff', fontStyle: 'bold' },
            styles: { fontSize: 8, cellPadding: 2 },
            columnStyles: {
                0: { cellWidth: 15 }, 1: { cellWidth: 18 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 25 }, 4: { cellWidth: 25 },
            },
        });
        currentY = (doc as any).lastAutoTable.finalY;
    } else {
        currentY += 10;
        doc.text("Nenhuma anomalia encontrada (ou correspondente ao filtro).", 14, currentY);
    }
    
    // --- RECOMMENDATIONS ---
    currentY += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor('#2c3e50');
    doc.text('Recomendações da IA', 14, currentY);
    doc.setLineWidth(0.2);
    doc.line(14, currentY + 1, 196, currentY + 1);
    currentY += 8;
    doc.setFontSize(10);
    doc.setTextColor('#34495e');
    doc.setFont('helvetica', 'normal');
    if (result.recommendations.length > 0) {
        let yPos = currentY;
        result.recommendations.forEach(rec => {
            if (yPos > 270) {
                doc.addPage();
                yPos = 20;
            }
            const lines = doc.splitTextToSize(`• ${rec}`, 182);
            doc.text(lines, 14, yPos);
            yPos += (lines.length * 5) + 2;
        });
    } else {
         doc.text("Nenhuma recomendação necessária.", 14, currentY);
    }

    const safeFileName = fileName.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
    doc.save(`auditoria_${safeFileName}.pdf`);
  };
    
  const handleShare = async () => {
    const shareData = {
      title: `Resultado da Auditoria: ${fileName}`,
      text: getShareableText(),
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.error("Share failed:", err);
        setShowShareModal(true);
      }
    } else {
      setShowShareModal(true);
    }
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(getShareableText()).then(() => {
      setCopyStatus('Copiado!');
      setTimeout(() => setCopyStatus('Copiar para Área de Transferência'), 2000);
    }, () => {
      setCopyStatus('Falha ao copiar');
    });
  };

  const handleCopyAnomalies = () => {
    if (filteredAnomalies.length === 0) return;

    let content = `--- ANOMALIAS ENCONTRADAS (${fileName}) ---\n\n`;
    filteredAnomalies.forEach((anom, idx) => {
         content += `[#${idx + 1}] ${anom.message}\n`;
         content += `   Gravidade: ${anom.severity.toUpperCase()} | Tipo: ${anom.type}\n`;
         if(anom.code) content += `   Código: ${anom.code}\n`;
         if(anom.field) content += `   Campo: ${anom.field}\n`;
         if(anom.found) content += `   Valor Encontrado: ${anom.found}\n`;
         if(anom.expected) content += `   Valor Esperado: ${anom.expected}\n`;
         content += '\n';
    });

    navigator.clipboard.writeText(content).then(() => {
        setAnomaliesCopyStatus('Copiado!');
        setTimeout(() => setAnomaliesCopyStatus('Compartilhar Anomalias'), 2000);
    });
  };

  const mailtoHref = `mailto:?subject=${encodeURIComponent(`Resultado da Auditoria: ${fileName}`)}&body=${encodeURIComponent(getShareableText())}`;

  const handleFilterChange = (filterType: 'type' | 'severity', value: string) => {
    setFilters(prev => ({ ...prev, [filterType]: value }));
  };

  const typeFilters = { all: 'Todos', error: 'Erros', warning: 'Avisos', info: 'Infos' };
  const severityFilters = { all: 'Todas', critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa' };

  return (
    <>
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-slate-200 dark:border-slate-700">
        <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Resultado da Auditoria</h2>
            
            {result.companyName && (
              <div className="flex items-center flex-wrap gap-2 mt-2">
                <p className="text-lg font-semibold text-indigo-600 dark:text-indigo-400">{result.companyName}</p>
                {officialEmitterData && (
                  <button 
                    onClick={() => setSelectedCompany(officialEmitterData)}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-100 rounded-md hover:bg-indigo-200 dark:bg-indigo-900 dark:text-indigo-300 dark:hover:bg-indigo-800 transition-colors"
                  >
                    <EyeIcon className="w-3 h-3" />
                    Verificar Detalhes
                  </button>
                )}
              </div>
            )}
             
             <div className="flex flex-col text-sm text-slate-500 dark:text-slate-400 gap-y-1 mt-2">
                <p className="truncate" title={fileName}>
                    <strong>Arquivo:</strong> {fileName}
                </p>
                {result.documentDate && (
                     <p>
                        <strong>Data:</strong> {formatDate(result.documentDate)}
                     </p>
                )}
                
                {(result.takerName || result.takerCnpj) && (
                  <div className="mt-1 p-2 bg-slate-50 dark:bg-slate-700/50 rounded-md border border-slate-100 dark:border-slate-600">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Tomador / Destinatário:</span>
                      {officialTakerData && (
                        <button 
                          onClick={() => setSelectedCompany(officialTakerData)}
                          className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-indigo-700 bg-indigo-100 rounded-md hover:bg-indigo-200 dark:bg-indigo-900 dark:text-indigo-300 dark:hover:bg-indigo-800 transition-colors"
                        >
                          <EyeIcon className="w-3 h-3" />
                          Detalhes
                        </button>
                      )}
                    </div>
                    {result.takerName && <p>{result.takerName}</p>}
                    {result.takerCnpj && <p className="font-mono text-xs">{result.takerCnpj}</p>}
                  </div>
                )}
            </div>
        </div>
        <div className="flex items-center gap-2 mt-4 sm:mt-0 flex-wrap">
            <button
              onClick={handleShare}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:text-slate-200 dark:hover:bg-slate-500 rounded-md transition-colors flex items-center gap-2"
            >
              <ShareIcon className="w-4 h-4" />
              Compartilhar
            </button>
            <button
              onClick={handleExport}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:text-white dark:hover:bg-indigo-700 rounded-md transition-colors flex items-center gap-2"
            >
              <DownloadIcon className="w-4 h-4" />
              Exportar PDF
            </button>
            <button
              onClick={onReset}
              className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900 dark:text-indigo-300 dark:hover:bg-indigo-800 rounded-md transition-colors"
            >
              Analisar Outro
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-6">
        <div className={`p-4 rounded-lg ${getRiskColorClasses(result.riskLevel)}`}>
          <h3 className="font-semibold">Nível de Risco</h3>
          <p className="text-2xl font-bold capitalize">{result.riskLevel}</p>
        </div>
        <div className={`p-4 rounded-lg ${getRiskColorClasses(result.riskLevel)}`}>
          <h3 className="font-semibold">Pontuação de Risco</h3>
          <p className="text-2xl font-bold">{result.riskScore} / 100</p>
        </div>
        <div className="p-4 rounded-lg bg-slate-100 dark:bg-slate-700 md:col-span-1">
          <h3 className="font-semibold text-slate-700 dark:text-slate-300">Resumo</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">{result.summary}</p>
        </div>
      </div>
      
      <div className="mt-6 space-y-4">
        {/* Accordion for Anomalies */}
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('anomalies')}
            className="w-full flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            aria-expanded={openSection === 'anomalies'}
          >
            <h3 className="text-lg font-semibold flex items-center text-slate-800 dark:text-slate-200">
              <XCircleIcon className="w-6 h-6 mr-2 text-red-500"/> Anomalias Encontradas ({result.anomalies.length})
            </h3>
            <ChevronDownIcon className={`w-5 h-5 text-slate-500 dark:text-slate-400 transition-transform duration-300 ${openSection === 'anomalies' ? 'rotate-180' : ''}`} />
          </button>
          {openSection === 'anomalies' && (
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 animate-fade-in-down">
                {result.anomalies.length > 0 ? (
                    <>
                        <div className="p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg space-y-3 mb-4 border border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
                                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Filtrar por Tipo:</span>
                                {Object.entries(typeFilters).map(([value, label]) => (
                                    <FilterButton key={value} label={label} value={value} isActive={filters.type === value} onClick={(v) => handleFilterChange('type', v)} />
                                ))}
                            </div>
                            <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
                                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Filtrar por Severidade:</span>
                                {Object.entries(severityFilters).map(([value, label]) => (
                                    <FilterButton key={value} label={label} value={value} isActive={filters.severity === value} onClick={(v) => handleFilterChange('severity', v)} />
                                ))}
                            </div>
                            
                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                                <span className="text-xs text-slate-500 italic">
                                    Exibindo {filteredAnomalies.length} de {result.anomalies.length} anomalias
                                </span>
                                <button
                                    onClick={handleCopyAnomalies}
                                    className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded flex items-center gap-1 transition-colors"
                                >
                                    <ShareIcon className="w-3 h-3" />
                                    {anomaliesCopyStatus}
                                </button>
                            </div>
                        </div>
                        {filteredAnomalies.length > 0 ? (
                            <div className="space-y-4">
                                {filteredAnomalies.map((anomaly, index) => <AnomalyItem key={index} anomaly={anomaly} />)}
                            </div>
                        ) : (
                            <div className="flex items-center p-4 text-sm text-yellow-800 rounded-lg bg-yellow-50 dark:bg-slate-700 dark:text-yellow-400">
                                <WarningIcon className="w-5 h-5 mr-2"/>
                                Nenhuma anomalia corresponde aos filtros selecionados.
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex items-center p-4 text-sm text-green-800 rounded-lg bg-green-50 dark:bg-slate-700 dark:text-green-400">
                    <CheckCircleIcon className="w-5 h-5 mr-2"/>
                    Nenhuma anomalia encontrada. O documento parece estar em conformidade.
                    </div>
                )}
            </div>
          )}
        </div>
        
        {/* Accordion for Recommendations */}
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
             <button
                onClick={() => toggleSection('recommendations')}
                className="w-full flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                aria-expanded={openSection === 'recommendations'}
            >
                <h3 className="text-lg font-semibold flex items-center text-slate-800 dark:text-slate-200">
                    <SparkleIcon className="w-6 h-6 mr-2 text-indigo-500"/> Recomendações da IA ({result.recommendations.length})
                </h3>
                 <ChevronDownIcon className={`w-5 h-5 text-slate-500 dark:text-slate-400 transition-transform duration-300 ${openSection === 'recommendations' ? 'rotate-180' : ''}`} />
            </button>
            {openSection === 'recommendations' && (
                <div className="p-4 border-t border-slate-200 dark:border-slate-700 animate-fade-in-down">
                    {result.recommendations.length > 0 ? (
                        <ul className="space-y-3 list-disc list-inside text-slate-600 dark:text-slate-300">
                        {result.recommendations.map((rec, index) => (
                            <li key={index} className="pl-2 leading-relaxed">{rec}</li>
                        ))}
                        </ul>
                    ) : (
                        <div className="flex items-center p-4 text-sm text-green-800 rounded-lg bg-green-50 dark:bg-slate-700 dark:text-green-400">
                            <CheckCircleIcon className="w-5 h-5 mr-2"/>
                            Nenhuma recomendação necessária.
                        </div>
                    )}
                </div>
            )}
        </div>
      </div>
    </div>

    {/* Company Details Modal */}
    {selectedCompany && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fade-in" onClick={() => setSelectedCompany(null)}>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Detalhes Oficiais da Empresa</h3>
                    <button onClick={() => setSelectedCompany(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                <div className="p-6 overflow-y-auto max-h-[70vh]">
                    <div className="space-y-4">
                        <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Razão Social</p>
                            <p className="text-base text-slate-900 dark:text-slate-200 font-medium">{selectedCompany.razao_social}</p>
                        </div>
                        {selectedCompany.nome_fantasia && (
                          <div>
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nome Fantasia</p>
                              <p className="text-base text-slate-900 dark:text-slate-200">{selectedCompany.nome_fantasia}</p>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">CNPJ</p>
                                <p className="text-base font-mono text-slate-900 dark:text-slate-200">{selectedCompany.cnpj}</p>
                            </div>
                             <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Situação Cadastral</p>
                                <p className={`text-base font-bold ${selectedCompany.situacao_cadastral === 'ATIVA' ? 'text-green-600' : 'text-red-600'}`}>
                                  {selectedCompany.situacao_cadastral}
                                </p>
                            </div>
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Atividade Principal (CNAE)</p>
                            <p className="text-sm text-slate-900 dark:text-slate-200">{selectedCompany.cnae_fiscal_descricao}</p>
                        </div>
                        <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Endereço</p>
                            <p className="text-sm text-slate-900 dark:text-slate-200">
                                {selectedCompany.logradouro}, {selectedCompany.numero} {selectedCompany.bairro && `- ${selectedCompany.bairro}`}
                            </p>
                            <p className="text-sm text-slate-900 dark:text-slate-200">
                                {selectedCompany.municipio} - {selectedCompany.uf}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 text-right">
                    <button onClick={() => setSelectedCompany(null)} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors">
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    )}

    {showShareModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fade-in" onClick={() => setShowShareModal(false)}>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-slate-200 dark:border-slate-700">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Compartilhar Resultado</h3>
                </div>
                <div className="p-5 space-y-3">
                    <a href={mailtoHref} className="block w-full text-center px-4 py-2 font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors">
                        Compartilhar por E-mail
                    </a>
                    <button onClick={handleCopyToClipboard} className="w-full px-4 py-2 font-medium text-slate-700 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:text-slate-200 dark:hover:bg-slate-500 rounded-md transition-colors">
                        {copyStatus}
                    </button>
                </div>
                 <div className="p-4 border-t border-slate-200 dark:border-slate-700 text-right">
                    <button onClick={() => setShowShareModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 rounded-md transition-colors">
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    )}
    </>
  );
};
