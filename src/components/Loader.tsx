'use client';

interface LoaderProps {
  message?: string;
  size?: number;
  className?: string;
}

export default function Loader({ 
  message = "Loading...", 
  size = 48,
  className = ""
}: LoaderProps) {
  return (
    <div
      className={`flex flex-col h-screen items-center px-4 overflow-hidden ${className}`}
      style={{ 
        paddingTop: "15vh", 
        paddingBottom: "15vh",
        background: "white",
      }}
    >
      {/* Top spacing */}
      <div className="flex-1"></div>
      
      {/* Loading content in middle */}
      <div className="flex flex-col items-center space-y-6 z-10">
        <div 
          className="animate-spin rounded-full border-b-2 border-blue-600"
          style={{ width: `${size}px`, height: `${size}px` }}
        ></div>
        <div className="text-gray-700 font-medium text-lg">
          {message}
        </div>
      </div>
      
      {/* Bottom spacing */}
      <div className="flex-1"></div>
    </div>
  );
}
