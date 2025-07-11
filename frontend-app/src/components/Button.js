import React from 'react'; // Importă React pentru a folosi React.createElement

export const Button = ({ children, onClick, className = '', disabled = false }) => {
  return React.createElement('button', {
    onClick: onClick,
    className: `px-4 py-2 rounded-md font-semibold transition-colors duration-200 ${
      disabled ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'
    } ${className}`,
    disabled: disabled
  }, children);
};
