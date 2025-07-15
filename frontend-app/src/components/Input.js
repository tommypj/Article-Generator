import React from 'react'; // Importă React pentru a folosi React.createElement

export const Input = ({ type = 'text', placeholder, value, onChange, className }) => {
    return (
        <input
            type={type} // Ensure this prop is being used
            placeholder={placeholder}
            value={value}
            onChange={onChange}
            className={`border border-gray-300 p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
        />
    );
};
