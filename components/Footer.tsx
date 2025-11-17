import React from 'react';

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 mt-8 py-6">
      <div className="container mx-auto px-4 text-center text-slate-500 dark:text-slate-400">
        <p className="text-sm font-medium">Desenvolvido BY - SP Assessoria Contabil</p>
        <p className="text-xs mt-1">&copy; {currentYear} Direitos e uso reservados.</p>
      </div>
    </footer>
  );
};
