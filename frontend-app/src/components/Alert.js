import React from 'react'; // Importă React pentru a folosi React.createElement

export const Alert = ({ children, type = 'info', className = '', onClose = null }) => {
  let bgColor, textColor;
  switch (type) {
    case 'error':
      bgColor = 'bg-red-100';
      textColor = 'text-red-700';
      break;
    case 'success':
      bgColor = 'bg-green-100';
      textColor = 'text-green-700';
      break;
    case 'warning':
      bgColor = 'bg-yellow-100';
      textColor = 'text-yellow-700';
      break;
    default:
      bgColor = 'bg-blue-100';
      textColor = 'text-blue-700';
  }
  return React.createElement('div', { className: `${bgColor} ${textColor} p-3 rounded-md flex justify-between items-center ${className}` },
    children,
    onClose && (
      React.createElement('button', { onClick: onClose, className: "ml-4 text-current hover:text-opacity-75" },
        React.createElement('span', null, '×')
      )
    )
  );
};
