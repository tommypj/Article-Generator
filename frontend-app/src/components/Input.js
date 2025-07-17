import React from 'react';

export const Input = ({ type = 'text', placeholder, value, onChange, className }) => {
    return (
        <input
            type={type}
            placeholder={placeholder}
            value={value}
            // Ensure that onChange passes the value directly
            onChange={(e) => onChange(e)} // Pass the full event object
            className={`border border-gray-300 p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
        />
    );
};