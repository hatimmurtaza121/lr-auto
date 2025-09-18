'use client';

import React, { useState, useEffect } from 'react';

interface ScriptEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (script: string) => void;
  initialScript?: string;
  title?: string;
  actionInputs?: {
    fields: Array<{
      key: string;
      label: string;
      placeholder?: string;
      required?: boolean;
    }>;
  };
}

export default function ScriptEditor({ 
  isOpen, 
  onClose, 
  onSave, 
  initialScript = '', 
  title = 'Script Editor',
  actionInputs
}: ScriptEditorProps) {
  const [script, setScript] = useState(initialScript);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setScript(initialScript);
      setHasUnsavedChanges(false);
    }
  }, [isOpen, initialScript]);

  const handleScriptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setScript(e.target.value);
    setHasUnsavedChanges(e.target.value !== initialScript);
  };

  const handleSave = () => {
    onSave(script);
    setHasUnsavedChanges(false);
    onClose();
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm('You have unsaved changes. Are you sure you want to close?');
      if (!confirmed) return;
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle Ctrl+S for save
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
    // Handle Escape for close
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    >
      <div 
        className="bg-white rounded-lg shadow-2xl w-[80vw] h-[80vh] flex flex-col"
        style={{ maxWidth: '80vw', maxHeight: '80vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
          <div className="flex items-center space-x-3">
            <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
            {hasUnsavedChanges && (
              <span className="text-sm text-orange-600 font-medium">• Unsaved changes</span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleClose}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Close (Esc)"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 p-4">
          <div className="h-full flex gap-4">
            {/* Main Editor */}
            <div className="flex-1 flex flex-col">
              <div className="mb-2">
                <p className="text-sm text-gray-600">
                  Enter your playwright script below. Use <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Ctrl+S</kbd> to save or <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Esc</kbd> to close.
                </p>
              </div>
              <textarea
                value={script}
                onChange={handleScriptChange}
                onKeyDown={handleKeyDown}
                placeholder="// Enter your playwright script here...&#10;// Example:&#10;// await page.goto('https://example.com');&#10;// await page.fill('input[name=&quot;username&quot;]', 'user123');&#10;// await page.click('button[type=&quot;submit&quot;]');"
                className="flex-1 w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm resize-none"
                style={{ 
                  fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                  lineHeight: '1.5',
                  tabSize: 2
                }}
              />
            </div>

            {/* Helper Panel */}
            {actionInputs && actionInputs.fields && actionInputs.fields.length > 0 && (
              <div className="w-80 bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Common Setup Lines</h3>
                <div className="space-y-3">
                  <div className="text-xs text-gray-600 font-mono bg-white p-2 rounded border">
                    <div className="text-gray-500 mb-1">{/* Start of the script: */}</div>
                    <div>await page.reload();</div>
                    <div>await page.waitForLoadState(&apos;networkidle&apos;);</div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-gray-700">Available Inputs:</div>
                    {actionInputs.fields.map((field, index) => (
                      <div key={index} className="text-xs text-gray-600 font-mono bg-white p-2 rounded border">
                        <div className="text-gray-500">{/* {field.label} */}</div>
                        <div>params.{field.key}</div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-medium text-gray-700">Return format:</div>
                    <div className="text-xs text-gray-600 font-mono bg-white p-2 rounded border">
                      <div>return {`{`}</div>
                      <div>  success: true/false,</div>
                      <div>  message: &apos;Relevant message&apos;</div>
                      <div>{`};`}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

                 {/* Footer */}
         <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
           <div className="text-sm text-gray-500">
             {script.length} characters • {script.split('\n').length} lines
           </div>
           <div className="flex items-center space-x-3">
             <button
               onClick={handleClose}
               className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
             >
               Cancel
             </button>
             <button
               onClick={handleSave}
               disabled={!hasUnsavedChanges}
               className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
             >
               Save & Close
             </button>
           </div>
         </div>
      </div>
    </div>
  );
}
