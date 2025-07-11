import React from 'react'; // Importă React pentru a folosi React.createElement

export const Card = ({ children, className = '', ref = null }) => {
  return React.createElement('div', { className: `bg-white rounded-lg shadow-md p-6 ${className}`, ref: ref }, children);
};
