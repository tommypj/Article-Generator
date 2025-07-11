import React from 'react'; // Importă React pentru a folosi React.createElement

export const Input = ({ value, onChange, placeholder, className = '' }) => {
  return React.createElement('input', {
    type: 'text',
    value: value,
    onChange: onChange,
    placeholder: placeholder,
    className: `w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 ${className}`
  });
};
