import React from 'react';
import { SparkleIcon } from './icons/SparkleIcon';

export const Header: React.FC = () => {
  return (
    <header className="bg-white dark:bg-slate-800 shadow-sm border-b border-slate-200 dark:border-slate-700">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center">
          <SparkleIcon className="h-8 w-8 text-indigo-500" />
          <span className="ml-2 text-xl font-bold text-indigo-600 dark:text-indigo-400">
            Auditor Fiscal AI
          </span>
        </div>
      </div>
    </header>
  );
};